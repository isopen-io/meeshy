# Plan — Itération 105i (iOS) : `FeedView+Attachments`

**Base** : `main` HEAD (`61257034`, 0 PR ouverte) · **Branche** : `claude/upbeat-euler-s5qysh`
**Thème** : VoiceOver (labels boutons destructifs + masquage glyphes décoratifs)
**Gate** : CI `iOS Tests`

## Constat

Typographie déjà conforme (labels `MeeshyFont.relative`, toolbar composer déjà étiquetée).
Les 14 `.system(size:)` = glyphes en cadres fixes (croix suppression, miniatures, toolbar) →
figés par doctrine. Vrai défaut = boutons « retirer » non étiquetés + glyphes décoratifs non masqués.

## Actions (1 fichier, 0 logique)

| Élément | Avant | Action |
|---|---|---|
| Croix retirer `feedAttachmentTile` (28×28) | pas de label | **FIGÉ** + `.accessibilityLabel(feed.attachment.remove)` + commentaire |
| Croix retirer `sheetAttachmentTile` (20×20) | pas de label | **FIGÉ** + `.accessibilityLabel(feed.attachment.remove)` + commentaire |
| `play.circle.fill` vidéo (×2 tuiles) | décoratif lu | `.accessibilityHidden(true)` |
| `mappin.circle.fill` lieu (×2 tuiles) | décoratif lu | `.accessibilityHidden(true)` |
| icône de type fichier (×2 tuiles) | décoratif lu | `.accessibilityHidden(true)` |

## Règles respectées

1. Glyphes en cadres de dimension fixe → figés (doctrine 82i).
2. Boutons destructifs étiquetés VoiceOver (défaut WCAG/HIG corrigé).
3. Palette + toolbar déjà conformes → non touchées.
4. 1 fichier, 0 logique, 0 test neuf. 1 clé i18n via `defaultValue` inline.

## Étapes

1. [x] Resync `main` (0 PR ouverte → 0 contention) ; reset branche.
2. [x] Éditer `FeedView+Attachments.swift` (2 labels + 6 hidden + 2 commentaires).
3. [x] Vérifier : 6 `.accessibilityHidden`, 2 `feed.attachment.remove`, 2 commentaires doctrine.
4. [ ] Commit + push ; ouvrir PR ; attendre CI `ios-tests` verte.
5. [ ] Merger dans `main` (gate = `ios-tests` ; `Build (bun)` non-requis), supprimer la branche, MAJ tracking.

## Différé 106i+

- Normaliser les clés a11y de la toolbar `FeedComposerSheet` (actuellement texte FR littéral
  `String(localized: "Ajouter une photo", …)` sans bundle) → clés SSOT.
- Grandes surfaces Dynamic Type restantes : `StoryViewerView+Content` (38, ⚠️ i18n),
  `ConversationView+Composer` (22, prudent), `OnboardingAnimations` (17) ; `seekBar` audio adjustable (104i différé).
