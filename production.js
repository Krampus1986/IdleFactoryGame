// production.js
// Coke Idle Game – Production Loop using SKUs & Changeovers (Step 1)
// -----------------------------------------------------------------
// Responsibilities:
//  - Initialize lines and production-related state
//  - Use CokeGame.Bottles for:
//      * line.currentSkuId
//      * changeovers (downtime)
//      * variable cost per SKU
//  - Produce bottles per line per hour, store in inventory by SKU & flavor
//
// Public API:
//  - CokeGame.Production.init(state)
//  - CokeGame.Production.tickHours(state, hoursDelta)
//
// Assumptions:
//  - CokeGame.Bottles is loaded (bottles.js above)
//  - state.lines: array of line objects
//      * line.baseBph: base bottles per hour
//      * optional line.efficiency: 0–2 multiplier, default 1
//  - state.inventory: object (will be normalized here)
//
// NOTE: This is a full replacement for production.js.

(function () {
  'use strict';

  window.CokeGame = window.CokeGame || {};
  const G = window.CokeGame;

  if (G.Production && G.Production.__version >= 2) {
    return;
  }

  function safeLog(state, msg, category) {
    try {
      if (G.Log && typeof G.Log.add === 'function') {
        G.Log.add(state, msg, category || 'OPS');
      }
    } catch (e) {
      // ignore logging errors
    }
  }

  // --------------------------------------------------------
  //  STATE INITIALIZATION
  // --------------------------------------------------------
  function initLines(state) {
    if (!state) return;
    if (!Array.isArray(state.lines)) {
      state.lines = [];
    }

    if (state.lines.length === 0) {
      // Fallback lines if none exist in save.
      state.lines.push(
        {
          id: 1,
          name: 'Line 1',
          baseBph: typeof state.capacityPerHour === 'number'
            ? state.capacityPerHour
            : 8000,
          efficiency: 1.0
        }
        // You can add more default lines here if desired.
      );
    }

    // Let Bottles wire in currentSkuId + changeover
    if (G.Bottles && typeof G.Bottles.initBottlesState === 'function') {
      G.Bottles.initBottlesState(state);
    }
  }

  function initInventory(state) {
    if (!state) return;
    state.inventory = state.inventory || {};

    // Structure:
    //   bySku[skuId] = { bottles: number, liters: number }
    //   byFlavor[flavorId] = { bottles: number, liters: number }
    state.inventory.bySku = state.inventory.bySku || {};
    state.inventory.byFlavor = state.inventory.byFlavor || {};
  }

  function initEconomy(state) {
    if (!state) return;
    state.economy = state.economy || {};
    if (typeof state.economy.resinCostPerGram !== 'number') {
      state.economy.resinCostPerGram = 0.002; // default fallback
    }
  }

  function init(state) {
    if (!state) return;
    initLines(state);
    initInventory(state);
    initEconomy(state);
  }

  // --------------------------------------------------------
  //  CORE PRODUCTION LOGIC
  // --------------------------------------------------------
  function produceOnLine(state, line, hoursDelta) {
    if (!state || !line) return;
    if (!hoursDelta || hoursDelta <= 0) return;

    initInventory(state); // make sure inventory structure exists

    // If line is in changeover, it produces nothing for now.
    if (
      G.Bottles &&
      typeof G.Bottles.isLineInChangeover === 'function' &&
      G.Bottles.isLineInChangeover(line)
    ) {
      return;
    }

    const skuId = line.currentSkuId;
    if (!skuId || !G.Bottles || typeof G.Bottles.getSku !== 'function') {
      return;
    }

    const sku = G.Bottles.getSku(skuId);
    if (!sku) return;

    const flavorId = sku.flavorId || 'unknown';

    const bph = typeof line.baseBph === 'number' ? line.baseBph : 0;
    const eff = typeof line.efficiency === 'number' ? line.efficiency : 1;

    if (bph <= 0 || eff <= 0) return;

    // Raw potential output
    let bottlesPotential = bph * eff * hoursDelta;
    if (bottlesPotential <= 0) return;

    // --- Integrate with legacy inventory (state.inv, storageCapacity, preforms, etc.) ---
    const legacyInv = state.inv || null;
    const storageCapacity =
      typeof state.storageCapacity === 'number'
        ? state.storageCapacity
        : Infinity;

    if (legacyInv) {
      const currentBottles = Number(legacyInv.bottles || 0);
      const maxStorageRoom = storageCapacity - currentBottles;

      // Input materials
      const preforms = Number(legacyInv.preforms || 0);
      const labels = Number(legacyInv.labels || 0);
      const packaging = Number(legacyInv.packaging || 0);

      let maxByInputs = Math.min(preforms, labels, packaging);
      if (!Number.isFinite(maxByInputs)) {
        maxByInputs = 0;
      }

      const maxByStorage = Number.isFinite(maxStorageRoom)
        ? maxStorageRoom
        : bottlesPotential;

      let bottleneck = Math.min(maxByInputs, maxByStorage, bottlesPotential);
      if (!Number.isFinite(bottleneck) || bottleneck < 0) {
        bottleneck = 0;
      }

      bottlesPotential = bottleneck;

      if (bottlesPotential <= 0) {
        return;
      }

      // Consume inputs & push to legacy inventory
      legacyInv.preforms = preforms - bottlesPotential;
      legacyInv.labels = labels - bottlesPotential;
      legacyInv.packaging = packaging - bottlesPotential;
      legacyInv.bottles = currentBottles + bottlesPotential;

      // Stats integration (produced bottles)
      state.stats = state.stats || {
        produced: 0,
        sold: 0,
        revenue: 0,
        expenses: 0
      };
      state.monthly = state.monthly || {
        produced: 0,
        sold: 0,
        revenue: 0,
        expenses: 0
      };

      state.stats.produced = Number(state.stats.produced || 0) + bottlesPotential;
      state.monthly.produced =
        Number(state.monthly.produced || 0) + bottlesPotential;

      // Flavor-specific stats (if flavors exist in main game state)
      if (state.flavors && state.activeFlavorId && state.flavors[state.activeFlavorId]) {
        const activeFlavor = state.flavors[state.activeFlavorId];
        activeFlavor.producedLifetime =
          Number(activeFlavor.producedLifetime || 0) + bottlesPotential;
        activeFlavor.monthlyProduced =
          Number(activeFlavor.monthlyProduced || 0) + bottlesPotential;
      }
    }

    const bottlesProduced = bottlesPotential;
    if (bottlesProduced <= 0) return;

    const litersProduced = bottlesProduced * (sku.volumeL || 0);

    // --- New inventory by SKU ---
    const invSku =
      state.inventory.bySku[skuId] ||
      (state.inventory.bySku[skuId] = { bottles: 0, liters: 0 });
    invSku.bottles += bottlesProduced;
    invSku.liters += litersProduced;

    // --- New inventory by flavor ---
    const invFlavor =
      state.inventory.byFlavor[flavorId] ||
      (state.inventory.byFlavor[flavorId] = { bottles: 0, liters: 0 });
    invFlavor.bottles += bottlesProduced;
    invFlavor.liters += litersProduced;

    // Backwards-compat: simple numeric inventory per flavor key
    if (typeof state.inventory[flavorId] !== 'number') {
      state.inventory[flavorId] = 0;
    }
    state.inventory[flavorId] += bottlesProduced;

    safeLog(
      state,
      '[OPS] ' +
        (line.name || 'Line') +
        ' produced ' +
        Math.round(bottlesProduced).toLocaleString() +
        ' x ' +
        (G.Bottles.getSkuLabel ? G.Bottles.getSkuLabel(skuId) : skuId),
      'OPS'
    );
  }

  /**
   * Called once per tick with hoursDelta (e.g. 1 hour per tick).
   */
  function tickHours(state, hoursDelta) {
    if (!state) return;
    if (!hoursDelta || hoursDelta <= 0) return;

    // 1) Advance changeovers
    if (
      G.Bottles &&
      typeof G.Bottles.advanceLineChangeovers === 'function'
    ) {
      G.Bottles.advanceLineChangeovers(state, hoursDelta);
    }

    // 2) Produce on each line that is not in changeover
    if (!Array.isArray(state.lines)) return;

    state.lines.forEach(function (line) {
      produceOnLine(state, line, hoursDelta);
    });
  }

  // --------------------------------------------------------
  //  EXPORT
  // --------------------------------------------------------
  G.Production = {
    __version: 2,
    init: init,
    tickHours: tickHours
  };
})();