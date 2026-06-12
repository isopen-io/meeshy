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
| Last completed iteration | **47w** (web only : migration i18n admin agent COMPLÈTE — `AgentConfigDialog` ~122 strings FR dures → `agentConfig.*` (sections Comportement/Triggers/Seuils/Planificateur/Instructions/Recherche Web/Sujets neufs/Génération/Quality Gate/Scheduling/Timeline/Rôles + footer `tCommon('cancel')`/`save` + `createButton` + compteurs paramétrés `{percent}`/`{factor}`/`{count}`/topics) ; `AgentLlmTab` 6 tooltips → `llm.*Help` ; `AgentGlobalConfigTab` 15 tooltips + placeholder → `globalConfig.*Help` ; +145 clés × 4 locales fr/en/es/pt, parité vérifiée par script) |
| Last merged PR | #605 (46w), #604 (routine fraîcheur), #597 (45) ; iter-47w sur `claude/blissful-ritchie-8d57jg` |
| Last Merged Base (commit) | d10a80c5 (merge #605) — base de la branche iter-47w (+ merge #608 avant push) |
| Next iteration | **48** — repartir de `main` HEAD post-merge iter-47w |

### Deferred carry-over — web (pour 48+)
- ~~admin AgentConfigDialog/AgentLlmTab/AgentGlobalConfigTab i18n~~ → **SOLDÉ en 47w** (arbres `agentConfig.*`/`llm.*Help`/`globalConfig.*Help` étendus — ne plus auditer ces 3 fichiers)
- chart hex sans variante dark : `RankingStatsImpl` (10+ hex recharts), `MermaidDiagramImpl` (thème mermaid fixe `default`, 6 hex), `AgentOverviewTab` (2 hex pie) ; consolidation `notifications/preferences` page vs composant
- réactions par pièce jointe (wiring gateway, feature commune web+Android)
- audit qualité es/pt (relecture des traductions existantes)
- console.error en français (participants-drawer ×5, links-section ×3) — logs dev, non bloquant
- optimisations 45w toujours ouvertes : deep links `/v2/chats?id=` (parité iOS/Android), swipe-back mobile web, audit dark pages admin
- locale maps intentionnelles NON à migrer : share-affiliate-modal, AudioPostComposer (speech), use-voice-recording (SpeechRecognition lang) ; StoryViewer `select-none` text-objects = design (parité stories iOS)

### Deferred carry-over — iOS (pour 47+, post-46/46i)
PostDetailView (.textSelection + 21 hex — re-vérifié OK iter-45, retirer si confirmé) ; arbitrage `time.*` (FeedPostCard) vs `time.short.*` (ShortRelativeTime) ; ConversationInfoSheet (52 polices), ConversationDashboardView (43), TwoFactorSetupView (42, héros intentionnels), CallView (34), InviteFriendsSheet (33), ProfileView/GlobalSearchView (32), SettingsView (27), NewConversationView (16), DataExportView (16), DataStorageView (11) ; ladder catégoriel arc-en-ciel (FF9F43/45B7D1/2ECC71/F8B500/9B59B6/E74C3C/FF6B6B/E91E63/3498DB/A855F7 — à arbitrer charte : UserStatsView, AboutView sections, MediaDownloadSettingsView, toolbars feed, WidgetPreviewView « Post ») ; `FeedItem`/`ConversationTag` possiblement orphelins post-46i (audit avant suppression) ; washes AudioPostComposer (décision design, OK) ; filtre photo « cool » 08D9D6 StoryViewerView+Content:180 (exception documentée 46i — NE PLUS FLAGGER) ; VoiceProfileWizardView/TrackingLinksView Color(hex:) ; IncomingCallView .white contraste ; AvatarContextMenuItem → LocalizedStringKey (API SDK à évaluer) ; ThemedConversationRow theme-aware (leaf-view). **Réglés en 46/46i : ancienne palette (toutes surfaces vivantes), SampleData/MessageComposer supprimés, FriendRequestListView polices+a11y, RootViewComponents épuré, CameraView a11y, PostDetailView confirmé OK**

### Deferred carry-over — Android (pour 47+)
parité stories (UI absente, large) OU réactions par pièce jointe (avec web) ; App Links `https://meeshy.me` (assetlinks.json, arbitrage cross-platform) ; exceptions documentées : SettingsScreen 14.dp, emoji 22.sp (acceptées, ne pas re-flagger). Soldés en 46 : 4 sites `Role.Button` (SettingsScreen profil, MeeshyPrimaryButton, ReactionChip, BubbleImageGrid ×2)

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
| 46 | claude/blissful-ritchie-8rma6f | #606 | ⏳ |
| 46i | claude/wizardly-rubin-a15oib | #607 | ⏳ |
| 46w | claude/elegant-noether-09t4x2 | #605 | ✅ |
| 47w | claude/blissful-ritchie-8d57jg | ⏳ | ⏳ |
