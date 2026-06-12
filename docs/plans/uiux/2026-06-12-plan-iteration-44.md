# UI/UX Plan — Iteration 44 (2026-06-12)

Analyse : `docs/analyses/uiux/2026-06-12-iteration-44.md`
Branche : `claude/keen-dirac-485vpk` (synchronisée avec main @ 813b7fe3 post-merge #588)

## Objectif
Passe complète iOS sur `ThemedConversationRow` (surface n°1) : i18n, Dynamic Type, tokens de charte, a11y — plus consolidation du formateur de temps relatif.

## Étapes

- [x] 1. **SDK — `MeeshyColors`** : ajouter les tokens statiques theme-aware `textPrimary(isDark:)`, `textSecondary(isDark:)`, `textMuted(isDark:)`, `backgroundSecondary(isDark:)` (miroirs des valeurs canoniques ThemeManager, exprimés via l'échelle indigo)
- [x] 2. **SDK — `ThemeManager`** : déléguer `textPrimary/textSecondary/textMuted/backgroundSecondary` aux statiques `MeeshyColors` (source unique de vérité)
- [x] 3. **App — `ConversationListHelpers.swift`** : ajouter `ShortRelativeTime.label(for:now:)` — helper pur, localisé, `now` injectable pour les tests (pas de nouveau fichier : pbxproj à références explicites)
- [x] 4. **App — `ThemedConversationRow.swift`** :
  - couleurs stone → tokens `MeeshyColors.*(isDark:)`
  - 26 polices figées → sémantiques (15→`.subheadline`, 13→`.footnote`, 12→`.caption`, ≤11→`.caption2`, poids préservés)
  - badge non-lus : cercle figé 24×24 → capsule `minWidth/minHeight: 24` (scale Dynamic Type)
  - i18n : toutes les chaînes FR → `String(localized:defaultValue:bundle:)` ; réutiliser `accessibility.opens_conversation`, « Conversation », « Voir le profil », « Infos conversation »
  - `timeAgo` → `ShortRelativeTime.label`
  - faute « epingle » → « épinglée »
- [x] 5. **App — `RootViewComponents.swift`** : `timeAgoShort` → `ShortRelativeTime.label` (supprime le doublon français)
- [x] 6. **Localizable.xcstrings** : 21 nouvelles clés (time.short.*, typing.*, draft.*, accessibility.*, menu.create_share_link) × 5 locales (fr source + de/en/es/pt-BR), insertion chirurgicale (round-trip JSON byte-identique vérifié)
- [x] 7. **Tests** : `ShortRelativeTimeTests` (buckets maintenant/min/h/j/sem + bornes) ajoutés dans `ConversationListViewModelTests.swift` (pas de nouveau fichier)
- [x] 8. Annoter l'analyse iter-43 (statut soldé via PR #576/#579/#588) + mettre à jour `branch-tracking.md`
- [x] 9. Commit + push `claude/keen-dirac-485vpk`, PR vers main, CI (ios-tests + sdk-tests), merge, suppression de branche

## Risques & garde-fous
- Pas de compilation locale possible (conteneur Linux) → CI ios-tests (macOS, suite MeeshyTests complète) est le gate ; édits limités à des patterns Swift éprouvés dans le repo
- Aucune création de fichier (pbxproj objectVersion 63 à références explicites)
- xcstrings : sérialisation `json.dumps(indent=2, separators=(',', ' : '))` vérifiée byte-identique en round-trip
- Changement visuel assumé : texte de la cellule passe de la palette stone à la palette indigo canonique (règle charte) ; tailles 8-9 pt remontées à `.caption2` (minimum HIG 11 pt)

## Review (fin d'itération)
- PR #589 mergée dans main (CI ios-tests + sdk-tests vertes)
- `branch-tracking.md` mis à jour : prochaine itération 45 depuis main post-merge
- Reports tracés dans l'analyse iter-44 § Deferred
