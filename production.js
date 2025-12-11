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
    state.lines = state.lines || [];

    if (state.lines.length === 0) {
      // If there were no lines in your previous save, create a basic set.
      // Adjust these to match your old project if needed.
      state.lines.push(
        {
          id: 1,
          name: 'Line 1',
          baseBph: 8000,  // bottles per hour
          efficiency: 1.0
        },
        {
          id: 2,
          name: 'Line 2',
          baseBph: 6000,
          efficiency: 1.0
        }
      );
    }

    // Let Bottles wire in currentSkuId + changeover
    if (G.Bottles && typeof G.Bottles.initBottlesState === 'function') {
      G.Bottles.initBottlesState(state);
    }
  }

  function initInventory(state) {
    state.inventory = state.inventory || {};

    // Structure:
    //   bySku[skuId] = { bottles: number, liters: number }
    //   byFlavor[flavorId] = { bottles: number, liters: number }
    state.inventory.bySku = state.inventory.bySku || {};
    state.inventory.byFlavor = state.inventory.byFlavor || {};
  }

  function initEconomy(state) {
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
    if (!line || hoursDelta <= 0) return;

    if (G.Bottles && G.Bottles.isLineInChangeover &&
        G.Bottles.isLineInChangeover(line)) {
      // Line is down for changeover – no production
      return;
    }

    const skuId = line.currentSkuId;
    if (!skuId || !G.Bottles || !G.Bottles.getSku) {
      return;
    }

    const sku = G.Bottles.getSku(skuId);
    if (!sku) return;

    const flavorId = sku.flavorId;
    const bph = typeof line.baseBph === 'number' ? line.baseBph : 0;
    const eff = typeof line.efficiency === 'number' ? line.efficiency : 1;

    const bottlesProduced = bph * eff * hoursDelta;
    if (bottlesProduced <= 0) return;

    const litersProduced = bottlesProduced * (sku.volumeL || 0);

    // --- Inventory by SKU ---
    const invSku = state.inventory.bySku[skuId] ||
      (state.inventory.bySku[skuId] = { bottles: 0, liters: 0 });
    invSku.bottles += bottlesProduced;
    invSku.liters += litersProduced;

    // --- Inventory by flavor ---
    const invFlavor = state.inventory.byFlavor[flavorId] ||
      (state.inventory.byFlavor[flavorId] = { bottles: 0, liters: 0 });
    invFlavor.bottles += bottlesProduced;
    invFlavor.liters += litersProduced;

    // Backwards-compat: simple numeric inventory per flavor
    if (typeof state.inventory[flavorId] !== 'number') {
      state.inventory[flavorId] = 0;
    }
    state.inventory[flavorId] += bottlesProduced;

    safeLog(
      state,
      '[OPS] ' + line.name + ' produced ' +
        Math.round(bottlesProduced).toLocaleString() +
        ' x ' + G.Bottles.getSkuLabel(skuId),
      'OPS'
    );
  }

  /**
   * Called once per tick with hoursDelta (e.g. 1 hour per tick).
   */
  function tickHours(state, hoursDelta) {
    if (!state) return;
    if (hoursDelta <= 0) return;

    // 1) Advance changeovers
    if (G.Bottles && typeof G.Bottles.advanceLineChangeovers === 'function') {
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