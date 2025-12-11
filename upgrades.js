/**
 * upgrades.js - Upgrade System Module
 * Manages available upgrades and purchase logic
 */
(function () {
  "use strict";

  window.CokeGame = window.CokeGame || {};
  window.CokeGame.Upgrades = window.CokeGame.Upgrades || {};

  // ========== UPGRADE DEFINITIONS ==========
  const upgradeDefs = [
    {
      id: "line_2",
      label: "Second Production Line",
      desc: "Double your base capacity by adding a second production line.",
      cost: 10000,
      category: "production",
      apply(state) {
        state.meta.lines = Math.max(2, state.meta.lines || 1);
        state.capacityPerHour = 25 * state.meta.lines; // BASE_CAPACITY_PER_LINE * lines
        
        // Use GameAPI if available
        if (window.GameAPI && typeof window.GameAPI.addProductionLine === "function") {
          if (!state.lines || state.lines.length < 2) {
            window.GameAPI.addProductionLine("Line 2", 25);
          }
        }
      }
    },
    {
      id: "line_3",
      label: "Third Production Line",
      desc: "Add a third production line to increase capacity further.",
      cost: 25000,
      category: "production",
      requires: ["line_2"],
      apply(state) {
        state.meta.lines = Math.max(3, state.meta.lines || 1);
        state.capacityPerHour = 25 * state.meta.lines;
        
        if (window.GameAPI && typeof window.GameAPI.addProductionLine === "function") {
          if (!state.lines || state.lines.length < 3) {
            window.GameAPI.addProductionLine("Line 3", 25);
          }
        }
      }
    },
    {
      id: "warehouse_2",
      label: "Warehouse Expansion II",
      desc: "Double your storage capacity to hold more finished bottles.",
      cost: 15000,
      category: "storage",
      apply(state) {
        state.meta.warehouses = Math.max(2, state.meta.warehouses || 1);
        state.storageCapacity = 2000 * state.meta.warehouses; // BASE_STORAGE_CAPACITY * warehouses
      }
    },
    {
      id: "warehouse_3",
      label: "Warehouse Expansion III",
      desc: "Add a third warehouse for even more storage.",
      cost: 35000,
      category: "storage",
      requires: ["warehouse_2"],
      apply(state) {
        state.meta.warehouses = Math.max(3, state.meta.warehouses || 1);
        state.storageCapacity = 2000 * state.meta.warehouses;
      }
    },
    {
      id: "auto_buy",
      label: "Auto Procurement System",
      desc: "Automatically purchase preforms, labels, and packaging when stock is low.",
      cost: 5000,
      category: "automation",
      apply(state) {
        if (!state.flags) state.flags = {};
        state.flags.autoBuy = true;
      }
    },
    {
      id: "marketing_push",
      label: "Citywide Marketing Campaign",
      desc: "Launch a major marketing push to increase demand by 15%.",
      cost: 8000,
      category: "marketing",
      apply(state) {
        state.demandModifier = (state.demandModifier || 1.0) * 1.15;
      }
    },
    {
      id: "marketing_blitz",
      label: "Regional Marketing Blitz",
      desc: "Expand marketing to neighboring cities. +20% demand boost.",
      cost: 20000,
      category: "marketing",
      requires: ["marketing_push"],
      apply(state) {
        state.demandModifier = (state.demandModifier || 1.0) * 1.20;
      }
    },
    {
      id: "energy_efficiency",
      label: "Energy Efficiency Program",
      desc: "Reduce hourly fixed costs by 10% through energy savings.",
      cost: 9000,
      category: "efficiency",
      apply(state) {
        state.fixedCostPerHour = Math.max(1, Math.round((state.fixedCostPerHour || 40) * 0.9));
      }
    },
    {
      id: "bulk_purchasing",
      label: "Bulk Purchasing Discount",
      desc: "Negotiate better rates with suppliers. -5% on all material costs.",
      cost: 12000,
      category: "efficiency",
      apply(state) {
        if (!state.costModifier) state.costModifier = 1.0;
        state.costModifier *= 0.95;
      }
    },
    {
      id: "quality_control",
      label: "Quality Control Systems",
      desc: "Reduce waste and improve output quality. +5% effective capacity.",
      cost: 18000,
      category: "efficiency",
      apply(state) {
        state.capacityPerHour = Math.round((state.capacityPerHour || 25) * 1.05);
      }
    }
  ];

  // ========== HELPER FUNCTIONS ==========
  function getUpgradeDef(id) {
    return upgradeDefs.find(u => u.id === id);
  }

  function getAllUpgrades() {
    return upgradeDefs;
  }

  function getAvailableUpgrades(state) {
    if (!state) return [];
    
    return upgradeDefs.filter(upgrade => {
      // Check if already purchased
      if (state.upgradesPurchased && state.upgradesPurchased[upgrade.id]) {
        return false;
      }
      
      // Check requirements
      if (upgrade.requires && upgrade.requires.length > 0) {
        const hasRequirements = upgrade.requires.every(reqId => {
          return state.upgradesPurchased && state.upgradesPurchased[reqId];
        });
        if (!hasRequirements) {
          return false;
        }
      }
      
      return true;
    });
  }

  function getPurchasedUpgrades(state) {
    if (!state || !state.upgradesPurchased) return [];
    
    return upgradeDefs.filter(upgrade => {
      return state.upgradesPurchased[upgrade.id];
    });
  }

  function canAffordUpgrade(state, upgradeId) {
    const upgrade = getUpgradeDef(upgradeId);
    if (!upgrade) return false;
    
    return (state.cash || 0) >= upgrade.cost;
  }

  function purchaseUpgrade(state, upgradeId) {
    const upgrade = getUpgradeDef(upgradeId);
    if (!upgrade) {
      console.error("Upgrade not found:", upgradeId);
      return false;
    }
    
    // Check if already purchased
    if (state.upgradesPurchased && state.upgradesPurchased[upgradeId]) {
      return false;
    }
    
    // Check requirements
    if (upgrade.requires && upgrade.requires.length > 0) {
      const hasRequirements = upgrade.requires.every(reqId => {
        return state.upgradesPurchased && state.upgradesPurchased[reqId];
      });
      if (!hasRequirements) {
        console.error("Requirements not met for upgrade:", upgradeId);
        return false;
      }
    }
    
    // Use GameAPI if available
    if (window.GameAPI && typeof window.GameAPI.buyUpgrade === "function") {
      return window.GameAPI.buyUpgrade(upgradeId, upgrade.cost, upgrade.apply);
    }
    
    // Fallback: direct purchase
    if ((state.cash || 0) < upgrade.cost) {
      return false;
    }
    
    state.cash -= upgrade.cost;
    
    if (!state.stats) state.stats = { produced: 0, sold: 0, revenue: 0, expenses: 0 };
    state.stats.expenses = (state.stats.expenses || 0) + upgrade.cost;
    
    if (!state.monthly) state.monthly = { produced: 0, sold: 0, revenue: 0, expenses: 0 };
    state.monthly.expenses = (state.monthly.expenses || 0) + upgrade.cost;
    
    if (!state.upgradesPurchased) {
      state.upgradesPurchased = {};
    }
    state.upgradesPurchased[upgradeId] = true;
    
    // Apply upgrade effect
    if (typeof upgrade.apply === "function") {
      upgrade.apply(state);
    }
    
    return true;
  }

  // ========== PUBLIC API ==========
  window.CokeGame.Upgrades = {
    getUpgradeDef,
    getAllUpgrades,
    getAvailableUpgrades,
    getPurchasedUpgrades,
    canAffordUpgrade,
    purchaseUpgrade
  };

  console.log("Upgrades module initialized");
})();
