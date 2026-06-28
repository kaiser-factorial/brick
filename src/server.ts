#!/usr/bin/env node
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { fetchProjects, resolveFocusTask } from "./ledger.js";
import { adjudicate } from "./adjudicate.js";
import { buildPrependHeader, wrapMessage } from "./prepend.js";
import { classify } from "./tiers.js";
import { groundingEnabled } from "./grounding.js";
import { loadTiers, resetTiers, saveTiers } from "./config-store.js";
import {
  endSession,
  getSession,
  recordAdjudication,
  setPhase,
  startSession,
} from "./session.js";
import type { FocusTask } from "./types.js";

try {
  process.loadEnvFile();
} catch {
  /* ambient env */
}

const PORT = Number(process.env.BRICK_PORT ?? "7373");
const MODEL = process.env.BRICK_MODEL ?? "claude-haiku-4-5";
const hasApiKey = (): boolean => Boolean(process.env.ANTHROPIC_API_KEY);

// Tier config: persisted (.data/tiers.json), editable via the options page / POST /config/tiers.
let tiers = await loadTiers();

type Body = Record<string, unknown>;

function readJson(req: IncomingMessage): Promise<Body> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data) as Body);
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

// SECURITY: a localhost service is reachable by any web page the user visits. Two defenses:
//  1. Only reflect Access-Control-Allow-Origin for the extension / localhost (never "*"), so a
//     random site can't read GET responses (e.g. exfiltrate the project list).
//  2. Require an X-Brick-Client header on every request. A cross-origin "simple" request can't set
//     custom headers; adding one forces a CORS preflight that only succeeds for allowed origins —
//     so a malicious page's request never reaches the handler. The extension/CLI set it explicitly.
function isAllowedOrigin(origin: string): boolean {
  if (!origin) return true; // non-browser clients (curl, the CLI) send no Origin
  if (origin.startsWith("chrome-extension://")) return true;
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function applyCors(req: IncomingMessage, res: ServerResponse): void {
  const origin = req.headers.origin ?? "";
  if (origin && isAllowedOrigin(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Brick-Client");
}

function authorized(req: IncomingMessage): boolean {
  return Boolean(req.headers["x-brick-client"]);
}

/** Privacy: send only origin+path to the model, never query strings / fragments. */
function modelUrl(u: string): string {
  try {
    const x = new URL(u);
    return x.origin + x.pathname;
  } catch {
    return u;
  }
}

function sendJson(res: ServerResponse, status: number, obj: unknown): void {
  res.setHeader("Content-Type", "application/json");
  res.statusCode = status;
  res.end(JSON.stringify(obj));
}

function str(body: Body, key: string): string | undefined {
  const v = body[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** Resolve the focus. During an active session the session's focus wins — a per-call `task` in the
 *  body can't hijack the adjudication target. Only outside a session do explicit fields apply. */
async function focusFor(body: Body): Promise<FocusTask> {
  const s = getSession();
  if (s) return s.focus;
  if (body.task || body.projectId || body.last) {
    return resolveFocusTask({
      explicit: str(body, "task"),
      projectId: str(body, "projectId"),
      last: Boolean(body.last),
    });
  }
  throw new Error("No active session and no focus given (pass task / projectId / last).");
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const route = `${req.method} ${url.pathname}`;

  applyCors(req, res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (!authorized(req)) {
    return sendJson(res, 403, { error: "missing X-Brick-Client header" });
  }

  switch (route) {
    case "GET /health":
      return sendJson(res, 200, {
        ok: true,
        model: MODEL,
        hasApiKey: hasApiKey(),
        grounding: groundingEnabled(),
      });

    case "GET /config":
      return sendJson(res, 200, {
        tiers,
        model: MODEL,
        hasApiKey: hasApiKey(),
        grounding: groundingEnabled(),
      });

    case "POST /config/tiers": {
      const body = await readJson(req);
      tiers = await saveTiers({ tier1: body.tier1, tier3: body.tier3 });
      return sendJson(res, 200, { tiers });
    }

    case "POST /config/tiers/reset": {
      tiers = await resetTiers();
      return sendJson(res, 200, { tiers });
    }

    case "GET /projects":
      return sendJson(res, 200, { projects: await fetchProjects() });

    case "GET /session":
      return sendJson(res, 200, { session: getSession() });

    case "POST /session/start": {
      const body = await readJson(req);
      const focus = await focusFor(body);
      const session = await startSession({
        focus,
        workMinutes: typeof body.workMinutes === "number" ? body.workMinutes : undefined,
        breakMinutes: typeof body.breakMinutes === "number" ? body.breakMinutes : undefined,
      });
      return sendJson(res, 200, { session });
    }

    case "POST /session/phase": {
      const body = await readJson(req);
      const phase = str(body, "phase");
      if (phase !== "work" && phase !== "break" && phase !== "ended") {
        return sendJson(res, 400, { error: "phase must be work|break|ended" });
      }
      return sendJson(res, 200, { session: await setPhase(phase) });
    }

    case "POST /session/stop":
      return sendJson(res, 200, { session: await endSession() });

    case "POST /adjudicate": {
      const body = await readJson(req);
      const target = str(body, "url");
      if (!target) return sendJson(res, 400, { error: "url required" });
      const focus = await focusFor(body);
      const tier = classify(target, tiers);

      let result: { decision: string; reason: string; confidence: number; stub: boolean };
      if (tier === "tier1") {
        result = { decision: "block", reason: "Tier-1 always-blocked site.", confidence: 1, stub: false };
      } else if (tier === "tier3") {
        result = { decision: "allow", reason: "Tier-3 always-allowed site.", confidence: 1, stub: false };
      } else if (!hasApiKey()) {
        // PLACEHOLDER: no key → don't block, but mark as a stub so the UI can show it.
        result = {
          decision: "allow",
          reason: "(stub — no ANTHROPIC_API_KEY; tier-2 not adjudicated)",
          confidence: 0,
          stub: true,
        };
      } else {
        const r = await adjudicate({ focus, url: modelUrl(target), title: str(body, "title") });
        result = { decision: r.decision, reason: r.reason, confidence: r.confidence, stub: false };
      }

      await recordAdjudication(target, result.decision, tier);
      return sendJson(res, 200, { ...result, tier, url: target, focus });
    }

    case "POST /prepend": {
      const body = await readJson(req);
      const focus = await focusFor(body);
      const style = body.strict ? "strict" : "nudge";
      const message = str(body, "message");
      const header = buildPrependHeader(focus, { style });
      return sendJson(res, 200, {
        header,
        wrapped: message ? wrapMessage(message, focus, { style }) : undefined,
        focus,
      });
    }

    default:
      return sendJson(res, 404, { error: `no route: ${route}` });
  }
}

createServer((req, res) => {
  handle(req, res).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    sendJson(res, 500, { error: msg });
  });
}).listen(PORT, "127.0.0.1", () => {
  process.stdout.write(
    `brick service on http://127.0.0.1:${PORT}  (model: ${MODEL}, key: ${hasApiKey() ? "set" : "MISSING — tier-2 stubbed"})\n`,
  );
});
