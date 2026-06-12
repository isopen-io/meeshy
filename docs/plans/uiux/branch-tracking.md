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
| Last completed iteration | **47w** (web only : lot i18n admin agent — `AgentConfigDialog` 122 strings → `agentConfig.*` (labels + tooltips `*Help` + hints + placeholders + options + footer via `tCommon`), `AgentLlmTab` 6 tooltips → `llm.*Help`, `AgentGlobalConfigTab` 15 tooltips + placeholder → `globalConfig.*` ; +143 clés ×4 locales, parité vérifiée par script ; hygiène docs : 46w marquée mergée #605, faux positifs footer 1/3/5/7/8/33 documentés) |
| Last merged PR | #605 (46w), #608 (iOS notification details) ; iter-47w sur `claude/elegant-noether-0bs5fe` |
| Last Merged Base (commit) | 61d0122 (merge #608, contient #605) — base de la branche iter-47w |
| Next iteration | **48w** — repartir de `main` HEAD post-merge iter-47w |

### Deferred carry-over — web (pour 48w+)
- lot agent.config SOLDÉ en 47w (AgentConfigDialog/AgentLlmTab/AgentGlobalConfigTab — ne plus auditer ; clés dans les arbres existants `agentConfig.*`/`llm.*`/`globalConfig.*`, pas de nouvel arbre `agent.config.*`)
- chart hex sans variante dark : `RankingStatsImpl` (10+ hex recharts), `MermaidDiagramImpl` (thème mermaid fixe `default`, 6 hex), `AgentOverviewTab` (2 hex pie) ; consolidation `notifications/preferences` page vs composant
- réactions par pièce jointe (wiring gateway, feature commune web+Android)
- audit qualité es/pt (relecture des traductions existantes)
- console.error en français (participants-drawer ×5, links-section ×3) — logs dev, non bloquant
- optimisations 45w toujours ouvertes : deep links `/v2/chats?id=` (parité iOS/Android), swipe-back mobile web, audit dark pages admin
- locale maps intentionnelles NON à migrer : share-affiliate-modal, AudioPostComposer (speech), use-voice-recording (SpeechRecognition lang) ; StoryViewer `select-none` text-objects = design (parité stories iOS)

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
| 45 | claude/blissful-ritchie-dp7ibu | #597 | ✅ |
| 46w | claude/elegant-noether-09t4x2 | #605 | ✅ |
| 47w | claude/elegant-noether-0bs5fe | ⏳ | ⏳ |
