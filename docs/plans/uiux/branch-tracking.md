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
| Last completed iteration | **46i** (iOS only : éradication FINALE ancienne palette `08D9D6`/`FF2E63`/`4ECDC4` — épuration 3 îlots morts (MessageComposer.swift 218 l., SampleData.swift ~320 l., RootViewComponents:697-1113 ThemedFeedComposer/ThemedFeedCard/FeedActionButton + 10 wrappers Legacy, 8 entrées pbxproj) ; ~40 occurrences re-tokenisées sur 13 fichiers vivants (FeedView, FeedView+Attachments, RootViewComponents, WidgetPreviewView, AboutView, AttachmentPreparationService, ConversationAnimatedBackground, ConversationInfoSheet, MemberManagementSection, BlockedUsersView, UserStatsView, MediaDownloadSettingsView, MeeshyWidgets) ; FriendRequestListView 10 polices → Dynamic Type + formateur date `fr_FR` → locale courante (Prisme) + clé `common.unknown` ajoutée 5 locales) |
| Last merged PR | #605 (46w), #597 (45), #596 (45w), #595 (45i) ; iter-46i sur `claude/wizardly-rubin-wnm76f` |
| Last Merged Base (commit) | d10a80c5 (merge #605, iter-46w) — base de la branche iter-46i |
| Next iteration | **47w** / **47i** — repartir de `main` HEAD post-merge respectif |

### Deferred carry-over — web (pour 47w+)
- admin : `AgentConfigDialog` (~58 labels/tooltips FR) + tooltips InfoIcon `AgentLlmTab` (6) / `AgentGlobalConfigTab` (15) — à traiter en un lot sous `agent.config.*` (vérifié 46w : debug.tsx, AgentArchetypesTab, BackSoundDetails, UserPicker DÉJÀ corrigés — ne plus auditer)
- chart hex sans variante dark : `RankingStatsImpl` (10+ hex recharts), `MermaidDiagramImpl` (thème mermaid fixe `default`, 6 hex), `AgentOverviewTab` (2 hex pie) ; consolidation `notifications/preferences` page vs composant
- réactions par pièce jointe (wiring gateway, feature commune web+Android)
- audit qualité es/pt (relecture des traductions existantes)
- console.error en français (participants-drawer ×5, links-section ×3) — logs dev, non bloquant
- optimisations 45w toujours ouvertes : deep links `/v2/chats?id=` (parité iOS/Android), swipe-back mobile web, audit dark pages admin
- locale maps intentionnelles NON à migrer : share-affiliate-modal, AudioPostComposer (speech), use-voice-recording (SpeechRecognition lang) ; StoryViewer `select-none` text-objects = design (parité stories iOS)

### Deferred carry-over — iOS (pour 47i+, post-46i)
**Ancienne palette : SOLDÉE en 46i** (grep `08D9D6|FF2E63|4ECDC4` = zéro hors fixtures de tests et filtre artistique stories `cool` StoryViewerView+Content:180, intentionnel — ne plus flagger) ; ladder « arc-en-ciel » catégoriel (FF9F43/45B7D1/2ECC71/F8B500/9B59B6/E74C3C/F39C12/3498DB — toolbar feed, AboutView, UserStatsView, MediaDownloadSettingsView) : arbitrage charte global en UNE décision ; grandes surfaces polices : ConversationInfoSheet (52), ConversationDashboardView (43), TwoFactorSetupView (42, héros intentionnels), CallView (34), InviteFriendsSheet (33), ProfileView/GlobalSearchView (32), SettingsView (27), NewConversationView (16), DataExportView (16), DataStorageView (11) ; arbitrage `time.*` (FeedPostCard) vs `time.short.*` (ShortRelativeTime) — FriendRequestListView garde `friends.requests.time.*` (wording long) ; washes AudioPostComposer (décision design) ; VoiceProfileWizardView/TrackingLinksView Color(hex:) ; IncomingCallView .white contraste ; AvatarContextMenuItem → LocalizedStringKey (API SDK à évaluer) ; ThemedConversationRow theme-aware (leaf-view) ; BubbleStandardLayout:340 « Inconnu » brut dans chaîne a11y (clé `common.unknown` désormais disponible)

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
| 46i | claude/wizardly-rubin-wnm76f | #609 | ✅ |
