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
| Last completed iteration (iOS) | **51i** (iOS only : adoption Liquid Glass iOS 26 sur le menu d'actions long-press + fidélité fallback `AdaptiveGlass` + épuration code mort. (1) **SDK `AdaptiveGlass`** — `adaptiveGlassRegularFallback(tint:)` empile désormais la teinte AU-DESSUS de `.ultraThinMaterial` (le flou EST le glass ; un verre sans flou n'est pas du verre) ; API publique inchangée (smoke test vert) ; bénéficie tous les appels teintés dont le toggle micro actif de `CallView`. (2) **`ContextActionMenu`** — trio `.ultraThinMaterial` + dégradé accent + strokeBorder dégradé → un seul `.adaptiveGlass(in: Capsule(), tint: accent.opacity(0.18))` : capsule Liquid Glass natif teinté marque sur iOS 26, material teinté + liseré avant ; 2 ombres d'élévation conservées ; cohérent avec `FloatingCallPillView`/`CallView`. (3) **`OverlayMenu.swift` supprimé** (code mort jamais instancié ; FR durs + `.white` figés + boutons no-op) + 4 refs `project.pbxproj` retirées. `MessageContextOverlay` & `ContextActionButton` re-vérifiés conformes (gestes dismiss/swipe-down, a11y modal, Dynamic Type) — ne pas re-flagger.) |
| ~~Last completed iteration (iOS) [49i]~~ | (iOS only : solde le différé 48i « SDK MeeshyUI — ancienne palette ». Migration du chrome SDK trio `08D9D6`/`FF2E63`/`4ECDC4` + accent pourpre `A855F7` vers `MeeshyColors` sur 29 fichiers — Auth (AuthTextField/LanguageSelector/MeeshyForgotPasswordView→brandPrimary), Community (unification indigo complète ; quitter/requis→error ; public toggle→success ; presetColors documenté), Primitives (EmojiReactionPicker/LanguagePickerSheet→brandPrimary, NotificationBadge→error, ConversationSettingsView Modérateur→success, EmptyStateView/ChatBubble défauts→brandPrimaryHex, UserIdentityBar→brandPrimary), UserProfileSheet débloquer→[success,successDeep], Media/Location défauts accentColor ×19→brandPrimaryHex, VoiceProfile ×4→brandPrimaryHex ; commentaires d'intention sur MeeshyAvatar story ring + NotificationListView ladder ; + i18n label a11y `userIdentity.translation.available`. Documentés intentionnels NON migrés : palettes de contenu/swatches utilisateur (Story/Community presetColors), affordance story ring Instagram, ladder catégoriel notifications, speakerPalette, TagInputView, filtres .vivid, previews #DEBUG, modèles SDK core testés) |
| Last completed iteration (web) | **50w** (web only : micro-chaînes i18n + a11y audio/media/v2 — solde le différé « NOUVEAU repéré 49w » hors cluster appel entrant. (1) pattern buggé `t('x') || 'English'` → `t('x', 'En')` (signature fallback native) sur `AudioEffectsCarousel` ×3 + `AudioEffectsPanel` ×1 — `t()` renvoyait la **clé brute** pendant le load, jamais l'anglais ; (2) `AudioEffectsTimeline` sans hook i18n : ajout `useI18n('audioEffects')`, réutilise la clé existante `timeline.clickToSeek`, nouvelles clés `timeline.{segment,segments,noSegment}` ×4 ; (3) `AudioControls` `title="Voix clonée"` → `clonedVoice` ×4 ; (4) `v2/GhostBadge` `title="Utilisateur anonyme"` → `common.anonymousUser` ×4 (+ `useI18n('common')`) ; (5) a11y `v2/PostCard` `alt={m.alt ?? ''}` → `t('post.imageAlt', {index})` ×4 (alt vide = image masquée aux lecteurs d'écran) ; (6) hygiène `PrintButton` défaut FR `'Imprimer'` supprimé → `label` requis (2 appelants passent déjà `t('print')`). 7 clés ×4 locales.) |
| ~~Last completed iteration (web) [49wb]~~ | (web only : surface admin Ranking i18n — (1) **bug critique** réparé : préfixe namespace cassé `admin.ranking.*` → `ranking.*` sur 13 libellés de `RankingFilters` qui affichaient les **clés brutes** dans toutes les langues ; (2) 33 labels `RANKING_CRITERIA` FR durs → clés `ranking.criteria.*` ×4 locales (champ `label` supprimé de `constants.ts`, helper `criterionLabelKey`) ; (3) 7 chaînes FR dures `LinkRankCard` → i18n ; (4) fichier de test ranking mort réanimé → 30/30 verts). **Note** : numérotée `49wb` car un autre agent a livré en parallèle une `49w` distincte (i18n+dark mode appel vidéo — `CallNotification`/`VideoCallInterface`, déjà mergée) ; périmètres disjoints, les deux conservées. |
| Last merged PR | iter-49i #630 ✅ ; iter-49wb (ranking) #633 ✅ ; iter-50w (i18n/a11y audio/media/v2) `claude/focused-brown-u6wp8r` ⏳ ; iter-51i (Liquid Glass context menu) `claude/upbeat-euler-oc9dm6` ⏳ |
| Last Merged Base (commit) | `6d08f805` (main HEAD) — base de l'iter-51i |
| Next iteration | **52** — repartir de `main` HEAD post-merge iter-51i |

### Deferred carry-over — web (pour 51+)
- ~~fallbacks anglais `t('x') || 'En'` (AudioEffectsCarousel/Panel) ; FR durs `AudioEffectsTimeline:61`, `AudioControls:238` « Voix clonée », `GhostBadge:29`, `PrintButton` défaut « Imprimer » ; a11y `PostCard:255` `alt` vide~~ → **SOLDÉ en 50w** (signature `t(key, fallback)` ; clés `audioEffects.{clonedVoice,timeline.segment,timeline.segments,timeline.noSegment}`, `common.anonymousUser`, `components.post.imageAlt` ×4 ; `PrintButton.label` rendu requis. NB : PostCard fallback = `t('post.imageAlt', {index})`, pas `m.fileName` (absent du type Media). Ne plus re-flagger ces 7 fichiers pour ces chaînes.)
- ~~chart hex sans variante dark (RankingStatsImpl/MermaidDiagramImpl/AgentOverviewTab)~~ → **SOLDÉ en 48w** (ne plus auditer ces 3 fichiers pour le dark mode)
- ~~`RANKING_CRITERIA` labels FR durs (`ranking/constants.ts`)~~ → **SOLDÉ en 49wb** (champ `label` supprimé, i18n `ranking.criteria.*` ; ne plus re-flagger ces 33 labels ni le préfixe `admin.ranking.*` de RankingFilters — corrigé)
- **NOUVEAU (49wb)** : `getTypeLabel`/`getMessageTypeIcon` (`ranking/utils.tsx`) renvoient `Groupe`/`Publique` FR durs — à i18n dans une passe dédiée (codes de type de conversation, possible réutilisation hors ranking)
- **NOUVEAU (49wb)** : tests web touchant `stores` (ex. `__tests__/admin/ranking/page.test.tsx`) échouent en env-local sur la résolution `@meeshy/shared/encryption` (`.js` en source TS) — config jest / mock chaîne, non bloquant (`continue-on-error` job web CI), à corriger isolément
- retrait dépendance orpheline `next-themes` de `apps/web/package.json` (zéro import restant post-48w ; touche `pnpm-lock.yaml` — à faire isolément)
- consolidation `notifications/preferences` page vs composant
- réactions par pièce jointe (wiring gateway, feature commune web+Android)
- audit qualité es/pt (relecture des traductions existantes)
- console.error en français (participants-drawer ×5, links-section ×3) — logs dev, non bloquant
- optimisations 45w toujours ouvertes : deep links `/v2/chats?id=` (parité iOS/Android), swipe-back mobile web, audit dark pages admin (reste)
- locale maps intentionnelles NON à migrer : share-affiliate-modal, AudioPostComposer (speech), use-voice-recording (SpeechRecognition lang) ; StoryViewer `select-none` text-objects = design (parité stories iOS)
- `hooks/useI18n.ts` = simple re-export de `use-i18n.ts` (vérifié 48w — pas un doublon, ne pas re-flagger)
- `/v2` garde son ThemeProvider propre (`gp-theme-mode`, `data-theme`) — système assumé, ne pas unifier avec `useResolvedTheme`

### Deferred carry-over — iOS (pour 52+, post-51i)
- ~~`ContextActionMenu` vieux style material+gradient ; `AdaptiveGlass` fallback teinté sans flou ; `OverlayMenu.swift` mort~~ → **SOLDÉ en 51i** (Liquid Glass natif ; fallback teinté = material + teinte ; fichier supprimé). Ne plus re-flagger.
- **NOUVEAU (51i)** — **Glass adoption (reste)** : surfaces flottantes content-agnostic candidates au même swap 1-ligne `adaptiveGlass` — `MentionSuggestionPanel` (vérifier clip-shape avant), `MessageOverlayMenu` (reaction picker, gros), `ContactCardView`, `LocationPickerView`. Par petits lots bornés.

### Deferred carry-over — iOS (héritage 49i, toujours ouvert)
- ~~SampleData.swift + reliquats ancienne palette app~~ → **SOLDÉ en 48i** (ne plus auditer le trio `08D9D6|FF2E63|4ECDC4` côté `apps/ios` ; seul reliquat intentionnel : StoryViewerView+Content:180 = filtre artistique « cool »)
- ~~SDK MeeshyUI chrome ancienne palette (trio + A855F7) : Auth/Community/EmojiReactionPicker/LanguagePickerSheet/NotificationBadge/EmptyStateView/UserIdentityBar/ConversationSettingsView/UserProfileSheet/Media/Location/VoiceProfile défauts~~ → **SOLDÉ en 49i** (ne plus auditer le chrome `MeeshyUI` pour le trio/A855F7). Reliquats documentés **intentionnels** (NE PAS re-flagger) : MeeshyAvatar story ring (affordance Instagram), NotificationListView.color (ladder catégoriel), MediaTypes.speakerPalette, StoryFilter .vivid, Story swatches (DrawingEditToolOptions/StoryComposerView/StoryTextEditorView), CommunitySettings presetColors, TagInputView palette, StatsCard/AchievementBadge previews #DEBUG, modèles SDK core (testés)
- **Ladder catégoriel arc-en-ciel — UNE décision charte (app + SDK)** : NotificationListView.color (11 cat.), TagInputView, speakerPalette, + app-side UniversalComposerBar/toolbars feed (emoji/doc) + prepareVideo défaut FF6B6B (FF9F43/45B7D1/2ECC71/F8B500/9B59B6/E74C3C/FF6B6B). Arbitrer « catégoriel = identité hue-codée OU charte indigo ? »
- ~~`UserIdentityBar` `accessibilityLabel("Traduction disponible")` FR brut~~ → **SOLDÉ 49i** (clé `userIdentity.translation.available`, 5 locales)
- FriendRequestListView 11 polices ; PostDetailView (.textSelection + 21 hex — re-vérifié OK iter-45, retirer si confirmé) ; arbitrage `time.*` (FeedPostCard) vs `time.short.*` (ShortRelativeTime) ; ConversationInfoSheet (52 polices), ConversationDashboardView (43), TwoFactorSetupView (42, héros intentionnels), CallView (34), InviteFriendsSheet (33), ProfileView/GlobalSearchView (32), SettingsView (27), NewConversationView (16), DataExportView (16), DataStorageView (11) ; washes AudioPostComposer (décision design) ; TrackingLinksView Color(hex:) ; IncomingCallView .white contraste ; AvatarContextMenuItem → LocalizedStringKey (API SDK à évaluer) ; ThemedConversationRow theme-aware (leaf-view)

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
| 48i | claude/wizardly-rubin-ph295e | #617 | ✅ |
| 49w | claude/eager-keller-e6eq78 (appel vidéo) | ✅ | ✅ |
| 49wb | claude/focused-brown-uxa19f (admin ranking) | #633 | ✅ |
| 49i | claude/upbeat-euler-c48142 (SDK MeeshyUI palette) | #630 | ✅ |
| 50w | claude/focused-brown-u6wp8r (i18n/a11y audio/media/v2) | ⏳ | ⏳ |
| 51i | claude/upbeat-euler-oc9dm6 (Liquid Glass context menu) | ⏳ | ⏳ |
