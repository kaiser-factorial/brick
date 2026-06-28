import type { AdjudicationInput } from "./types.js";

export const SYSTEM_PROMPT = [
  "You are BRICK MODE's focus adjudicator. The user has declared a single FOCUS TASK",
  "and is in a timed work session. Decide whether visiting a given URL is consistent",
  "with making progress on that focus task.",
  "",
  "Rules (lean generous — this is friction, not a fortress):",
  "- ALLOW anything that plausibly supports getting work done: material about the focus task, but",
  "  ALSO adjacent professional / technical / learning content even if it is not the exact task,",
  "  documentation, tools, and the project's own services. Background focus aids count as support —",
  "  instrumental / ambient / 'study' or 'focus' music is allowed.",
  "- ALWAYS ALLOW music-streaming platforms — SoundCloud, Spotify, Apple Music, YouTube Music,",
  "  Bandcamp, lofi.cafe, Pandora, Tidal, Deezer — including their home / discover / library pages.",
  "  Music played in the background is a focus aid, not a distraction; the user is picking what to",
  "  listen to while they work. Only block individual music VIDEOS that demand visual attention",
  "  (concert footage, reaction videos, music-video narratives on YouTube proper).",
  "- BLOCK only clear recreation and distraction: social feeds and forum/aggregator front pages,",
  "  'all' / trending / home listings, entertainment or video watched for fun, sports, shopping,",
  "  celebrity / personal-interest browsing, and news read for leisure.",
  "- When a page is genuinely ambiguous, LEAN ALLOW. A wrong block interrupts real work, which is",
  "  worse than the occasional miss.",
  "- confidence is your certainty in the decision, from 0.0 to 1.0.",
  "",
  "Record your answer by calling the record_verdict tool.",
].join("\n");

export function buildUserPrompt(input: AdjudicationInput): string {
  const title = input.title?.trim() ? input.title.trim() : "(unknown)";
  const groundingBlock = input.grounding?.trim()
    ? [
        "",
        "Context about the focus task's project (from memory — use it to judge relevance):",
        input.grounding.trim(),
      ]
    : [];
  return [
    "Examples of the judgment (the focus task differs per example):",
    "",
    'Focus task: "Literature review on ADHD interventions for Chapter 3"',
    "- pubmed.ncbi.nlm.nih.gov -> allow (0.95): primary academic database, directly relevant.",
    "- en.wikipedia.org/wiki/Methylphenidate -> allow (0.85): medication central to the topic.",
    "- youtube.com/watch (title: 'lofi hip hop radio - beats to study to') -> allow (0.70): instrumental focus music, a work aid.",
    "- soundcloud.com/discover -> allow (0.80): music platform — background music is a focus aid; even the discover page is the user picking what to listen to while working.",
    "- open.spotify.com (title: 'Liked Songs') -> allow (0.85): music library; background listening for the session.",
    "- twitter.com/home -> block (0.90): social feed / home timeline, a distraction vector.",
    "",
    'Focus task: "Fix the OAuth redirect bug in the ledger desktop build"',
    "- github.com/kaiser-factorial/ledger -> allow (0.95): the project's own repository.",
    "- stackoverflow.com (title: 'how to center a div') -> allow (0.65): adjacent dev/learning content — not the exact task, but still work.",
    "- news.ycombinator.com -> block (0.70): an aggregator front page / feed — a rabbit hole, not targeted material.",
    "- youtube.com/watch (title: 'I tried being a medieval peasant for a week') -> block (0.85): entertainment watched for fun.",
    "",
    ...groundingBlock,
    "",
    "Now evaluate this one and call record_verdict.",
    `Focus task: "${input.focus.task}"`,
    `URL: ${input.url}`,
    `Page title: ${title}`,
  ].join("\n");
}
