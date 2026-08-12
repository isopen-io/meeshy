# iOS UI/UX — Iteration 184i

**Date** : 2026-07-20
**Surface** : `apps/ios/Meeshy/Features/Main/Views/TrackingLinksView.swift`
**Axe** : design-system dedup (HIG empty state) + Dynamic Type
**Base** : `main` HEAD `bfae3ca`

## Contexte

L'écran « Liens de tracking » (`TrackingLinksView`) liste les liens de suivi de
campagne de l'utilisateur (overview de stats + rangées). Le fichier est par
ailleurs mûr : strings localisées (`String(localized:)` partout), `MeeshyFont.relative`
pour le texte scalable, glyphes décoratifs figés + `accessibilityHidden`
documentés « doctrine 74i/86i », titre d'en-tête `.isHeader`, en-tête de section
`.isHeader`, rangées avec label copie + chevron masqué.

Un seul point restait non traité, **auto-contenu** (1 fichier, 0 logique) : l'état
vide fait-main.

## Constat — État vide réimplémenté à la main (dédup design-system)

`trackingEmptyState` était un `VStack` fait-main (icône `.system(size: 40)` +
titre `.subheadline` + sous-titre `.footnote` + `.accessibilityElement(children: .combine)`)
— soit une **réimplémentation** exacte de ce que fournit le composant canonique
du design-system `EmptyStateView`
(`packages/MeeshySDK/Sources/MeeshyUI/Primitives/EmptyStateView.swift`), déjà
adopté dans 13+ emplacements, dont **le frère direct `ShareLinksView`** qui a
reçu exactement ce même dédup en 178i (PR #2096).

Coûts de la duplication :
- maintenance divergente vs le composant canonique ;
- perte de l'animation d'apparition (spring) fournie par le composant ;
- **glyphe hero figé `.system(size: 40)`** qui ne scale pas avec Dynamic Type
  (le composant utilise une icône native qui scale, `.system(size:, weight:)`
  piloté par `compact`).

## Correctif (184i)

`trackingEmptyState` délègue désormais à
`EmptyStateView(icon: "chart.bar.fill", title:, subtitle:, accentColor: MeeshyColors.trackingAccentHex, compact: true)` :

- réutilise **les clés i18n existantes** (`tracking.links.empty.title` /
  `.subtitle`) — **0 clé neuve** ;
- `compact: true` dimensionne le composant pour la section in-scroll ;
- l'accent de marque (`trackingAccentHex` = indigo600 `#4F46E5`) est préservé ;
- VoiceOver : label combiné titre+sous-titre fourni nativement par le composant
  (l'icône reste hors de l'arbre a11y — pas de régression vs le `.combine`
  manuel précédent) ;
- +animation d'apparition spring gratuite ;
- **−1 glyphe figé `.system(size: 40)`** (l'icône native du composant scale avec
  Dynamic Type) ;
- `.padding(.vertical, 24)` conserve l'aération, parité exacte avec 178i.

`import MeeshyUI` ajouté (aligné sur `ShareLinksView` frère) pour exposer
explicitement `EmptyStateView` (public, MeeshyUI) — les autres symboles MeeshyUI
déjà utilisés (`MeeshyColors`, `ThemeManager`, `HapticFeedback`, `MeeshyFont`)
restent inchangés.

## Portée

- **1 fichier** (+ 1 ligne d'import), net ≈ −4 lignes sur le corps de l'état vide.
- **0 logique** / 0 réseau / **0 clé i18n neuve** / 0 test neuf.
- Palette déjà tokenisée (0 swap ; `trackingAccentHex` conservé).
- Header, stats overview, `trackingLinkRow`, navigation, ViewModel **inchangés**.

## Vérification

- Équilibre accolades/parenthèses/crochets vérifié (46/46, 180/180, 3/3).
- `EmptyStateView` (public, MeeshyUI) et `MeeshyColors.trackingAccentHex`
  (public) accessibles depuis le target app (import `MeeshyUI` ajouté, cf.
  `ShareLinksView`).
- Build iOS non exécutable dans l'environnement Linux (pas de toolchain
  Xcode/Swift) → **gate = CI `iOS Tests`**.

## NE PLUS re-flagger

`TrackingLinksView` : empty state natif/dédup soldé 184i, `.isHeader` déjà posé
(titre + section), Dynamic Type déjà OK (fonts relatives), glyphes décoratifs
figés à dessein (badge rangée 40×40, stat card 16pt — doctrine 86i).

## Restant (piste 185i+)

Même dédup empty-state sur les frères non traités si non encore en vol
(vérifier collision essaim via `list_pull_requests` avant) :
`CommunityLinksView` (empty inline `communityLinksSection`) — **attention** :
rangées de `CommunityLinksView` déjà touchées par #2134 (183i, copy action),
vérifier que l'état vide n'y est pas déjà repris.
