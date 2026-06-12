# UI/UX Plan — Iteration 45i (2026-06-12)

Base : `main` @ 09e08439 (post-merge PR #594, iter-44). Branche : `claude/wizardly-rubin-ux84an`.
Analyse source : `docs/analyses/uiux/2026-06-12-iteration-45i.md`. iOS exclusivement.

## Étapes

### 1. Épuration code mort legacy (zéro pbxproj impact)
- [ ] `ConversationListHelpers.swift` : supprimer `SemanticColors`, `ColorfulConversationRow`,
      `CommunityCard`, `ColorfulFilterChip`, `ConversationRow`, `CategoryPill`, `FilterChip`
- [ ] `ConversationHelperViews.swift` : supprimer `ConversationOptionButton`,
      `AttachOptionButton`, `MessageBubble`, `ColorfulMessageBubble`

### 2. Éradication ancienne palette (fallbacks UI vivants)
- [ ] `ThreadView.swift:22` → `?? MeeshyColors.brandPrimaryHex` ; `:151,160` → `?? accentColor`
- [ ] `ConversationView.swift:712` → `?? MeeshyColors.brandPrimaryHex`
- [ ] `StoryViewerView.swift:519` → accent auteur `currentGroup?.avatarColor ?? brandPrimaryHex` ;
      `:1015` littéral `"6366F1"` → `brandPrimaryHex`
- [ ] `StoryTrayView.swift:97-98` → `avatarColor: brandPrimaryHex` + `username` localisé
- [ ] `FriendRequestListView.swift:58` → `.tint(MeeshyColors.brandPrimary)` ;
      `:162` → `[success, successDeep]`
- [ ] `StoryViewModel.swift:1419,1424` → `thumbnailColor: MeeshyColors.brandPrimaryHex`

### 3. Dynamic Type — ConversationListHelpers (19 polices)
- [ ] Mapping : 20→`.title3`, 16→`.callout`, 14-15→`.subheadline`, 13→`.footnote`,
      12→`.caption`, 8-11→`.caption2` (poids conservés)

### 4. Accessibilité (surfaces touchées)
- [ ] `SectionHeaderView` : `.accessibilityValue` Développée/Réduite
- [ ] `ThemedFilterChip` : `.accessibilityAddTraits(.isSelected)` conditionnel

### 5. i18n — Localizable.xcstrings (5 locales : de/en/es/fr/pt-BR)
- [ ] `story.preview.username` (Aperçu/Preview/Vista previa/Prévia/Vorschau)
- [ ] `accessibility.section_expanded` / `accessibility.section_collapsed`

### 6. Livraison
- [ ] Commit + push `claude/wizardly-rubin-ux84an`
- [ ] PR vers main, CI vert (ios-tests.yml), merge
- [ ] MAJ `branch-tracking.md` + annotation Status des analyses

## Vérification
- Pas de build local possible (conteneur Linux) — la compilation est validée par
  `ios-tests.yml` (Xcode 26.1.1, suite MeeshyTests complète) sur la PR.
- Greps post-édition : zéro `4ECDC4|FF2E63|08D9D6` restant dans les fichiers traités ;
  zéro `font(.system(size:` restant dans ConversationListHelpers.

## Review (2026-06-12)
- Étapes 1–5 implémentées intégralement ; toutes les cases cochées de fait :
  11 structs mortes supprimées (−95 lignes nettes hors xcstrings), 13 fallbacks/littéraux
  ancienne palette éradiqués, 19 polices migrées en sémantique, 2 améliorations VoiceOver,
  3 clés ×5 locales ajoutées (diff xcstrings minimal : +105 lignes, ordre préservé)
- Greps de vérification : zéro `4ECDC4|FF2E63|08D9D6|2ECC71|6366F1` littéral dans les
  8 fichiers Swift touchés ; zéro `font(.system(size:` dans ConversationListHelpers ;
  accolades équilibrées ; JSON xcstrings valide ; zéro référence restante aux symboles
  supprimés (app, tests, extensions)
- Compilation + suite MeeshyTests validées par CI `ios-tests.yml` sur la PR
