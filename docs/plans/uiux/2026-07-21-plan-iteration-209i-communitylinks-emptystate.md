# Plan — Iteration 209i — CommunityLinksView empty-state dedup → EmptyStateView

- **Date** : 2026-07-21
- **Piste** : iOS (suffixe `i`)
- **Branche de travail** : `claude/laughing-thompson-jj2z84`
- **Base** : `main` HEAD (resync depuis `origin/main`, PR mergées jusqu'à 207i)
- **Fichier(s)** : `apps/ios/Meeshy/Features/Main/Views/CommunityLinksView.swift`

## Contexte

`CommunityLinksView` (écran « Liens communauté » — communautés administrées avec lien
d'invitation) affichait son **empty-state via un `VStack` bespoke** ré-implémentant le primitive
partagé `MeeshyUI.EmptyStateView` :

```swift
VStack(spacing: 12) {
    Image(systemName: "person.3.fill").font(.system(size: 40))
        .foregroundColor(accent.opacity(0.6))
        .accessibilityHidden(true)
    Text( community.links.empty.title )...
    Text( community.links.empty.subtitle )...
}.padding(40).frame(maxWidth: .infinity)
.accessibilityElement(children: .combine)
```

Ce pattern était **explicitement flaggé** dans `branch-tracking.md` (note 183i) comme candidat de
dédup restant (« ex. `CommunityLinksView` l.112, `person.3.fill` size 40 »). Les sections-sœurs
in-scroll `ShareLinksView` (178i) et `BookmarksView` (168i) délèguent déjà à `EmptyStateView`.

## Déficits identifiés

1. **Duplication** d'un primitive partagé (`EmptyStateView`) — dette design-system.
2. **A11y appauvrie** : label VoiceOver via `children: .combine` brut (concatène titre + sous-titre
   sans structure), vs le `accessibilityLabel("\(title). \(subtitle)")` cadré du primitive.
3. **Pas d'animation** : le primitive apporte gratuitement l'apparition spring (fade + offset).
4. **Divergence de traitement visuel** du glyphe (opacité/poids ad hoc vs treatment canonique).

## Fix

Remplacement par `EmptyStateView(icon:title:subtitle:accentColor:compact:)`, en **miroir exact de
`ShareLinksView`** (section in-scroll, `compact: true`, accent de marque préservé) :

```swift
EmptyStateView(
    icon: "person.3.fill",
    title: String(localized: "community.links.empty.title", ...),
    subtitle: String(localized: "community.links.empty.subtitle", ...),
    accentColor: accentHex,        // MeeshyColors.communityAccentHex — accent de marque préservé
    compact: true
)
.padding(.vertical, 24)
```

+ ajout de `import MeeshyUI` (module du primitive — `ShareLinksView`/`BookmarksView` l'importent déjà).

### Propriétés

- **0 clé i18n neuve** : les clés existantes `community.links.empty.title` / `.subtitle` sont réutilisées telles quelles.
- **0 logique / 0 réseau / 0 test neuf** : couche présentation pure.
- **Gains hérités** : label VoiceOver combiné cadré, apparition spring, treatment glyphe canonique, Dynamic Type via `MeeshyFont.relative` interne au primitive.
- **Accent de marque communauté** (`communityAccentHex`) conservé via `accentColor:`.
- `-11 lignes nettes` de code bespoke, `+1 import`.

## Non-collision essaim

- Dernière modif iOS de `CommunityLinksView.swift` = 195i (skeleton cold-start), **déjà en `main`**.
- PR #2191 (référencée dans le tracking pour « CommunityLinksView ») est en réalité un changement **web** (community slugs) — mislabel du snapshot. Aucune PR iOS ouverte ne touche cet empty-state.

## Vérification

- Environnement d'exécution Linux (pas de Xcode) → build/tests validés par la CI `iOS Tests`.
- Changement structurellement identique à `ShareLinksView` (précédent vert 178i) → risque de régression minimal.

## Statut

- [x] Édition appliquée
- [x] Plan documenté
- [x] Tracking mis à jour
- [ ] CI verte (à valider après push)
