# Iteration-175i — StarredMessagesView empty-state → native `ContentUnavailableView`

**Date**: 2026-07-19
**Surface**: `apps/ios/Meeshy/Features/Main/Views/StarredMessagesView.swift`
**Type**: Native HIG adoption + design-system reuse (single reusable empty-state component)

## Contexte

`StarredMessagesView` (liste dédiée des messages favoris, miroir de l'écran
« Messages favoris » de WhatsApp) est déjà mature : les rangées portent une
structure VoiceOver complète (`accessibilityElement(children: .combine)` +
`.isButton` + hint + action), toutes les chaînes sont localisées, les polices
utilisent déjà `MeeshyFont.relative(...)` (Dynamic Type OK).

Le **seul point faible restant** est l'**état vide**, rendu par un `VStack`
custom :

```swift
private var emptyState: some View {
    VStack(spacing: 16) {
        Image(systemName: "star.circle")
            .font(.system(size: 56, weight: .regular))   // ← seul .system(size:) du fichier
            .foregroundStyle(MeeshyColors.indigo400)
            .accessibilityHidden(true)
        Text(...titre...)
        Text(...sous-titre...)
    }
}
```

### Problèmes

1. **Non-natif / hors HIG** : Apple fournit `ContentUnavailableView` (iOS 17+)
   comme composant système standard pour les états vides. La reproduction custom
   diverge du look natif (métriques, typographie, tint) que l'utilisateur
   retrouve partout ailleurs dans iOS.
2. **Duplication design-system** : le repo possède déjà
   `AdaptiveContentUnavailableView` (`MeeshyUI/Compatibility/`), wrapper qui rend
   le vrai `ContentUnavailableView` sur iOS 17+ et une reproduction fidèle sur
   iOS 16. Il est **déjà adopté** par `FeedView` et `CreateShareLinkView`.
   `StarredMessagesView` réimplémente à la main ce que ce composant fournit.
3. **VoiceOver de l'état vide non groupé** : les deux `Text` (titre + sous-titre)
   sont deux éléments VoiceOver distincts, l'icône est masquée mais le tout
   n'est pas un seul élément lisible d'un coup. `ContentUnavailableView` /
   le fallback `AdaptiveContentUnavailableView` groupent nativement titre +
   description (`.accessibilityElement(children: .combine)` dans le legacy body).
4. **`.font(.system(size: 56))` figé** : dernier size codé en dur du fichier.
   Le composant natif gère lui-même l'échelle de son icône symbolique.

## Décision

Remplacer le `VStack` custom `emptyState` par `AdaptiveContentUnavailableView`,
en réutilisant les **clés i18n existantes** (`starred.messages.empty.title` /
`starred.messages.empty.subtitle`) — aucune nouvelle chaîne, aucune régression
de contenu.

- Alignement HIG : état vide natif (iOS 17+), fallback fidèle iOS 16.
- Réduction de duplication : un composant partagé au lieu d'un `VStack` maison.
- VoiceOver : titre + description groupés par le composant.
- Suppression du dernier `.system(size:)` du fichier.

### Ce qui N'est PAS touché (préservé à dessein)

- Les rangées `StarredRow` : structure VoiceOver, fonts relatives, palette accent,
  context menu, navigation → **inchangées**.
- La logique de navigation (`navigate(to:)`), le store, le toolbar « Tout retirer ».
- L'icône de rang `star.fill` 10pt et le glyphe conversation 9pt (déjà `relative`).

## Verification

- Gate = CI `iOS Tests`.
- 1 fichier, 0 logique / 0 réseau / 0 clé i18n neuve / 0 test neuf.
- Aucun test n'assère le contenu du `VStack` emptyState (état interne de vue) →
  0 régression de suite.

## Statut

- [x] Analyse
- [x] Implémentation
- [ ] Push / PR
