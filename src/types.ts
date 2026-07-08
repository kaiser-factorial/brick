// `ask` (Epic 0.1) is a third outcome: the focus is too vague to judge the page against, so brick
// routes to the clarify overlay instead of hard-blocking — distinct from a confident `block`.
export type Decision = "allow" | "block" | "ask";

/** The raw verdict the model produces. */
export interface Verdict {
  decision: Decision;
  reason: string;
  /** 0.0–1.0 certainty in the decision. */
  confidence: number;
}

/** Where the focus task came from. */
export type FocusSource =
  | "next-action" // the active Ledger project's Next Action (the keystone)
  | "status-note" // fell back to the project's status note
  | "project-name" // fell back to just the project name
  | "explicit"; // user passed --task

export interface FocusTask {
  task: string;
  source: FocusSource;
  projectId?: string;
  projectName?: string;
}

export interface AdjudicationInput {
  focus: FocusTask;
  url: string;
  title?: string;
  /** Optional project context from the Memory Hub (Phase-2 fast-follow grounding). */
  grounding?: string;
  /** Per-request model override (R2 — configurable from the options page). Falls back to
   *  BRICK_MODEL, then the active provider's default. */
  model?: string;
}

export interface AdjudicationResult extends Verdict {
  focus: FocusTask;
  url: string;
  title?: string;
  model: string;
  latencyMs: number;
  /** True if a low-confidence block was downgraded to allow (conservative-allow). */
  downgraded: boolean;
}

// ---------- Workload / day-plan layer (Epic A) ----------
// Ledger-native in shape (see WORKLOAD_DESIGN.md §3/§7): the local JSON store mirrors the eventual
// Ledger object exactly, so Epic D is a backend swap, not a schema migration.

export interface Step {
  id: string;
  label: string;
  done: boolean;
}

export type GitPredicate =
  | { kind: "head-advanced"; ref?: string } // e.g. origin/main moved
  | { kind: "merge-commit"; intoRef: string } // a merge landed on <ref>
  | { kind: "message-match"; regex: string }; // commit subject matches

/** Structural only in Epic A — evaluators arrive with Epic B. `manual` is always available. */
export type StopCondition =
  | { type: "git"; repoPath: string; predicate: GitPredicate; met: boolean; metAt?: string }
  | {
      type: "ledger";
      projectId: string;
      on: "next-action-change";
      from?: string;
      met: boolean;
      metAt?: string;
    }
  | { type: "command"; cmd: string; cwd?: string; expectExit?: number; met: boolean; metAt?: string }
  | { type: "manual"; met: boolean; metAt?: string };

export interface RepeatSpec {
  mode: "requeue"; // on complete, drop a fresh copy at the queue tail
  maxPerDay?: number; // safety cap on total spawned copies
}

/** What actually advances the queue (§12). Behavior lands in Epic B; Epic A stores the field. */
export type SwapMode = "condition" | "time" | "first" | "both";

export type BlockStatus = "pending" | "active" | "done" | "skipped";

export interface WorkBlock {
  id: string;
  focus: FocusTask; // REUSED — ties to a Ledger project or an explicit task
  budgetMinutes?: number; // attention allocation; advisory in Epic A
  stopConditions?: StopCondition[];
  completionPolicy?: "any" | "all"; // when >1 condition (default "any")
  steps?: Step[]; // optional intra-block checklist
  repeat?: RepeatSpec;
  swapMode?: SwapMode; // default derived: both present → "first"; else the one present
  status: BlockStatus;
  startedAt?: string;
  completedAt?: string;
  actualMinutes?: number; // measured, for end-of-day review
}

export interface WorkloadPlan {
  id: string; // e.g. plan_<ts>
  label?: string; // "Sunday", "deep-work AM", …
  blocks: WorkBlock[]; // ORDERED; the queue
  activeBlockId?: string;
  createdAt: string;
}
