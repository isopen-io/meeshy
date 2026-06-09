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
| Last completed iteration | 32 (admin i18n 180+ strings, iOS textSelection + Dynamic Type) |
| Last merged PR | #539 (feat(uiux/iter-32): admin i18n 180+ strings, iOS textSelection + Dynamic Type) |
| Last Merged Base (commit) | 1875e18a |
| Next iteration | **33** (web: admin user-detail sections i18n, AgentLlmTab i18n, dark mode inputs; iOS: Dynamic Type SecurityVerificationView, BubbleReactionsOverlay a11y) |
| Next branch to create from | `main` (HEAD = 1875e18a) |

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
| 32 | feat/uiux-iter32 | #539 | ✅ |
