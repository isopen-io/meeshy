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
| In progress | **46** (#606, `claude/blissful-ritchie-8rma6f`) **+ 46i** (#607, iOS-only, `claude/wizardly-rubin-a15oib`) — co-mergées dans une branche d'intégration. 46i : éradication FINALE ancienne palette (24 sites vivants), épuration 14 structs mortes RootViewComponents + suppression `MessageComposer.swift`/`SampleData.swift` (pbxproj), Dynamic Type FriendRequestListView, 6 clés i18n ×5 locales, 8 labels a11y |
| Last Merged Base (commit) | 945a8d74 (merge #604, inclut #597) |
| Note de réconciliation 45×45w | 45w a remplacé `'fr-FR'` par `getCurrentInterfaceLocale()` dans transform-conversation/users.service/notification-helpers en gardant les libellés FR en dur ; iter-45 i18n-ise complètement ces trois sites (clés `timeCompact.*`/`contacts.status.*` + suppression code mort) — la version iter-45 supersède, imports `getCurrentInterfaceLocale` orphelins retirés. 45i (refonte ConversationListHelpers) ne touche pas `ShortRelativeTime` ni les fichiers iter-45 — merge propre vérifié |
| Next iteration | **47** — repartir de `main` HEAD post-merge 46/46i |

### Deferred carry-over — web (pour 47+)
- **`AgentConfigDialog`** : ~40-45 strings FR (labels, selects, 20+ tooltips InfoIcon 50-300 chars) — chantier dédié, passe isolée recommandée (vérifié iter-46 : seul gros reste de l'admin ; debug.tsx/AgentArchetypesTab/BackSoundDetails/UserPicker soldés)
- `MermaidDiagramImpl` : themeVariables fixes (init global Mermaid, pas d'API mode-aware) — architectural
- consolidation `notifications/preferences` page vs composant
- réactions par pièce jointe (wiring gateway, feature commune web+Android)
- audit qualité es/pt (relecture des traductions existantes)
- console.error en français (participants-drawer ×5, links-section ×3) — logs dev, non bloquant
- locale maps intentionnelles NON à migrer : share-affiliate-modal, AudioPostComposer (speech), use-voice-recording (SpeechRecognition lang)
- Universal/App Links `https://meeshy.me/...` — arbitrage produit cross-platform (web assetlinks.json + AASA, voir Android)

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
