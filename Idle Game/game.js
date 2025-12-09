    (function () {
      "use strict";

      const TICK_MS = 1000;
      const OFFLINE_TICK_CAP = 3600; // max simulated offline hours

      const SUPPLY_COST = {
        preforms: 0.25,
        labels: 0.05,
        packaging: 0.1
      };

      const BASE_MARKET_PRICE = 2.0;

      const flavorDefs = [
        { id: "classic", name: "Classic Cola", demandMultiplier: 1.0, unlockRevenue: 0 },
        { id: "cherry", name: "Cherry Cola", demandMultiplier: 1.1, unlockRevenue: 20000 },
        { id: "zero", name: "Zero Sugar", demandMultiplier: 1.15, unlockRevenue: 60000 },
        { id: "lime", name: "Lime Twist", demandMultiplier: 1.2, unlockRevenue: 120000 }
      ];

      const upgradeDefs = [
        {
          id: "capacity_1",
          name: "Extra Shift",
          desc: "Hire a second shift. +20 bottles/hour.",
          cost: 2500,
          apply: state => { state.capacityPerHour += 20; }
        },
        {
          id: "capacity_2",
          name: "High-Speed Filler",
          desc: "+40 bottles/hour.",
          cost: 8500,
          apply: state => { state.capacityPerHour += 40; }
        },
        {
          id: "capacity_3",
          name: "Robotic Palletizer",
          desc: "+70 bottles/hour.",
          cost: 18000,
          apply: state => { state.capacityPerHour += 70; }
        },
        {
          id: "auto_buy",
          name: "Smart Procurement",
          desc: "Automatically keeps preforms, labels and packaging in stock.",
          cost: 22000,
          apply: state => { state.flags.autoBuy = true; }
        },
        {
          id: "marketing_push",
          name: "Regional Marketing Push",
          desc: "+10% demand permanently.",
          cost: 16000,
          apply: state => { state.demandModifier *= 1.1; }
        },
        {
          id: "premium_packaging",
          name: "Premium Packaging",
          desc: "Customers are willing to pay slightly more. +5% effective price.",
          cost: 26000,
          apply: state => { state.costModifier *= 0.95; }
        },
        {
          id: "cold_chain",
          name: "Cold Chain Investment",
          desc: "Better quality on shelf → +7% demand.",
          cost: 32000,
          apply: state => { state.demandModifier *= 1.07; }
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

      let state;
      let tickHandle = null;

      function defaultState() {
        const baseFlavors = {};
        flavorDefs.forEach(f => {
          baseFlavors[f.id] = { unlocked: f.unlockRevenue === 0 };
        });
        return {
          cash: 2500,
          day: 1,
          hour: 8,
          capacityPerHour: 25,
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
          flags: {
            autoBuy: false
          },
          purchasedUpgrades: {},
          unlockedAchievements: {},
          lastTick: Date.now()
        };
      }

      function formatMoney(v) {
        return "$" + v.toFixed(2);
      }

      function unlockedFlavorCount(s) {
        return Object.values(s.flavors).filter(f => f.unlocked).length;
      }

      // --- Persistence ---

      function loadGame() {
        try {
          const raw = localStorage.getItem("cokeIdleSave");
          if (!raw) {
            state = defaultState();
            return;
          }
          const parsed = JSON.parse(raw);
          state = Object.assign(defaultState(), parsed);
          // Ensure flavor map includes new flavors
          flavorDefs.forEach(f => {
            if (!state.flavors[f.id]) {
              state.flavors[f.id] = { unlocked: f.unlockRevenue === 0 };
            }
          });
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

      // --- DOM helpers ---

      function D(id) {
        return document.getElementById(id);
      }

      function pushLog(text, type) {
        const logBox = D("logBox");
        if (!logBox) return;
        const entry = document.createElement("div");
        entry.className = "log-entry" + (type === "good" ? " good" : type === "bad" ? " bad" : "");
        entry.textContent = text;
        logBox.prepend(entry);
        while (logBox.childElementCount > 60) {
          logBox.removeChild(logBox.lastElementChild);
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
            "While you were away, your factory ran for ~" + offlineTicks + " in-game hours.",
            "good"
          );
        }
        state.lastTick = now;
      }

      function runSingleTick(online) {
        advanceTime();
        if (state.flags.autoBuy) {
          autoBuySupplies();
        }
        const produced = produceBottles();
        const saleInfo = sellBottles();
        state.lastProduced = produced;
        state.lastMarketShare = saleInfo.marketShare;
        state.lastDemandLevel = saleInfo.demandLevel;
        maybeUnlockFlavors();
        maybeActivateRival();
        checkUpgrades();
        checkAchievements();
        if (online) {
          saveGame();
        }
      }

      function advanceTime() {
        state.hour += 1;
        if (state.hour >= 24) {
          state.hour = 0;
          state.day += 1;
        }
      }

      function ensureSupplies(amount) {
        const neededPreforms = Math.max(0, amount - state.inv.preforms);
        const neededLabels = Math.max(0, amount - state.inv.labels);
        const neededPackaging = Math.max(0, amount - state.inv.packaging);

        const totalCost =
          neededPreforms * SUPPLY_COST.preforms +
          neededLabels * SUPPLY_COST.labels +
          neededPackaging * SUPPLY_COST.packaging;

        if (totalCost <= state.cash && totalCost > 0) {
          state.cash -= totalCost;
          state.stats.expenses += totalCost;
          state.inv.preforms += neededPreforms;
          state.inv.labels += neededLabels;
          state.inv.packaging += neededPackaging;
        }
      }

      function autoBuySupplies() {
        const target = state.capacityPerHour * 4;
        ensureSupplies(target);
      }

      function produceBottles() {
        const possible = Math.min(
          state.capacityPerHour,
          state.inv.preforms,
          state.inv.labels,
          state.inv.packaging
        );
        if (possible <= 0) return 0;
        state.inv.preforms -= possible;
        state.inv.labels -= possible;
        state.inv.packaging -= possible;
        state.inv.bottles += possible;
        state.stats.produced += possible;
        return possible;
      }

      function computeDemand(price, marketPrice, flavorFactor) {
        const ratio = price / marketPrice;
        let demand = 1.0;
        if (ratio > 1.2) {
          demand -= (ratio - 1.2) * 1.4;
        } else if (ratio < 0.8) {
          demand += (0.8 - ratio) * 1.2;
        }
        demand = Math.max(0.05, Math.min(1.4, demand));
        demand *= flavorFactor;
        demand *= state.demandModifier;
        demand *= 1 + state.brandLegacy * 0.15;
        return demand;
      }

      function sellBottles() {
        const activeFlavor = flavorDefs.find(f => f.id === state.activeFlavorId) || flavorDefs[0];
        const flavorFactor = activeFlavor.demandMultiplier;
        let marketPrice = BASE_MARKET_PRICE * 1.05;
        if (state.rival.active) {
          marketPrice = (state.pricePerBottle + state.rival.price) / 2;
        }
        state.marketPrice = marketPrice;

        const demandFactor = computeDemand(state.pricePerBottle, marketPrice, flavorFactor);
        const maxDemand = state.capacityPerHour * 1.2;
        const potentialSales = Math.min(state.inv.bottles, Math.floor(maxDemand * demandFactor));
        if (potentialSales <= 0) {
          return { sold: 0, marketShare: 0, demandLevel: Math.round(demandFactor * 50) };
        }

        state.inv.bottles -= potentialSales;
        state.stats.sold += potentialSales;

        const effectivePrice = state.pricePerBottle * (1 + (1 - state.costModifier) * 0.5);
        const revenue = potentialSales * effectivePrice;
        state.cash += revenue;
        state.stats.revenue += revenue;

        const demandLevel = Math.max(0, Math.min(100, Math.round(demandFactor * 70)));
        let marketShare = 100;
        if (state.rival.active) {
          const ourScore = demandFactor * (1 + state.brandLegacy * 0.2);
          const rivalScore = 1.0 * state.rival.brandPower;
          marketShare = Math.round((ourScore / (ourScore + rivalScore)) * 100);
        }

        return {
          sold: potentialSales,
          revenue,
          demandLevel,
          marketShare
        };
      }

      function maybeUnlockFlavors() {
        flavorDefs.forEach(f => {
          if (!state.flavors[f.id]) {
            state.flavors[f.id] = { unlocked: f.unlockRevenue === 0 };
          }
          if (!state.flavors[f.id].unlocked && state.stats.revenue >= f.unlockRevenue) {
            state.flavors[f.id].unlocked = true;
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
        // No-op for now; placeholder for dynamic unlock rules if needed later
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
        newState.capacityPerHour = 25 + 5 * oldLegacy;
        newState.demandModifier = 1.0 + 0.1 * oldLegacy;
        newState.lastTick = Date.now();
        newState.unlockedAchievements = Object.assign({}, state.unlockedAchievements);
        state = newState;
        pushLog(
          "You rebranded the company. Brand Legacy increased to x" +
            oldLegacy.toFixed(1) + ".",
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

      function clamp(min, max, v) {
        return Math.min(max, Math.max(min, v));
      }

      // --- UI rendering ---

      function renderFlavors() {
        const row = D("flavorsRow");
        row.innerHTML = "";
        flavorDefs.forEach(def => {
          const flavorState = state.flavors[def.id];
          const pill = document.createElement("button");
          pill.type = "button";
          pill.className = "flavor-pill" + (def.id === state.activeFlavorId ? " active" : "");
          if (!flavorState || !flavorState.unlocked) {
            pill.className += " locked";
          }
          pill.dataset.flavorId = def.id;

          const dot = document.createElement("span");
          dot.className = "dot";
          pill.appendChild(dot);

          const label = document.createElement("span");
          label.textContent = flavorState && flavorState.unlocked
            ? def.name
            : def.name + " (locked: $" + def.unlockRevenue.toLocaleString() + ")";
          pill.appendChild(label);

          if (!flavorState || !flavorState.unlocked) {
            pill.disabled = true;
          }

          pill.addEventListener("click", () => {
            state.activeFlavorId = def.id;
            renderFlavors();
          });

          row.appendChild(pill);
        });
      }

      function renderUpgrades() {
        const list = D("upgradesList");
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
            state.purchasedUpgrades[def.id] = true;
            def.apply(state);
            pushLog("Upgrade purchased: " + def.name + ".", "good");
            if (def.id === "auto_buy") {
              D("autoBuyStatus").textContent = "Auto-buy: on";
            }
            renderUpgrades();
          });

          right.appendChild(btn);

          wrap.appendChild(left);
          wrap.appendChild(right);
          list.appendChild(wrap);
        });
      }

      function renderAchievements() {
        const box = D("achievementsList");
        box.innerHTML = "";
        achievementDefs.forEach(def => {
          const span = document.createElement("span");
          const unlocked = !!state.unlockedAchievements[def.id];
          span.className = "achievement" + (unlocked ? " unlocked" : "");
          span.textContent = def.label;
          box.appendChild(span);
        });
      }

      function updateTopbar() {
        D("cashDisplay").textContent = formatMoney(state.cash);
        D("dayDisplay").textContent = state.day.toString();
        const hh = state.hour.toString().padStart(2, "0");
        D("timeDisplay").textContent = hh + ":00";
        D("legacyDisplay").textContent = "x" + (1 + state.brandLegacy * 0.2).toFixed(1);
      }

      function updateProductionUI() {
        D("capacityDisplay").textContent = state.capacityPerHour.toString();
        D("lastProducedDisplay").textContent = state.lastProduced.toString();
        D("lifetimeProducedDisplay").textContent = state.stats.produced.toLocaleString();

        D("invPreforms").textContent = state.inv.preforms.toString();
        D("invLabels").textContent = state.inv.labels.toString();
        D("invPackaging").textContent = state.inv.packaging.toString();
        D("invBottles").textContent = state.inv.bottles.toString();

        const autoText = state.flags.autoBuy ?
          "Auto-buy: on" :
          "Auto-buy: off";
        D("autoBuyStatus").textContent = autoText;

        const rivalText = state.rival.active ?
          "Rivals: active" :
          "Rivals: sleeping";
        D("rivalStatus").textContent = rivalText;
      }

      function updateMarketUI() {
        D("priceDisplay").textContent = formatMoney(state.pricePerBottle);
        D("marketPriceDisplay").textContent = formatMoney(state.marketPrice || BASE_MARKET_PRICE);
        const demandLevel = state.lastDemandLevel || 0;
        const share = state.lastMarketShare || 0;
        D("demandLevelDisplay").textContent = demandLevel + "%";
        D("marketShareDisplay").textContent = share + "%";
        D("rivalPriceDisplay").textContent = state.rival.active ? formatMoney(state.rival.price) : "$0.00";

        const slider = D("priceSlider");
        if (slider && slider.value !== String(state.pricePerBottle)) {
          slider.value = state.pricePerBottle.toString();
        }

        const prestigeButton = D("prestigeButton");
        const prestigeHint = D("prestigeHint");
        if (prestigeAvailable()) {
          prestigeButton.disabled = false;
          prestigeHint.textContent =
            "You can rebrand now. Reset and gain Brand Legacy!";
        } else {
          prestigeButton.disabled = true;
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
      }

      // --- Event wiring ---

      function bindEvents() {
        const invGrid = D("inventoryGrid");
        invGrid.addEventListener("click", e => {
          const btn = e.target.closest("button[data-buy]");
          if (!btn) return;
          const kind = btn.getAttribute("data-buy");
          const amount = parseInt(btn.getAttribute("data-amount"), 10) || 0;
          if (!kind || !amount) return;
          buySupply(kind, amount, false);
          updateUI();
          saveGame();
        });

        const slider = D("priceSlider");
        slider.addEventListener("input", () => {
          const v = parseFloat(slider.value);
          if (!isFinite(v)) return;
          state.pricePerBottle = clamp(0.5, 5, v);
          updateMarketUI();
        });
        slider.addEventListener("change", () => {
          saveGame();
        });

        const prestigeButton = D("prestigeButton");
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

      function buySupply(kind, amount, logOnFail = true) {
        const costPer = SUPPLY_COST[kind] || 0;
        const total = costPer * amount;
        if (total <= 0) return;
        if (total > state.cash) {
          if (logOnFail) {
            pushLog("Not enough cash to buy " + amount + " " + kind + ".", "bad");
          }
          return;
        }
        state.cash -= total;
        state.stats.expenses += total;
        if (kind === "preforms") state.inv.preforms += amount;
        if (kind === "labels") state.inv.labels += amount;
        if (kind === "packaging") state.inv.packaging += amount;
        pushLog("Purchased " + amount + " " + kind + ".", "good");
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
          "Welcome to Coke Tycoon Idle. Buy preforms, labels and packaging, then tune your price to grow from a tiny bottler into a shelf-dominating brand.",
          "good"
        );
        startLoop();
      }

      document.addEventListener("DOMContentLoaded", init);
    })();
