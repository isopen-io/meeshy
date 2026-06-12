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
| Last completed iteration | **46** (PR #606, cette branche) × **46w** (#605, web-only) — 46 : web admin i18n (UserPicker repris par 46w, AgentOverviewTab `kpi.inactive` + pie dark-aware, RankingStatsImpl 5 clés `ranking.charts.*` + palette charts dark-aware, InfoIcon aria-label, ConversationSettingsModal `editPhoto`, MessageSearch locale interface) ; iOS : palette legacy 10 fichiers/27 occ → tokens, FriendRequestListView 8 polices sémantiques, CameraView 3 accessibilityLabel + 5 clés xcstrings ; Android : Role.Button ×5 (SettingsScreen profil, MeeshyPrimaryButton, ReactionChip, BubbleImageGrid ×2). 46w : i18n surface v2 (CommentComposer, StatusBar, ThemeToggle, TranslationToggle/MediaImageCard), admin UserPicker 8 clés, MessageComposer web tokens erreur, aria-hidden overlays, hygiène docs |
| Last merged PR | #605 (46w) ; iter-46 (#606) mergée juste après |
| Last Merged Base (commit) | merge #606 (voir History) — réconciliation 46×46w faite dans #606 |
| Note de réconciliation 46×46w | Collision sur UserPicker : 46w (mergée la première) et 46 l'ont i18n-isé en parallèle avec des noms de clés différents — la version 46w (`noneSelected`/`noResults`, hook `use-i18n`) est conservée, les clés dupliquées de 46 (`empty`/`noneFound`) retirées des 4 locales ; les ajouts 46 (`ranking.charts.*`, `agent.overview.kpi.inactive`) sont réinjectés par-dessus. Le différé 46w « chart hex sans variante dark (RankingStatsImpl/AgentOverviewTab) » est soldé par 46 (même PR) |
| Next iteration | **47** — repartir de `main` HEAD post-merge #606 |

### Deferred carry-over — web (pour 47+)
- admin : `AgentConfigDialog` (~58 labels/tooltips FR) + tooltips InfoIcon `AgentLlmTab` (6) / `AgentGlobalConfigTab` (15) — à traiter en un lot sous `agent.config.*` (vérifié 46/46w : debug.tsx, AgentArchetypesTab, BackSoundDetails, UserPicker DÉJÀ corrigés — ne plus auditer)
- `MermaidDiagramImpl` : thème mermaid fixe `default` (6 hex, init global, pas d'API mode-aware) — architectural ; consolidation `notifications/preferences` page vs composant
- réactions par pièce jointe (wiring gateway, feature commune web+Android)
- audit qualité es/pt (relecture des traductions existantes)
- console.error en français (participants-drawer ×5, links-section ×3) — logs dev, non bloquant
- optimisations 45w toujours ouvertes : deep links `/v2/chats?id=` (parité iOS/Android), swipe-back mobile web, audit dark pages admin
- Universal/App Links `https://meeshy.me/...` — arbitrage produit cross-platform (web assetlinks.json + AASA, voir Android)
- locale maps intentionnelles NON à migrer : share-affiliate-modal, AudioPostComposer (speech), use-voice-recording (SpeechRecognition lang) ; StoryViewer `select-none` text-objects = design (parité stories iOS)

### Deferred carry-over — iOS (pour 47+, post-46)
**Gros fichiers palette legacy (planifié 47)** : RootViewComponents (13), FeedView (9), FeedView+Attachments (11), WidgetPreviewView (8) — gradients décoratifs, arbitrage visuel par surface ; hex hors périmètre des 6 legacy (F8B500, 3498DB, F39C12…) dans AboutView/UserStatsView/MediaDownloadSettingsView à inventorier ; SampleData.swift ×2 (app + SDK) morts confirmés — suppression nécessite pbxproj + build macOS ; BubbleStandardLayout:835 quoted reply sans .textSelection (conflit potentiel tap-to-scroll, à évaluer) ; arbitrage `time.*` (FeedPostCard) vs `time.short.*` (ShortRelativeTime) ; grandes surfaces polices : ConversationInfoSheet (52), ConversationDashboardView (43), TwoFactorSetupView (42, héros intentionnels), CallView (34), InviteFriendsSheet (33), ProfileView/GlobalSearchView (32), SettingsView (27), NewConversationView (16), DataExportView (16), DataStorageView (11) ; washes AudioPostComposer (décision design) ; ladder pièces jointes arc-en-ciel (à arbitrer charte) ; VoiceProfileWizardView/TrackingLinksView Color(hex:) ; IncomingCallView .white contraste ; AvatarContextMenuItem → LocalizedStringKey (API SDK à évaluer) ; ThemedConversationRow theme-aware (leaf-view). Soldés en 46 : FriendRequestListView polices, PostDetailView (confirmé OK), CameraView a11y, 10 petits fichiers palette (27 occ)

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
| 46w | claude/elegant-noether-09t4x2 | #605 | ✅ |
| 46 | claude/blissful-ritchie-8rma6f | #606 | ⏳ |
