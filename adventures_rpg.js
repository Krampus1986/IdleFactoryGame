(function () {
  'use strict';

  if (!window.CokeExt || typeof window.CokeExt.register !== "function") return;

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

  const handler = {
    onInit(api) {
      if (!api || !api.constants) return;
      const adventureDefs = api.constants.adventureDefs;
      if (!Array.isArray(adventureDefs)) return;

      extraAdventures.forEach(def => {
        if (!adventureDefs.some(a => a.id === def.id)) {
          adventureDefs.push(def);
        }
      });
    },

    onBindEvents(api) {
      if (!api || !api.D) return;
      const listEl = api.D("extraAdventuresList");
      if (!listEl) return;

      listEl.addEventListener("click", e => {
        const btn = e.target.closest("button[data-adv-id]");
        if (!btn || !api.actions || typeof api.actions.startAdventure !== "function") {
          return;
        }
        const id = btn.getAttribute("data-adv-id");
        api.actions.startAdventure(id);
      });
    },

    onUpdateUI(api) {
      if (!api || !api.D || !api.getState) return;

      const listEl = api.D("extraAdventuresList");
      if (!listEl) return;

      const state = api.getState();
      if (!state || !state.inv) {
        listEl.innerHTML = "";
        return;
      }

      const advActive = !!(state.adventure && state.adventure.activeId);
      const bottlesInStock = Number(state.inv.bottles || 0);

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
        btn.disabled = advActive || bottlesInStock < def.minBottlesRequired;
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
})();