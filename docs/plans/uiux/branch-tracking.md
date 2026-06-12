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
| Last completed iteration | **46w** (#605 ✅ mergée — web only : i18n surface v2 — CommentComposer 7 clés, StatusBar timeRemaining, ThemeToggle 5 clés, TranslationToggle/MediaImageCard `language.original`/`availableTranslations`/`captionLanguage` ; admin UserPicker 8 clés `agent.userPicker.*` ; MessageComposer `#EF4444`×3 → `var(--gp-error)` + hover theme-aware ; overlays click-outside `aria-hidden` MessageBubble/MediaImageCard ; hygiène docs : 36/36 analyses annotées, carry-over purgé de 3 faux restes) |
| In progress | **46i** (iOS-only, PR #607, CI verte) sur `claude/wizardly-rubin-a15oib` : éradication FINALE ancienne palette (24 sites vivants + mapping documenté), épuration 14 structs mortes RootViewComponents + suppression fichiers `MessageComposer.swift`/`SampleData.swift` (pbxproj), Dynamic Type FriendRequestListView, 6 clés i18n ×5 locales, 8 labels a11y — réconciliée avec main @ 61d01227 (merges #605 iter-46w, #608 notification preview iOS) |
| Last Merged Base (commit) | 61d01227 (merge #608) |
| Next iteration | **47** / **47w** — repartir de `main` HEAD post-merge 46i ; supprimer `claude/wizardly-rubin-a15oib` après merge |

### Deferred carry-over — web (pour 47w+)
- admin : `AgentConfigDialog` (~58 labels/tooltips FR) + tooltips InfoIcon `AgentLlmTab` (6) / `AgentGlobalConfigTab` (15) — à traiter en un lot sous `agent.config.*` (vérifié 46w : debug.tsx, AgentArchetypesTab, BackSoundDetails, UserPicker DÉJÀ corrigés — ne plus auditer)
- chart hex sans variante dark : `RankingStatsImpl` (10+ hex recharts), `MermaidDiagramImpl` (thème mermaid fixe `default`, 6 hex), `AgentOverviewTab` (2 hex pie) ; consolidation `notifications/preferences` page vs composant
- réactions par pièce jointe (wiring gateway, feature commune web+Android)
- audit qualité es/pt (relecture des traductions existantes)
- console.error en français (participants-drawer ×5, links-section ×3) — logs dev, non bloquant
- optimisations 45w toujours ouvertes : deep links `/v2/chats?id=` (parité iOS/Android), swipe-back mobile web, audit dark pages admin
- locale maps intentionnelles NON à migrer : share-affiliate-modal, AudioPostComposer (speech), use-voice-recording (SpeechRecognition lang) ; StoryViewer `select-none` text-objects = design (parité stories iOS)

### Deferred carry-over — iOS (pour 47+, post-46i)
PostDetailView (.textSelection + 21 hex — re-vérifié OK iter-45, retirer si confirmé) ; arbitrage `time.*` (FeedPostCard) vs `time.short.*` (ShortRelativeTime) ; ConversationInfoSheet (52 polices), ConversationDashboardView (43), TwoFactorSetupView (42, héros intentionnels), CallView (34), InviteFriendsSheet (33), ProfileView/GlobalSearchView (32), SettingsView (27), NewConversationView (16), DataExportView (16), DataStorageView (11) ; ladder catégoriel arc-en-ciel (FF9F43/45B7D1/2ECC71/F8B500/9B59B6/E74C3C/FF6B6B/E91E63/3498DB/A855F7 — à arbitrer charte : UserStatsView, AboutView sections, MediaDownloadSettingsView, toolbars feed, WidgetPreviewView « Post ») ; `FeedItem`/`ConversationTag` possiblement orphelins post-46i (audit avant suppression) ; washes AudioPostComposer (décision design, OK) ; filtre photo « cool » 08D9D6 StoryViewerView+Content:180 (exception documentée 46i — NE PLUS FLAGGER) ; VoiceProfileWizardView/TrackingLinksView Color(hex:) ; IncomingCallView .white contraste ; AvatarContextMenuItem → LocalizedStringKey (API SDK à évaluer) ; ThemedConversationRow theme-aware (leaf-view). **Réglés en 46i : ancienne palette (toutes surfaces vivantes), SampleData/MessageComposer supprimés, FriendRequestListView polices+a11y, RootViewComponents épuré**

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
| 46i | claude/wizardly-rubin-a15oib | #607 | ⏳ |
