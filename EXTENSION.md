# BRICK MODE — browser extension (Phase 2 MVP)

The extension is the **enforcement surface**; the local **brick service** is the brain. The extension
holds no secrets and runs no AI — it asks the service (`127.0.0.1:7373`) for every decision.

```
popup / content scripts  ──►  background worker  ──►  brick service (:7373)  ──►  ledger-cli + Claude
   (pick focus, block UI)        (state, DNR rules)      (tiers, adjudicate, prepend)
```

## Run it

1. **Start the service** (needs `ANTHROPIC_API_KEY` in `brick/.env` for real Tier-2 adjudication;
   without it Tier-2 is a clearly-flagged stub that allows):
   ```bash
   cd brick
   npm install      # once
   npm run serve    # http://127.0.0.1:7373
   ```
2. **Load the extension** (Chrome / Edge / Brave):
   - Open `chrome://extensions`
   - Toggle **Developer mode** on
   - **Load unpacked** → select `brick/extension/`
3. Click the BRICK MODE toolbar icon → pick a **project** (or free-type a task, or "most recently
   touched") → **start focus session**.

## What happens during a work block

| Tier | Example | Behavior |
|---|---|---|
| **Tier 1** (always blocked) | reddit, instagram, tiktok, netflix… | `declarativeNetRequest` redirects to the block page instantly (no AI call) |
| **Tier 2** (conditional) | nytimes, youtube, twitter, anything else | content script asks the service → Claude adjudicates against your focus task → block page if off-task |
| **Tier 3** (always allowed) | github, stackoverflow, MDN, localhost… | never touched |

- **Pomodoro:** work block → break (restrictions lifted) → work, on `chrome.alarms`. Timer shown in the popup.
- **AI chat (claude.ai / Gemini / ChatGPT):** a focus pill appears bottom-right with a **"↳ prepend focus"**
  button that inserts the soft-nudge header into the composer. (Auto-on-send interception is a future
  per-site enhancement — see `SESSION_LOG.md` DIVERGENCE 4.)
- **Settings page** (`chrome://extensions` → BRICK MODE → Details → Extension options): service status +
  current tier lists.

## Step-by-step test (first run)

**Tip:** in the popup set **Work = 1** and **Break = 1** minute so you can watch the Pomodoro flip
quickly while testing.

1. **Service up:** `cd brick && npm run serve` → `brick service on http://127.0.0.1:7373 (... key: set)`.
   Leave it running.
2. **Load:** `chrome://extensions` → Developer mode ON → **Load unpacked** → pick `brick/extension/`.
   Pin the toolbar icon.
3. **Start a session:** click the icon → pick a project (or "most recently touched") → **start focus
   session**. The popup switches to the live timer, and a **countdown badge appears on the toolbar
   icon** — **red with minutes-left during work**, **green during breaks** (a constant at-a-glance
   indicator; the popup shows the finer second-by-second timer).
4. **Tier-1 (instant block):** visit `https://reddit.com` → you should be redirected to the BRICK
   block page immediately (no delay — this is a static rule, no AI).
5. **Tier-3 (always allowed):** visit `https://github.com` → loads normally, no interference.
6. **Tier-2 (AI adjudication, soft overlay):** visit a site that's clearly off-topic *for your focus*
   and not in the lists — e.g. `https://www.espn.com` while focused on a coding task → after ~1–1.5s a
   **"Back to BRICK MODE" modal** appears with **Just 1 more minute** / **Back to work →**. "1 more
   minute" → a red vignette + countdown stays (you can still type) and re-prompts at 0:00. Visit
   something on-topic → it loads untouched.
7. **Already-open tab on work re-engage:** open a Tier-2 distraction (e.g. X) *during a break*, then
   wait for **work** to re-engage → the same soft overlay should appear on that tab. Switching to an
   off-task tab during work triggers it too.
7. **AI-chat pill:** open `https://claude.ai` → a green "■ <focus task> ↳ prepend focus" pill appears
   bottom-right → click it → the focus header is inserted into the chat box.
8. **Pomodoro:** watch the popup timer hit 0 → it flips to **break** (Tier-1 rules lift — reddit loads)
   → then back to **work** (rules re-engage).
9. **Settings:** `chrome://extensions` → BRICK MODE → **Details** → **Extension options** → edit the
   tier lists, **save tier lists**, start a new session to pick up changes.
10. **Stop:** popup → **end session**. All blocking lifts.

**Debugging (since this hasn't been browser-verified):**
- Service-worker logs/errors: `chrome://extensions` → BRICK MODE → click **service worker** → Console.
- A blocked page not blocking? Confirm a session is active and in the **work** phase, and that
  `npm run serve` is still running (the worker logs "service unreachable" if not).
- Content-script logs: open DevTools on the page you're testing (the guard fails open silently).

## Placeholders / not-yet-wired

- **No `ANTHROPIC_API_KEY`** → Tier-2 returns `allow` with `stub:true` (the block page and options page
  say so). Tier-1/Tier-3 still work without a key.
- **Firestore session sync** is stubbed; sessions log locally to `brick/.data/sessions.jsonl`.
- **Memory-Hub grounding** (sharper adjudication) is inert unless `BRICK_MEM_BIN` is set — see README.
- **Not browser-verified:** the extension was written and statically checked headless; content-script
  behavior on live claude.ai/Gemini/ChatGPT DOMs may need per-site tuning.

## Troubleshooting

- Popup says *"service not reachable"* → start `npm run serve`.
- Tier-1 sites not blocking → the dynamic rules are set on session start; confirm a session is active
  and in the **work** phase (not break).
