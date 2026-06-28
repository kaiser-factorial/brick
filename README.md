# brick-adjudicator

**BRICK MODE — Phase 1 prototype.** A standalone, focus-task-aware **allow/block adjudicator**.
It pulls the active project's **Next Action** from The Ledger, asks **Claude Haiku 4.5** whether a
given URL is consistent with that focus task, and returns a structured verdict — with **no daemon,
no network interception, and no enforcement**. The whole point is to validate the novel core (does
context-aware adjudication actually work?) before any macOS plumbing.

See `../ledger/docs/BRICK_MODE_PLAN.md` (Phase 1) for where this fits.

```
Ledger active project + Next Action ──┐
                                      ├─► Claude Haiku 4.5 ─► { decision, reason, confidence }
                 URL (+ optional title)┘
```

## Setup

```bash
cd brick
npm install
cp .env.example .env      # then add your ANTHROPIC_API_KEY
```

`.env` is auto-loaded. `LEDGER_BIN` defaults to the repo's `ledger` binary; override if yours lives
elsewhere.

## Usage

Run directly with `tsx` (no build needed):

```bash
# Choose a focus: a tracked project, free-typed text, or the most recently touched.
npm run dev -- https://github.com/kaiser-factorial/ledger --task "Fix the OAuth redirect bug"
npm run dev -- https://news.ycombinator.com --project <firestore-id>
npm run dev -- https://news.ycombinator.com --last

# With no focus flag, brick lists your projects so you can pick one:
npm run dev -- https://news.ycombinator.com

# JSON output
npm run dev -- https://news.ycombinator.com --last --json
```

> Ledger has no "active project" state — for a focus session you say what you're focusing on
> (`--task` / `--project` / `--last`).

Or build and use the `brick` binary:

```bash
npm run build
node dist/cli.js https://news.ycombinator.com
```

### No API key yet? Use `--dry-run`

Resolves the focus task from Ledger and prints the exact prompt that *would* be sent — proves the
Ledger wiring and prompt end-to-end without calling the API or needing a key:

```bash
npm run dev -- https://twitter.com/home --dry-run
```

### Evaluate on a batch of real URLs

```bash
npm run eval                 # runs examples/cases.json, prints a table + accuracy
npm run eval -- my-cases.json
```

`cases.json` is an array of `{ "task", "url", "title?", "expected?" }`. Add 20–30 URLs from your own
browsing to tune the prompt against reality. Cases with an `expected` decision are scored.

### AI-chat prepend header

The other half of Phase 1. Since you can't set a system prompt on claude.ai / Gemini / ChatGPT, BRICK
injects a focus header into the *outgoing message*. No API key needed — it's pure string assembly
(`src/prepend.ts`); the browser extension (Phase 2) will call the same functions to wrap messages
before they're sent.

```bash
# Header from a chosen project's Next Action (default style = gentle "nudge")
npm run prepend -- --last

npm run prepend -- --task "Prepare the Q3 VAT return"

# See a message wrapped with the header
npm run prepend -- --task "Prepare the Q3 VAT return" --message "what's a good pasta recipe?"

# Stricter ask (decline off-topic) instead of the default check-in
npm run prepend -- --task "Prepare the Q3 VAT return" --strict
```

It's a **soft nudge** (locked decision), framed as *your own* self-imposed reminder rather than a
command to refuse you — a header that tells the assistant to "decline to answer the user" invites
push-back, because models are trained to help the user and resist instructions that work against
them. `--strict` opts into the original decline-and-redirect phrasing; the default `nudge` just makes
the assistant check in before going off-task. Either way the real enforcement is the URL adjudicator
+ tier lists, not this.

## Local service + browser extension (Phase 2)

The adjudicator + prepend are now also exposed as a **local HTTP service** that a **Manifest-V3
browser extension** drives — the first real enforcement surface.

```bash
npm run serve     # local service on http://127.0.0.1:7373 (the "brain")
npm run smoke     # build + assert the service end-to-end (no API key needed) — 7 checks
```

Then load `extension/` unpacked in Chrome — full walkthrough in **[EXTENSION.md](./EXTENSION.md)**.
The extension holds no secrets and runs no AI: it asks the service for every decision. Tier-1 sites
are blocked instantly (`declarativeNetRequest`), Tier-2 is adjudicated per-navigation, Tier-3 is
untouched; a Pomodoro timer gates the work/break phases; AI-chat pages get an opt-in "↳ prepend
focus" pill. Sessions log to `.data/sessions.jsonl` (Firestore sync is stubbed — needs creds).

**Memory-Hub grounding (fast-follow):** set `BRICK_MEM_BIN` to enrich adjudication with the project's
own context via the Unified Memory Hub's `mem` CLI. Off by default; fails open.

## How it works

- **Focus task resolution** (`src/ledger.ts`): precedence is `--task` → `--project <id>` → `--last`
  (most recently touched). Ledger has **no "active project" state** ("active" there only means
  not-archived), so with none of these `brick` lists your projects and asks you to pick — it never
  silently guesses. A chosen project's task is its **Next Action**, falling back to its status note,
  then its name. This is BRICK's keystone — the focus task *is* the Ledger Next Action, not a string
  retyped each session.
- **Adjudication** (`src/adjudicate.ts`): Claude Haiku 4.5 via the Anthropic SDK, with a few-shot
  prompt (`src/prompt.ts`) and **forced tool use** to guarantee a structured
  `{ decision, reason, confidence }` verdict. Latency is logged (target < 500ms).
- **Conservative-allow**: a `block` whose confidence is below `BRICK_MIN_BLOCK_CONFIDENCE`
  (default 0.6) is downgraded to `allow`, so a shaky call never interrupts real work.

## Configuration

| Variable | Purpose | Default |
|---|---|---|
| `ANTHROPIC_API_KEY` | Adjudicator auth (Tier-2 stubs to allow without it) | _required for real adjudication_ |
| `LEDGER_BIN` | Path to the `ledger` CLI | repo path |
| `BRICK_MODEL` | Adjudicator model | `claude-haiku-4-5` |
| `BRICK_MIN_BLOCK_CONFIDENCE` | Below this, a block becomes an allow | `0.6` |
| `BRICK_PORT` | Local service port | `7373` |
| `BRICK_MEM_BIN` | Memory-Hub `mem` command for grounding (unset = off) | _unset_ |
| `BRICK_DATA_DIR` | Where `sessions.jsonl` is written | `brick/.data/` |

## Status & what's next

**Built (Phases 1–2, headless):** adjudicator, prepend, local service, MV3 extension, tiers,
Pomodoro sessions, JSONL logging; Memory-Hub grounding wired (inert until `BRICK_MEM_BIN`). See
`HANDOFF.md` and `SESSION_LOG.md`.

**Needs you:** (1) `ANTHROPIC_API_KEY` to validate Tier-2 accuracy (`npm run eval`) and stop stubbing;
(2) a browser to load/verify the extension on live chat sites; (3) Phase 3 (Focus UI *inside* the
Ledger app + session-as-Ledger-object) and Phase 4 (privileged daemon + bypass resistance) — both
deliberately not started here (mature-app edits / native macOS work that can't be verified headless).
