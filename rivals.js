// rivals.js
// Coke Tycoon Idle – Rivals & Channels Extension
// ----------------------------------------------
// Purpose:
//   - Define 3 rival brands with different personalities & base shares.
//   - Store them in state.ext.rivals so game.js can simulate market share, prices, etc.
//   - Provide a *light* fallback UI if rivalsGrid is empty, without fighting game.js.
//
// Data model (state.ext.rivals):
//   {
//     roster: [
//       {
//         id: string,
//         name: string,
//         style: string,
//         color: string,
//         baseShare: number,        // 0–1, fraction of market
//         priceAggression: number,  // 0–1, higher = cuts price hard
//         marketingFocus: string,   // "discount" | "premium" | "youth" | ...
//         notes: string
//       },
//       ...
//     ],
//     lastUpdateDay: number
//   }

(function () {
  'use strict';

  if (!window.CokeExt || typeof window.CokeExt.register !== 'function') return;

  // ---- Static rival definitions (authoritative) ------------------------------
  const RIVALS = [
    {
      id: 'polar_fizz',
      name: 'Polar Fizz',
      style: 'Aggressive discounter',
      color: '#0ea5e9',              // icy blue
      baseShare: 0.30,               // ~30% baseline market share
      priceAggression: 0.9,          // cuts prices quickly
      marketingFocus: 'discount',    // hard supermarket / discount chain focus
      notes: 'Wins on low shelf price and multipacks in discount chains.'
    },
    {
      id: 'royal_cola',
      name: 'Royal Cola',
      style: 'Classic mainstream brand',
      color: '#f97316',              // warm orange-red
      baseShare: 0.35,               // ~35% baseline
      priceAggression: 0.5,          // moderate price moves
      marketingFocus: 'mass_media',  // TV, billboards, big city branding
      notes: 'Strong legacy brand, stable pricing, big city billboard presence.'
    },
    {
      id: 'zen_bubble',
      name: 'Zen Bubble',
      style: 'Trendy zero-sugar upstart',
      color: '#22c55e',              // fresh green
      baseShare: 0.15,               // ~15% baseline
      priceAggression: 0.3,          // less focused on price war
      marketingFocus: 'youth',       // campuses, festivals, social media
      notes: 'Targets younger consumers with zero-sugar, limited flavors, and social buzz.'
    }
  ];

  // ---- State helpers ---------------------------------------------------------
  function ensureRivalsState(state) {
    if (!state) return null;
    if (!state.ext) state.ext = {};

    if (!state.ext.rivals) {
      state.ext.rivals = {
        roster: [],
        lastUpdateDay: state.day || 1
      };
    }

    // If roster is empty or missing, seed from RIVALS.
    if (!Array.isArray(state.ext.rivals.roster) || state.ext.rivals.roster.length === 0) {
      // Clone static rivals so we can mutate per-save later if needed.
      state.ext.rivals.roster = RIVALS.map(r => Object.assign({}, r));
    }

    return state.ext.rivals;
  }

  // ---- Light fallback rendering (only if game.js didn't fill the grid) ------
  function renderFallbackRivals(api, rivalsState) {
    if (!api || !api.D) return;

    const rivalsGrid = api.D('rivalsGrid');
    if (!rivalsGrid) return;

    // Avoid double-rendering: only draw if grid is effectively empty.
    if (rivalsGrid.children && rivalsGrid.children.length > 0) return;

    const roster = (rivalsState && rivalsState.roster) || [];

    rivalsGrid.innerHTML = '';
    roster.forEach(rival => {
      const card = document.createElement('div');
      card.className = 'chip rival-card';

      const main = document.createElement('div');
      main.className = 'chip-main';

      const nameEl = document.createElement('span');
      nameEl.textContent = rival.name;

      const shareEl = document.createElement('span');
      const pct = Math.round((rival.baseShare || 0) * 100);
      shareEl.textContent = pct + '% baseline share';

      main.appendChild(nameEl);
      main.appendChild(shareEl);

      const sub = document.createElement('div');
      sub.className = 'chip-sub';

      const styleEl = document.createElement('span');
      styleEl.textContent = rival.style + ' • Focus: ' + rival.marketingFocus;

      const notesEl = document.createElement('span');
      notesEl.textContent = rival.notes;

      sub.appendChild(styleEl);
      sub.appendChild(notesEl);

      card.appendChild(main);
      card.appendChild(sub);

      // Optional: color stripe
      if (rival.color) {
        card.style.borderLeft = '4px solid ' + rival.color;
        card.style.paddingLeft = '0.75rem';
      }

      rivalsGrid.appendChild(card);
    });
  }

  // ---- Extension handler ----------------------------------------------------
  const handler = {
    onInit(api) {
      if (!api || !api.getState) return;
      const state = api.getState();
      if (!state) return;

      ensureRivalsState(state);
    },

    onBindEvents(api) {
      // Reserved for future rival-specific actions.
      // For now, price + channels logic is handled in game.js.
      if (!api || !api.D) return;

      // Example for later:
      // const rivalsGrid = api.D('rivalsGrid');
      // if (!rivalsGrid) return;
      // rivalsGrid.addEventListener('click', (e) => {
      //   const btn = e.target.closest('[data-rival-action]');
      //   if (!btn) return;
      //   const action = btn.getAttribute('data-rival-action');
      //   const rivalId = btn.getAttribute('data-rival-id');
      //   // game.js can react to this via a public API.
      // });
    },

    onUpdateUI(api) {
      if (!api || !api.getState) return;
      const state = api.getState();
      if (!state) return;

      const rivalsState = ensureRivalsState(state);

      // Do NOT overwrite what game.js already rendered.
      // Only show our basic cards if grid is empty.
      renderFallbackRivals(api, rivalsState);
    }
  };

  window.CokeExt.register(handler);
})();