// One-shot migration (Epic D): copy the local plan/templates (.data/plan.json,
// .data/templates.json) into the Ledger backend, through the SAME store classes the service uses
// (LedgerPlanStore/LedgerTemplateStore) — not a raw Firestore write — so this exercises the real
// D2 code path. Non-destructive: the local files are never touched/deleted; they simply stop being
// read once BULWORK_PLAN_BACKEND=ledger is set.
//
// Usage: node scripts/migrate-plan-to-ledger.mjs [--dry-run]
// Requires: LEDGER_BIN set (and Firestore creds) — same requirements as running the service with
// BULWORK_PLAN_BACKEND=ledger. Run `npm run build` first (imports the compiled dist/ output).
import { LedgerPlanStore, LocalPlanStore } from "../dist/plan-store.js";
import { LedgerTemplateStore, LocalTemplateStore } from "../dist/template-store.js";

try {
  process.loadEnvFile();
} catch {
  /* ambient env */
}

const dryRun = process.argv.includes("--dry-run");
const log = (msg) => process.stderr.write(`${msg}\n`);

if (!process.env.LEDGER_BIN) {
  log("LEDGER_BIN is not set — nothing to migrate to. Set it (see .env.example) and re-run.");
  process.exit(1);
}

const localPlan = new LocalPlanStore();
const localTemplates = new LocalTemplateStore();
const ledgerPlan = new LedgerPlanStore();
const ledgerTemplates = new LedgerTemplateStore();

// ---- plan ----
const plan = await localPlan.load();
if (!plan) {
  log("No local plan (.data/plan.json) — skipping.");
} else if (dryRun) {
  log(`[dry-run] would migrate plan "${plan.id}" (${plan.blocks.length} block(s)).`);
} else {
  await ledgerPlan.save(plan);
  const roundTrip = await ledgerPlan.load();
  if (roundTrip?.id !== plan.id) {
    throw new Error(`plan migration verification failed: expected "${plan.id}", got ${JSON.stringify(roundTrip?.id)}`);
  }
  log(`migrated plan "${plan.id}" (${plan.blocks.length} block(s)) — verified via ledger plan show.`);
}

// ---- templates ----
const templates = await localTemplates.list();
if (!templates.length) {
  log("No local templates (.data/templates.json) — skipping.");
} else if (dryRun) {
  log(`[dry-run] would migrate ${templates.length} template(s): ${templates.map((t) => t.id).join(", ")}`);
} else {
  let migrated = 0;
  for (const t of templates) {
    await ledgerTemplates.save(t);
    const roundTrip = await ledgerTemplates.get(t.id);
    if (roundTrip?.id !== t.id) {
      throw new Error(`template migration verification failed for "${t.id}"`);
    }
    migrated += 1;
    log(`  migrated template "${t.id}" (${t.name})`);
  }
  log(`migrated ${migrated}/${templates.length} template(s) — each verified via ledger template show.`);
}

log(
  dryRun
    ? "\n[dry-run] no writes made. Local .data/*.json files are untouched either way — set BULWORK_PLAN_BACKEND=ledger to start reading from Ledger."
    : "\nDone. Local .data/*.json files are untouched (harmless — they're no longer read once BULWORK_PLAN_BACKEND=ledger is set).",
);
