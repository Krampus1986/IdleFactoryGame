(function () {
  "use strict";

  // Initialize namespace
  window.CokeGame = window.CokeGame || {};
  window.CokeGame.Adventures = window.CokeGame.Adventures || {};

  const extraAdventures = [
    {
      id: "music_festival",
      name: "Summer Music Festival",
      desc: "Sponsor a stage at the city festival. Huge exposure, but stock must be ready.",
      durationHours: 10,
      minBottlesRequired: 400,
      reward: { cash: 14000, legacy: 0.18 }
    },
    {
      id: "campus_takeover",
      name: "Campus Takeover",
      desc: "Give away bottles at universities. Great for long-term brand recognition.",
      durationHours: 12,
      minBottlesRequired: 350,
      reward: { cash: 9000, legacy: 0.25 }
    },
    {
      id: "night_run",
      name: "City Night Run",
      desc: "Sponsor a marathon with branded refreshment stations.",
      durationHours: 8,
      minBottlesRequired: 300,
      reward: { cash: 11000, legacy: 0.2 }
    }
  ];

  // ========== PUBLIC API ==========
  function listMissions(state) {
    if (!state) return [];
    
    // Get base adventures from game.js if available
    let allMissions = [];
    if (window.CokeGame && window.CokeGame.adventureDefs) {
      allMissions = [...window.CokeGame.adventureDefs];
    }
    
    // Add extra adventures
    extraAdventures.forEach(def => {
      if (!allMissions.some(a => a.id === def.id)) {
        allMissions.push(def);
      }
    });
    
    return allMissions;
  }

  function startMission(state, missionId) {
    if (!state || !state.adventure) return false;
    
    const mission = listMissions(state).find(m => m.id === missionId);
    if (!mission) return false;
    
    // Check if mission already active
    if (state.adventure.activeId) return false;
    
    // Check requirements
    if (state.inv.bottles < mission.minBottlesRequired) return false;
    
    // Start mission
    state.inv.bottles -= mission.minBottlesRequired;
    state.adventure.activeId = mission.id;
    state.adventure.remainingHours = mission.durationHours;
    state.adventure.rewardPending = null;
    
    // Persist to localStorage
    try {
      localStorage.setItem("coke_adventure_active", JSON.stringify({
        id: mission.id,
        remainingHours: mission.durationHours,
        startedAt: Date.now()
      }));
    } catch (e) {
      console.error("Failed to persist mission state:", e);
    }
    
    return true;
  }

  function getActive(state) {
    if (!state || !state.adventure) return null;
    
    if (!state.adventure.activeId && !state.adventure.rewardPending) {
      return null;
    }
    
    const mission = listMissions(state).find(m => m.id === state.adventure.activeId);
    
    return {
      mission: mission || null,
      remainingHours: state.adventure.remainingHours || 0,
      rewardPending: state.adventure.rewardPending || null
    };
  }

  function claimMission(state) {
    if (!state || !state.adventure || !state.adventure.rewardPending) {
      return false;
    }
    
    const reward = state.adventure.rewardPending;
    state.cash = (state.cash || 0) + (reward.cash || 0);
    state.brandLegacy = (state.brandLegacy || 0) + (reward.legacy || 0);
    
    state.adventure.rewardPending = null;
    state.adventure.activeId = null;
    state.adventure.remainingHours = 0;
    
    // Clear localStorage
    try {
      localStorage.removeItem("coke_adventure_active");
    } catch (e) {
      console.error("Failed to clear mission state:", e);
    }
    
    return true;
  }

  // Export public API
  window.CokeGame.Adventures = {
    listMissions,
    startMission,
    getActive,
    claimMission,
    extraAdventures
  };

  // ========== EXTENSION HANDLER ==========
  if (!window.CokeExt || typeof window.CokeExt.register !== "function") {
    console.log("Adventures API initialized (CokeExt not available)");
    return;
  }

  const handler = {
    onInit(api) {
      const { adventureDefs } = api.constants;
      extraAdventures.forEach(def => {
        if (!adventureDefs.some(a => a.id === def.id)) {
          adventureDefs.push(def);
        }
      });
    },

    onBindEvents(api) {
      const listEl = api.D("extraAdventuresList");
      if (!listEl) return;

      listEl.addEventListener("click", e => {
        const btn = e.target.closest("button[data-adv-id]");
        if (!btn) return;
        const id = btn.getAttribute("data-adv-id");
        api.actions.startAdventure(id);
      });
    },

    onUpdateUI(api) {
      const listEl = api.D("extraAdventuresList");
      if (!listEl) return;

      const state = api.getState();
      const advActive = !!state.adventure.activeId;

      listEl.innerHTML = "";

      extraAdventures.forEach(def => {
        const wrap = document.createElement("div");
        wrap.className = "chip";

        const main = document.createElement("div");
        main.className = "chip-main";
        const title = document.createElement("span");
        title.textContent = def.name;
        const req = document.createElement("span");
        req.textContent =
          def.minBottlesRequired + " bottles • " + def.durationHours + "h";
        main.appendChild(title);
        main.appendChild(req);

        const sub = document.createElement("div");
        sub.className = "chip-sub";
        const desc = document.createElement("span");
        desc.textContent = def.desc;
        const actions = document.createElement("div");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn ghost";
        btn.textContent = advActive ? "Busy" : "Start";
        btn.disabled = advActive || state.inv.bottles < def.minBottlesRequired;
        btn.setAttribute("data-adv-id", def.id);
        actions.appendChild(btn);

        sub.appendChild(desc);
        sub.appendChild(actions);

        wrap.appendChild(main);
        wrap.appendChild(sub);
        listEl.appendChild(wrap);
      });
    }
  };

  window.CokeExt.register(handler);
  console.log("Adventures module initialized with CokeExt");
})();