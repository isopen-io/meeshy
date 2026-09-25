## 2026-07-22 — Swarm collision: verify target is still unfixed on fresh main right before committing (iOS UI/UX routine)

**Context:** Iteration 212i (CallView audio-call duration VoiceOver label+value) was
opened as PR #2261 and **closed without merging — superseded by `main`**. A concurrent
swarm agent landed the identical fix (a superset: both audio capsules +
`compactAudioCallHeader` + tests, keeping `.combine`) directly to `main` between my
resync and my commit. My open-PR collision check didn't catch it because the other
work merged in the race window.

**Lessons:**
1. In a dense swarm, even a freshly-resynced target can be taken by a concurrent merge.
   **Re-verify the specific defect is still present on the latest `main` immediately
   before committing** (re-grep the exact lines), not just at target-selection time.
2. When several consecutive iterations (210i/211i/212i were all mine) cluster in one
   area (numeric-readout a11y: reaction counts → recording chrono → call duration),
   **other agents are likely swarming the same theme** — PIVOT to a distinct, quieter
   surface to reduce collision probability.
3. The superseding fix kept `.combine` (not my `.ignore`) so the caption-mode header —
   which has no `statusPill` row — still merges the signal glyph's label. When a
   duration/status element has NO sibling that voices degradation, `.combine` (glyph
   merges) is safer than `.ignore` (glyph swallowed). Match the collapse mode to
   whether degradation is voiced elsewhere.
