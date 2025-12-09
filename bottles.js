(function () {
  if (!window.CokeExt || typeof window.CokeExt.register !== "function") return;

  const handler = {
    onInit(api) {
      const state = api.getState();
      if (!state.ext) state.ext = {};
      if (!state.ext.bottles) {
        const defs = {
          small_500: {
            id: "small_500",
            label: "0.5L On-the-go",
            priceMult: 0.85,
            capacityMult: 1.1,
            note: "Cheaper, high volume. Great for kiosks."
          },
          medium_1000: {
            id: "medium_1000",
            label: "1.0L Standard",
            priceMult: 1.0,
            capacityMult: 1.0,
            note: "Balanced line speed vs. margin."
          },
          family_1500: {
            id: "family_1500",
            label: "1.5L Family Pack",
            priceMult: 1.25,
            capacityMult: 0.9,
            note: "Higher price, slightly slower handling."
          }
        };

        state.ext.bottles = {
          activeId: "medium_1000",
          defs
        };

        const { flavorDefs, BASE_MARKET_PRICE } = api.constants;
        flavorDefs.forEach(fd => {
          const fs = state.flavors[fd.id];
          if (!fs) return;
          const base = fd.basePrice || BASE_MARKET_PRICE;
          const active = defs["medium_1000"];
          fs.price = base * active.priceMult;
        });
      }
    },

    onBindEvents(api) {
      const row = api.D("bottleRow");
      if (!row) return;

      row.addEventListener("click", e => {
        const btn = e.target.closest("[data-bottle-id]");
        if (!btn) return;
        const id = btn.getAttribute("data-bottle-id");
        const state = api.getState();
        const bottles = state.ext && state.ext.bottles;
        if (!bottles || !bottles.defs[id]) return;

        bottles.activeId = id;

        const { flavorDefs, BASE_MARKET_PRICE } = api.constants;
        const defBottle = bottles.defs[id];

        flavorDefs.forEach(fd => {
          const fs = state.flavors[fd.id];
          if (!fs) return;
          const base = fd.basePrice || BASE_MARKET_PRICE;
          fs.price = base * defBottle.priceMult;
        });

        api.pushLog("Switched bottle format to " + defBottle.label + ".", "good");
      });
    },

    onAfterTick(api) {
      const state = api.getState();
      if (!state.ext || !state.ext.bottles) return;
      const active = state.ext.bottles.defs[state.ext.bottles.activeId];
      if (!active) return;

      // Softly nudge capacity according to bottle type (once per tick)
      const baseCap = api.constants.BASE_CAPACITY_PER_LINE;
      const baseLines = state.meta && state.meta.lines ? state.meta.lines : 1;
      const expected = Math.round(baseCap * baseLines * active.capacityMult);
      if (state.capacityPerHour < expected) {
        state.capacityPerHour = expected;
      }
    },

    onUpdateUI(api) {
      const state = api.getState();
      if (!state.ext || !state.ext.bottles) return;
      const row = api.D("bottleRow");
      const noteEl = api.D("bottleNote");
      if (!row) return;

      const bottles = state.ext.bottles;
      row.innerHTML = "";

      Object.keys(bottles.defs).forEach(id => {
        const def = bottles.defs[id];
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className =
          "flavor-pill bottle-pill" +
          (bottles.activeId === id ? " active" : "");
        btn.setAttribute("data-bottle-id", id);

        const dot = document.createElement("span");
        dot.className = "dot";
        btn.appendChild(dot);

        const label = document.createElement("span");
        label.textContent = def.label;
        btn.appendChild(label);

        row.appendChild(btn);
      });

      if (noteEl) {
        const active = bottles.defs[bottles.activeId];
        if (active) {
          noteEl.textContent = active.note;
        }
      }
    }
  };

  window.CokeExt.register(handler);
})();