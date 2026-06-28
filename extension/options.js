// BRICK MODE settings — service status + editable tier lists.
const $ = (id) => document.getElementById(id);
const lines = (id) =>
  $(id)
    .value.split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

function load() {
  chrome.runtime.sendMessage({ type: "getConfig" }, (cfg) => {
    const status = $("status");
    if (!cfg || cfg.error) {
      status.innerHTML =
        '<span class="bad">✗ service unreachable on 127.0.0.1:7373 — run <code>npm run serve</code></span>';
      return;
    }
    const key = cfg.hasApiKey
      ? '<span class="ok">key set</span>'
      : '<span class="warn">no ANTHROPIC_API_KEY — Tier-2 adjudication is stubbed (allow)</span>';
    status.innerHTML = `<span class="ok">✓ connected</span> · model ${cfg.model} · ${key}`;
    $("tier1").value = ((cfg.tiers && cfg.tiers.tier1) || []).join("\n");
    $("tier3").value = ((cfg.tiers && cfg.tiers.tier3) || []).join("\n");
  });
}

$("save").addEventListener("click", () => {
  chrome.runtime.sendMessage(
    { type: "saveTiers", tier1: lines("tier1"), tier3: lines("tier3") },
    (res) => {
      if (!res || res.error) {
        $("saved").textContent = "save failed: " + ((res && res.error) || "unknown");
        return;
      }
      $("tier1").value = ((res.tiers && res.tiers.tier1) || []).join("\n");
      $("tier3").value = ((res.tiers && res.tiers.tier3) || []).join("\n");
      $("saved").textContent = "saved ✓";
      setTimeout(() => ($("saved").textContent = ""), 2000);
    },
  );
});

$("reset").addEventListener("click", () => {
  if (!confirm("Reset tier lists to built-in defaults? This removes any custom changes.")) return;
  chrome.runtime.sendMessage({ type: "resetTiers" }, (res) => {
    if (!res || res.error) {
      $("saved").textContent = "reset failed: " + ((res && res.error) || "unknown");
      return;
    }
    $("tier1").value = ((res.tiers && res.tiers.tier1) || []).join("\n");
    $("tier3").value = ((res.tiers && res.tiers.tier3) || []).join("\n");
    $("saved").textContent = "reset to defaults ✓";
    setTimeout(() => ($("saved").textContent = ""), 2500);
  });
});

load();
