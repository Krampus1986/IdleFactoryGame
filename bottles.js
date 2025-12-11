// bottles.js
// Coke Idle Game – Bottles, SKUs & Line Changeovers (Step 1)
// ---------------------------------------------------------
// Responsibilities:
//  - Define SKUs (sizes, segments) for each flavor (0.33 can, 0.5/1.0/1.5 PET)
//  - Attach per-line currentSkuId + changeover state (downtime)
//  - Helpers for variable cost and SKU demand multipliers
//  - UI helpers for labels and lists
//
// Integration assumptions:
//  - window.CokeGame exists
//  - state.lines: array of production line objects
//  - optional: state.upgrades.quickChangeoverLevel (number)
//  - optional: CokeGame.Log.add(state, msg, category) for logging
//
// This file is *drop-in* and namespaced as CokeGame.Bottles.

(function () {
  'use strict';

  window.CokeGame = window.CokeGame || {};
  const G = window.CokeGame;

  // Prevent double-load in case of hot reload
  if (G.Bottles && G.Bottles.__version >= 2) {
    return;
  }

  // --------------------------------------------------------
  //  FLAVORS – high-level IDs that can align with your old system
  // --------------------------------------------------------
  const FLAVORS = {
    cola: {
      id: 'cola',
      name: 'Cola',
      color: '#b80000'
    },
    cola_zero: {
      id: 'cola_zero',
      name: 'Cola Zero',
      color: '#000000'
    },
    orange: {
      id: 'orange',
      name: 'Orange',
      color: '#ff7a00'
    }
    // Add more as needed
  };

  // --------------------------------------------------------
  //  SKUs – sizes + segments
  // --------------------------------------------------------
  const SKUS = {
    // Cola: Can & PET
    cola_033_can: {
      id: 'cola_033_can',
      name: 'Cola 0.33 L Can',
      flavorId: 'cola',
      volumeL: 0.33,
      preformWeight: 10,        // grams (can equivalence)
      labelCost: 0.01,
      packagingCost: 0.04,
      basePrice: 1.00,
      segmentDemandMultiplier: 1.3, // cheap, high demand
      channelFocus: ['kiosk', 'vending', 'stadium']
    },
    cola_050_pet: {
      id: 'cola_050_pet',
      name: 'Cola 0.5 L PET',
      flavorId: 'cola',
      volumeL: 0.5,
      preformWeight: 20,
      labelCost: 0.015,
      packagingCost: 0.05,
      basePrice: 1.40,
      segmentDemandMultiplier: 1.0,
      channelFocus: ['supermarket', 'kiosk', 'vending']
    },
    cola_100_pet: {
      id: 'cola_100_pet',
      name: 'Cola 1.0 L PET',
      flavorId: 'cola',
      volumeL: 1.0,
      preformWeight: 35,
      labelCost: 0.02,
      packagingCost: 0.07,
      basePrice: 1.99,
      segmentDemandMultiplier: 0.9,
      channelFocus: ['supermarket']
    },
    cola_150_pet: {
      id: 'cola_150_pet',
      name: 'Cola 1.5 L PET',
      flavorId: 'cola',
      volumeL: 1.5,
      preformWeight: 40,
      labelCost: 0.025,
      packagingCost: 0.09,
      basePrice: 2.29,
      segmentDemandMultiplier: 0.85,
      channelFocus: ['supermarket', 'discount']
    }

    // TODO: later → add cola_zero_050_pet, orange_050_pet, etc.
  };

  // --------------------------------------------------------
  //  CHANGEOVER CONSTANTS
  // --------------------------------------------------------
  const DEFAULT_CHANGEOVER_HOURS = 3; // 2–4h → use 3 as baseline
  const MIN_CHANGEOVER_HOURS = 1;

  // --------------------------------------------------------
  //  INTERNAL HELPERS
  // --------------------------------------------------------
  function safeLog(state, message, category) {
    try {
      if (G.Log && typeof G.Log.add === 'function') {
        G.Log.add(state, message, category || 'OPS');
      }
    } catch (e) {
      // never let logging break the game
    }
  }

  function getSku(id) {
    return SKUS[id] || null;
  }

  function getDefaultSkuId() {
    const keys = Object.keys(SKUS);
    return keys.length ? keys[0] : null;
  }

  // --------------------------------------------------------
  //  STATE INITIALIZATION
  // --------------------------------------------------------
  /**
   * Ensure state has SKUs + line fields wired in.
   * Call once at game init (or before first tick).
   */
  function initBottlesState(state) {
    if (!state) return;

    // Track which SKUs are unlocked/visible
    state.skus = state.skus || {};
    Object.keys(SKUS).forEach(function (id) {
      if (!state.skus[id]) {
        state.skus[id] = {
          id: id,
          discovered: true    // later: gated by research / unlocks
        };
      }
    });

    state.lines = state.lines || [];
    const defaultSkuId = getDefaultSkuId();

    state.lines.forEach(function (line) {
      if (!line.currentSkuId) {
        line.currentSkuId = defaultSkuId;
      }
      if (!line.changeover) {
        line.changeover = {
          inProgress: false,
          targetSkuId: null,
          remainingHours: 0
        };
      }
    });
  }

  // --------------------------------------------------------
  //  CHANGEOVER LOGIC
  // --------------------------------------------------------
  function computeChangeoverTimeHours(state, line, targetSkuId) {
    const upgrades = (state && state.upgrades) ? state.upgrades : {};
    const quickLevel = Number(upgrades.quickChangeoverLevel || 0);

    const reduction = quickLevel * 0.25; // each level shaves 0.25h
    let hours = DEFAULT_CHANGEOVER_HOURS - reduction;

    if (hours < MIN_CHANGEOVER_HOURS) {
      hours = MIN_CHANGEOVER_HOURS;
    }
    return hours;
  }

  /**
   * Schedule a changeover on a given line.
   * Returns true if started, false if invalid or already in progress / same SKU.
   */
  function scheduleLineChangeover(state, lineIndex, targetSkuId) {
    if (!state || !Array.isArray(state.lines)) return false;
    const line = state.lines[lineIndex];
    if (!line) return false;

    if (!targetSkuId || !SKUS[targetSkuId]) return false;

    if (!line.changeover) {
      line.changeover = {
        inProgress: false,
        targetSkuId: null,
        remainingHours: 0
      };
    }

    // already on that SKU
    if (line.currentSkuId === targetSkuId) {
      return false;
    }

    // changeover already in progress
    if (line.changeover.inProgress) {
      return false;
    }

    const hours = computeChangeoverTimeHours(state, line, targetSkuId);

    line.changeover.inProgress = true;
    line.changeover.targetSkuId = targetSkuId;
    line.changeover.remainingHours = hours;

    safeLog(
      state,
      '[OPS] Line ' + (lineIndex + 1) + ' changeover started → ' + getSkuLabel(targetSkuId),
      'OPS'
    );

    return true;
  }

  /**
   * Advance all line changeovers by a given number of in-game hours.
   * Call this from your hourly tick (or convert ticks → hours).
   */
  function advanceLineChangeovers(state, hoursDelta) {
    if (!state || !Array.isArray(state.lines)) return;
    if (!hoursDelta || hoursDelta <= 0) return;

    state.lines.forEach(function (line, idx) {
      if (!line.changeover || !line.changeover.inProgress) return;

      line.changeover.remainingHours -= hoursDelta;

      if (line.changeover.remainingHours <= 0) {
        const completedSkuId = line.changeover.targetSkuId;

        line.currentSkuId = completedSkuId;
        line.changeover.inProgress = false;
        line.changeover.targetSkuId = null;
        line.changeover.remainingHours = 0;

        safeLog(
          state,
          '[OPS] Line ' + (idx + 1) + ' now running ' + getSkuLabel(completedSkuId),
          'OPS'
        );
      }
    });
  }

  function isLineInChangeover(line) {
    return !!(line && line.changeover && line.changeover.inProgress);
  }

  // --------------------------------------------------------
  //  COST & DEMAND HELPERS
  // --------------------------------------------------------
  /**
   * Variable cost per bottle for a SKU.
   * Uses state.economy.resinCostPerGram if present, else a default.
   */
  function getVariableCostPerBottle(state, skuId) {
    const sku = getSku(skuId);
    if (!sku) return 0;

    const economy = state && state.economy ? state.economy : {};
    const resinCostPerGram = Number(economy.resinCostPerGram || 0.002);

    const preformCost = (sku.preformWeight || 0) * resinCostPerGram;
    const packCost = (sku.labelCost || 0) + (sku.packagingCost || 0);

    return preformCost + packCost;
  }

  /**
   * Apply SKU-specific demand multiplier to a base demand value.
   */
  function applySkuDemandMultiplier(baseDemand, skuId) {
    const sku = getSku(skuId);
    if (!sku) return baseDemand;
    const mult = Number(sku.segmentDemandMultiplier || 1);
    return baseDemand * mult;
  }

  // --------------------------------------------------------
  //  UI HELPERS
  // --------------------------------------------------------
  function getSkuLabel(id) {
    const sku = getSku(id);
    return sku ? sku.name : '(Unknown SKU)';
  }

  function getAllSkuIds() {
    return Object.keys(SKUS);
  }

  function getAllSkuDefinitions() {
    return Object.assign({}, SKUS);
  }

  function getFlavor(id) {
    return FLAVORS[id] || null;
  }

  function getAllFlavors() {
    return Object.assign({}, FLAVORS);
  }

  // --------------------------------------------------------
  //  PUBLIC API
  // --------------------------------------------------------
  G.Bottles = {
    __version: 2,

    // data
    FLAVORS: FLAVORS,
    SKUS: SKUS,

    // init / state wiring
    initBottlesState: initBottlesState,

    // changeovers
    scheduleLineChangeover: scheduleLineChangeover,
    advanceLineChangeovers: advanceLineChangeovers,
    isLineInChangeover: isLineInChangeover,

    // economics
    getVariableCostPerBottle: getVariableCostPerBottle,
    applySkuDemandMultiplier: applySkuDemandMultiplier,

    // UI / lookup
    getSku: getSku,
    getSkuLabel: getSkuLabel,
    getAllSkuIds: getAllSkuIds,
    getAllSkuDefinitions: getAllSkuDefinitions,
    getFlavor: getFlavor,
    getAllFlavors: getAllFlavors
  };
})();