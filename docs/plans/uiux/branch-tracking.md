# Branch Tracking — UI/UX Iterations

## Purpose
Trace the base branch for each new UI/UX iteration, to avoid divergence.

## Protocol
1. At the start of each iteration: sync the working branch with `main` (merge origin/main)
2. Develop, commit, push on the iteration branch
3. Once CI passes: merge into main via PR
4. After merge: update this file with the new base
5. Delete the feature branch after merge

---

## Current State

| Field | Value |
|-------|-------|
| Last completed iteration | 33 (web search i18n + iOS Dynamic Type + Android i18n) |
| Last merged PR | pending — iteration 33 PR from claude/blissful-ritchie-6709o7 |
| Last Merged Base (commit) | 7ab236f (merge PR #574) |
| Next iteration | **34** — candidates in `2026-06-12-plan-iteration-33.md` § Continuity |
| Next branch to create from | `main` after iteration-33 PR merges |

---

## History

| Iteration | Branch | PR | Merged |
|-----------|--------|----|--------|
| 1 | feat/uiux-iter1 | (early) | ✅ |
| 2–12 | feat/uiux-iter{N} | various | ✅ |
| 13 | feat/uiux-iter13 | #407 | ✅ |
| 14 | feat/uiux-iter14 | #410 | ✅ |
| 14b | claude/dazzling-hawking-* | #412, #416 | ✅ |
| 15 | feat/uiux-iter15 | #419 | ✅ |
| 16 | (inline in main) | — | ✅ |
| 17 | (inline in main) | — | ✅ |
| 18 | feat/uiux-iter18 | — | ✅ |
| 19 | feat/uiux-iter19 | — | ✅ |
| 20 | feat/uiux-iter20 | — | ✅ |
| 21 | feat/uiux-iter21 | — | ✅ |
| 22 | feat/uiux-iter22 | — | ✅ |
| 23 | feat/uiux-iter23 | — | ✅ |
| 24 | (inline/iter-24) | — | ✅ |
| 25 | (inline/iter-25) | — | ✅ |
| 26 | (inline/iter-26) | — | ✅ |
| 27 | (inline/iter-27) | — | ✅ |
| 28 | (inline/iter-28) | — | ✅ |
| 29 | (inline/iter-29) | — | ✅ |
| 30 | claude/dazzling-hawking-b4tdnk | #507 | ✅ |
| 31 | claude/iter31-type-safety | #509 | ✅ |
| 32 | (uiux iter-32) | merged | ✅ |
| 33 | claude/blissful-ritchie-6709o7 | (this PR) | ⏳ |
