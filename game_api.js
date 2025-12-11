/**
 * game_api.js - Central Game API Wrapper
 * Provides a clean interface to the game state and exposes events for UI updates.
 */
(function () {
  "use strict";

  window.GameAPI = window.GameAPI || {};

  // Event system for UI updates
  const eventListeners = {
    cashChanged: [],
    stateChanged: [],
    productionLineAdded: [],
    equipmentPurchased: [],
    upgradePurchased: []
  };

  // ========== EVENT SYSTEM ==========
  function on(eventName, callback) {
    if (eventListeners[eventName]) {
      eventListeners[eventName].push(callback);
    }
  }

  function emit(eventName, data) {
    if (eventListeners[eventName]) {
      eventListeners[eventName].forEach(cb => {
        try {
          cb(data);
        } catch (e) {
          console.error("GameAPI event error:", e);
        }
      });
    }
  }

  // ========== STATE ACCESS ==========
  function getState() {
    if (window.CokeGame && window.CokeGame.getState) {
      return window.CokeGame.getState();
    }
    // Fallback: try to get state from global
    if (typeof state !== "undefined") {
      return state;
    }
    return null;
  }

  // ========== CASH MANAGEMENT ==========
  function getCash() {
    const state = getState();
    return state ? (state.cash || 0) : 0;
  }

  function addCash(amount) {
    const state = getState();
    if (!state) return false;
    
    state.cash = (state.cash || 0) + amount;
    emit("cashChanged", { cash: state.cash, delta: amount });
    emit("stateChanged", state);
    saveState();
    return true;
  }

  function spendCash(amount) {
    const state = getState();
    if (!state) return false;
    if ((state.cash || 0) < amount) return false;
    
    state.cash = (state.cash || 0) - amount;
    
    // Track expenses
    if (!state.stats) state.stats = { produced: 0, sold: 0, revenue: 0, expenses: 0 };
    state.stats.expenses = (state.stats.expenses || 0) + amount;
    
    if (!state.monthly) state.monthly = { produced: 0, sold: 0, revenue: 0, expenses: 0 };
    state.monthly.expenses = (state.monthly.expenses || 0) + amount;
    
    emit("cashChanged", { cash: state.cash, delta: -amount });
    emit("stateChanged", state);
    saveState();
    return true;
  }

  // ========== PRODUCTION LINES ==========
  function addProductionLine(name, baseBph) {
    const state = getState();
    if (!state) return false;
    
    if (!Array.isArray(state.lines)) {
      state.lines = [];
    }
    
    const newId = state.lines.length > 0 
      ? Math.max(...state.lines.map(l => l.id || 0)) + 1 
      : 1;
    
    const newLine = {
      id: newId,
      name: name || `Line ${newId}`,
      baseBph: baseBph || 25,
      efficiency: 1.0,
      currentSkuId: null
    };
    
    state.lines.push(newLine);
    
    if (state.meta) {
      state.meta.lines = state.lines.length;
    }
    
    emit("productionLineAdded", newLine);
    emit("stateChanged", state);
    saveState();
    return newLine;
  }

  function getProductionLines() {
    const state = getState();
    return state && Array.isArray(state.lines) ? state.lines : [];
  }

  // ========== EQUIPMENT ==========
  function buyEquipment(equipmentId, cost, applyFn) {
    const state = getState();
    if (!state) return false;
    
    if (!spendCash(cost)) {
      return false;
    }
    
    // Apply equipment effect
    if (typeof applyFn === "function") {
      applyFn(state);
    }
    
    // Track equipment ownership
    if (!state.ext) state.ext = {};
    if (!state.ext.equipmentExt) {
      state.ext.equipmentExt = { owned: {}, spent: 0 };
    }
    state.ext.equipmentExt.owned[equipmentId] = true;
    state.ext.equipmentExt.spent = (state.ext.equipmentExt.spent || 0) + cost;
    
    emit("equipmentPurchased", { id: equipmentId, cost });
    emit("stateChanged", state);
    saveState();
    return true;
  }

  // ========== UPGRADES ==========
  function buyUpgrade(upgradeId, cost, applyFn) {
    const state = getState();
    if (!state) return false;
    
    // Check if already purchased
    if (state.upgradesPurchased && state.upgradesPurchased[upgradeId]) {
      return false;
    }
    
    if (!spendCash(cost)) {
      return false;
    }
    
    // Apply upgrade effect
    if (typeof applyFn === "function") {
      applyFn(state);
    }
    
    // Mark as purchased
    if (!state.upgradesPurchased) {
      state.upgradesPurchased = {};
    }
    state.upgradesPurchased[upgradeId] = true;
    
    emit("upgradePurchased", { id: upgradeId, cost });
    emit("stateChanged", state);
    saveState();
    return true;
  }

  function isUpgradePurchased(upgradeId) {
    const state = getState();
    return state && state.upgradesPurchased && state.upgradesPurchased[upgradeId];
  }

  // ========== PERSISTENCE ==========
  function saveState() {
    const state = getState();
    if (!state) return;
    
    try {
      localStorage.setItem("coke_tycoon_idle_save", JSON.stringify(state));
      localStorage.setItem("coke_tycoon_idle_last_tick", String(Date.now()));
    } catch (e) {
      console.error("Failed to save game state:", e);
    }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem("coke_tycoon_idle_save");
      if (raw) {
        return JSON.parse(raw);
      }
    } catch (e) {
      console.error("Failed to load game state:", e);
    }
    return null;
  }

  // ========== UTILITIES ==========
  function formatMoney(value) {
    return "$" + (value || 0).toFixed(2);
  }

  function formatNumber(value) {
    return (value || 0).toLocaleString();
  }

  // ========== PUBLIC API ==========
  window.GameAPI = {
    // State
    getState,
    
    // Cash
    getCash,
    addCash,
    spendCash,
    
    // Production
    addProductionLine,
    getProductionLines,
    
    // Equipment & Upgrades
    buyEquipment,
    buyUpgrade,
    isUpgradePurchased,
    
    // Persistence
    saveState,
    loadState,
    
    // Events
    on,
    emit,
    
    // Utilities
    formatMoney,
    formatNumber
  };

  // Log initialization
  console.log("GameAPI initialized");
})();
