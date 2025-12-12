# GitHub Copilot Instructions — IdleFactoryGame (STRICT / ENFORCED)

You are GitHub Copilot working in this repository.
You MUST follow these rules exactly. If you cannot comply due to tool, UI, or permission limits, you must clearly say so and give the exact minimal steps the user must perform.

Failure to follow these rules is considered an incorrect response.

---

## 0) Absolute rules (non-negotiable)
- NEVER push directly to `main`.
- ALWAYS use a feature branch and a Pull Request targeting `main`.
- NEVER bypass branch protection rules.
- NO unrelated refactors, cleanup, or “improvements” unless explicitly requested.
- NO partial or “example” implementations unless explicitly requested.
- If something cannot be completed fully, mark it as **BLOCKED** and explain why.

---

## 1) Obedience & completeness contract (anti-lazy / anti-half-answer)

### 1.1 Requirements lock (MANDATORY)
Before doing any work, restate the task as:

**Requirements I will satisfy**
- [ ] Requirement 1
- [ ] Requirement 2
- [ ] Requirement 3

You MUST satisfy every checked item.
If any requirement is unclear, ask **ONE** clarifying question BEFORE editing files.
If not asked, proceed with reasonable assumptions and label them **Assumption**.

---

### 1.2 Definition of Done (DoD) — REQUIRED
You are NOT finished unless your final response includes ALL of the following:

- ✅ What changed (concise bullet list)
- ✅ Files changed / added (exact file list)
- ✅ How to verify (exact steps or actions)
- ✅ Risks & rollback plan (1–3 bullets)
- ✅ PR-ready summary:
  - PR title
  - PR description

If ANY of these are missing, the task is incomplete.

---

### 1.3 No placeholders / no vagueness
- No “etc”, “you could”, “should”, “might want”.
- No pseudocode unless explicitly requested.
- Provide concrete file names, functions, variables, and logic.
- Never claim something works or is tested unless you verified it.

---

## 2) Two-phase execution gate (MANDATORY FLOW)

### Phase A — PLAN ONLY (NO CODE CHANGES)
You MUST output exactly these sections, in this order:

1) **Requirements I will satisfy** (checkbox list)
2) **Plan** (numbered steps)
3) **Files to change/add**
4) **Verification plan**
5) **Risks**

Then STOP and ask exactly:
**Proceed? (Approve / Cancel)**

---

### Phase B — APPLY (ONLY AFTER APPROVAL)
After applying changes, output exactly:

1) **What I changed**
2) **Files changed / added**
3) **How to verify**
4) **Risks & rollback**
5) **PR details**
   - PR title
   - PR description

Then STOP and ask exactly:
**Open or update PR to `main` now? (Approve / Cancel)**

---

## 3) Command: “update main branch with all changes made”
When the user says:

> **"update main branch with all changes made"**

Interpret it EXACTLY as:

### 3.1 Preflight (NO edits)
- Identify current branch
- Check for uncommitted changes
- Check if a PR already exists
- Propose:
  - Feature branch name (`feat/<topic>` or `fix/<topic>`)
  - Commit plan (1–3 commits max)
  - PR title + PR description draft

Then ask once:
**Proceed to commit + open/update PR to `main`? (Approve / Cancel)**

---

### 3.2 Execute (AFTER approval)
- Ensure feature branch exists
- Commit changes with clear messages (`feat:`, `fix:`, `chore:`)
- Create or update PR targeting `main`
- Provide full DoD summary
- STOP so the user can merge on GitHub web/mobile

---

## 4) Repository structure & responsibilities (DO NOT GUESS)

### HTML (UI only)
- `index.html` — main UI shell
- `upgrades.html` — upgrades UI
- `equipment.html` — equipment UI
- `production_lines.html` — production UI
- `adventures.html` — adventures UI
- `adventure_map.html` — map UI

### CSS
- `styles.css` — styling only

### Core logic
- `game.js` — main game state, tick loop, save/load coordination
- `game_api.js` — shared helpers / APIs used across modules

### Systems
- `production.js` — production rates, resource math
- `bottles.js` — bottling logic & inventory
- `equipment.js` — machines, modifiers, unlocks
- `upgrades.js` — upgrades & effects
- `prestige_ext.js` — prestige & meta-progression
- `rivals.js` — competitors / market pressure

### Adventures
- `adventures_rpg.js` — RPG / adventure mechanics

Rule: Make the smallest correct change in the correct file. Do not move code unless explicitly told.

---

## 5) Idle-game design guardrails (STRICT)
When changing economy, progression, or balance, ALWAYS include:
- Before vs after numbers or formulas
- Early / mid / late game impact
- Caps or soft caps (if applicable)
- Effect on prestige value

### Offline progress (if added or modified)
- Deterministic
- Time-capped
- Never double-pay
- Clearly reported to the player

### Automation
- Must reduce repetitive input
- Must be clearly explained in UI text

---

## 6) Output discipline
- Responses must be structured, checklist-based, and concise.
- If the user requests “only confirmations”, show ONLY the required sections and approval prompt.
- If blocked, clearly mark **BLOCKED** and explain why.

---

## 7) Priority rule
When there is a conflict between:
- User instruction
- These instructions
- Model behavior

→ **User instruction + this file always win.**
