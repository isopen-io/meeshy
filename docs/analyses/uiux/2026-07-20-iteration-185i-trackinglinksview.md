# iOS UI/UX — Iteration 185i

**Date** : 2026-07-20
**Surface** : `apps/ios/Meeshy/Features/Main/Views/TrackingLinksView.swift`
**Axe** : design-system dedup (état vide → `EmptyStateView`)
**Base** : `main` HEAD `0b2df50`

## Contexte

L'écran « Liens de tracking » (`TrackingLinksView`) liste les liens de suivi de
campagne de l'utilisateur (overview stats + rangées). Le fichier est par ailleurs
mûr : strings 100 % localisées, `MeeshyFont.relative` pour le texte scalable,
`.isHeader` déjà posé sur le titre d'en-tête (l.65) ET le section header
« MES LIENS » (l.120), glyphes décoratifs figés + `accessibilityHidden`
documentés « doctrine 74i/86i ». Un seul point restait : l'état vide
réimplémenté à la main.

Follow-up explicitement listé dans le doc 178i (`ShareLinksView`) : « Même dédup
empty-state sur les frères non traités : `CommunityLinksView`, `TrackingLinksView`
(`trackingEmptyState`, l.138-152) ». `CommunityLinksView` a une PR a11y en vol
(#2134, rangées) → écartée pour éviter la collision fichier. `TrackingLinksView`
n'est touché par aucune PR ouverte (les PRs `TrackingLink*` en vol — #2121/#2122
— visent `TrackingLinkDetailView`, fichier distinct).

## Constat — état vide réimplémenté à la main

Le `trackingEmptyState` (l.138-152) était un `VStack` fait-main :
- glyphe hero `Image(systemName: "chart.bar.fill").font(.system(size: 40))` **figé**
  (ne scale pas avec Dynamic Type) ;
- titre + sous-titre `Text` ;
- `.accessibilityElement(children: .combine)` manuel.

Soit une **réimplémentation** exacte de ce que fournit le composant canonique du
design-system `EmptyStateView`
(`packages/MeeshySDK/Sources/MeeshyUI/Primitives/EmptyStateView.swift`), déjà
adopté dans 13+ emplacements dont le **frère direct de la même famille**
`ShareLinksView` (178i, `compact: true`).

Coûts de la duplication : maintenance divergente, perte de l'animation
d'apparition (spring) fournie par le composant, glyphe hero figé au lieu du
`.system(size: 36, weight: .light)` cohérent du composant.

## Correctif (185i)

`trackingEmptyState` délègue désormais à
`EmptyStateView(icon: "chart.bar.fill", title:, subtitle:, accentColor: accentHex,
compact: true)` :
- réutilise **les clés i18n existantes** (`tracking.links.empty.title` /
  `.subtitle`) — **0 clé neuve** ;
- `compact: true` dimensionne le composant pour la section in-scroll
  (parité exacte `ShareLinksView`) ;
- l'accent de marque (`accentHex` = `MeeshyColors.trackingAccentHex`, déjà propriété
  du fichier l.15) est préservé ;
- VoiceOver : label combiné titre+sous-titre fourni nativement par le composant
  (l'icône reste hors de l'arbre a11y — pas de régression) ;
- +animation d'apparition spring gratuite ; **suppression du `.system(size: 40)`
  figé** (le glyphe natif du composant scale/est borné de façon cohérente).

## Portée

- **1 fichier**, dédup nette (`VStack` custom → 1 composant).
- **0 logique** / 0 réseau / **0 clé i18n neuve** / 0 test neuf.
- Palette déjà tokenisée (0 swap ; `trackingAccentHex` conservé).
- Aucun `import` ajouté : `EmptyStateView` (public, MeeshyUI) déjà en portée
  via `@_exported import MeeshyUI` (`apps/ios/Meeshy/MeeshyUIExports.swift`) —
  d'où l'usage préexistant de `MeeshyColors`/`MeeshyFont` sans import explicite.
- Rangées `trackingLinkRow`, stats overview, header, navigation, ViewModel
  **inchangés**.

## Vérification

- Équilibre accolades/parenthèses/crochets vérifié (46/46, 178/178, 3/3).
- Seul `.system(size:)` restant du fichier = glyphe rangée 40×40 (l.162, figé à
  dessein, doctrine 86i — commenté l.159).
- Build iOS non exécutable dans l'environnement Linux (pas de toolchain
  Xcode/Swift) → **gate = CI `iOS Tests`**.

## NE PLUS re-flagger

`TrackingLinksView` : état vide natif/dédup soldé 185i, `.isHeader` déjà posé
(titre + section header), Dynamic Type déjà OK (fonts relatives), glyphes
décoratifs figés à dessein (badge rangée 40×40, doctrine 86i).

## Restant (piste 186i+)

Même dédup empty-state sur le dernier frère non traité :
`CommunityLinksView` (empty inline `communityLinksSection`) — vérifier collision
essaim via `list_pull_requests` (a11y rangées en vol #2134).
