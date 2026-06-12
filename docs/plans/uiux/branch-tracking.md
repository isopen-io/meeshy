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
| Last completed iteration | **47** (tri-plateforme, PR #615 : web — AgentConfigDialog/AgentLlmTab/AgentGlobalConfigTab i18n complet 145 clés `agentConfig.*` ×4 locales + page chats v2 11 strings → `conversations.v2chat.*` + Mermaid dark theme-aware ; iOS — 46 reliquats palette legacy → tokens MeeshyColors sur 14 fichiers + FriendRequestListView 10 polices Dynamic Type ; Android — TalkBack compteur +N images (`bubble_hidden_images` ×4) + SelectionContainer posts feed) |
| Last merged PR | #605 (46w), #608 (notifications iPad) ; iter-47 (#615) en cours sur `claude/blissful-ritchie-9jc6xs` |
| Last Merged Base (commit) | 61d0122 (merge #608) — base de la branche iter-47 |
| Next iteration | **48** — repartir de `main` HEAD post-merge #615 |

### Deferred carry-over — web (pour 48+)
- `RankingStatsImpl` : 22 hex ambre/jaune recharts sans variante dark (strokes/fills/tooltips lignes 54-147) — nécessite hook thème + ternaires, lot dédié (Mermaid et AgentOverviewTab soldés/purgés en 47)
- `formatFileSize` local page chats v2 : unités FR `o`/`Ko`/`Mo` en dur — unifier avec un util partagé locale-aware
- chats v2 `languageName={msg.originalLanguage || 'Francais'}` : passe un code langue comme nom — mapper via `languages.json`
- landing/signup/settings v2 : noms de langues « Français »/« English » en dur (vitrine démo, arbitrage produit)
- consolidation `notifications/preferences` page vs composant ; réactions par pièce jointe (wiring gateway, commun web+Android) ; audit qualité es/pt (incluant les 145 clés agentConfig ajoutées en 47) ; console.error FR (logs dev, non bloquant) ; swipe-back mobile web ; audit dark pages admin
- PURGÉS (vérifiés conformes en 47, ne plus auditer) : deep link `/v2/chats?id=` (implémenté), sélection bulles MessageBubble v2 (aucun select-none), AgentOverviewTab (pas de hex)
- locale maps intentionnelles NON à migrer : share-affiliate-modal, AudioPostComposer (speech), use-voice-recording (SpeechRecognition lang) ; StoryViewer `select-none` text-objects = design (parité stories iOS)

### Deferred carry-over — iOS (pour 48+)
- résidus `FF6B6B` hors périmètre 47 (signalés par la passe palette, majorité → `error`/`errorHex`) : PrivacySettingsView (×4, toggles restrictifs), RootView:~1365 (bell notifications), ComposerModels:37 (thumbnailColor), AddParticipantSheet:~167, ConversationPreferencesTab (×3)
- SampleData.swift suppression fichier mort (4 entrées pbxproj + build local requis)
- grandes surfaces polices : ConversationInfoSheet (52), ConversationDashboardView (43), TwoFactorSetupView (42, héros intentionnels), CallView (34), InviteFriendsSheet (33), ProfileView/GlobalSearchView (32), SettingsView (27), NewConversationView (16), DataExportView (16), DataStorageView (11)
- PURGÉS (vérifiés en 47) : PostDetailView (.textSelection présent, 20 Color(hex:) tous dynamiques — retirer définitivement), FriendRequestListView polices (fait), reliquats palette des 14 fichiers listés en 45i (fait)
- washes AudioPostComposer (décision design) ; ladder pièces jointes arc-en-ciel (à arbitrer charte) ; VoiceProfileWizardView/TrackingLinksView Color(hex:) ; IncomingCallView .white contraste ; AvatarContextMenuItem → LocalizedStringKey (API SDK à évaluer) ; ThemedConversationRow theme-aware (leaf-view) ; arbitrage `time.*` vs `time.short.*`

### Deferred carry-over — Android (pour 48+)
- parité stories (UI absente, large) OU réactions par pièce jointe (avec web)
- largeurs/grilles d'images en constantes nommées (MessageBubble 252.dp/124.dp) — hygiène
- SelectionContainer sur Profile (bio) si demande
- exceptions documentées : SettingsScreen 14.dp, emoji 22.sp (acceptées) ; icônes décoratives `contentDescription=null` avec label adjacent (ChatScreen:464/514, MessageBubble:307) = pratique a11y correcte, ne pas re-flagger ; tailles `sp` suivent fontScale (pas une violation)

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
| 47 | claude/blissful-ritchie-9jc6xs | #615 | ⏳ |
