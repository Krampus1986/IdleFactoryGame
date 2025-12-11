(function () {
  "use strict";
  // --- Extension bus for modular systems (adventures, equipment, prestige, etc.) ---
  window.CokeGame = window.CokeGame || {};
  window.CokeExt = window.CokeExt || {
    handlers: [],
    register(handler) {
      if (!handler || typeof handler !== "object") return;
      if (!this.handlers.includes(handler)) {
        this.handlers.push(handler);
      }
    }
  };

  function buildExtensionApi() {
    return {
      getState() {
        return state;
      },
      D,
      formatMoney,
      pushLog,
      constants: {
        adventureDefs
      },
      actions: {
        startAdventure(id) {
          if (typeof startAdventure === "function") {
            startAdventure(id);
          }
        }
      }
    };
  }

  function callExtensions(phase, api) {
    if (!window.CokeExt || !Array.isArray(window.CokeExt.handlers)) return;
    window.CokeExt.handlers.forEach(handler => {
      try {
        if (handler && typeof handler[phase] === "function") {
          handler[phase](api);
        }
      } catch (err) {
        console.error("CokeExt handler error in phase", phase, err);
      }
    });
  }

  const TICK_MS = 1000;
  const OFFLINE_TICK_CAP = 3600; // max simulated offline hours

  // --- Core economic constants ---

  const SUPPLY_COST = {
    preforms: 0.25,
    labels: 0.05,
    packaging: 0.1
  };

  const BASE_MARKET_PRICE = 2.0;
  const BASE_CAPACITY_PER_LINE = 25;
  const BASE_STORAGE_CAPACITY = 2000;
  const BASE_FIXED_COST_PER_HOUR = 40;

  const BASE_DEMAND_PER_CHANNEL = {
    supermarket: 1000,
    kiosk: 600,
    vending: 400,
    stadium: 800
  };

  const channels = ["supermarket", "kiosk", "vending", "stadium"];

  // --- Flavors (design data) ---

  const flavorDefs = [
    {
      id: "classic",
      name: "Classic Cola",
      demandMultiplier: 1.0,
      basePrice: 2.0,
      unlockRevenue: 0
    },
    {
      id: "cherry",
      name: "Cherry Cola",
      demandMultiplier: 1.1,
      basePrice: 2.2,
      unlockRevenue: 20000
    },
    {
      id: "zero",
      name: "Zero Sugar",
      demandMultiplier: 1.05,
      basePrice: 2.1,
      unlockRevenue: 40000
    },
    {
      id: "lime",
      name: "Lime Twist",
      demandMultiplier: 1.2,
      basePrice: 2.4,
      unlockRevenue: 80000
    }
  ];

  // --- Rivals (static archetypes) ---

  const rivalDefs = [
    {
      id: "discounters",
      name: "BudgetFizz",
      brandPower: 0.7,
      riskTolerance: 0.9,
      channelStrength: {
        supermarket: 1.1,
        kiosk: 1.0,
        vending: 0.9,
        stadium: 0.8
      }
    },
    {
      id: "premium",
      name: "RoyalCola",
      brandPower: 1.3,
      riskTolerance: 0.4,
      channelStrength: {
        supermarket: 1.0,
        kiosk: 0.9,
        vending: 1.0,
        stadium: 1.2
      }
    },
    {
      id: "copycat",
      name: "ColaMax",
      brandPower: 1.0,
      riskTolerance: 0.7,
      channelStrength: {
        supermarket: 1.0,
        kiosk: 1.1,
        vending: 1.1,
        stadium: 1.0
      }
    }
  ];

  // --- Achievements & upgrades (existing design) ---

  const achievementDefs = [
    {
      id: "first_sale",
      label: "First Sale",
      desc: "Sell your first bottle.",
      check: s => s.stats.sold >= 1
    },
    {
      id: "ten_k_sold",
      label: "10k Sold",
      desc: "Sell 10,000 bottles.",
      check: s => s.stats.sold >= 10000
    },
    {
      id: "hundred_k_sold",
      label: "100k Sold",
      desc: "Sell 100,000 bottles.",
      check: s => s.stats.sold >= 100000
    },
    {
      id: "million_sold",
      label: "One Million Bottles",
      desc: "Sell 1,000,000 bottles in total.",
      check: s => s.stats.sold >= 1000000
    },
    {
      id: "rich",
      label: "First 100k",
      desc: "Reach $100,000 in cash.",
      check: s => s.cash >= 100000
    },
    {
      id: "legacy_1",
      label: "First Legacy",
      desc: "Secure your first Brand Legacy point.",
      check: s => s.brandLegacy >= 1
    },
    {
      id: "legacy_2x",
      label: "Brand Legacy x2",
      check: s => s.brandLegacy >= 2
    }
  ];

  const adventureDefs = [
    {
      id: "stadium_promo",
      name: "Stadium Promotion",
      desc: "Sponsor the big game. Consume 200 bottles now for a big sales boost over 8 hours.",
      durationHours: 8,
      minBottlesRequired: 200,
      reward: { cash: 8000, legacy: 0.1 }
    }
  ];

  let state;
  let tickHandle = null;

  // --- Helpers ---

  function clamp(min, max, v) {
    return Math.min(max, Math.max(min, v));
  }

  function D(id) {
    return document.getElementById(id);
  }

  function formatMoney(v) {
    return "$" + v.toFixed(2);
  }

  function currentDateString() {
    const day = state.day || 1;
    const hour = state.hour || 0;
    return "Day " + day + ", " + (hour < 10 ? "0" + hour : hour) + ":00";
  }

  function pushLog(msg, type) {
    const logEl = D("logList");
    if (!logEl) return;
    const wrapper = document.createElement("div");
    wrapper.className =
      "log-item" + (type ? " log-item--" + type : " log-item--info");
    wrapper.textContent = "[" + currentDateString() + "] " + msg;
    logEl.prepend(wrapper);
    while (logEl.children.length > 100) {
      logEl.removeChild(logEl.lastChild);
    }
  }

  function getBrandPower() {
    const prestigeBonus = (state.brandLegacy || 0) * 0.03;
    return 1.0 + prestigeBonus;
  }

  function computeChannelDemand() {
    const result = {};
    const brandPower = getBrandPower();
    const globalMult = state.demandModifier || 1.0;
    const eventMult =
      state.events.active && state.events.active.demandMult
        ? state.events.active.demandMult
        : 1.0;

    channels.forEach(ch => {
      let base = BASE_DEMAND_PER_CHANNEL[ch] || 0;
      base *= brandPower;
      base *= globalMult;
      base *= eventMult;
      result[ch] = base;
    });

    return result;
  }

  function computeRivalPrices() {
    const playerPrice =
      typeof state.pricePerBottle === "number"
        ? state.pricePerBottle
        : BASE_MARKET_PRICE;

    const rivalPrices = {};
    rivalDefs.forEach(r => {
      const perChannel = {};
      channels.forEach(ch => {
        let target;
        if (r.id === "discounters") {
          target = playerPrice * 0.9;
        } else if (r.id === "premium") {
          target = playerPrice * 1.3;
        } else if (r.id === "copycat") {
          const mode = r.riskTolerance > 0.7 ? "undercut" : "shadow";
          target = mode === "undercut" ? playerPrice * 0.97 : playerPrice * 1.02;
        } else {
          target = playerPrice;
        }
        const wiggle = (Math.random() - 0.5) * 0.05 * playerPrice;
        perChannel[ch] = Math.max(0.3, target + wiggle);
      });
      rivalPrices[r.id] = perChannel;
    });

    state.rivalPrices = rivalPrices;
    return rivalPrices;
  }

  function computeMarketShares(channelDemand) {
    const result = {};
    const rivalPrices = state.rivalPrices || computeRivalPrices();
    const playerBrandPower = getBrandPower();

    channels.forEach(ch => {
      const demand = channelDemand[ch] || 0;

      const competitors = [];
      competitors.push({
        id: "player",
        name: "You",
        brandPower: playerBrandPower,
        price: state.pricePerBottle || BASE_MARKET_PRICE,
        channelStrength: 1.0
      });

      rivalDefs.forEach(r => {
        const price =
          rivalPrices[r.id] && rivalPrices[r.id][ch]
            ? rivalPrices[r.id][ch]
            : state.pricePerBottle || BASE_MARKET_PRICE;
        competitors.push({
          id: r.id,
          name: r.name,
          brandPower: r.brandPower,
          price,
          channelStrength: r.channelStrength[ch] || 1.0
        });
      });

      const scores = competitors.map(c => {
        const priceAttractiveness = 1 / Math.max(0.3, c.price);
        return {
          id: c.id,
          score: c.brandPower * c.channelStrength * priceAttractiveness
        };
      });

      const totalScore = scores.reduce((sum, s) => sum + s.score, 0.0001);
      const shares = {};
      scores.forEach(s => {
        shares[s.id] = s.score / totalScore;
      });

      const playerShare = shares.player || 0;
      const rivalShares = {};
      rivalDefs.forEach(r => {
        rivalShares[r.id] = shares[r.id] || 0;
      });

      result[ch] = {
        demand,
        playerShare,
        rivalShares
      };
    });

    return result;
  }

  // --- State & persistence ---

  function defaultState() {
    const flavorsState = {};
    flavorDefs.forEach(f => {
      flavorsState[f.id] = {
        unlocked: f.unlockRevenue === 0,
        price: f.basePrice,
        producedLifetime: 0,
        soldLifetime: 0,
        monthlyProduced: 0,
        monthlySold: 0
      };
    });

    return {
      version: 1,
      cash: 2500,
      day: 1,
      hour: 8,
      capacityPerHour: BASE_CAPACITY_PER_LINE,
      storageCapacity: BASE_STORAGE_CAPACITY,
      fixedCostPerHour: BASE_FIXED_COST_PER_HOUR,

      meta: {
        lines: 1,
        warehouses: 1
      },

      inv: {
        preforms: 500,
        labels: 500,
        packaging: 500,
        bottles: 0
      },

      stats: {
        produced: 0,
        sold: 0,
        revenue: 0,
        expenses: 0
      },

      monthly: {
        produced: 0,
        sold: 0,
        revenue: 0,
        expenses: 0
      },

      calendar: {
        lastMonthIndex: 1
      },

      flavors: flavorsState,

      events: {
        active: null
      },

      flags: {
        autoBuy: false
      },

      demandModifier: 1.0,
      marginPenalty: 0,

      rivalPrices: {},

      brandLegacy: 0,

      achievementsUnlocked: {},
      upgradesPurchased: {},

      adventure: {
        activeId: null,
        remainingHours: 0,
        rewardPending: null
      }
    };
  }

  function saveGame() {
    try {
      localStorage.setItem("coke_tycoon_idle_save", JSON.stringify(state));
    } catch (e) {
      console.error("Failed to save", e);
    }

  function hardResetGame() {
    try {
      localStorage.removeItem("coke_tycoon_idle_save");
      localStorage.removeItem("coke_tycoon_idle_last_tick");
    } catch (e) {
      console.error("Failed to clear save", e);
    }

    state = defaultState();
    saveGame();
    updateUI();
    pushLog(
      "New game started. Previous save data was wiped from this browser.",
      "good"
    );
  }
  }

  function loadGame() {
    try {
      const raw = localStorage.getItem("coke_tycoon_idle_save");
      if (!raw) {
        state = defaultState();
        return;
      }
      const parsed = JSON.parse(raw);
      state = defaultState();
      Object.assign(state, parsed);

      if (!state.meta) {
        state.meta = { lines: 1, warehouses: 1 };
      }
      if (!state.stats) {
        state.stats = { produced: 0, sold: 0, revenue: 0, expenses: 0 };
      }
      if (!state.monthly) {
        state.monthly = { produced: 0, sold: 0, revenue: 0, expenses: 0 };
      }
      if (!state.calendar) {
        state.calendar = { lastMonthIndex: 1 };
      }
      if (!state.events) {
        state.events = { active: null };
      }
      if (!state.flags) {
        state.flags = { autoBuy: false };
      }
      if (!state.flavors) {
        state.flavors = {};
      }
      if (!state.adventure) {
        state.adventure = {
          activeId: null,
          remainingHours: 0,
          rewardPending: null
        };
      }
      if (!state.achievementsUnlocked) {
        state.achievementsUnlocked = {};
      }
      if (!state.upgradesPurchased) {
        state.upgradesPurchased = {};
      }
      if (typeof state.brandLegacy !== "number") {
        state.brandLegacy = 0;
      }

      // Ensure all flavor entries exist
      const newFlavors = {};
      flavorDefs.forEach(f => {
        const existing = state.flavors[f.id] || {};
        newFlavors[f.id] = {
          unlocked:
            typeof existing.unlocked === "boolean"
              ? existing.unlocked
              : f.unlockRevenue === 0,
          price:
            typeof existing.price === "number" ? existing.price : f.basePrice,
          producedLifetime: existing.producedLifetime || 0,
          soldLifetime: existing.soldLifetime || 0,
          monthlyProduced: existing.monthlyProduced || 0,
          monthlySold: existing.monthlySold || 0
        };
      });
      state.flavors = newFlavors;
    } catch (e) {
      console.error("Failed to load game, resetting", e);
      state = defaultState();
    }
  }

  function applyOfflineProgress() {
    try {
      const last = localStorage.getItem("coke_tycoon_idle_last_tick");
      if (!last) return;
      const then = parseInt(last, 10);
      if (!Number.isFinite(then)) return;
      const now = Date.now();
      const deltaSeconds = Math.floor((now - then) / 1000);
      if (deltaSeconds <= 0) return;

      const maxSimulated = Math.min(deltaSeconds, OFFLINE_TICK_CAP);
      for (let i = 0; i < maxSimulated; i++) {
        runSingleTick(false);
      }
    } catch (e) {
      console.warn("Failed offline progress", e);
    }
  }

  // --- Time & calendar ---

  function currentMonthIndex() {
    return Math.floor((state.day - 1) / 30) + 1;
  }

  function maybeHandleMonthEnd() {
    const current = currentMonthIndex();
    if (current !== state.calendar.lastMonthIndex) {
      const m = state.monthly;
      const profit = m.revenue - m.expenses;
      const msg =
        "Month " +
        state.calendar.lastMonthIndex +
        " recap: produced " +
        m.produced.toLocaleString() +
        " / sold " +
        m.sold.toLocaleString() +
        " bottles. Revenue " +
        formatMoney(m.revenue) +
        ", expenses " +
        formatMoney(m.expenses) +
        ", profit " +
        formatMoney(profit) +
        ".";
      pushLog(msg, profit >= 0 ? "good" : "bad");

      state.monthly = { produced: 0, sold: 0, revenue: 0, expenses: 0 };
      state.calendar.lastMonthIndex = current;
    }
  }

  function advanceTime() {
    state.hour += 1;
    if (state.hour >= 24) {
      state.hour = 0;
      state.day += 1;
      maybeHandleMonthEnd();
    }
  }

  function applyFixedCosts() {
    const extra = state.meta.lines > 1 ? (state.meta.lines - 1) * 15 : 0;
    const cost = state.fixedCostPerHour + extra;
    if (cost > 0) {
      state.cash -= cost;
      state.stats.expenses += cost;
      state.monthly.expenses += cost;
    }
  }

  
  // --- Production lines helper (for dedicated lines UI) ---
  function ensureLines() {
    if (!state.meta) {
      state.meta = { lines: 1, warehouses: 1 };
    }
    if (!Array.isArray(state.lines) || state.lines.length === 0) {
      const count = Math.max(1, state.meta.lines || 1);
      const perLineCap = Math.max(
        1,
        Math.floor((state.capacityPerHour || BASE_CAPACITY_PER_LINE * count) / count)
      );
      const lines = [];
      for (let i = 0; i < count; i++) {
        lines.push({
          id: i + 1,
          name: "Line " + (i + 1),
          baseBph: perLineCap,
          efficiency: 1.0
        });
      }
      state.lines = lines;
    }
  }
// --- Production & sales ---

  function getEffectiveCapacityPerHour() {
    const eventMult =
      state.events.active && state.events.active.capacityMult
        ? state.events.active.capacityMult
        : 1.0;
    return Math.max(
      0,
      Math.floor(state.capacityPerHour * eventMult * getCapacityPrestigeMult())
    );
  }

  function getCapacityPrestigeMult() {
    return 1 + (state.brandLegacy || 0) * 0.02;
  }

  function getDemandPrestigeMult() {
    return 1 + (state.brandLegacy || 0) * 0.01;
  }

  function autoBuySupplies() {
    const targetPreforms = state.storageCapacity;
    const targetLabels = state.storageCapacity;
    const targetPackaging = state.storageCapacity;

    const buy = (kind, target, costPer) => {
      const current = state.inv[kind];
      const need = Math.max(0, target - current);
      if (need <= 0) return;
      const cost = need * costPer;
      if (state.cash >= cost) {
        state.cash -= cost;
        state.inv[kind] += need;
        state.stats.expenses += cost;
        state.monthly.expenses += cost;
      }
    };

    buy("preforms", targetPreforms, SUPPLY_COST.preforms);
    buy("labels", targetLabels, SUPPLY_COST.labels);
    buy("packaging", targetPackaging, SUPPLY_COST.packaging);
  }

  function produceBottles() {
    const capacity = getEffectiveCapacityPerHour();
    const maxProducible = Math.min(
      capacity,
      state.inv.preforms,
      state.inv.labels,
      state.inv.packaging,
      state.storageCapacity - state.inv.bottles
    );

    if (maxProducible <= 0) {
      return 0;
    }

    state.inv.preforms -= maxProducible;
    state.inv.labels -= maxProducible;
    state.inv.packaging -= maxProducible;
    state.inv.bottles += maxProducible;

    state.stats.produced += maxProducible;
    state.monthly.produced += maxProducible;

    const activeFlavor = state.flavors[state.activeFlavorId];
    if (activeFlavor) {
      activeFlavor.producedLifetime += maxProducible;
      activeFlavor.monthlyProduced += maxProducible;
    }

    return maxProducible;
  }

  function getEffectiveDemandMult() {
    const eventMult =
      state.events.active && state.events.active.demandMult
        ? state.events.active.demandMult
        : 1.0;
    return (state.demandModifier || 1.0) * eventMult * getDemandPrestigeMult();
  }

  function sellBottles() {
    const channelDemand = computeChannelDemand();
    const marketShares = computeMarketShares(channelDemand);

    let totalDemanded = 0;
    channels.forEach(ch => {
      const info = marketShares[ch];
      totalDemanded += info.demand * info.playerShare;
    });

    const effectiveDemand = totalDemanded * getEffectiveDemandMult();
    const possibleSales = Math.min(effectiveDemand, state.inv.bottles);
    const roundedSales = Math.floor(possibleSales);

    state.lastDemandLevel = totalDemanded;
    const approxMaxDemand =
      channels.reduce((sum, ch) => sum + (channelDemand[ch] || 0), 0) *
      getEffectiveDemandMult();
    state.lastMarketShare =
      approxMaxDemand > 0 ? roundedSales / approxMaxDemand : 0;

    if (roundedSales <= 0) {
      return {
        demanded: totalDemanded,
        sold: 0,
        revenue: 0
      };
    }

    const price = state.pricePerBottle || BASE_MARKET_PRICE;
    const marginPenalty = state.marginPenalty || 0;
    const effectivePrice = Math.max(0.1, price * (1 - marginPenalty));

    const revenue = roundedSales * effectivePrice;

    state.inv.bottles -= roundedSales;
    state.cash += revenue;

    state.stats.sold += roundedSales;
    state.stats.revenue += revenue;

    state.monthly.sold += roundedSales;
    state.monthly.revenue += revenue;

    const activeFlavor = state.flavors[state.activeFlavorId];
    if (activeFlavor) {
      activeFlavor.soldLifetime += roundedSales;
      activeFlavor.monthlySold += roundedSales;
    }

    return {
      demanded: totalDemanded,
      sold: roundedSales,
      revenue
    };
  }

  // --- Events / random things ---

  const simpleEvents = {
    sugarTax: {
      id: "sugar_tax",
      name: "Sugar Tax Proposal",
      desc:
        "A new sugar tax on soft drinks is proposed. Demand dips while retailers hesitate.",
      minHours: 12,
      maxHours: 36,
      capacityMult: 1.0,
      demandMult: 0.8,
      extraCostPerHour: 0
    },
    strike: {
      id: "strike",
      name: "Partial Strike",
      desc: "Workers are unhappy. Capacity is reduced until an agreement is reached.",
      minHours: 8,
      maxHours: 24,
      capacityMult: 0.6,
      demandMult: 1.0,
      extraCostPerHour: 0
    },
    heatwave: {
      id: "heatwave",
      name: "Heatwave",
      desc: "Scorching weather spikes cola demand across the city.",
      minHours: 6,
      maxHours: 18,
      capacityMult: 1.0,
      demandMult: 1.5,
      extraCostPerHour: 0
    }
  };

  function maybeTriggerEvent() {
    if (state.events.active) return;
    if (Math.random() < 0.97) return;

    const keys = Object.keys(simpleEvents);
    const choice = simpleEvents[keys[Math.floor(Math.random() * keys.length)]];
    const durationHours =
      choice.minHours +
      Math.floor(Math.random() * (choice.maxHours - choice.minHours + 1));

    state.events.active = {
      id: choice.id,
      name: choice.name,
      description: choice.desc,
      demandMult: choice.demandMult,
      capacityMult: choice.capacityMult,
      extraCostPerHour: choice.extraCostPerHour,
      remainingHours: durationHours
    };

    pushLog("Event started: " + choice.name, "event");
  }

  function advanceEvents() {
    const ev = state.events.active;
    if (!ev) return;

    ev.remainingHours -= 1;
    if (ev.remainingHours <= 0) {
      pushLog("Event ended: " + ev.name, "event");
      state.events.active = null;
    }
  }

  // --- Achievements & upgrades ---

  function checkAchievements() {
    achievementDefs.forEach(def => {
      if (state.achievementsUnlocked[def.id]) return;
      if (def.check(state)) {
        state.achievementsUnlocked[def.id] = true;
        pushLog("Achievement unlocked: " + def.label, "good");
      }
    });
  }

  function purchaseUpgrade(id) {
    if (state.upgradesPurchased[id]) return;

    let cost = 0;
    let applyFn = null;

    if (id === "line_2") {
      cost = 10000;
      applyFn = () => {
        state.meta.lines = Math.max(2, state.meta.lines);
        state.capacityPerHour = BASE_CAPACITY_PER_LINE * state.meta.lines;
      };
    } else if (id === "warehouse_2") {
      cost = 15000;
      applyFn = () => {
        state.meta.warehouses = Math.max(2, state.meta.warehouses);
        state.storageCapacity = BASE_STORAGE_CAPACITY * state.meta.warehouses;
      };
    } else if (id === "auto_buy") {
      cost = 5000;
      applyFn = () => {
        state.flags.autoBuy = true;
      };
    } else if (id === "marketing_push") {
      cost = 8000;
      applyFn = () => {
        state.demandModifier *= 1.15;
      };
    } else if (id === "energy_efficiency") {
      cost = 9000;
      applyFn = () => {
        state.fixedCostPerHour = Math.round(state.fixedCostPerHour * 0.9);
      };
    }

    if (!applyFn) return;
    if (state.cash < cost) {
      pushLog("Not enough cash for upgrade.", "bad");
      return;
    }

    state.cash -= cost;
    state.stats.expenses += cost;
    state.monthly.expenses += cost;
    state.upgradesPurchased[id] = true;
    applyFn();
    pushLog("Upgrade purchased: " + id, "good");
  }

  // --- Adventures ---

  function startAdventure(id) {
    if (state.adventure.activeId) return;
    const def = adventureDefs.find(a => a.id === id);
    if (!def) return;
    if (state.inv.bottles < def.minBottlesRequired) {
      pushLog("Not enough bottles for " + def.name + ".", "bad");
      return;
    }
    state.inv.bottles -= def.minBottlesRequired;
    state.adventure.activeId = def.id;
    state.adventure.remainingHours = def.durationHours;
    state.adventure.rewardPending = null;

    pushLog("Started adventure: " + def.name, "info");
  }

  function updateAdventure() {
    if (!state.adventure.activeId) return;
    state.adventure.remainingHours -= 1;
    if (state.adventure.remainingHours <= 0) {
      const def = adventureDefs.find(a => a.id === state.adventure.activeId);
      if (!def) {
        state.adventure.activeId = null;
        state.adventure.remainingHours = 0;
        state.adventure.rewardPending = null;
        return;
      }
      state.adventure.rewardPending = {
        cash: def.reward.cash,
        legacy: def.reward.legacy
      };
      state.adventure.activeId = null;
      state.adventure.remainingHours = 0;
      pushLog(
        "Adventure complete: " +
          def.name +
          ". Click 'Claim' to receive your reward.",
        "good"
      );
    }
  }

  function claimAdventureReward() {
    const reward = state.adventure.rewardPending;
    if (!reward) return;
    state.cash += reward.cash;
    state.brandLegacy += reward.legacy;
    state.adventure.rewardPending = null;
    pushLog(
      "Adventure rewards claimed: " +
        formatMoney(reward.cash) +
        " and +" +
        reward.legacy.toFixed(2) +
        " Brand Legacy.",
      "good"
    );
  }

  // --- Prestige (Brand Legacy) ---

  function canPrestige() {
    return (
      state.brandLegacy >= 1 &&
      (state.stats.revenue || 0) >= 50000
    );
  }

  function doPrestigeReset() {
    if (!canPrestige()) return;

    const keepLegacy = state.brandLegacy;
    const keepAchievements = { ...state.achievementsUnlocked };

    state = defaultState();
    state.brandLegacy = keepLegacy;
    state.achievementsUnlocked = keepAchievements;

    saveGame();
    pushLog(
      "Prestige reset complete. Your Brand Legacy persists and boosts future runs.",
      "good"
    );
  }

  // --- Core tick ---

  function runSingleTick(online) {
    advanceTime();
    applyFixedCosts();

    if (state.flags.autoBuy) {
      autoBuySupplies();
    }

    const produced = produceBottles();
    const sale = sellBottles();

    state.lastProduced = produced;
    state.lastRevenue = sale.revenue || 0;

    maybeTriggerEvent();
    advanceEvents();

    updateAdventure();
    checkAchievements();

    try {
      localStorage.setItem("coke_tycoon_idle_last_tick", String(Date.now()));
    } catch (e) {
      // ignore
    }
  }

  // --- UI updates ---

  function updateTopbar() {
    const cashEl = D("cashDisplay");
    const dayEl = D("dayDisplay");
    const timeEl = D("timeDisplay");
    const capEl = D("capacityPill");
    const legacyEl = D("legacyPointsDisplay");

    if (cashEl) cashEl.textContent = formatMoney(state.cash);
    if (dayEl) dayEl.textContent = "Day " + (state.day || 1);
    if (timeEl)
      timeEl.textContent =
        (state.hour < 10 ? "0" + state.hour : state.hour) + ":00";
    if (capEl)
      capEl.textContent = getEffectiveCapacityPerHour().toLocaleString();
    if (legacyEl)
      legacyEl.textContent = (state.brandLegacy || 0).toFixed(2);
  }

  function updateProductionUI() {
    const capDisplay = D("capacityDisplay");
    const lastProd = D("lastProducedDisplay");
    const lifetimeProd = D("lifetimeProducedDisplay");

    if (capDisplay)
      capDisplay.textContent = getEffectiveCapacityPerHour().toLocaleString();
    if (lastProd)
      lastProd.textContent = (state.lastProduced || 0).toLocaleString();
    if (lifetimeProd)
      lifetimeProd.textContent = state.stats.produced.toLocaleString();

    const invPreforms = D("invPreforms");
    const invLabels = D("invLabels");
    const invPackaging = D("invPackaging");
    const invBottles = D("invBottles");
    const storageCap = D("storageCapacityDisplay");

    if (invPreforms)
      invPreforms.textContent = state.inv.preforms.toLocaleString();
    if (invLabels) invLabels.textContent = state.inv.labels.toLocaleString();
    if (invPackaging)
      invPackaging.textContent = state.inv.packaging.toLocaleString();
    if (invBottles)
      invBottles.textContent = state.inv.bottles.toLocaleString();
    if (storageCap)
      storageCap.textContent = state.storageCapacity.toLocaleString();

    const autoStatus = D("autoBuyStatus");
    if (autoStatus) {
      autoStatus.textContent = state.flags.autoBuy ? "On" : "Off";
    }
  }

  
  function updateLinesUI() {
    const grid = D("linesGrid");
    if (!grid) return;
    ensureLines();
    grid.innerHTML = "";
    state.lines.forEach(line => {
      const eff = typeof line.efficiency === "number" ? line.efficiency : 1;
      const effPct = Math.round(eff * 100);
      const effCap = Math.round((line.baseBph || 0) * eff);

      const card = document.createElement("div");
      card.className = "chip";

      const main = document.createElement("div");
      main.className = "chip-main";
      const nameSpan = document.createElement("strong");
      nameSpan.textContent = line.name || ("Line " + line.id);
      const capSpan = document.createElement("span");
      capSpan.textContent = effCap.toLocaleString() + " bph";
      main.appendChild(nameSpan);
      main.appendChild(capSpan);

      const sub = document.createElement("div");
      sub.className = "chip-sub";
      sub.textContent = "Base " + (line.baseBph || 0).toLocaleString() + " • Eff. " + effPct + "%";

      card.appendChild(main);
      card.appendChild(sub);
      grid.appendChild(card);
    });
  }
function updateMarketUI() {
    const flavor = state.flavors[state.activeFlavorId];
    const def = flavorDefs.find(f => f.id === state.activeFlavorId);
    const flavorNameEl = D("activeFlavorName");
    const flavorStatsEl = D("activeFlavorStats");

    if (flavorNameEl && def) {
      flavorNameEl.textContent = def.name;
    }
    if (flavorStatsEl && flavor) {
      flavorStatsEl.textContent =
        "Lifetime produced: " +
        flavor.producedLifetime.toLocaleString() +
        " | Lifetime sold: " +
        flavor.soldLifetime.toLocaleString();
    }

    const priceDisplay = D("priceDisplay");
    if (priceDisplay) {
      priceDisplay.textContent = formatMoney(state.pricePerBottle);
    }

    const demandBar = D("demandBar");
    const shareBar = D("shareBar");
    const demandHint = D("demandHint");
    const rivalHint = D("rivalHint");

    const demandLevel = state.lastDemandLevel || 0;
    const marketShare = state.lastMarketShare || 0;

    if (demandBar) {
      const pct = clamp(0, 1, demandLevel / 2000);
      demandBar.style.width = Math.round(pct * 100) + "%";
    }
    if (shareBar) {
      const pct = clamp(0, 1, marketShare * 4);
      shareBar.style.width = Math.round(pct * 100) + "%";
    }

    if (demandHint) {
      if (demandLevel < 400) demandHint.textContent = "Soft";
      else if (demandLevel < 800) demandHint.textContent = "Normal";
      else demandHint.textContent = "Hot!";
    }

    if (rivalHint) {
      if (marketShare < 0.2) rivalHint.textContent = "Rivals dominating.";
      else if (marketShare < 0.4)
        rivalHint.textContent = "Rivals ahead, but you are in the game.";
      else if (marketShare < 0.6)
        rivalHint.textContent = "Neck-and-neck with main rival.";
      else rivalHint.textContent = "You are the category leader.";
    }

    const channelsGrid = D("channelsGrid");
    const rivalsGrid = D("rivalsGrid");

    if (channelsGrid || rivalsGrid) {
      const channelDemand = computeChannelDemand();
      const shares = computeMarketShares(channelDemand);

      if (channelsGrid) {
        channelsGrid.innerHTML = "";
        channels.forEach(ch => {
          const info = shares[ch];
          if (!info) return;
          const box = document.createElement("div");
          box.className = "chip";
          const main = document.createElement("div");
          main.className = "chip-main";
          main.innerHTML =
            "<strong>" +
            ch.charAt(0).toUpperCase() +
            ch.slice(1) +
            "</strong><span>" +
            info.demand.toLocaleString() +
            " demand</span>";
          const sub = document.createElement("div");
          sub.className = "chip-sub";
          sub.textContent =
            "Your share: " + Math.round(info.playerShare * 100) + "%";
          box.appendChild(main);
          box.appendChild(sub);
          channelsGrid.appendChild(box);
        });
      }

      if (rivalsGrid) {
        rivalsGrid.innerHTML = "";
        rivalDefs.forEach(r => {
          const box = document.createElement("div");
          box.className = "chip";
          const main = document.createElement("div");
          main.className = "chip-main";
          main.innerHTML =
            "<strong>" +
            r.name +
            "</strong><span>Brand power " +
            r.brandPower.toFixed(2) +
            "</span>";
          const sub = document.createElement("div");
          sub.className = "chip-sub";
          const shareLines = channels.map(ch => {
            const info = shares[ch];
            if (!info) return "";
            const rivalShare = info.rivalShares[r.id] || 0;
            return (
              ch.charAt(0).toUpperCase() +
              ch.slice(1) +
              ": " +
              Math.round(rivalShare * 100) +
              "%"
            );
          });
          sub.textContent = shareLines.join(" • ");
          box.appendChild(main);
          box.appendChild(sub);
          rivalsGrid.appendChild(box);
        });
      }
    }
  }

  function updatePrestigeUI() {
    const pointsSummary = D("prestigePointsInfo");
    if (!pointsSummary) return;
    pointsSummary.textContent =
      (state.brandLegacy || 0).toFixed(2) + " available";
  }

  function renderFlavors() {
    // currently flavor list is summarized via active flavor UI
    // could expand to full list in future
  }

  function renderUpgrades() {
    const list = D("upgradesList");
    if (!list) return;

    list.innerHTML = "";

    const defs = [
      {
        id: "line_2",
        label: "Second production line",
        desc: "Double your base capacity.",
        cost: 10000
      },
      {
        id: "warehouse_2",
        label: "Warehouse II",
        desc: "Double your storage capacity.",
        cost: 15000
      },
      {
        id: "auto_buy",
        label: "Auto Procurement",
        desc: "Automatically buy preforms, labels, and packaging when low.",
        cost: 5000
      },
      {
        id: "marketing_push",
        label: "Citywide Marketing Push",
        desc: "+15% global demand.",
        cost: 8000
      },
      {
        id: "energy_efficiency",
        label: "Energy Efficiency Program",
        desc: "Reduce hourly fixed costs by 10%.",
        cost: 9000
      }
    ];

    defs.forEach(def => {
      const row = document.createElement("div");
      row.className =
        "upgrade-row" +
        (state.upgradesPurchased[def.id] ? " upgrade-row--owned" : "");

      const main = document.createElement("div");
      main.className = "upgrade-row-main";
      const label = document.createElement("div");
      label.className = "upgrade-row-title";
      label.textContent = def.label;
      const desc = document.createElement("div");
      desc.className = "upgrade-row-desc";
      desc.textContent = def.desc;
      main.appendChild(label);
      main.appendChild(desc);

      const side = document.createElement("div");
      side.className = "upgrade-row-side";
      const cost = document.createElement("div");
      cost.textContent = formatMoney(def.cost);
      side.appendChild(cost);

      if (!state.upgradesPurchased[def.id]) {
        const btn = document.createElement("button");
        btn.className = "btn";
        btn.textContent = "Buy";
        btn.disabled = state.cash < def.cost;
        btn.addEventListener("click", () => {
          purchaseUpgrade(def.id);
          updateUI();
          saveGame();
        });
        side.appendChild(btn);
      } else {
        const tag = document.createElement("span");
        tag.className = "badge";
        tag.textContent = "Owned";
        side.appendChild(tag);
      }

      row.appendChild(main);
      row.appendChild(side);
      list.appendChild(row);
    });
  }

  function renderAchievements() {
    const list = D("achievementsList");
    if (!list) return;
    list.innerHTML = "";

    achievementDefs.forEach(def => {
      const unlocked = !!state.achievementsUnlocked[def.id];
      const row = document.createElement("div");
      row.className =
        "achievement-row" + (unlocked ? " achievement-row--unlocked" : "");
      const left = document.createElement("div");
      left.className = "achievement-main";
      const title = document.createElement("div");
      title.className = "achievement-title";
      title.textContent = def.label;
      const desc = document.createElement("div");
      desc.className = "achievement-desc";
      desc.textContent = def.desc;
      left.appendChild(title);
      left.appendChild(desc);

      const right = document.createElement("div");
      right.className = "achievement-side";
      right.textContent = unlocked ? "Unlocked" : "Locked";

      row.appendChild(left);
      row.appendChild(right);
      list.appendChild(row);
    });
  }

  function renderAdventureUI() {
    const crewGrid = D("crewGrid");
    const missionsGrid = D("missionsGrid");
    const activePanel = D("activeMissionPanel");
    const statusText = D("adventureStatusText");
    const claimBtn = D("adventureClaimButton");

    if (!crewGrid || !missionsGrid || !activePanel || !statusText || !claimBtn)
      return;

    crewGrid.innerHTML = "";
    const crew = [
      {
        id: "sales",
        name: "Sales Rep",
        role: "Frontline deals",
        trait: "Charismatic"
      },
      {
        id: "brand",
        name: "Brand Ambassador",
        role: "Sampling & buzz",
        trait: "Charming"
      },
      {
        id: "logistics",
        name: "Logistics Specialist",
        role: "Stock & routing",
        trait: "Analytical"
      }
    ];
    crew.forEach(c => {
      const chip = document.createElement("div");
      chip.className = "chip";
      chip.innerHTML =
        '<div class="chip-main"><strong>' +
        c.name +
        "</strong><span>" +
        c.role +
        "</span></div>" +
        '<div class="chip-sub"><span>Trait: ' +
        c.trait +
        "</span></div>";
      crewGrid.appendChild(chip);
    });

    missionsGrid.innerHTML = "";
    adventureDefs.forEach(def => {
      const chip = document.createElement("div");
      chip.className = "chip";
      const main = document.createElement("div");
      main.className = "chip-main";
      main.innerHTML =
        "<strong>" +
        def.name +
        "</strong><span>" +
        def.durationHours +
        "h • Needs " +
        def.minBottlesRequired +
        " bottles</span>";
      const sub = document.createElement("div");
      sub.className = "chip-sub";
      const desc = document.createElement("span");
      desc.textContent = def.desc;
      const btn = document.createElement("button");
      btn.className = "btn ghost";
      btn.textContent = state.adventure.activeId ? "Busy" : "Start";
      btn.disabled =
        !!state.adventure.activeId ||
        state.inv.bottles < def.minBottlesRequired;
      btn.addEventListener("click", () => {
        startAdventure(def.id);
        updateUI();
        saveGame();
      });
      sub.appendChild(desc);
      sub.appendChild(btn);
      chip.appendChild(main);
      chip.appendChild(sub);
      missionsGrid.appendChild(chip);
    });

    if (state.adventure.activeId) {
      const def = adventureDefs.find(a => a.id === state.adventure.activeId);
      activePanel.innerHTML =
        "<strong>" +
        def.name +
        "</strong><p>" +
        def.desc +
        "</p><p>Time left: " +
        state.adventure.remainingHours +
        "h</p>";
      statusText.textContent = "Mission in progress.";
    } else if (state.adventure.rewardPending) {
      const r = state.adventure.rewardPending;
      activePanel.innerHTML =
        "<strong>Mission complete</strong><p>Reward ready: " +
        formatMoney(r.cash) +
        " and +" +
        r.legacy.toFixed(2) +
        " Brand Legacy.</p>";
      statusText.textContent = "Reward ready.";
    } else {
      activePanel.innerHTML = "<p>No active mission.</p>";
      statusText.textContent = "No mission selected.";
    }

    claimBtn.disabled = !state.adventure.rewardPending;
  }

  function updateUI() {
    updateTopbar();
    updateProductionUI();
    updateLinesUI();
    updateMarketUI();
    updatePrestigeUI();
    renderFlavors();
    renderUpgrades();
    renderAchievements();
    renderAdventureUI();

    // Let extension modules refresh their UI
    if (window.CokeExt && Array.isArray(window.CokeExt.handlers) && window.CokeExt.handlers.length) {
      const api = buildExtensionApi();
      callExtensions("onUpdateUI", api);
    }
  }

  // --- Event wiring & loop ---

  function bindEvents() {
    const invGrid = D("inventoryGrid");
    if (invGrid) {
      invGrid.addEventListener("click", e => {
        const btn = e.target.closest("button[data-buy]");
        if (!btn) return;
        const kind = btn.getAttribute("data-buy");
        const amount = parseInt(btn.getAttribute("data-amount"), 10) || 0;
        if (
          !["preforms", "labels", "packaging"].includes(kind) ||
          amount <= 0
        ) {
          return;
        }
        const costPer = SUPPLY_COST[kind];
        const cost = costPer * amount;
        if (state.cash < cost) {
          pushLog("Not enough cash for " + kind + ".", "bad");
          return;
        }
        state.cash -= cost;
        state.inv[kind] += amount;
        state.stats.expenses += cost;
        state.monthly.expenses += cost;
        updateUI();
        saveGame();
      });
    }

    const autoToggle = D("autoBuyToggle");
    if (autoToggle) {
      autoToggle.addEventListener("click", () => {
        state.flags.autoBuy = !state.flags.autoBuy;
        updateUI();
        saveGame();
      });
    }

    const prevFlavorButton = D("prevFlavorButton");
    const nextFlavorButton = D("nextFlavorButton");

    if (prevFlavorButton) {
      prevFlavorButton.addEventListener("click", () => {
        const ids = flavorDefs.map(f => f.id);
        const currentIndex = ids.indexOf(state.activeFlavorId);
        const nextIndex = (currentIndex - 1 + ids.length) % ids.length;
        state.activeFlavorId = ids[nextIndex];
        updateUI();
        saveGame();
      });
    }

    if (nextFlavorButton) {
      nextFlavorButton.addEventListener("click", () => {
        const ids = flavorDefs.map(f => f.id);
        const currentIndex = ids.indexOf(state.activeFlavorId);
        const nextIndex = (currentIndex + 1) % ids.length;
        state.activeFlavorId = ids[nextIndex];
        updateUI();
        saveGame();
      });
    }

    const decreasePrice = D("decreasePriceButton");
    const increasePrice = D("increasePriceButton");
    if (decreasePrice) {
      decreasePrice.addEventListener("click", () => {
        state.pricePerBottle = Math.max(
          0.1,
          +(state.pricePerBottle - 0.1).toFixed(2)
        );
        updateUI();
        saveGame();
      });
    }
    if (increasePrice) {
      increasePrice.addEventListener("click", () => {
        state.pricePerBottle = +(state.pricePerBottle + 0.1).toFixed(2);
        updateUI();
        saveGame();
      });
    }

    const adventureClaim = D("adventureClaimButton");
    if (adventureClaim) {
      adventureClaim.addEventListener("click", () => {
        claimAdventureReward();
        updateUI();
        saveGame();
      });
    }

    const prestigeButton = D("prestigeResetButton");
    if (prestigeButton) {
      prestigeButton.addEventListener("click", () => {
        if (canPrestige()) {
          doPrestigeReset();
          updateUI();
          saveGame();
        } else {
          pushLog(
            "Not ready to prestige. Build more revenue and Brand Legacy first.",
            "bad"
          );
        }
      });
    }

    const hardResetButton = D("hardResetButton");
    if (hardResetButton) {
      hardResetButton.addEventListener("click", () => {
        const ok = window.confirm
          ? window.confirm(
              "Start a completely new game?\n\nThis will wipe the current save data stored in this browser."
            )
          : true;
        if (!ok) return;
        hardResetGame();
      });
    }

    const logFilters = document.querySelectorAll("[data-log-filter]");
    if (logFilters && logFilters.length) {
      logFilters.forEach(btn => {
        btn.addEventListener("click", () => {
          logFilters.forEach(b => b.classList.remove("chip--active"));
          btn.classList.add("chip--active");
          const filter = btn.getAttribute("data-log-filter");
          const list = D("logList");
          if (!list) return;
          Array.from(list.children).forEach(item => {
            if (filter === "all") {
              item.style.display = "";
            } else if (filter === "ops") {
              item.style.display = "";
            } else {
              item.style.display = "";
            }
          });
        });
      });
    }
  }

  function startLoop() {
    if (tickHandle) clearInterval(tickHandle);
    tickHandle = setInterval(() => {
      runSingleTick(true);
      updateUI();
      saveGame();
    }, TICK_MS);
  }

  function init() {
    loadGame();
    applyOfflineProgress();
    bindEvents();

    // Let extension modules initialize and bind their own events
    if (window.CokeExt && Array.isArray(window.CokeExt.handlers) && window.CokeExt.handlers.length) {
      const api = buildExtensionApi();
      callExtensions("onInit", api);
      callExtensions("onBindEvents", api);
    }

    updateUI();
    pushLog(
      "Welcome to Coke Tycoon Idle. Buy preforms, labels and pac...ces to grow from a tiny bottler into a shelf-dominating brand.",
      "good"
    );
    startLoop();
  }

  document.addEventListener("DOMContentLoaded", init);
})();