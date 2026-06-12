# Branch Tracking — UI/UX Iterations

## Purpose
Trace the base branch for each new UI/UX iteration, to avoid divergence.

## Protocol
1. At the start of each iteration: create the working branch from the **Last Merged Base** below
2. Develop, commit, push on the working branch
3. Once CI passes: merge into main via PR
4. After merge: update this file with the new base
5. Delete the feature branch after merge

---

## Current State

| Field | Value |
|-------|-------|
| Last completed iteration | 41 (deux passes parallèles mergées : #577 + #580) — 42 en cours sur cette branche |
| Working branch (iteration 42) | `claude/blissful-ritchie-e672ur` (from main @ 167ef31c, resynced post-#580/#581) |
| Last Merged Base (commit) | 1a238dd1 (merge #581) — sera le merge commit de l'iter 42 une fois la PR posée |
| Next iteration | **43** |
| Next branch to create from | `main` (after iter-42 merge) |
| Deferred carry-over for 43 | balayage hex iOS hors des 6 surfaces de l'iter 42 + polices fixes vues liens ; parité stories Android + tokens MeeshySpacing SettingsScreen ; web dates 'fr-FR'/sans locale hors v2 (~40, admin/groups/contacts) + relecture qualité es/pt ; AudioEffectTile role=button web ; validation client ID conversation web ; réactions par pièce jointe web/Android (wiring gateway attachment:reaction-*) |

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
| 42 | claude/blissful-ritchie-e672ur | (this iteration) | ⏳ |
