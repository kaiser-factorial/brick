import { randomUUID } from "node:crypto";
import { LocalPlanStore, advancePlan } from "./plan-store.js";
import type { PlanStore } from "./plan-store.js";
import { endSession, startSession } from "./session.js";
import type { FocusTask, Step, WorkBlock, WorkloadPlan } from "./types.js";

// PlanRuntime (Epic A3): owns the queue; the ACTIVE BLOCK delegates to the existing single-focus
// FocusSession — so the adjudicator, tiers, learned decisions, and Pomodoro all keep working
// unchanged, anchored to whichever block is live. Budgets are advisory in Epic A (reported, never
// enforced); swap policy/watchers arrive with Epic B.

export interface PlanView extends WorkloadPlan {
  stateVersion: number;
  /** Advisory budget readout for the active block (Epic A): elapsed vs budget, minutes. */
  active?: {
    blockId: string;
    elapsedMinutes: number;
    budgetMinutes?: number;
    remainingMinutes?: number;
    overBudget: boolean;
  };
}

export interface StartBlockInput {
  focus: FocusTask;
  budgetMinutes?: number;
  steps?: string[]; // labels; ids are assigned
  repeat?: WorkBlock["repeat"];
  swapMode?: WorkBlock["swapMode"];
}

let store: PlanStore = new LocalPlanStore();
let current: WorkloadPlan | null = null;
let stateVersion = 0; // monotonic per process; bumps on every plan mutation
let pomodoro: { workMinutes?: number; breakMinutes?: number } = {};

/** Swap the backing store (Epic D drops in a LedgerPlanStore here). */
export function usePlanStore(s: PlanStore): void {
  store = s;
}

const bump = (): void => {
  stateVersion += 1;
};

async function persist(): Promise<void> {
  if (current) await store.save(current);
}

/** Anchor the single-focus session to a block (start/advance both come through here). */
async function anchorSession(block: WorkBlock): Promise<void> {
  await endSession(); // no-op when nothing is running
  await startSession({ focus: block.focus, ...pomodoro });
}

export function getPlan(): WorkloadPlan | null {
  return current;
}

export function activeBlock(): WorkBlock | null {
  if (!current?.activeBlockId) return null;
  return current.blocks.find((b) => b.id === current!.activeBlockId) ?? null;
}

export function planView(): PlanView | null {
  if (!current) return null;
  const view: PlanView = { ...current, stateVersion };
  const block = activeBlock();
  if (block?.startedAt) {
    const elapsed = Math.max(0, (Date.now() - new Date(block.startedAt).getTime()) / 60000);
    view.active = {
      blockId: block.id,
      elapsedMinutes: Math.round(elapsed * 10) / 10,
      budgetMinutes: block.budgetMinutes,
      remainingMinutes:
        block.budgetMinutes != null
          ? Math.round((block.budgetMinutes - elapsed) * 10) / 10
          : undefined,
      overBudget: block.budgetMinutes != null && elapsed > block.budgetMinutes,
    };
  }
  return view;
}

export function getStateVersion(): number {
  return stateVersion;
}

/** Re-hydrate a persisted plan on service start (best-effort; the queue survives restarts). */
export async function restorePlan(): Promise<void> {
  const saved = await store.load();
  if (saved?.activeBlockId) {
    current = saved;
    bump();
  }
}

export async function startPlan(opts: {
  label?: string;
  blocks: StartBlockInput[];
  workMinutes?: number;
  breakMinutes?: number;
}): Promise<PlanView> {
  if (!opts.blocks.length) throw new Error("a plan needs at least one block");
  pomodoro = { workMinutes: opts.workMinutes, breakMinutes: opts.breakMinutes };
  const now = new Date().toISOString();
  const blocks: WorkBlock[] = opts.blocks.map((b, i) => ({
    id: `blk_${i}_${randomUUID().slice(0, 8)}`,
    focus: b.focus,
    budgetMinutes: b.budgetMinutes,
    steps: (b.steps ?? []).map((label, j) => ({ id: `step_${j}`, label, done: false })),
    repeat: b.repeat,
    swapMode: b.swapMode,
    status: i === 0 ? "active" : "pending",
    startedAt: i === 0 ? now : undefined,
  }));
  current = {
    id: `plan_${Date.now().toString(36)}`,
    label: opts.label,
    blocks,
    activeBlockId: blocks[0].id,
    createdAt: now,
  };
  bump();
  await persist();
  await anchorSession(blocks[0]);
  return planView()!;
}

export async function advanceBlock(
  blockId: string | undefined,
  how: "done" | "skipped",
): Promise<PlanView | null> {
  if (!current) throw new Error("no active plan");
  const id = blockId ?? current.activeBlockId;
  if (!id) throw new Error("no active block");
  current = advancePlan(current, id, how);
  bump();
  await persist();
  const next = activeBlock();
  if (next) {
    await anchorSession(next);
    return planView();
  }
  // Queue exhausted — the plan is over.
  await endSession();
  const finished = planView();
  current = null;
  return finished;
}

/** The `manual` stop-condition fallback: mark it met, then advance as done. */
export async function completeBlock(blockId?: string): Promise<PlanView | null> {
  const block = blockId
    ? current?.blocks.find((b) => b.id === blockId)
    : activeBlock();
  if (current && block) {
    for (const c of block.stopConditions ?? []) {
      if (c.type === "manual" && !c.met) {
        c.met = true;
        c.metAt = new Date().toISOString();
      }
    }
  }
  return advanceBlock(block?.id, "done");
}

export async function toggleStep(blockId: string | undefined, stepId: string): Promise<PlanView> {
  if (!current) throw new Error("no active plan");
  const block = blockId
    ? current.blocks.find((b) => b.id === blockId)
    : activeBlock();
  const step: Step | undefined = block?.steps?.find((s) => s.id === stepId);
  if (!block || !step) throw new Error("unknown block or step");
  step.done = !step.done;
  bump();
  await persist();
  return planView()!;
}

/** Fluid edits (Epic A4 /plan/reorder): reorder pending blocks, drop one, extend a budget, or
 *  insert an ad-hoc block at the tail. Active/done blocks keep their position. */
export async function editPlan(edit: {
  order?: string[];
  drop?: string;
  budget?: { blockId: string; budgetMinutes: number };
  insert?: StartBlockInput;
}): Promise<PlanView> {
  if (!current) throw new Error("no active plan");

  if (edit.drop) {
    const b = current.blocks.find((x) => x.id === edit.drop);
    if (b?.status === "active") throw new Error("cannot drop the active block — advance it instead");
    current.blocks = current.blocks.filter((x) => x.id !== edit.drop);
  }
  if (edit.budget) {
    const b = current.blocks.find((x) => x.id === edit.budget!.blockId);
    if (b) b.budgetMinutes = Math.max(1, Math.round(edit.budget.budgetMinutes));
  }
  if (edit.insert) {
    current.blocks.push({
      id: `blk_i_${randomUUID().slice(0, 8)}`,
      focus: edit.insert.focus,
      budgetMinutes: edit.insert.budgetMinutes,
      steps: (edit.insert.steps ?? []).map((label, j) => ({ id: `step_${j}`, label, done: false })),
      repeat: edit.insert.repeat,
      swapMode: edit.insert.swapMode,
      status: "pending",
    });
  }
  if (edit.order?.length) {
    // Reorder only the pending tail; settled blocks (done/skipped/active) keep their position.
    const settled = current.blocks.filter((b) => b.status !== "pending");
    const pending = current.blocks.filter((b) => b.status === "pending");
    const byId = new Map(pending.map((b) => [b.id, b]));
    const reordered = edit.order.map((id) => byId.get(id)).filter((b): b is WorkBlock => !!b);
    const leftover = pending.filter((b) => !edit.order!.includes(b.id));
    current.blocks = [...settled, ...reordered, ...leftover];
  }
  bump();
  await persist();
  return planView()!;
}

/** End the plan outright: remaining pending blocks are skipped; the session ends. */
export async function endPlan(): Promise<PlanView | null> {
  if (!current) return null;
  const now = new Date().toISOString();
  for (const b of current.blocks) {
    if (b.status === "pending") b.status = "skipped";
    if (b.status === "active") {
      b.status = "skipped";
      b.completedAt = now;
    }
  }
  current.activeBlockId = undefined;
  bump();
  await persist();
  await endSession();
  const finished = planView();
  current = null;
  return finished;
}
