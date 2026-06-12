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
| Last completed iteration | **45** (cette PR : web i18n participants-drawer 6 clés ×4 locales, `timeCompact.*` aligné iOS dans transform-conversation, `getLastSeenFormatted` localisé via `contacts.status.*`, suppression code mort notification-helpers, locale sur 2 dates ; iOS : régression FR timeAgo FeedCommentsSheet → `ShortRelativeTime`, ChangePasswordView tokens 6366F1/9B59B6 + 13 polices sémantiques ; Android : dédoublonnage `chat_date_*` es/pt) + **45w** mergée (#596, web-only : migration 37 fichiers `'fr-FR'` → locale interface, avatar toasts i18n, SwipeableRow a11y) |
| Last merged PR | #596 (45w), #598 (admin dashboard push) ; iter-45 en cours sur `claude/blissful-ritchie-dp7ibu` |
| Last Merged Base (commit) | 883b284d (merge #598) — réintégré dans la branche iter-45 |
| Note de réconciliation 45×45w | 45w a remplacé `'fr-FR'` par `getCurrentInterfaceLocale()` dans transform-conversation/users.service/notification-helpers en gardant les libellés FR en dur ; iter-45 i18n-ise complètement ces trois sites (clés `timeCompact.*`/`contacts.status.*` + suppression code mort) — la version iter-45 supersède, imports `getCurrentInterfaceLocale` orphelins retirés |
| Next iteration | **46** |
| Next branch to create from | `main` (HEAD post-merge iter-45) |
| Deferred carry-over for 46 | Voir « Différés » de `docs/analyses/uiux/2026-06-12-iteration-45.md` — web : batch admin i18n (debug.tsx, AgentArchetypesTab, AgentConfigDialog, UserPicker, tooltips InfoIcon LlmTab/GlobalConfigTab), chart hex dark, BackSoundDetails, consolidation notifications/preferences, audit qualité es/pt ; locale maps intentionnelles NON à migrer : share-affiliate-modal, AudioPostComposer (speech), use-voice-recording (SpeechRecognition lang) ; iOS : grandes surfaces polices (ConversationInfoSheet 52, ConversationDashboardView 43, TwoFactorSetupView 42, CallView 34, InviteFriendsSheet 33, ProfileView/GlobalSearchView 32, SettingsView 27, VoiceProfileManageView 29, FeedView 29, NewConversationView 16, DataExportView 16, DataStorageView 11), ancienne palette 08D9D6/FF2E63/4ECDC4 (~10 fichiers), washes AudioPostComposer, ladder arc-en-ciel attachments, ThemedConversationRow theme-aware, arbitrage `time.*` vs `time.short.*` ; Android : parité stories (large) OU réactions par pièce jointe (wiring gateway, commune web+Android) |

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
| 44 | claude/keen-dirac-485vpk | #589, #591 | ✅ |
| 44 | claude/blissful-ritchie-foe2wg | #589 | ✅ |
| 44 | claude/blissful-ritchie-jls4lb | #592 | ✅ |
| 44 | claude/blissful-ritchie-kay6v7 | #594 | ✅ |
| 44b | claude/keen-dirac-a53ki2 | #590 | ✅ |
| 45w | claude/elegant-noether-1pen57 | #596 | ✅ |
| 45 | claude/blissful-ritchie-dp7ibu | #597 | ⏳ |
