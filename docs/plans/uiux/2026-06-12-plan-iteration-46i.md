# UI/UX Plan — Iteration 46i (2026-06-12)

Base : `main` @ 945a8d74 (post-merge PR #604). Branche : `claude/wizardly-rubin-a15oib`.
Analyse source : `docs/analyses/uiux/2026-06-12-iteration-46i.md`. iOS exclusivement.

## Étapes

### 1. Épuration code mort
- [ ] `RootViewComponents.swift` : supprimer `ThemedFloatingButton`, `ThemedFeedComposer`,
      `ThemedFeedCard`, `FeedActionButton` et la section « Legacy Support » (10 structs) ;
      mettre à jour le commentaire d'index de `RootView.swift:8-9`
- [ ] Supprimer `Components/MessageComposer.swift` + 4 entrées pbxproj
- [ ] Supprimer `Models/SampleData.swift` + 4 entrées pbxproj + ligne commentaire
      `Models.swift:12`

### 2. Éradication ancienne palette (surfaces vivantes — mapping de l'analyse)
- [ ] `RootViewComponents.swift` (ThemedFeedOverlay) : orbe → `indigo400`, avatar → drop
      args, spinner → `brandPrimary`
- [ ] `FeedView.swift` : 8 sites (tints, avatar, progress, toolbar photo/micro, location)
- [ ] `FeedView+Attachments.swift` : 10 sites + `"Moi"` → `feed.composer.me`
- [ ] `AttachmentPreparationService.swift` : défauts → `brandPrimaryHex`/`brandDeepHex`
      (+ `import MeeshyUI`)
- [ ] `WidgetPreviewView.swift` : héros, 3 quick actions, carte Partage
- [ ] `AboutView.swift` ×5 → `infoHex`
- [ ] `UserStatsView.swift` → `brandPrimaryHex` ; `MediaDownloadSettingsView.swift` → `infoHex`
- [ ] `MemberManagementSection.swift` → `success` ; `BlockedUsersView.swift` → `success`
- [ ] `ConversationInfoSheet.swift` → `shareAccentHex`
- [ ] `ConversationAnimatedBackground.swift` défauts → `brandPrimaryHex`/`brandDeepHex`
- [ ] `MeeshyWidgets.swift` ×2 → `"818CF8"`

### 3. Dynamic Type — FriendRequestListView (10 polices, héros 48pt conservé)
- [ ] Mapping iter-32/42 (cf. analyse)

### 4. i18n — Localizable.xcstrings (5 locales : de/en/es/fr/pt-BR)
- [ ] `widget.preview.action.new` (Nouveau/New/Nuevo/Novo/Neu)
- [ ] `widget.preview.action.share` (Partager/Share/Compartir/Compartilhar/Teilen)
- [ ] `widget.preview.action.post` (Post/Post/Publicación/Post/Beitrag)
- [ ] `widget.preview.action.settings` (Réglages/Settings/Ajustes/Ajustes/Einstellungen)

### 5. Livraison
- [ ] Greps de clôture : zéro `08D9D6|FF2E63|4ECDC4` hors DynamicColorGenerator/filtre
      cool/fixtures tests ; zéro `font(.system(size:` texte dans FriendRequestListView
- [ ] Commit + push `claude/wizardly-rubin-a15oib`
- [ ] PR vers main, CI vert (`ios-tests.yml`), merge
- [ ] MAJ `branch-tracking.md` + annotation Status de l'analyse

## Vérification
Pas de build local possible (conteneur Linux) — compilation + suite MeeshyTests validées
par `ios-tests.yml` sur la PR. Les suppressions pbxproj sont le point de risque surveillé :
en cas d'échec CI, corriger et re-pousser jusqu'au vert (boucle pilotée).

## Review (2026-06-12)
- Étapes 1–4 implémentées intégralement, toutes cases cochées de fait :
  - Épuration : 14 structs mortes RootViewComponents (−497 lignes), fichiers
    `MessageComposer.swift` (218) et `SampleData.swift` (390) supprimés + 8 entrées
    pbxproj retirées, commentaires d'index RootView/Models mis à jour
  - Palette : 24 sites vivants migrés selon le mapping de l'analyse ; appels
    `prepareImage`/`prepareVideo` des surfaces feed simplifiés vers les défauts brand
  - Dynamic Type : 10 polices FriendRequestListView migrées, héros 48pt conservé
  - i18n/a11y bonus : 6 clés ×5 locales (4 widget actions + 2 a11y demandes d'amis),
    `feed.composer.me` réutilisé, 6 `.accessibilityLabel` toolbar FeedView+Attachments
- Greps de clôture : zéro `08D9D6|FF2E63|4ECDC4` dans `apps/ios` hors fixtures
  MeeshyTests et filtre photo « cool » documenté (StoryViewerView+Content:180) ;
  zéro référence aux symboles supprimés ; accolades équilibrées sur les 6 fichiers
  lourds ; JSON xcstrings valide (+210 lignes, format Xcode préservé) ; pbxproj sans
  référence orpheline
- Compilation + suite MeeshyTests : validation par CI `ios-tests.yml` sur la PR
