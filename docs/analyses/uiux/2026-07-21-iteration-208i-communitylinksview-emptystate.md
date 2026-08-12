# Iteration-208i — `CommunityLinksView` empty-state design-system consolidation

## Contexte

`CommunityLinksView` (écran « Liens communauté », navigué depuis `RootView` /
`iPadRootView+Panels` / `StatusBubbleOverlay`) affiche la section « MES COMMUNAUTÉS ».
Son état vide (`viewModel.links.isEmpty`, lignes 112-124) était un **`VStack` fait-main**
ré-implémentant le primitive partagé `MeeshyUI.EmptyStateView` :

```
VStack(spacing: 12) {
    Image(systemName: "person.3.fill").font(.system(size: 40))    // hero glyph
    Text("community.links.empty.title")                            // titre
    Text("community.links.empty.subtitle")                         // sous-titre
}.padding(40).frame(maxWidth: .infinity)
.accessibilityElement(children: .combine)
```

C'est exactement le pattern dédupliqué par la doctrine **183i** (`ProfileUserPostsList`)
et **205i** (`ContactsListTab` → `EmptyStateView`). Les listes-sœurs `BookmarksView` (168i),
`ShareLinksView` (178i), `ProfileUserPostsList` (183i), `ContactsListTab` (205i) délèguent
déjà toutes au primitive ; `CommunityLinksView` était le dernier écran majeur de la piste
« MES … » à conserver une ré-implémentation locale.

## Déficits identifiés

1. **Duplication d'un pattern partagé** — hero glyph + titre + sous-titre ré-écrits à la main
   alors que `EmptyStateView(compact:)` fournit exactement cette structure.
2. **Pas d'animation d'apparition** — le primitive apporte gratuitement le spring
   `.spring(response: 0.5, dampingFraction: 0.8).delay(0.15)` (opacity + offset), absent de
   la version locale (apparition sèche).
3. **A11y label pauvre** — la version locale se contentait de `children: .combine` (VoiceOver
   lisait les fragments concaténés bruts). `EmptyStateView` expose en plus un
   `.accessibilityLabel("\(title). \(subtitle)")` explicite et ponctué.

## Fix

- `import MeeshyUI` ajouté (le fichier n'importait que `SwiftUI`/`Combine`/`MeeshySDK` ;
  `EmptyStateView` est `public` dans le target `MeeshyUI`).
- Bloc empty-state remplacé par :

```swift
EmptyStateView(
    icon: "person.3.fill",
    title: String(localized: "community.links.empty.title", …),
    subtitle: String(localized: "community.links.empty.subtitle", …),
    accentColor: accentHex,           // MeeshyColors.communityAccentHex — teinte préservée
    compact: true
)
.padding(.vertical, 24)
```

- **0 clé i18n neuve** : `community.links.empty.title` et `community.links.empty.subtitle`
  existent déjà et sont réutilisées telles quelles (defaultValue identique → aucun
  changement de contenu localisé).
- **Teinte de marque préservée** : le glyphe reste teinté à l'accent communauté
  (`communityAccentHex`) — `EmptyStateView` applique `Color(hex: accentColor).opacity(0.4)`,
  cohérent avec l'ancien `accent.opacity(0.6)` (même hue).
- **Layout** : l'état vide vit dans un `ScrollView` → le `maxHeight: .infinity` interne du
  primitive se résout à la hauteur de contenu (les `Spacer` se collapsent), footprint
  vertical équivalent à l'ancien `.padding(40)` grâce au `.padding(.vertical, 24)` ajouté.

Portée : **1 fichier** (`CommunityLinksView.swift`), −13/+15 lignes nettes,
0 logique / 0 réseau / 0 test neuf / **0 clé i18n neuve** / 0 changement de wording.
Le glyphe reste décoratif (masqué VoiceOver par le primitive), le sens porté par le
label combiné.

## Vérification

- Gate = CI `iOS Tests` (compile Xcode 26.1.1 / Swift 6.2, run simu iOS 18.2).
- Pas de toolchain Swift dans l'environnement Linux d'exécution → vérification par
  inspection + parité stricte avec l'API `EmptyStateView` déjà consommée par 4 écrans-frères
  (`BookmarksView`, `ShareLinksView`, `ProfileUserPostsList`, `ContactsListTab`).
- `communityAccentHex` confirmé `public static let … String` (MeeshyColors.swift l.84).
- Aucun test ne référence `CommunityLinksView` ni `community.links.empty` (grep = 0) → 0
  test à mettre à jour.
- Les autres usages de `theme` / `accent` dans le fichier restent référencés (header, rows,
  stats) → 0 warning « unused ».

## Statut

✅ Résolu. Ne plus re-flagger `CommunityLinksView` pour la dédup de l'état vide
(soldé 208i). L'écran est désormais structurellement aligné avec ses frères de la piste
« MES … ».

### Pistes 209i+ (1/itération, collision-check `list_pull_requests` d'abord)

- ⚠️ `MemberManagementSection.swift` (empty-state fait-main `person.slash` 28pt, l.306-322) :
  candidat dédup **mais composant actuellement mort** (aucune référence hors sa propre
  définition + pbxproj — vérifié grep 208i). Ne PAS investir tant qu'il n'est pas recâblé.
- Autres empty-states fait-main à auditer via `grep 'font(.system(size: 4'` sur les Views
  LIVE : vérifier d'abord que la View est réellement navigable (référencée hors self) avant
  toute dédup.
