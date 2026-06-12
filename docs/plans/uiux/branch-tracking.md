# Branch Tracking — UI/UX Iterations

## Purpose
Trace the base branch for each new UI/UX iteration, to avoid divergence.

## Protocol
1. At the start of each iteration: create the working branch from the **Last Merged Base** below (or sync the assigned branch with `main`)
2. Develop, commit, push on the working branch
3. Once CI passes: merge into main via PR
4. After merge: update this file with the new base
5. Delete the feature branch after merge

---

## Current State

| Field | Value |
|-------|-------|
| Last completed iteration | 43 (web search i18n + iOS Dynamic Type Bookmarks/PostTranslation/LinksHub + déflake tests grouping/loadMore/VideoSurvival iOS) |
| Last merged PR | pending — iteration 43 PR #576 from claude/blissful-ritchie-6709o7 |
| Last Merged Base (commit) | ddcc428 (merge #582, itération 42) |
| Next iteration | **44** |
| Next branch to create from | `main` after PR #576 merges |
| Carry-over traités en 42 (#582) | hex iOS hors surface liens ; polices fixes vues liens iOS ; AudioEffectTile role=button web ; validation client ID conversation web |
| Deferred carry-over for 44 | parité stories Android ; réactions par pièce jointe web+Android (wiring gateway attachment:reaction-*) ; audit qualité es/pt ; iOS SettingsView/NewConversationView fonts + PostDetailView textSelection ; web admin debug + AgentArchetypesTab i18n ; Android es/pt strings.xml |

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
| 16–17 | (inline in main) | — | ✅ |
| 18–23 | feat/uiux-iter{N} | — | ✅ |
| 24 | claude/wizardly-hamilton-fpmwqf | #543 | ✅ |
| 25–29 | (inline iter-25…29) | — | ✅ |
| 30 | claude/dazzling-hawking-b4tdnk | #507 | ✅ |
| 31 | claude/iter31-type-safety | #509 | ✅ |
| 32 | feat/uiux-iter32 | #539 | ✅ |
| 33–39 | (inline admin-i18n passes, commit-message numbering) | #544, #545, … | ✅ |
| 40 | claude/friendly-brown-xuzpju | #575 | ✅ |
| 41 | claude/blissful-ritchie-9vesx9 | #577 | ✅ |
| 41b | claude/blissful-ritchie-68j2oq | #580 | ✅ |
| 42 | claude/blissful-ritchie-fst8wf | #582 | ✅ |
| 43 | claude/blissful-ritchie-6709o7 | #576 | ⏳ |
