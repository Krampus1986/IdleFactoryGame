(function () {
  "use strict";

  if (!window.CokeExt || typeof window.CokeExt.register !== "function") return;

  function ensureRivalsState(state) {
    if (!state.ext) state.ext = {};
    if (!state.ext.rivals) {
      state.ext.rivals = {
        // Core roster used by game.js:getRivalArchetypes()
        roster: [
          {
            id: "polar_fizz",
            name: "PolarFizz",
            baseShare: 0.32,        // how strong they are at baseline
            priceAggression: 0.85,  // how aggressively they undercut
            marketingFocus: ["supermarket", "kiosk"]
          },
          {
            id: "royal_cola",
            name: "RoyalCola",
            baseShare: 0.28,
            priceAggression: 0.35,
            marketingFocus: ["stadium", "vending"]
          },
          {
            id: "zen_bubble",
            name: "ZenBubble",
            baseShare: 0.22,
            priceAggression: 0.55,
            marketingFocus: ["kiosk", "vending"]
          }
        ],
        lastRefreshDay: 1
      };
    }
    // Ensure roster is an array
    if (!Array.isArray(state.ext.rivals.roster)) {
      state.ext.rivals.roster = [];
    }
    return state.ext.rivals;
  }

  const handler = {
    onInit(api) {
      const state = api.getState();
      ensureRivalsState(state);
    },

    onBindEvents(api) {
      // Reserved for future rival-specific UI or actions (offers, poaching, etc.)
      // For now, the main market UI is driven from game.js using the seeded roster.
    },

    onUpdateUI(api) {
      const state = api.getState();
      ensureRivalsState(state);
      // All visualisation of rivals happens inside game.js:updateMarketUI()
      // which reads from state.ext.rivals via getRivalArchetypes().
    }
  };

  window.CokeExt.register(handler);
})();