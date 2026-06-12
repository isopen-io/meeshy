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
| Last completed iteration | 43 (i18n recherche web, Dynamic Type Bookmarks/PostTranslationSheet/LinksHub iOS, déflake tests iOS, onglets contacts Android) — PRs #576/#579/#587/#588 toutes mergées |
| Last merged PR | #588 (commit 7358047) |
| Last Merged Base (commit) | 7358047 (merge #588) |
| Current iteration | **44** — iOS exclusivement (directive routine) : Dynamic Type vues liens détail/create + surface composer, hex Recording/AudioPost |
| Current branch | `claude/keen-dirac-a53ki2` (synchronisée avec main 7358047) |
| Deferred carry-over for 45 | iOS : polices figées SettingsView (8), NewConversationView (7), DataExportView/DataStorageView (8), ChangePasswordView (2), ConversationView:495,551, ProfileView:65, TwoFactorSetupView textes ; PostDetailView `.textSelection(.enabled)` ; ThemedConversationRow hex vs accentColor ; VoiceProfileWizardView/PrivacySettingsView/TrackingLinksView Color(hex:) ; IncomingCallView .white contraste. Hors iOS (suspendu tant que directive iOS-only) : parité stories Android ; réactions par pièce jointe web+Android ; audit qualité es/pt web ; dates hors v2 web (~40) |

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
| 33 | feat/uiux-iter33 | #588 | ✅ |
| 33–39 | (inline admin-i18n passes, commit-message numbering) | #544, #545, … | ✅ |
| 40 | claude/friendly-brown-xuzpju | #575 | ✅ |
| 41 | claude/blissful-ritchie-9vesx9 | #577 | ✅ |
| 41b | claude/blissful-ritchie-68j2oq | #580 | ✅ |
| 42 | claude/blissful-ritchie-fst8wf | #582 | ✅ |
| 42b | claude/blissful-ritchie-e672ur | #579 | ✅ |
| 43 | claude/blissful-ritchie-6709o7 | #576 | ✅ |
| 43b | claude/awesome-albattani-xaqlhj | #587 | ✅ |
| 44 | claude/keen-dirac-a53ki2 | — | ⏳ |
