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
| Last completed iteration | **45** (PR #597 : web i18n participants-drawer 6 clés ×4 locales, `timeCompact.*` aligné iOS dans transform-conversation, `getLastSeenFormatted` localisé via `contacts.status.*`, suppression code mort notification-helpers, locale sur 2 dates ; iOS : régression FR timeAgo FeedCommentsSheet → `ShortRelativeTime`, ChangePasswordView tokens 6366F1/9B59B6 + 13 polices sémantiques ; Android : dédoublonnage `chat_date_*` es/pt) — co-mergée avec **45w** (#596, web-only) et **45i** (#595, iOS-only) |
| Last merged PR | #595 (45i), #596 (45w), #598 (admin dashboard push) ; iter-45 (#597) en cours sur `claude/blissful-ritchie-dp7ibu` |
| Last Merged Base (commit) | d33b41f2 (merge #595) — réintégré dans la branche iter-45 |
| Note de réconciliation 45×45w | 45w a remplacé `'fr-FR'` par `getCurrentInterfaceLocale()` dans transform-conversation/users.service/notification-helpers en gardant les libellés FR en dur ; iter-45 i18n-ise complètement ces trois sites (clés `timeCompact.*`/`contacts.status.*` + suppression code mort) — la version iter-45 supersède, imports `getCurrentInterfaceLocale` orphelins retirés. 45i (refonte ConversationListHelpers) ne touche pas `ShortRelativeTime` ni les fichiers iter-45 — merge propre vérifié |
| Next iteration | **46** — repartir de `main` HEAD post-merge #597 |

### Deferred carry-over — web (pour 46+)
- admin : `debug.tsx` (~15 strings), `AgentArchetypesTab`, `AgentConfigDialog`, `UserPicker`, tooltips InfoIcon `LlmTab`/`GlobalConfigTab`
- chart hex sans variante dark (`RankingStatsImpl`, `MermaidDiagramImpl`, `AgentOverviewTab`) ; `BackSoundDetails` (4 strings FR) ; consolidation `notifications/preferences` page vs composant
- réactions par pièce jointe (wiring gateway, feature commune web+Android)
- audit qualité es/pt (relecture des traductions existantes)
- console.error en français (participants-drawer ×5, links-section ×3) — logs dev, non bloquant
- locale maps intentionnelles NON à migrer : share-affiliate-modal, AudioPostComposer (speech), use-voice-recording (SpeechRecognition lang)

### Deferred carry-over — iOS (pour 46+, post-45i/45)
SampleData.swift suppression fichier mort (pbxproj + build local) ; FriendRequestListView 11 polices ; PostDetailView (.textSelection + 21 hex — re-vérifié OK iter-45, retirer si confirmé) ; arbitrage `time.*` (FeedPostCard) vs `time.short.*` (ShortRelativeTime) — timeAgo FeedCommentsSheet réglé en 45, ChangePasswordView réglé en 45 ; ConversationInfoSheet (52 polices), ConversationDashboardView (43), TwoFactorSetupView (42, héros intentionnels), CallView (34), InviteFriendsSheet (33), ProfileView/GlobalSearchView (32), SettingsView (27), NewConversationView (16), DataExportView (16), DataStorageView (11) ; reliquats ancienne palette : RootViewComponents (11), FeedView (8), FeedView+Attachments (10), WidgetPreviewView (7), AboutView (5), MessageComposer (4), AttachmentPreparationService (3), ConversationAnimatedBackground (2), divers ×1 (ConversationInfoSheet, MemberManagementSection, BlockedUsersView, UserStatsView, StoryViewerView+Content, MediaDownloadSettingsView) ; washes AudioPostComposer (décision design) ; ladder pièces jointes arc-en-ciel (à arbitrer charte) ; VoiceProfileWizardView/TrackingLinksView Color(hex:) ; IncomingCallView .white contraste ; AvatarContextMenuItem → LocalizedStringKey (API SDK à évaluer) ; ThemedConversationRow theme-aware (leaf-view)

### Deferred carry-over — Android (pour 46+)
parité stories (UI absente, large) OU réactions par pièce jointe (avec web) ; exceptions documentées : SettingsScreen 14.dp, emoji 22.sp (acceptées, ne pas re-flagger)

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
| 44 | claude/keen-dirac-485vpk | #591 | ✅ |
| 44 | claude/blissful-ritchie-foe2wg | #589 | ✅ |
| 44 | claude/blissful-ritchie-jls4lb | #592 | ✅ |
| 44 | claude/blissful-ritchie-kay6v7 | #594 | ✅ |
| 44b | claude/keen-dirac-a53ki2 | #590 | ✅ |
| 45w | claude/elegant-noether-1pen57 | #596 | ✅ |
| 45i | claude/wizardly-rubin-ux84an | #595 | ✅ |
| 45 | claude/blissful-ritchie-dp7ibu | #597 | ⏳ |
