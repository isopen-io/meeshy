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
| Last completed iteration | **46i** (iOS only : épuration MessageComposer.swift + SampleData.swift + ThemedFeedCard/FeedActionButton/10 wrappers Legacy supprimés (pbxproj nettoyé) ; ancienne palette `4ECDC4`/`FF2E63`/`08D9D6` du target app à ZÉRO (RootViewComponents, FeedView, FeedView+Attachments, WidgetPreviewView, AboutView, ConversationAnimatedBackground, divers ×1, MeeshyWidgets samples) ; défauts AttachmentPreparationService → `AttachmentKind.hexTintColor` ; token SDK `warningDeep` ; FriendRequestListView 10 polices sémantiques + `relativeTime` fr_FR → `ShortRelativeTime` ; clé `common.unknown` cataloguée 5 locales ; 6 a11y labels toolbar sheet composer ; `widget.preview.action.*` 4 clés) — précédée de **46w** (#605, web-only) |
| Last merged PR | #605 (46w), #608 (notification details iOS) ; iter-46i sur `claude/wizardly-rubin-v9thim` (PR #612 ⏳) |
| Last Merged Base (commit) | 61d0122 (merge #608) — base de la branche iter-46i |
| Next iteration | **47i** — repartir de `main` HEAD post-merge #612 |

### Deferred carry-over — web (pour 47w+)
- admin : `AgentConfigDialog` (~58 labels/tooltips FR) + tooltips InfoIcon `AgentLlmTab` (6) / `AgentGlobalConfigTab` (15) — à traiter en un lot sous `agent.config.*` (vérifié 46w : debug.tsx, AgentArchetypesTab, BackSoundDetails, UserPicker DÉJÀ corrigés — ne plus auditer)
- chart hex sans variante dark : `RankingStatsImpl` (10+ hex recharts), `MermaidDiagramImpl` (thème mermaid fixe `default`, 6 hex), `AgentOverviewTab` (2 hex pie) ; consolidation `notifications/preferences` page vs composant
- réactions par pièce jointe (wiring gateway, feature commune web+Android)
- audit qualité es/pt (relecture des traductions existantes)
- console.error en français (participants-drawer ×5, links-section ×3) — logs dev, non bloquant
- optimisations 45w toujours ouvertes : deep links `/v2/chats?id=` (parité iOS/Android), swipe-back mobile web, audit dark pages admin
- locale maps intentionnelles NON à migrer : share-affiliate-modal, AudioPostComposer (speech), use-voice-recording (SpeechRecognition lang) ; StoryViewer `select-none` text-objects = design (parité stories iOS)

### Deferred carry-over — iOS (pour 47i+, post-46i)
PURGÉ en 46i : SampleData ✓ supprimé, FriendRequestListView polices ✓, PostDetailView ✓ re-vérifié conforme (textSelection présent, 0 hex hors charte — retiré), reliquats ancienne palette app ✓ tous traités, StoryViewerView+Content ✓ reclassé conforme (wash filtre photo « cool », intentionnel).
Restent :
- ladders catégorielles à arbitrer charte EN UN LOT : pièces jointes (`AttachmentKind.hexTintColor` = désormais le seul point à changer), sections AboutView (9B59B6/F8B500), cartes UserStatsView (5 hex), `attachmentOptions` ThemedFeedComposer, policyPickers MediaDownloadSettingsView (F39C12/E74C3C), quick action « Post » WidgetPreviewView (A855F7)
- arbitrage `time.*` (FeedPostCard) vs `time.short.*` (ShortRelativeTime)
- grandes surfaces polices : ConversationInfoSheet (52), ConversationDashboardView (43), TwoFactorSetupView (42, héros intentionnels), CallView (34), InviteFriendsSheet (33), ProfileView/GlobalSearchView (32), SettingsView (27), NewConversationView (16), DataExportView (16), DataStorageView (11)
- reliquats ancienne palette SDK MeeshyUI (passe dédiée, fort volume) : Auth (AuthTextField, LanguageSelector, MeeshyForgotPasswordView), Community (CreateView/ListView/DetailView/SettingsView), Primitives (FloatingButtons, LanguagePickerSheet, EmojiReactionPicker, ChatBubble, UserIdentityBar, StatsCard, AchievementBadge, EmptyStateView), viewers Media défauts `08D9D6`, NotificationListView
- washes AudioPostComposer (décision design, conforme) ; VoiceProfileWizardView/TrackingLinksView Color(hex:) ; IncomingCallView .white contraste ; AvatarContextMenuItem → LocalizedStringKey (API SDK à évaluer) ; ThemedConversationRow theme-aware (leaf-view)

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
| 46i | claude/wizardly-rubin-v9thim | #612 | ⏳ |
