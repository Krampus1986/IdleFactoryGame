(function () {
      "use strict";

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
      const BASE_STORAGE_CAPACITY = 300;
      const BASE_FIXED_COST_PER_HOUR = 15;

      // Flavors: now include basePrice and demand multiplier
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
          demandMultiplier: 1.15,
          basePrice: 2.4,
          unlockRevenue: 60000
        },
        {
          id: "lime",
          name: "Lime Twist",
          demandMultiplier: 1.2,
          basePrice: 2.5,
          unlockRevenue: 120000
        }
      ];

      // Global events (strike, inventory full, demand spike, etc.)
      const globalEventDefs = {
        workers_strike: {
          id: "workers_strike",
          name: "Workers' Strike",
          desc: "Union action slows production drastically while wages still need to be paid.",
          minHours: 8,
          maxHours: 18,
          capacityMult: 0.2,
          demandMult: 1.0,
          extraCostPerHour: 10
        },
        inventory_full: {
          id: "inventory_full",
          name: "Warehouse Overflow",
          desc: "Storage is full. Production halts but fixed costs continue.",
          minHours: 6,
          maxHours: 12,
          capacityMult: 0.0,
          demandMult: 1.0,
          extraCostPerHour: 5
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

      // Upgrades: capacity, auto-buy, marketing, operations, lines & warehouses
      const upgradeDefs = [
        {
          id: "capacity_1",
          name: "Extra Shift",
          desc: "Hire a second shift. +20 bottles/hour.",
          cost: 2500,
          apply: state => {
            state.capacityPerHour += 20;
          }
        },
        {
          id: "capacity_2",
          name: "High-Speed Filler",
          desc: "+40 bottles/hour.",
          cost: 8500,
          apply: state => {
            state.capacityPerHour += 40;
          }
        },
        {
          id: "capacity_3",
          name: "Robotic Palletizer",
          desc: "+70 bottles/hour.",
          cost: 18000,
          apply: state => {
            state.capacityPerHour += 70;
          }
        },
        {
          id: "line_2",
          name: "Second Bottling Line",
          desc: "Adds a second line. +25 bottles/hour.",
          cost: 22000,
          apply: state => {
            state.meta.lines = (state.meta.lines || 1) + 1;
            state.capacityPerHour += 25;
          }
        },
        {
          id: "warehouse_1",
          name: "Warehouse Expansion I",
          desc: "+300 finished bottle storage capacity.",
          cost: 10000,
          apply: state => {
            state.storageCapacity += 300;
            state.meta.warehouses = (state.meta.warehouses || 1) + 1;
          }
        },
        {
          id: "warehouse_2",
          name: "Warehouse Expansion II",
          desc: "+500 finished bottle storage capacity.",
          cost: 28000,
          apply: state => {
            state.storageCapacity += 500;
            state.meta.warehouses = (state.meta.warehouses || 1) + 1;
          }
        },
        {
          id: "auto_buy",
          name: "Smart Procurement",
          desc: "Automatically keeps preforms, labels and packaging in stock.",
          cost: 22000,
          apply: state => {
            state.flags.autoBuy = true;
          }
        },
        {
          id: "marketing_push",
          name: "Regional Marketing Push",
          desc: "+10% demand permanently.",
          cost: 16000,
          apply: state => {
            state.demandModifier *= 1.1;
          }
        },
        {
          id: "premium_packaging",
          name: "Premium Packaging",
          desc: "Customers are willing to pay slightly more. +5% effective margin.",
          cost: 26000,
          apply: state => {
            state.costModifier *= 0.95;
          }
        },
        {
          id: "cold_chain",
          name: "Cold Chain Investment",
          desc: "Better quality on shelf → +7% demand.",
          cost: 32000,
          apply: state => {
            state.demandModifier *= 1.07;
          }
        }
      ];

      const achievementDefs = [
        {
          id: "first_sale",
          label: "First sale",
          check: s => s.stats.sold >= 1
        },
        {
          id: "first_1000",
          label: "Turnover: $1,000",
          check: s => s.stats.revenue >= 1000
        },
        {
          id: "first_10000",
          label: "Turnover: $10,000",
          check: s => s.stats.revenue >= 10000
        },
        {
          id: "first_100k",
          label: "Turnover: $100,000",
          check: s => s.stats.revenue >= 100000
        },
        {
          id: "bottles_10k",
          label: "10,000 bottles produced",
          check: s => s.stats.produced >= 10000
        },
        {
          id: "bottles_50k",
          label: "50,000 bottles produced",
          check: s => s.stats.produced >= 50000
        },
        {
          id: "demand_90",
          label: "Demand at 90%",
          check: s => s.lastDemandLevel >= 90
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

      function unlockedFlavorCount(s) {
        return Object.values(s.flavors || {}).filter(f => f.unlocked).length;
      }

      function currentMonthIndex() {
        return Math.floor((state.day - 1) / 30) + 1;
      }

      function getActiveFlavorState() {
        return state.flavors[state.activeFlavorId] || null;
      }

      function getEffectiveCapacityPerHour() {
        const base = state.capacityPerHour || BASE_CAPACITY_PER_LINE;
        const eventMult =
          (state.events.active && state.events.active.capacityMult) || 1.0;
        return Math.max(0, Math.floor(base * eventMult));
      }

      function getEffectiveDemandMult() {
        const eventMult =
          (state.events.active && state.events.active.demandMult) || 1.0;
        return state.demandModifier * eventMult;
      }

      // --- State & persistence ---

      function defaultState() {
        const baseFlavors = {};
        flavorDefs.forEach(f => {
          baseFlavors[f.id] = {
            unlocked: f.unlockRevenue === 0,
            price: f.basePrice || BASE_MARKET_PRICE,
            producedLifetime: 0,
            soldLifetime: 0,
            monthlyProduced: 0,
            monthlySold: 0
          };
        });

        return {
          version: 2,
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

          lastProduced: 0,
          pricePerBottle: BASE_MARKET_PRICE,
          marketPrice: BASE_MARKET_PRICE,

          inv: { preforms: 0, labels: 0, packaging: 0, bottles: 0 },

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

          brandLegacy: 0,
          demandModifier: 1.0,
          costModifier: 1.0,

          flavors: baseFlavors,
          activeFlavorId: "classic",

          rival: {
            active: false,
            price: 2.5,
            brandPower: 1.2
          },

          lastMarketShare: 1.0,
          lastDemandLevel: 0,

          events: {
            active: null
          },

          adventure: {
            activeId: null,
            remainingHours: 0,
            rewardPending: null
          },

          flags: {
            autoBuy: false
          },
          purchasedUpgrades: {},
          unlockedAchievements: {},
          lastTick: Date.now()
        };
      }

      function loadGame() {
        try {
          const raw = localStorage.getItem("cokeIdleSave");
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
          if (typeof state.storageCapacity !== "number") {
            state.storageCapacity = BASE_STORAGE_CAPACITY;
          }
          if (typeof state.fixedCostPerHour !== "number") {
            state.fixedCostPerHour = BASE_FIXED_COST_PER_HOUR;
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
          if (!state.adventure) {
            state.adventure = {
              activeId: null,
              remainingHours: 0,
              rewardPending: null
            };
          }
          if (!state.stats) {
            state.stats = { produced: 0, sold: 0, revenue: 0, expenses: 0 };
          }
          if (!state.unlockedAchievements) {
            state.unlockedAchievements = {};
          }
          if (!state.purchasedUpgrades) {
            state.purchasedUpgrades = {};
          }

          // Ensure flavors are fully shaped
          const newFlavors = {};
          flavorDefs.forEach(f => {
            const existing = state.flavors && state.flavors[f.id];
            const unlocked =
              existing && typeof existing.unlocked === "boolean"
                ? existing.unlocked
                : f.unlockRevenue === 0;
            const price =
              existing && typeof existing.price === "number"
                ? existing.price
                : f.basePrice || BASE_MARKET_PRICE;

            newFlavors[f.id] = {
              unlocked,
              price,
              producedLifetime: existing?.producedLifetime || 0,
              soldLifetime: existing?.soldLifetime || 0,
              monthlyProduced: 0,
              monthlySold: 0
            };
          });
          state.flavors = newFlavors;
        } catch (e) {
          console.warn("Failed to load save, using default.", e);
          state = defaultState();
        }
      }

      function saveGame() {
        try {
          const clone = JSON.parse(JSON.stringify(state));
          localStorage.setItem("cokeIdleSave", JSON.stringify(clone));
        } catch (e) {
          console.warn("Failed to save game", e);
        }
      }

      // --- Log ---

      function pushLog(text, type) {
        const logBox = D("logBox");
        if (!logBox) return;
        const entry = document.createElement("div");
        entry.className =
          "log-entry" +
          (type === "good" ? " good" : type === "bad" ? " bad" : "");
        entry.textContent = text;
        logBox.prepend(entry);
        while (logBox.childElementCount > 60) {
          logBox.removeChild(logBox.lastElementChild);
        }
      }

      // --- Global events / popup ---

      function hoursForEvent(def) {
        const min = def.minHours;
        const max = def.maxHours;
        return min + Math.floor(Math.random() * (max - min + 1));
      }

      function showEventPopup(title, text) {
        const wrap = D("eventPopup");
        if (!wrap) return;
        const t = D("eventPopupTitle");
        const p = D("eventPopupText");
        if (t) t.textContent = title;
        if (p) p.textContent = text;
        wrap.classList.remove("hidden");
      }

      function hideEventPopup() {
        const wrap = D("eventPopup");
        if (!wrap) return;
        wrap.classList.add("hidden");
      }

      function startGlobalEvent(id, options = {}) {
        const def = globalEventDefs[id];
        if (!def) return;
        const already = state.events.active;
        if (already && already.id === id) return;

        const duration = options.durationHours || hoursForEvent(def);

        state.events.active = {
          id: def.id,
          name: def.name,
          desc: def.desc,
          remainingHours: duration,
          capacityMult: def.capacityMult,
          demandMult: def.demandMult,
          extraCostPerHour: def.extraCostPerHour
        };

        showEventPopup(def.name, def.desc + " (est. " + duration + "h)");
        pushLog("Global event started: " + def.name + ".", "bad");
      }

      function endGlobalEvent() {
        if (!state.events.active) return;
        pushLog("Global event ended: " + state.events.active.name + ".", "good");
        state.events.active = null;
      }

      function updateGlobalEvent() {
        const ev = state.events.active;
        if (!ev) return;
        ev.remainingHours -= 1;
        if (ev.remainingHours <= 0) {
          endGlobalEvent();
        }
      }

      function maybeTriggerRandomEvent() {
        if (state.events.active) return;
        if (state.day < 5) return;
        if (Math.random() < 0.01) {
          const pool = ["workers_strike", "heatwave"];
          const pick = pool[Math.floor(Math.random() * pool.length)];
          startGlobalEvent(pick);
        }
      }

      // --- Adventure mode ---

      function startAdventure(id) {
        const def = adventureDefs.find(a => a.id === id);
        if (!def) return;
        if (state.adventure.activeId) {
          pushLog("An adventure is already in progress.", "bad");
          return;
        }
        if (state.inv.bottles < def.minBottlesRequired) {
          pushLog(
            "Adventure requires at least " +
              def.minBottlesRequired +
              " bottles ready.",
            "bad"
          );
          return;
        }
        state.inv.bottles -= def.minBottlesRequired;
        state.adventure.activeId = def.id;
        state.adventure.remainingHours = def.durationHours;
        state.adventure.rewardPending = def.reward;
        pushLog("Adventure started: " + def.name + ".", "good");
      }

      function updateAdventure() {
        if (!state.adventure.activeId) return;
        state.adventure.remainingHours -= 1;
        if (state.adventure.remainingHours <= 0) {
          const def = adventureDefs.find(a => a.id === state.adventure.activeId);
          const reward = state.adventure.rewardPending || {};
          if (reward.cash) {
            state.cash += reward.cash;
            state.stats.revenue += reward.cash;
            state.monthly.revenue += reward.cash;
          }
          if (reward.legacy) {
            state.brandLegacy += reward.legacy;
          }
          const name = def ? def.name : "Adventure";
          showEventPopup(
            "Adventure complete",
            name + " finished. Rewards applied to your brand."
          );
          pushLog("Adventure completed: " + name + ".", "good");
          state.adventure.activeId = null;
          state.adventure.remainingHours = 0;
          state.adventure.rewardPending = null;
        }
      }

      // --- Game logic ---

      function applyOfflineProgress() {
        const now = Date.now();
        const elapsedMs = now - state.lastTick;
        const offlineTicks = Math.min(
          OFFLINE_TICK_CAP,
          Math.floor(elapsedMs / TICK_MS)
        );
        if (offlineTicks > 0) {
          for (let i = 0; i < offlineTicks; i++) {
            runSingleTick(false);
          }
          pushLog(
            "While you were away, your factory ran for ~" +
              offlineTicks +
              " in-game hours.",
            "good"
          );
        }
        state.lastTick = now;
      }

      function applyFixedCosts() {
        const ev = state.events.active;
        const extra = ev ? ev.extraCostPerHour || 0 : 0;
        const cost = state.fixedCostPerHour + extra;
        if (cost > 0) {
          state.cash -= cost;
          state.stats.expenses += cost;
          state.monthly.expenses += cost;
        }
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
          showEventPopup("Monthly Recap", msg);
          pushLog(msg, profit >= 0 ? "good" : "bad");

          state.monthly = { produced: 0, sold: 0, revenue: 0, expenses: 0 };
          state.calendar.lastMonthIndex = current;
        }
      }

      function runSingleTick(online) {
        advanceTime();
        applyFixedCosts();

        if (state.flags.autoBuy) {
          autoBuySupplies();
        }

        const produced = produceBottles();
        const saleInfo = sellFlavors();

        state.lastProduced = produced;
        state.lastDemandLevel = saleInfo.demanded || 0;
        state.lastMarketShare = saleInfo.marketShare || 100;

        maybeUnlockFlavors();
        maybeActivateRival();
        maybeTriggerRandomEvent();
        updateGlobalEvent();
        updateAdventure();
        checkUpgrades();
        checkAchievements();
        maybeHandleMonthEnd();

        if (online) {
          state.lastTick = Date.now();
        }
      }

      function advanceTime() {
        state.hour += 1;
        if (state.hour >= 24) {
          state.hour = 0;
          state.day += 1;
          if (state.rival.active) {
            const drift = (Math.random() - 0.5) * 0.4;
            state.rival.price = clamp(
              1.2,
              5.0,
              state.rival.price + drift
            );
          }
        }
      }

      function ensureSupplies(amount) {
        const inv = state.inv;
        const neededPreforms = Math.max(0, amount - inv.preforms);
        const neededLabels = Math.max(0, amount - inv.labels);
        const neededPackaging = Math.max(0, amount - inv.packaging);

        const totalCost =
          neededPreforms * SUPPLY_COST.preforms +
          neededLabels * SUPPLY_COST.labels +
          neededPackaging * SUPPLY_COST.packaging;

        if (totalCost <= state.cash && totalCost > 0) {
          state.cash -= totalCost;
          state.stats.expenses += totalCost;
          state.monthly.expenses += totalCost;
          inv.preforms += neededPreforms;
          inv.labels += neededLabels;
          inv.packaging += neededPackaging;
        }
      }

      function autoBuySupplies() {
        const target = getEffectiveCapacityPerHour() * 6;
        ensureSupplies(target);
      }

      function buySupply(kind, amount, logOnFail = true) {
        const costPer = SUPPLY_COST[kind] || 0;
        const total = costPer * amount;
        if (total <= 0) return;
        if (total > state.cash) {
          if (logOnFail) {
            pushLog(
              "Not enough cash to buy " + amount + " " + kind + ".",
              "bad"
            );
          }
          return;
        }
        state.cash -= total;
        state.stats.expenses += total;
        state.monthly.expenses += total;

        if (kind === "preforms") state.inv.preforms += amount;
        if (kind === "labels") state.inv.labels += amount;
        if (kind === "packaging") state.inv.packaging += amount;

        if (logOnFail) {
          pushLog("Purchased " + amount + " " + kind + ".", "good");
        }
      }

      function produceBottles() {
        const inv = state.inv;

        if (inv.bottles >= state.storageCapacity) {
          startGlobalEvent("inventory_full");
          return 0;
        }

        const effCapacity = getEffectiveCapacityPerHour();
        const maxPossible = Math.min(
          inv.preforms,
          inv.labels,
          inv.packaging,
          effCapacity
        );
        if (maxPossible <= 0) {
          return 0;
        }

        const freeStorage = Math.max(0, state.storageCapacity - inv.bottles);
        const actual = Math.min(maxPossible, freeStorage);
        if (actual <= 0) {
          startGlobalEvent("inventory_full");
          return 0;
        }

        inv.preforms -= actual;
        inv.labels -= actual;
        inv.packaging -= actual;
        inv.bottles += actual;

        state.stats.produced += actual;
        state.monthly.produced += actual;

        const unlockedIds = Object.keys(state.flavors).filter(
          id => state.flavors[id].unlocked
        );
        if (unlockedIds.length > 0) {
          const totalWeight = unlockedIds.reduce((sum, id) => {
            const def = flavorDefs.find(f => f.id === id);
            return sum + (def?.demandMultiplier || 1);
          }, 0);
          unlockedIds.forEach(id => {
            const def = flavorDefs.find(f => f.id === id);
            const w = (def?.demandMultiplier || 1) / (totalWeight || 1);
            const share = Math.round(actual * w);
            const fState = state.flavors[id];
            fState.producedLifetime += share;
            fState.monthlyProduced += share;
          });
        }

        return actual;
      }

      function sellFlavors() {
        const globalDemandBase = 40 + state.day * 0.5;
        const legacyMult = 1 + state.brandLegacy * 0.2;
        const marketingMult = getEffectiveDemandMult();

        const rivalActive = state.rival.active;
        const rivalPrice = state.rival.price;

        const unlockedIds = Object.keys(state.flavors).filter(
          id => state.flavors[id].unlocked
        );
        if (unlockedIds.length === 0) {
          return { sold: 0, demanded: 0, marketShare: 100 };
        }

        const invBottles = state.inv.bottles;
        if (invBottles <= 0) {
          return { sold: 0, demanded: 0, marketShare: 100 };
        }

        let totalDesired = 0;
        let totalPlayerScore = 0;
        let totalRivalScore = 0;

        const flavorDemands = [];

        unlockedIds.forEach(id => {
          const def = flavorDefs.find(f => f.id === id);
          const fState = state.flavors[id];

          const flavorMult = def?.demandMultiplier || 1.0;
          const yourPrice = fState.price || def.basePrice || BASE_MARKET_PRICE;

          const priceFactor = clamp(
            0,
            2.5,
            (BASE_MARKET_PRICE * 1.8 - yourPrice) / (BASE_MARKET_PRICE * 1.0)
          );

          let rivalScore = 0;
          let playerScore = 1 * priceFactor;
          if (rivalActive) {
            const rivalPriceFactor = clamp(
              0,
              2.5,
              (BASE_MARKET_PRICE * 1.8 - rivalPrice) /
                (BASE_MARKET_PRICE * 1.0)
            );
            rivalScore = state.rival.brandPower * rivalPriceFactor;
          }

          const baseDemand =
            globalDemandBase * legacyMult * marketingMult * flavorMult;
          const randomFactor = 0.85 + Math.random() * 0.3;
          const totalScore = playerScore + rivalScore;

          let yourDemand;
          if (totalScore <= 0.01) {
            yourDemand = baseDemand * randomFactor;
          } else {
            yourDemand = (baseDemand * (playerScore / totalScore)) * randomFactor;
          }

          const demandRounded = Math.max(0, Math.round(yourDemand));

          flavorDemands.push({
            id,
            yourPrice,
            demandRounded,
            playerScore,
            rivalScore
          });

          totalDesired += demandRounded;
          totalPlayerScore += playerScore;
          totalRivalScore += rivalScore;
        });

        const totalScore = totalPlayerScore + totalRivalScore;
        const marketShare =
          totalScore > 0 ? Math.round((totalPlayerScore / totalScore) * 100) : 100;

        if (totalDesired <= 0) {
          return { sold: 0, demanded: 0, marketShare };
        }

        const scale =
          totalDesired <= invBottles ? 1 : invBottles / (totalDesired || 1);

        let totalSold = 0;
        let totalRevenue = 0;

        flavorDemands.forEach(fd => {
          if (totalSold >= invBottles) return;
          const sold = Math.min(
            invBottles - totalSold,
            Math.floor(fd.demandRounded * scale)
          );
          if (sold <= 0) return;

          totalSold += sold;
          const rev = sold * fd.yourPrice;
          totalRevenue += rev;

          const fState = state.flavors[fd.id];
          fState.soldLifetime += sold;
          fState.monthlySold += sold;
        });

        if (totalSold > 0) {
          state.inv.bottles -= totalSold;
          state.cash += totalRevenue;
          state.stats.sold += totalSold;
          state.stats.revenue += totalRevenue;
          state.monthly.sold += totalSold;
          state.monthly.revenue += totalRevenue;
        }

        // Update global "market price" approximation
        state.marketPrice = BASE_MARKET_PRICE;

        return { sold: totalSold, demanded: totalDesired, marketShare };
      }

      function maybeUnlockFlavors() {
        flavorDefs.forEach(f => {
          if (!state.flavors[f.id]) {
            state.flavors[f.id] = {
              unlocked: f.unlockRevenue === 0,
              price: f.basePrice || BASE_MARKET_PRICE,
              producedLifetime: 0,
              soldLifetime: 0,
              monthlyProduced: 0,
              monthlySold: 0
            };
          }
          const fs = state.flavors[f.id];
          if (!fs.unlocked && state.stats.revenue >= f.unlockRevenue) {
            fs.unlocked = true;
            pushLog("Unlocked new flavor: " + f.name + ".", "good");
          }
        });
      }

      function maybeActivateRival() {
        if (state.rival.active) return;
        if (state.stats.revenue >= 40000 || state.stats.sold >= 8000) {
          state.rival.active = true;
          state.rival.price = 2.3 + Math.random() * 0.6;
          pushLog(
            "Major retailer noticed you. They roll out their own cola and start competing on price.",
            "bad"
          );
        }
      }

      function checkUpgrades() {
        // reserved for dynamic unlock rules later
      }

      function prestigeAvailable() {
        return state.stats.revenue >= 250000;
      }

      function performPrestige() {
        const legacyGain = 1;
        state.brandLegacy += legacyGain;
        const oldLegacy = state.brandLegacy;
        const newState = defaultState();
        newState.brandLegacy = oldLegacy;
        newState.cash = 1500 * (1 + oldLegacy * 0.25);
        newState.capacityPerHour = BASE_CAPACITY_PER_LINE + 5 * oldLegacy;
        newState.demandModifier = 1.0 + 0.1 * oldLegacy;
        newState.lastTick = Date.now();
        newState.unlockedAchievements = Object.assign(
          {},
          state.unlockedAchievements
        );
        state = newState;
        pushLog(
          "You rebranded the company. Brand Legacy increased to x" +
            oldLegacy.toFixed(1) +
            ".",
          "good"
        );
      }

      function checkAchievements() {
        achievementDefs.forEach(def => {
          if (state.unlockedAchievements[def.id]) return;
          if (def.check(state)) {
            state.unlockedAchievements[def.id] = true;
            pushLog("Achievement unlocked: " + def.label + ".", "good");
          }
        });
      }

      // --- UI rendering ---

      function renderFlavors() {
        const row = D("flavorsRow");
        if (!row) return;
        row.innerHTML = "";
        flavorDefs.forEach(def => {
          const flavorState = state.flavors[def.id];
          const pill = document.createElement("button");
          pill.type = "button";
          pill.className =
            "flavor-pill" + (def.id === state.activeFlavorId ? " active" : "");
          if (!flavorState || !flavorState.unlocked) {
            pill.className += " locked";
          }
          pill.dataset.flavorId = def.id;

          const dot = document.createElement("span");
          dot.className = "dot";
          pill.appendChild(dot);

          const label = document.createElement("span");
          if (!flavorState || !flavorState.unlocked) {
            label.textContent =
              def.name +
              " (locked: $" +
              def.unlockRevenue.toLocaleString() +
              ")";
          } else {
            const price =
              flavorState.price || def.basePrice || BASE_MARKET_PRICE;
            label.textContent = def.name + " • " + formatMoney(price);
          }
          pill.appendChild(label);

          if (!flavorState || !flavorState.unlocked) {
            pill.disabled = true;
          }

          pill.addEventListener("click", () => {
            state.activeFlavorId = def.id;
            const f = getActiveFlavorState();
            if (f) {
              state.pricePerBottle = f.price;
            }
            renderFlavors();
            updateMarketUI();
          });

          row.appendChild(pill);
        });
      }

      function renderUpgrades() {
        const list = D("upgradesList");
        if (!list) return;
        list.innerHTML = "";
        upgradeDefs.forEach(def => {
          const purchased = !!state.purchasedUpgrades[def.id];
          const wrap = document.createElement("div");
          wrap.className = "upgrade" + (purchased ? " purchased" : "");
          const left = document.createElement("div");
          const right = document.createElement("div");

          const title = document.createElement("h4");
          title.textContent = def.name;
          left.appendChild(title);

          const p = document.createElement("p");
          p.textContent = def.desc;
          left.appendChild(p);

          const small = document.createElement("small");
          small.textContent = "Cost: " + formatMoney(def.cost);
          left.appendChild(small);

          const tag = document.createElement("div");
          tag.className = "tag";
          tag.textContent = purchased ? "Purchased" : "Upgrade";
          left.appendChild(tag);

          const btn = document.createElement("button");
          btn.className = "btn primary";
          btn.textContent = purchased ? "Owned" : "Buy";
          btn.disabled = purchased || state.cash < def.cost;
          btn.addEventListener("click", () => {
            if (purchased) return;
            if (state.cash < def.cost) {
              pushLog("Not enough cash for " + def.name + ".", "bad");
              return;
            }
            state.cash -= def.cost;
            state.stats.expenses += def.cost;
            state.monthly.expenses += def.cost;
            state.purchasedUpgrades[def.id] = true;
            def.apply(state);
            pushLog("Upgrade purchased: " + def.name + ".", "good");
            if (def.id === "auto_buy") {
              const el = D("autoBuyStatus");
              if (el) el.textContent = "Auto-buy: on";
            }
            renderUpgrades();
            updateUI();
            saveGame();
          });

          right.appendChild(btn);

          wrap.appendChild(left);
          wrap.appendChild(right);
          list.appendChild(wrap);
        });
      }

      function renderAchievements() {
        const box = D("achievementsList");
        if (!box) return;
        box.innerHTML = "";
        achievementDefs.forEach(def => {
          const span = document.createElement("span");
          const unlocked = !!state.unlockedAchievements[def.id];
          span.className = "achievement" + (unlocked ? " unlocked" : "");
          span.textContent = def.label;
          box.appendChild(span);
        });
      }

      function renderAdventureUI() {
        const box = D("adventureBox");
        if (!box) return;

        const activeId = state.adventure.activeId;
        if (!activeId) {
          box.innerHTML = `
            <div class="chip-main">
              <strong>No active campaign</strong>
              <span>Equip your factory with a field promotion to boost growth.</span>
            </div>
          `;
          return;
        }
        const def = adventureDefs.find(a => a.id === activeId);
        const name = def ? def.name : "Campaign";
        const remaining = state.adventure.remainingHours;

        box.innerHTML = `
          <div class="chip-main">
            <strong>${name}</strong>
            <span>${remaining}h remaining</span>
          </div>
          <div class="chip-sub">
            <span>Adventure in progress. Boosted impact on your brand while it runs.</span>
          </div>
        `;
      }

      function updateTopbar() {
        const cashEl = D("cashDisplay");
        if (cashEl) cashEl.textContent = formatMoney(state.cash);
        const dayEl = D("dayDisplay");
        if (dayEl) dayEl.textContent = state.day.toString();
        const hh = state.hour.toString().padStart(2, "0");
        const timeEl = D("timeDisplay");
        if (timeEl) timeEl.textContent = hh + ":00";
        const legacyEl = D("legacyDisplay");
        if (legacyEl)
          legacyEl.textContent = "x" + (1 + state.brandLegacy * 0.2).toFixed(1);
      }

      function updateProductionUI() {
        const effCap = getEffectiveCapacityPerHour();
        const capEl = D("capacityDisplay");
        if (capEl) capEl.textContent = effCap.toString();

        const lastProdEl = D("lastProducedDisplay");
        if (lastProdEl) lastProdEl.textContent = state.lastProduced.toString();

        const lifeProdEl = D("lifetimeProducedDisplay");
        if (lifeProdEl)
          lifeProdEl.textContent = state.stats.produced.toLocaleString();

        const preEl = D("invPreforms");
        if (preEl) preEl.textContent = state.inv.preforms.toString();
        const labEl = D("invLabels");
        if (labEl) labEl.textContent = state.inv.labels.toString();
        const packEl = D("invPackaging");
        if (packEl) packEl.textContent = state.inv.packaging.toString();
        const botEl = D("invBottles");
        if (botEl)
          botEl.textContent =
            state.inv.bottles.toString() +
            " / " +
            state.storageCapacity.toString();

        const autoText = state.flags.autoBuy ? "Auto-buy: on" : "Auto-buy: off";
        const autoEl = D("autoBuyStatus");
        if (autoEl) autoEl.textContent = autoText;

        const rivalStatus = state.rival.active
          ? "Rivals: competing"
          : "Rivals: sleeping";
        const rivalEl = D("rivalStatus");
        if (rivalEl) rivalEl.textContent = rivalStatus;

        const demandHint = D("demandHint");
        if (demandHint) {
          let label = "Demand: calm";
          if (state.lastDemandLevel > 80) label = "Demand: surging";
          else if (state.lastDemandLevel > 40) label = "Demand: steady";
          else if (state.lastDemandLevel < 10) label = "Demand: weak";
          demandHint.textContent = label;
        }
      }

      function updateMarketUI() {
        const activeFlavor = getActiveFlavorState();
        const price =
          activeFlavor && typeof activeFlavor.price === "number"
            ? activeFlavor.price
            : state.pricePerBottle;

        state.pricePerBottle = price;

        const priceEl = D("priceDisplay");
        if (priceEl) priceEl.textContent = formatMoney(price);

        const marketPriceEl = D("marketPriceDisplay");
        if (marketPriceEl)
          marketPriceEl.textContent = formatMoney(
            state.marketPrice || BASE_MARKET_PRICE
          );

        const demandPercent = clamp(
          0,
          300,
          (state.lastDemandLevel / 40) * 100
        );
        const demandEl = D("demandLevelDisplay");
        if (demandEl)
          demandEl.textContent = Math.round(demandPercent).toString() + "%";

        const sharePercent = Math.round(state.lastMarketShare || 100);
        const shareEl = D("marketShareDisplay");
        if (shareEl) shareEl.textContent = sharePercent + "%";

        const rivalPriceEl = D("rivalPriceDisplay");
        if (rivalPriceEl)
          rivalPriceEl.textContent = state.rival.active
            ? formatMoney(state.rival.price)
            : "–";

        const soldEl = D("soldDisplay");
        if (soldEl) soldEl.textContent = state.stats.sold.toLocaleString();
        const revEl = D("revenueDisplay");
        if (revEl) revEl.textContent = formatMoney(state.stats.revenue);
        const expEl = D("expensesDisplay");
        if (expEl) expEl.textContent = formatMoney(state.stats.expenses);

        const slider = D("priceSlider");
        if (slider && slider !== document.activeElement) {
          slider.value = price.toFixed(2);
        }

        const prestigeButton = D("prestigeButton");
        const prestigeHint = D("prestigeHint");
        if (prestigeAvailable()) {
          if (prestigeButton) prestigeButton.disabled = false;
          if (prestigeHint)
            prestigeHint.textContent =
              "You can rebrand now. Reset and gain Brand Legacy!";
        } else {
          if (prestigeButton) prestigeButton.disabled = true;
          if (prestigeHint)
            prestigeHint.textContent =
              "Earn $250,000 total revenue to unlock Brand Legacy.";
        }
      }

      function updatePrestigeUI() {
        const hint = D("prestigeHint");
        if (!hint) return;
        if (prestigeAvailable()) {
          hint.textContent =
            "You can rebrand now. Reset and gain Brand Legacy!";
        } else {
          hint.textContent =
            "Rebrand: reset everything but gain a permanent Brand Legacy multiplier.";
        }
      }

      function updateUI() {
        updateTopbar();
        updateProductionUI();
        updateMarketUI();
        updatePrestigeUI();
        renderFlavors();
        renderUpgrades();
        renderAchievements();
        renderAdventureUI();
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
            if (!kind || !amount) return;
            buySupply(kind, amount, true);
            updateUI();
            saveGame();
          });
        }

        const slider = D("priceSlider");
        if (slider) {
          slider.addEventListener("input", () => {
            const v = parseFloat(slider.value);
            if (!isFinite(v)) return;
            const price = clamp(0.5, 5, v);
            const f = getActiveFlavorState();
            if (f) {
              f.price = price;
            }
            state.pricePerBottle = price;
            updateMarketUI();
            renderFlavors();
          });
          slider.addEventListener("change", () => {
            saveGame();
          });
        }

        const prestigeButton = D("prestigeButton");
        if (prestigeButton) {
          prestigeButton.addEventListener("click", () => {
            if (!prestigeAvailable()) return;
            const sure = confirm(
              "Rebrand the company? This will reset cash, inventory and upgrades, but increase your Brand Legacy permanently."
            );
            if (!sure) return;
            performPrestige();
            updateUI();
            saveGame();
          });
        }

        const popupClose = D("eventPopupClose");
        if (popupClose) {
          popupClose.addEventListener("click", () => {
            hideEventPopup();
          });
        }

        const adventureBtn = D("adventureStartStadium");
        if (adventureBtn) {
          adventureBtn.addEventListener("click", () => {
            startAdventure("stadium_promo");
            updateUI();
            saveGame();
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

      // --- Bootstrap ---

      function init() {
        loadGame();
        applyOfflineProgress();
        bindEvents();
        updateUI();
        pushLog(
          "Welcome to Coke Tycoon Idle. Buy preforms, labels and packaging, build lines & warehouses, then tune your prices to grow from a tiny bottler into a shelf-dominating brand.",
          "good"
        );
        startLoop();
      }

      document.addEventListener("DOMContentLoaded", init);
    })();