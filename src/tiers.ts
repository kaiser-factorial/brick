export type Tier = "tier1" | "tier2" | "tier3";

export interface TierConfig {
  /** Always blocked during a session (host or host suffix). No adjudication. */
  tier1: string[];
  /** Always allowed — unambiguously work-critical. Never adjudicated. */
  tier3: string[];
  // Everything else is tier2 (conditional → adjudicated against the focus task).
}

export const DEFAULT_TIERS: TierConfig = {
  tier1: [
    "instagram.com",
    "tiktok.com",
    "netflix.com",
    "reddit.com",
    "discord.com",
    "twitch.tv",
    "facebook.com",
    "9gag.com",
    "tumblr.com",
    "pinterest.com",
    "threads.net",
  ],
  tier3: [
    "github.com",
    "stackoverflow.com",
    "developer.mozilla.org",
    "docs.anthropic.com",
    "localhost",
    "127.0.0.1",
  ],
  // NOTE: youtube/twitter/x are intentionally tier2 (adjudicated) — see SESSION_LOG DIVERGENCE 3.
};

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function matches(host: string, list: string[]): boolean {
  return list.some((d) => host === d || host.endsWith("." + d));
}

export function classify(url: string, cfg: TierConfig = DEFAULT_TIERS): Tier {
  const host = hostOf(url);
  if (!host) return "tier2";
  if (matches(host, cfg.tier1)) return "tier1";
  if (matches(host, cfg.tier3)) return "tier3";
  return "tier2";
}
