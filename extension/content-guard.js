// Tier-2 focus enforcement on every http(s) page.
//   - Navigation check at document_start, then a DEEPER re-check once the page describes itself.
//   - On "off-task", show a SOFT overlay (modal → optional 1-min grace with a red reminder → re-prompt)
//     instead of a hard redirect, so you're nudged without losing what you were mid-typing.
//   - Also listens for background "brick:catch" messages (when work re-engages on an already-open tab).
// Tier-1 (always-blocked) still hard-redirects to the block page. Fails open everywhere.
(() => {
  if (!location.protocol.startsWith("http")) return;

  const RUNTIME_PREFIX = chrome.runtime.getURL("");
  const escapeHtml = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );

  const pageSignal = () => {
    const desc = document.querySelector('meta[name="description"]')?.content || "";
    const h1 = document.querySelector("h1")?.textContent?.trim() || "";
    return [document.title, desc, h1].filter(Boolean).join(" — ").slice(0, 400);
  };

  // ---------- soft overlay ----------
  const CSS = `
  #brick-overlay-root{all:initial}
  #brick-overlay-root .bo{position:fixed;inset:0;z-index:2147483647;pointer-events:none;
    font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
  #brick-overlay-root .bo-back{position:fixed;inset:0;background:rgba(8,6,2,.55);
    -webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);pointer-events:auto}
  #brick-overlay-root .bo-modal{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);
    width:min(420px,92vw);box-sizing:border-box;background:#14110a;color:#fbd962;border:2px solid #c0392b;
    border-radius:12px;padding:26px;text-align:center;box-shadow:0 24px 70px rgba(0,0,0,.55);pointer-events:auto}
  #brick-overlay-root .bo-tag{letter-spacing:.3em;color:#c0392b;font-weight:700;font-size:11px}
  #brick-overlay-root .bo-h{font-size:1.35rem;margin:12px 0 6px;color:#fbd962}
  #brick-overlay-root .bo-reason{color:#cda94e;font-size:.85rem;margin:0 0 20px;line-height:1.4}
  #brick-overlay-root .bo-actions{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
  #brick-overlay-root .bo-actions button{font:inherit;padding:9px 14px;border-radius:7px;cursor:pointer;border:1px solid;
    transition:background .2s ease, color .2s ease, border-color .2s ease}
  /* "Just 1 more minute" — secondary, deliberately unenticing at rest, clear hover shift. */
  #brick-overlay-root .bo-stay{background:transparent;color:#777;border-color:#3a3a3a}
  #brick-overlay-root .bo-stay:hover{background:#3a3a3a;color:#cccccc;border-color:#5a5a5a}
  #brick-overlay-root .bo-go{background:#c0392b;color:#fff;border-color:#c0392b}
  #brick-overlay-root .bo-go:hover{filter:brightness(1.12)}
  @keyframes bo-wash{
    0%,100%{background:rgba(192,57,43,.22)}
    50%{background:rgba(192,57,43,.34)}
  }
  /* Full-screen soft red wash with a subtle inset glow + slow breathing — hard to ignore. */
  #brick-overlay-root .bo-vignette{position:fixed;inset:0;pointer-events:none;
    background:rgba(192,57,43,.22);box-shadow:inset 0 0 0 4px rgba(192,57,43,.85), inset 0 0 160px rgba(192,57,43,.5);
    animation:bo-wash 2.4s ease-in-out infinite}
  #brick-overlay-root .bo-chip{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);pointer-events:auto;
    background:#14110a;color:#fbd962;border:1px solid #c0392b;border-radius:999px;padding:7px 14px;font-size:12px;
    box-shadow:0 6px 20px rgba(0,0,0,.4)}`;

  let tick = null;

  const stopTick = () => {
    if (tick) clearInterval(tick);
    tick = null;
  };

  const removeOverlay = () => {
    stopTick();
    document.getElementById("brick-overlay-root")?.remove();
  };

  const surface = () => {
    let root = document.getElementById("brick-overlay-root");
    if (!root) {
      root = document.createElement("div");
      root.id = "brick-overlay-root";
      root.innerHTML = `<style>${CSS}</style><div class="bo"></div>`;
      (document.body || document.documentElement).appendChild(root);
    }
    return root.querySelector(".bo");
  };

  const showModal = (reason) => {
    stopTick();
    const bo = surface();
    bo.innerHTML =
      '<div class="bo-back"></div><div class="bo-modal" role="dialog" aria-modal="true">' +
      '<div class="bo-tag">■ BRICK MODE</div>' +
      '<div class="bo-h">Back to BRICK MODE 🧱</div>' +
      `<p class="bo-reason">${escapeHtml(reason || "This page is off-task for your focus right now.")}</p>` +
      '<div class="bo-actions">' +
      '<button class="bo-stay">Just 1 more minute</button>' +
      '<button class="bo-go">Back to work →</button>' +
      "</div></div>";
    bo.querySelector(".bo-stay").addEventListener("click", startGrace);
    bo.querySelector(".bo-go").addEventListener("click", goBack);
  };

  const startGrace = () => {
    let left = 60;
    const bo = surface();
    const render = () => {
      const s = String(left % 60).padStart(2, "0");
      bo.innerHTML =
        '<div class="bo-vignette"></div>' +
        `<div class="bo-chip">🧱 off task — back to work in ${Math.floor(left / 60)}:${s}</div>`;
    };
    render();
    stopTick();
    tick = setInterval(() => {
      left -= 1;
      if (left <= 0) {
        stopTick();
        recheck();
      } else {
        render();
      }
    }, 1000);
  };

  const recheck = async () => {
    try {
      const res = await chrome.runtime.sendMessage({
        type: "guard",
        url: location.href,
        title: pageSignal(),
      });
      if (res && res.allow === false) showModal(res.reason);
      else removeOverlay(); // on-task now, or break started (guard allows outside work) → clear
    } catch {
      removeOverlay();
    }
  };

  const goBack = () => {
    removeOverlay();
    if (history.length > 1) history.back();
    else location.replace("about:blank");
  };

  // Background tells us a work phase re-engaged on this already-open tab.
  // brick:phase keeps the overlay synced with the Pomodoro: when the phase flips away from "work"
  // (break / session ended) any active grace-minute countdown is cleared, so the overlay doesn't
  // keep nagging during a break or after the session is over.
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "brick:catch") showModal(msg.reason);
    else if (msg?.type === "brick:phase" && msg.phase !== "work") removeOverlay();
  });

  // ---------- navigation check ----------
  // Navigating to an off-task page DURING work is a HARD block — no grace. The soft "1 more minute"
  // overlay (showModal) is only triggered by the background brick:catch message, which is sent solely
  // on the break→work transition (you were already on the page when the mode flipped under you).
  const hardBlock = (res) => {
    const p = new URLSearchParams({
      url: location.href,
      reason: res.reason ?? "off-task",
      tier: res.tier ?? "tier2",
      decision: "block",
    });
    try {
      window.stop();
    } catch {
      /* ignore */
    }
    location.replace(chrome.runtime.getURL("block.html") + "?" + p.toString());
  };

  (async () => {
    let phase1;
    try {
      phase1 = await chrome.runtime.sendMessage({ type: "guard", url: location.href });
    } catch {
      return; // background unreachable — fail open
    }
    if (phase1 && phase1.allow === false) {
      hardBlock(phase1);
      return;
    }
    if (!phase1 || phase1.tier !== "tier2" || phase1.stub) return; // only deepen real Tier-2 allows

    const deeper = async () => {
      const title = pageSignal();
      if (!title) return;
      try {
        const res = await chrome.runtime.sendMessage({ type: "guard", url: location.href, title });
        if (res && res.allow === false) hardBlock(res);
      } catch {
        /* fail open */
      }
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", deeper, { once: true });
    } else {
      deeper();
    }
  })();
})();
