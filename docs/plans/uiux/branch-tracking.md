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
| Last completed iteration | **48i** (iOS only : solde « reliquats ancienne palette » du différé 45i — épuration 2 fichiers morts `SampleData.swift`+`MessageComposer.swift` (pbxproj nettoyé) + bloc feed legacy mort RootViewComponents 697–1113 (`ThemedFeedComposer`/`ThemedFeedCard`/`FeedActionButton`/10 wrappers Colorful-Legacy, liveness vérifiée) ; re-peinture charte des surfaces vivantes (RootViewComponents/FeedView/FeedView+Attachments/WidgetPreviewView/AttachmentPreparationService/ConversationAnimatedBackground/MeeshyWidgets + 6 singles) ; +6 `.accessibilityLabel` toolbar FeedComposerSheet ; +4 clés i18n `widget.preview.action.*` ×5 locales ; filtre story « cool » documenté intentionnel) |
| Last merged PR | #610 (47w), #605 (46w) ; iter-48i sur `claude/wizardly-rubin-ph295e` |
| Last Merged Base (commit) | 7659cb0e (merge #610) — base de la branche iter-48i |
| Next iteration | **49** — repartir de `main` HEAD post-merge iter-48i |

### Deferred carry-over — web (pour 49+)
- ~~chart hex sans variante dark (RankingStatsImpl/MermaidDiagramImpl/AgentOverviewTab)~~ → **SOLDÉ en 48w** (ne plus auditer ces 3 fichiers pour le dark mode)
- retrait dépendance orpheline `next-themes` de `apps/web/package.json` (zéro import restant post-48w ; touche `pnpm-lock.yaml` — à faire isolément)
- `RANKING_CRITERIA` labels dans `components/admin/ranking/constants.ts` — probablement FR durs (tooltip charts), à auditer
- consolidation `notifications/preferences` page vs composant
- réactions par pièce jointe (wiring gateway, feature commune web+Android)
- audit qualité es/pt (relecture des traductions existantes)
- console.error en français (participants-drawer ×5, links-section ×3) — logs dev, non bloquant
- optimisations 45w toujours ouvertes : deep links `/v2/chats?id=` (parité iOS/Android), swipe-back mobile web, audit dark pages admin (reste)
- locale maps intentionnelles NON à migrer : share-affiliate-modal, AudioPostComposer (speech), use-voice-recording (SpeechRecognition lang) ; StoryViewer `select-none` text-objects = design (parité stories iOS)
- `hooks/useI18n.ts` = simple re-export de `use-i18n.ts` (vérifié 48w — pas un doublon, ne pas re-flagger)
- `/v2` garde son ThemeProvider propre (`gp-theme-mode`, `data-theme`) — système assumé, ne pas unifier avec `useResolvedTheme`

### Deferred carry-over — iOS (pour 49+, post-48i)
- ~~SampleData.swift + reliquats ancienne palette app (RootViewComponents/FeedView/FeedView+Attachments/WidgetPreviewView/AboutView/MessageComposer/AttachmentPreparationService/ConversationAnimatedBackground + divers ×1)~~ → **SOLDÉ en 48i** (ne plus auditer le trio `08D9D6|FF2E63|4ECDC4` côté `apps/ios` ; seul reliquat intentionnel : StoryViewerView+Content:180 = filtre artistique « cool »)
- **NOUVEAU (découvert 48i)** : ancienne palette côté SDK `MeeshyUI` — chrome UI à migrer (EmojiReactionPicker ×3, NotificationListView:64, MeeshyAvatar:417 fallback gradient, CommunitySettingsView:19, AuthTextField/LanguageSelector/MeeshyForgotPasswordView…) vs palettes de contenu utilisateur à documenter intentionnelles (Story DrawingEditToolOptions/StoryComposerView/StoryTextEditorView)
- FriendRequestListView 11 polices ; PostDetailView (.textSelection + 21 hex — re-vérifié OK iter-45, retirer si confirmé) ; arbitrage `time.*` (FeedPostCard) vs `time.short.*` (ShortRelativeTime) ; ConversationInfoSheet (52 polices), ConversationDashboardView (43), TwoFactorSetupView (42, héros intentionnels), CallView (34), InviteFriendsSheet (33), ProfileView/GlobalSearchView (32), SettingsView (27), NewConversationView (16), DataExportView (16), DataStorageView (11) ; washes AudioPostComposer (décision design) ; ladder catégoriel arc-en-ciel (FF9F43/45B7D1/2ECC71/F8B500/9B59B6/E74C3C/FF6B6B — UniversalComposerBar + toolbars feed emoji/doc + prepareVideo défaut, à arbitrer charte en une décision) ; VoiceProfileWizardView/TrackingLinksView Color(hex:) ; IncomingCallView .white contraste ; AvatarContextMenuItem → LocalizedStringKey (API SDK à évaluer) ; ThemedConversationRow theme-aware (leaf-view)

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
| 47w | claude/blissful-ritchie-8d57jg | #610 | ✅ |
| 48i | claude/wizardly-rubin-ph295e | ⏳ | ⏳ |
