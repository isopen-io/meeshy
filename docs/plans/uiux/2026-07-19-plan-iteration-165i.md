# Plan Itération 165i — VoiceOver du badge d'alertes non lues (`ConversationListView+Overlays`)

**Date** : 2026-07-19 · **Piste** : iOS (`i`) · **Base** : `main` HEAD `efedb69e4` (post-164i, webhook #2013 clos)
**Branche** : `claude/laughing-thompson-eemipo`

## Objectif
Combler une lacune VoiceOver « info par couleur/badge seule » : le compteur d'alertes non lues du bouton Notifications de la barre d'en-tête (layout large/iPad) n'était accessible que visuellement.

## Cible
`apps/ios/Meeshy/Features/Main/Views/ConversationListView+Overlays.swift` — bouton `bell.fill` + pastille `iPadNotificationCount`.

## Étapes
1. [x] Resync branche sur `main` HEAD ; vérifier absence de contention (webhook = merge 161i/#2013).
2. [x] Ré-audit des fausses pistes du différé (`FeedCommentsSheet`, `BookmarksView` déjà soldés) → écartées.
3. [x] Identifier la lacune : `.accessibilityLabel` statique sans `accessibilityValue` sur un bouton porteur de badge de compteur.
4. [x] Ajouter `let unreadA11yValue` (0 / singulier / pluriel) + `.accessibilityValue(...)`.
5. [x] 2 clés `.a11y` code-only (`…unread.one.a11y`, `…unread.other.a11y`), pluriel FR manuel.
6. [x] Analyse + plan + tracking.
7. [ ] Commit + push + PR ; gate CI `iOS Tests`.

## Contraintes
- 1 fichier, 0 logique, 0 changement visuel, 0 test neuf.
- Palette/Dynamic Type déjà soldés sur ce composant → hors-scope.
- SwiftUI ne compile pas sous Linux → CI seule autorité.

## Différé 166i+
- Traquer d'autres pastilles/compteurs info-par-couleur : badge unread des lignes (`ThemedConversationRow`, composant distinct), badges d'onglets, indicateurs de statut sans label.
- Pivots suggérés (Dynamic Type low-hanging épuisé) : i18n chaînes hardcodées résiduelles, adoption composants natifs, dédup design-system.
