import { readFile } from "node:fs/promises";
import { adjudicate } from "./adjudicate.js";
import type { Decision } from "./types.js";

try {
  process.loadEnvFile();
} catch {
  /* rely on ambient env */
}

const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
};

interface Case {
  task: string;
  url: string;
  title?: string;
  expected?: Decision;
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}

async function main(): Promise<void> {
  const path = new URL("../examples/cases.json", import.meta.url);
  const arg = process.argv[2];
  const file = arg ? arg : path;
  const cases = JSON.parse(await readFile(file, "utf8")) as Case[];

  let correct = 0;
  let graded = 0;
  let totalLatency = 0;

  process.stdout.write(
    `${C.dim}${pad("VERDICT", 7)}  ${pad("EXP", 5)}  ${pad("CONF", 5)}  ${pad("ms", 5)}  URL${C.reset}\n`,
  );

  for (const c of cases) {
    const r = await adjudicate({
      focus: { task: c.task, source: "explicit" },
      url: c.url,
      title: c.title,
    });
    totalLatency += r.latencyMs;

    const verdictColor = r.decision === "allow" ? C.green : C.red;
    let mark = " ";
    if (c.expected) {
      graded++;
      const ok = r.decision === c.expected;
      if (ok) correct++;
      mark = ok ? `${C.green}✓${C.reset}` : `${C.red}✗${C.reset}`;
    }

    process.stdout.write(
      `${verdictColor}${pad(r.decision, 7)}${C.reset}  ` +
        `${pad(c.expected ?? "-", 5)}  ` +
        `${pad(String(Math.round(r.confidence * 100)) + "%", 5)}  ` +
        `${pad(String(r.latencyMs), 5)}  ` +
        `${mark} ${C.dim}${c.url}${C.reset}\n`,
    );
  }

  const avg = cases.length ? Math.round(totalLatency / cases.length) : 0;
  process.stdout.write(`\n${C.dim}avg latency: ${avg}ms${C.reset}\n`);
  if (graded) {
    const pct = Math.round((correct / graded) * 100);
    const color = pct >= 80 ? C.green : pct >= 60 ? C.yellow : C.red;
    process.stdout.write(`${color}accuracy: ${correct}/${graded} (${pct}%)${C.reset}\n`);
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`${C.red}eval: ${msg}${C.reset}\n`);
  process.exitCode = 1;
});
