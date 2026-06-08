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
| Last completed iteration | 14 |
| Last merged PR | #416 (feat(uiux): recover viewers i18n + iOS tokens) |
| Last Merged Base (commit) | 87d4e676 |
| Next iteration | **15** |
| Next branch to create from | `main` (HEAD = 87d4e676) |

---

## History

| Iteration | Branch | PR | Merged |
|-----------|--------|----|--------|
| 1 | feat/uiux-iter1 | (early) | ✅ |
| 2–12 | feat/uiux-iter{N} | various | ✅ |
| 13 | feat/uiux-iter13 | #407 | ✅ |
| 14 | feat/uiux-iter14 | #410 | ✅ |
| 14b | claude/dazzling-hawking-* | #412, #416 | ✅ |
