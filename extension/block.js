// Fills the block page from query params + the active session focus.
const p = new URLSearchParams(location.search);
// Tier-1 redirects can't pass the full original URL through declarativeNetRequest, so they pass
// `domain` instead — fall back to that, then to "(unknown)" only if neither is present.
document.getElementById("url").textContent = p.get("url") || p.get("domain") || "(unknown)";
document.getElementById("reason").textContent = p.get("reason") || "off-task";

const stubEl = document.getElementById("stub");
if (p.get("reason") && p.get("reason").includes("stub")) {
  stubEl.textContent = "Note: adjudication is stubbed (no ANTHROPIC_API_KEY) — this was a tier rule, not the AI.";
}

chrome.runtime.sendMessage({ type: "getState" }, (st) => {
  const focus = st && st.session && st.session.focus;
  document.getElementById("focus").textContent = focus ? focus.task : "(no active session)";
});

document.getElementById("back").addEventListener("click", () => {
  if (history.length > 1) history.back();
  else window.close();
});
