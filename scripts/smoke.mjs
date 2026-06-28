// Service smoke test: spawns dist/server.js on a test port, exercises the endpoints, asserts.
// Run: npm run smoke   (requires a built dist/ and a reachable ledger binary for --last)
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = process.env.SMOKE_PORT ?? "7399";
const BASE = `http://127.0.0.1:${PORT}`;

// The service requires X-Brick-Client (CSRF defense); local callers set it explicitly.
const H = { "content-type": "application/json", "x-brick-client": "smoke" };
const post = (path, body) =>
  fetch(BASE + path, { method: "POST", headers: H, body: JSON.stringify(body ?? {}) }).then((r) =>
    r.json(),
  );
const get = (path) => fetch(BASE + path, { headers: H }).then((r) => r.json());

let failed = 0;
const check = (name, cond) => {
  console.log(`${cond ? "✓" : "✗"} ${name}`);
  if (!cond) failed += 1;
};

const srv = spawn("node", ["dist/server.js"], {
  env: { ...process.env, BRICK_PORT: PORT },
  stdio: "ignore",
});

try {
  for (let i = 0; i < 25; i += 1) {
    try {
      await fetch(BASE + "/health");
      break;
    } catch {
      await sleep(150);
    }
  }

  // Auth gate: a request without the header is rejected.
  const noauth = await fetch(BASE + "/health");
  check("rejects missing X-Brick-Client", noauth.status === 403);

  const health = await get("/health");
  check("health ok", health.ok === true);

  const t1 = await post("/adjudicate", { url: "https://reddit.com/r/all", last: true });
  check("tier1 blocks", t1.tier === "tier1" && t1.decision === "block");

  const t3 = await post("/adjudicate", { url: "https://github.com/x", last: true });
  check("tier3 allows", t3.tier === "tier3" && t3.decision === "allow");

  const t2 = await post("/adjudicate", { url: "https://nytimes.com", task: "ship the thing" });
  check("tier2 resolves", t2.tier === "tier2" && typeof t2.confidence === "number");

  const start = await post("/session/start", { last: true });
  check("session starts", Boolean(start.session && start.session.id));

  const prep = await post("/prepend", {});
  check("prepend uses session focus", typeof prep.header === "string" && prep.header.includes("BRICK MODE"));

  await post("/session/stop", {});
  const after = await get("/session");
  check("session stops", after.session === null);
} finally {
  srv.kill();
}

console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
