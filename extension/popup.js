// BRICK MODE popup — focus picker (no session) / live timer (active session).
const $ = (id) => document.getElementById(id);
const send = (msg) => chrome.runtime.sendMessage(msg);

let tick = null;

function fmt(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

async function render() {
  const st = await send({ type: "getState" });
  const active = st && st.session;

  $("picker").classList.toggle("hidden", !!active);
  $("active").classList.toggle("hidden", !active);
  if (tick) {
    clearInterval(tick);
    tick = null;
  }

  if (active) {
    $("phase").textContent = st.phase === "break" ? "break — restrictions lifted" : "work";
    $("afocus").textContent = st.session.focus.task;
    $("stats").textContent = `${st.session.adjudications} checks · ${st.session.blocks} blocked`;
    const update = () => {
      $("timer").textContent = fmt((st.phaseEndsAt ?? Date.now()) - Date.now());
    };
    update();
    tick = setInterval(update, 1000);
    await renderPlan();
  } else {
    await loadProjects();
  }
}

// ---------- day plan (Epic A5) ----------
const GLYPH = { done: "✓", active: "▶", pending: "○", skipped: "✗" };

async function renderPlan() {
  const res = await send({ type: "getPlan" });
  const plan = res && res.plan;
  const has = !!(plan && plan.activeBlockId);
  $("planPane").classList.toggle("hidden", !has);
  $("planStrip").style.display = has ? "block" : "none";
  $("planBudget").style.display = has && plan.active?.budgetMinutes != null ? "block" : "none";
  if (!has) return;

  const idx = plan.blocks.findIndex((b) => b.id === plan.activeBlockId);
  $("planStrip").textContent = `plan${plan.label ? " · " + plan.label : ""} · block ${idx + 1} / ${plan.blocks.length}`;
  if (plan.active?.budgetMinutes != null) {
    const rem = Math.max(0, plan.active.remainingMinutes ?? 0);
    $("planBudget").textContent = plan.active.overBudget
      ? `budget: ${plan.active.budgetMinutes}m — over by ${Math.abs(plan.active.remainingMinutes).toFixed(0)}m`
      : `budget: ${rem.toFixed(0)}m of ${plan.active.budgetMinutes}m left`;
  }

  const block = plan.blocks[idx];
  const steps = $("planSteps");
  steps.textContent = "";
  if (block.steps && block.steps.length) {
    for (const s of block.steps) {
      const row = document.createElement("div");
      row.style.cursor = "pointer";
      row.textContent = `${s.done ? "☑" : "☐"} ${s.label}`;
      row.addEventListener("click", async () => {
        await send({ type: "planStep", blockId: block.id, stepId: s.id });
        renderPlan();
      });
      steps.appendChild(row);
    }
  } else {
    steps.textContent = "(none)";
  }

  const queue = $("planQueue");
  queue.textContent = "";
  for (const b of plan.blocks) {
    const row = document.createElement("div");
    const extra =
      b.status === "done" && b.actualMinutes != null
        ? ` (${b.actualMinutes}m)`
        : b.budgetMinutes != null
          ? ` · ${b.budgetMinutes}m`
          : "";
    row.textContent = `${GLYPH[b.status] ?? "○"} ${b.focus.task}${extra}${b.repeat ? " ↻" : ""}`;
    if (b.status === "active") row.style.color = "#d9e8dd";
    queue.appendChild(row);
  }
}

$("startPlan").addEventListener("click", async () => {
  const lines = $("planBlocks")
    .value.split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) {
    $("warn").textContent = "add at least one block: task | minutes";
    return;
  }
  const blocks = lines.map((l) => {
    const [task, mins] = l.split("|").map((s) => s.trim());
    const b = { task };
    const m = Number(mins);
    if (Number.isFinite(m) && m > 0) b.budgetMinutes = m;
    return b;
  });
  const opts = {
    blocks,
    workMinutes: Number($("work").value) || 25,
    breakMinutes: Number($("break").value) || 5,
  };
  const res = await send({ type: "planStart", opts });
  if (res && res.error) {
    $("warn").textContent = res.error;
    return;
  }
  render();
});

$("planAdvance").addEventListener("click", async () => {
  await send({ type: "planAdvance" });
  render();
});

$("planEnd").addEventListener("click", async () => {
  await send({ type: "planEnd" });
  render();
});

async function loadProjects() {
  const sel = $("project");
  sel.innerHTML = '<option value="__last__">— most recently touched —</option>';
  try {
    const { projects } = await send({ type: "getProjects" });
    for (const p of projects ?? []) {
      const o = document.createElement("option");
      o.value = p.id;
      o.textContent = p.nextAction ? `${p.name} — ${p.nextAction}` : p.name;
      sel.appendChild(o);
    }
  } catch {
    $("warn").textContent = "brick service not reachable on :7373 — run `npm run serve`.";
  }
}

$("start").addEventListener("click", async () => {
  const task = $("task").value.trim();
  const project = $("project").value;
  const opts = {
    workMinutes: Number($("work").value) || 25,
    breakMinutes: Number($("break").value) || 5,
  };
  if (task) opts.task = task;
  else if (project === "__last__") opts.last = true;
  else opts.projectId = project;

  const res = await send({ type: "startSession", opts });
  if (res && res.error) {
    $("warn").textContent = res.error;
    return;
  }
  render();
});

$("stop").addEventListener("click", async () => {
  await send({ type: "stopSession" });
  render();
});

// Honesty lever (Epic 0.5): correct the verdict for the current tab under the active focus.
async function mark(decision) {
  let tab;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch {
    /* no tabs permission / no window */
  }
  if (!tab || !tab.url) {
    $("markStatus").textContent = "no active tab to mark";
    return;
  }
  const res = await send({ type: "markPage", tabId: tab.id, url: tab.url, decision });
  if (res && res.error) {
    $("markStatus").textContent = "failed: " + res.error;
    return;
  }
  $("markStatus").textContent = decision === "block" ? "marked off-task ✓" : "marked on-topic ✓";
  setTimeout(() => window.close(), 800);
}

$("offtask").addEventListener("click", () => mark("block"));
$("ontopic").addEventListener("click", () => mark("allow"));

render();
