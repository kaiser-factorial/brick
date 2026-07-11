# BULWORK MODE — handoff

**What this is:** the focus-enforcement pillar of the Ledger project-OS. Spec + roadmap in
`../ledger/docs/BULWORK_MODE_PLAN.md`; chronological build log + divergences in `SESSION_LOG.md`.

---

## ▶ All five epics done — Epic D (Ledger-native store) shipped 2026-07-11

**Where we are:** the early wave (U/R/0/S/F/H) is merged (PR #1) and the local-first plan layer
(A/T/B/C) is complete. **Epic D** — the last epic, the only one touching the mature Ledger app —
is now done too: `LedgerPlanStore`/`LedgerTemplateStore` (Firestore, via new `ledger plan`/
`ledger template` CLI verbs in `ledger-cli`) are drop-in swaps for the local JSON stores behind the
existing `PlanStore`/`TemplateStore` seams, selected by `BULWORK_PLAN_BACKEND=ledger`. Verified live
against real Firestore (start/step/restart/migrate — see `SESSION_LOG.md`'s "Epic D" entry for full
detail and the one documented divergence from the ticket text). **Not built:** H5 (shared `help/`
corpus into Ledger's own focus agent) and a `ledger-mcp` wrapper for the two new commands — both
flagged as natural follow-ups, not required by D1/D2's acceptance criteria.

The two docs that drove the build (kept as reference — the phased history below is now complete):

- **`WORKLOAD_DESIGN.md`** — full system design. Workload/day-plan queue, swap policy, templates,
  advance-mode setting, notifications, Ledger-native store (§1–13); **gatekeeper quality** (§14),
  **session-state feedback** (§15), **focus-time integrity** (§16), **OpenRouter provider +
  configurable model** (§17), **in-app help agent** (§18). Appendices: stop-condition predicate
  schema, popup UI.
- **`WORKLOAD_TICKETS.md`** — phased tickets grouped into epics **U, R, 0, H, S, F, A, T, B, C, D**,
  each with acceptance criteria and a **per-phase verification gate** (checkboxes to run before
  sign-off).

**Build order that was followed:** `U → (R → {0, H}, S, F) → A → (T, B) → C → D`. (The detailed
per-epic parallelization map that used to live here — which files each ticket touched, which lanes
ran concurrently — is no longer forward-looking now that every epic is built; see `git log` on this
file, or `WORKLOAD_TICKETS.md`, if that history is ever needed again.)

## Status

- **Phase 1 — DONE.** Adjudicator (`bulwork`) + AI-chat prepend (`bulwork-prepend`). Verified: build,
  typecheck, live Ledger wiring, dry-run. (Eval now runnable — key is in.)
- **Phase 2 — DONE (headless).** Local service (`src/server.ts`) + MV3 browser extension
  (`extension/`) + tiers + Pomodoro sessions + JSONL session log + the prepend focus pill.
  Verified by `npm run smoke` (7/7) and manual curl. Now running live in Chrome with the key.
- **Phase-2 fast-follow — wired, inert.** Memory-Hub grounding (`src/grounding.ts`), gated on
  `BULWORK_MEM_BIN`.
- **Design/planning — DONE (2026-07-08).** Full design + phased tickets for the next build wave
  (Epics U, R, 0, H, S, F, A, T, B, C, D) written in `WORKLOAD_DESIGN.md` + `WORKLOAD_TICKETS.md`.
- **Workload early wave — COMPLETE (2026-07-08, branch `worktree-workload-early-wave`, PR #1).**
  **U ✓ R ✓ (R1–R3; R4 optional) 0 ✓ (0.1–0.8) S ✓ F ✓ H ✓ (H1–H4; H5 with Epic D).** Highlights:
  provider seam + OpenRouter with model picker (`GET /models`, tool-capable filter); `ask` outcome +
  clarify card + learned-decision store with precedence + honesty lever + YouTube per-page scoping +
  rabbit-hole nudge; phase border + synthesized sound cues; grace clock-pause with per-block cap +
  escalating tint; grounded `/help` agent with read-only state tools + options-page panel.
  `npm run smoke` = **46/46**, hermetic/key-free/ledger-free; OpenRouter + Anthropic + fail-open +
  learned/precedence + page-scope + refocus + help retrieval all verified live. 🖐 **A consolidated
  browser pass is the one open gate** (checklist on PR #1: grace regression, clarify card, popup
  levers, model picker, YouTube SPA, rabbit-hole at a test threshold, border/sound, grace pause/cap,
  help panel). **Merged to master.** See `SESSION_LOG.md` for per-epic detail.
- **Plan layer, Epics A + T + B + C — DONE (2026-07-08, branch `workload-plan-layer`, PR #2,
  smoke 108/108).** B: stop-condition watchers (git/ledger/command/manual — fail-open, monotonic),
  the §12 swap combinator, advance-mode auto-with-undo vs manual (`/plan/undo-advance`; time-driven
  swaps always nudge). C: escalation clock (t-minus/t-0/grace), NotificationDispatcher with
  persisted once-per-event dedup, OS toasts, in-page Advance/Stay/Undo card, badge colour ladder +
  popup banner. Earlier entry (A+T detail) follows:
  **A ✓** day-plan queue: `WorkloadPlan/WorkBlock/Step` types, `LocalPlanStore` (`.data/plan.json`,
  Ledger-native shape behind the `PlanStore` seam), `PlanRuntime` (active block **delegates to the
  existing FocusSession** — adjudicator/tiers/learned decisions/grace untouched; advisory budgets;
  monotonic `stateVersion`; survives restarts), `/plan*` routes, plan-aware badge
  (`2/3 · <focus> · Nm left`), popup builder/queue/steps UI. **T ✓** workflow templates:
  `LocalTemplateStore`, pure `expandTemplate` (slot binding, `repeat: N`, `until-end-of-day`),
  `liftPlanToTemplate` (save-current, parameterize projects→slots), `/templates` CRUD +
  `/plan/from-template`, popup slot-binding picker + save-as-template, options manager.
  `npm run smoke` = **77/77** hermetic. 🖐 Phase A/T browser gates on PR #2.
- **Epic D — Ledger-native store — DONE (2026-07-11).** `LedgerPlanStore`/`LedgerTemplateStore`
  (Firestore, via new `ledger plan`/`ledger template` CLI verbs), `BULWORK_PLAN_BACKEND` switch,
  `scripts/migrate-plan-to-ledger.mjs`. All five epics (A/T/B/C/D) now complete — the workload/day-
  plan layer is done. See `SESSION_LOG.md`'s "Epic D" entry for full detail, including the one
  documented divergence from `WORKLOAD_TICKETS.md`'s literal D1 wording.

## Resume / verify

```bash
cd bulwork && npm install
npm run smoke             # builds + self-tests the whole service — hermetic (no key, no ledger)
npm run serve             # then load extension/ unpacked in Chrome (see EXTENSION.md)
npm run eval              # needs a provider key — validates adjudication accuracy
npm run eval:corrections  # scores the adjudicator against YOUR recorded clarify answers/corrections
```

## Blocked on you (status)

1. ~~**API keys**~~ — **RESOLVED.** Both `OPENROUTER_API_KEY` (default provider, model picker on the
   options page) and `ANTHROPIC_API_KEY` (fallback path) are in `.env`; adjudication runs live.
2. ~~**A browser**~~ — **RESOLVED.** Running in Chrome. (Per-site content-script tuning on live
   claude.ai / Gemini / ChatGPT is still worth doing, but it's no longer a blocker.)
3. ~~**Firestore creds + Epic D**~~ — **RESOLVED (2026-07-11).** `LEDGER_BIN` + ADC creds work
   live; the workload plan/templates now have a Ledger-native (Firestore) backend, verified end to
   end. Still open, separately: **Phase 3** ("Focus UI in the Ledger app + session-as-Ledger-object")
   — a distinct piece of work editing the mature Ledger *React app* itself (not the CLI), and **H5**
   (shared `help/` corpus into Ledger's own focus agent). **Grounded plans are ready:**
   `../ledger/docs/BULWORK_PHASE3_LEDGER_APP.md` (app + `FocusSession`; key gotcha `BRICK_USER_ID`) and
   `../ledger-cli/docs/FOCUS_COMMAND_PLAN.md` (`ledger focus` primitive).

Note: a subagent security review hardened the service since first build — the local service now
requires an `X-Bulwork-Client` header and locks CORS to the extension/localhost origins (CSRF-to-
localhost fix). See SESSION_LOG "Agent-assisted hardening".

## File map

```
src/
  cli.ts / prepend-cli.ts / eval.ts   CLIs + eval harness
  ledger.ts          focus-task resolution (--task/--project/--last; no "active" state)
  adjudicate.ts      provider-agnostic adjudication: forced tool use, allow|block|ask,
                     conservative-allow, fail-open (R3)
  providers/         VerdictProvider seam: openrouter.ts (default) + anthropic.ts (fallback),
                     recordVerdict (forced tool) + chat (help agent, optional read-only tools)
  prompt.ts          system + few-shot (+ grounding block, ask guidance, source leniency)
  decisions-store.ts learned allow/block per (focusKey, scope, unit) + precedence + eval export
  prepend.ts         soft-nudge AI-chat header
  tiers.ts           tier1/tier3 defaults + classify()
  config-store.ts    tier lists + BulworkSettings (model, focus tuning) — .data/*.json
  session.ts         Pomodoro/focus session state + JSONL log (+ Firestore stub) + refocus
  plan-store.ts      PlanStore seam + Local/LedgerPlanStore + pure advancePlan (Epic A/D)
  plan-runtime.ts    queue runtime: block↔session anchoring, budgets, steps, stateVersion (Epic A)
  template-store.ts  TemplateStore + Local/LedgerTemplateStore + expandTemplate + liftPlanToTemplate
                     (Epic T/D)
  help.ts            grounded /help Q&A: corpus retrieval + read-only state tools (Epic H)
  grounding.ts       Memory-Hub grounding (env-gated placeholder)
  server.ts          local HTTP service (:7373) — adjudicate/session/plan/templates/help/config
help/*.md            curated help corpus (the help agent answers ONLY from these)
extension/           MV3: manifest, background, overlay.js (U1 primitive), content-guard,
                     content-prepend, offscreen audio, popup (plans/templates), options, block page
scripts/             smoke.mjs (hermetic self-test) + export-cases.mjs (corrections → eval cases) +
                     migrate-plan-to-ledger.mjs (Epic D one-shot .data → Firestore migration)
```

**Still-unbuilt (all `WORKLOAD_TICKETS.md` epics — U/R/0/H/S/F/A/T/B/C/D — are now complete):**
```
H5 (shared help/ corpus wired into Ledger's own focus agent) and a ledger-mcp wrapper for the new
`ledger plan`/`ledger template` commands — both flagged as follow-ups, not gating anything here.
```
