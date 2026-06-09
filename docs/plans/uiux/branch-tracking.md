# Branch Tracking — UI/UX Iterations

## Purpose
Trace the base branch for each new UI/UX iteration, to avoid divergence.

## Protocol
1. At the start of each iteration: create `feat/uiux-iter{N}` from the **Last Merged Base** below
2. Develop, commit, push on `feat/uiux-iter{N}`
3. Once CI passes: merge `feat/uiux-iter{N}` into main via PR
4. After merge: update this file with the new base
5. Delete the feature branch after merge

---

## Current State

| Field | Value |
|-------|-------|
| Last completed iteration | 15 |
| Last merged PR | #419 (feat(uiux/iter15): color tokens, i18n defaults, Dynamic Type, PostCard i18n) |
| Last Merged Base (commit) | a525a898 |
| Next iteration | **16** |
| Next branch to create from | `main` (HEAD = a525a898) |

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
