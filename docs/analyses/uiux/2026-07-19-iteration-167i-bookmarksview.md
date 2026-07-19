# Itération 167i — Analyse UI/UX iOS : `BookmarksView`

**Date** : 2026-07-19
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Views/BookmarksView.swift`
**Base** : `main` HEAD (`efedb69e4`)
**Branche** : `claude/laughing-thompson-6l6vkb`
**Gate** : CI `iOS Tests`

## Contexte

`BookmarksView` est l'écran « Favoris » (posts sauvegardés) : une `ScrollView` + `LazyVStack`
de `FeedPostCard`, avec pagination infinie, pull-to-refresh, et un **état vide hand-rolled**
lorsque `viewModel.posts.isEmpty`. Surface **fraîche** : aucune PR iOS ouverte ne la touche
(les PR ouvertes 144i–166i couvrent `MessageViewsDetailView` #2020, `StatsTimelineChart` #2028,
`MessageTranscriptionDetailView` #2030, `BubbleExpandableText` #2001, `EditProfileView` #1988,
`DeleteAccountView` #1986, `FeedView+Attachments` #2006). Numéro **167i** choisi strictement >
plus haut en vol (166i).

## Constat (avant 167i)

L'état vide était une `VStack` faite main :

```swift
VStack(spacing: 16) {
    Image(systemName: "bookmark").font(.system(size: 48))...   // glyphe figé, ne scale pas
    Text("Aucun favori").font(.body.weight(.semibold))
    Text("Les posts que vous sauvegardez...").font(.subheadline)
}
```

1. **Composant natif ignoré** — iOS 17+ fournit `ContentUnavailableView`, LE composant
   système d'état vide (glyphe + titre + description, layout HIG, Dynamic Type et
   regroupement VoiceOver gratuits). Le dépôt possède déjà l'atome de compat
   `AdaptiveContentUnavailableView` (SDK `MeeshyUI/Compatibility/`, natif sur iOS 17+, repli
   fidèle sur iOS 16), **adopté dans `FeedView` (ligne 909) et `CreateShareLinkView`
   (ligne 576)** — mais **pas ici** → duplication d'un état vide au lieu de réutiliser le
   composant du design system.
2. **Glyphe figé (Dynamic Type partiel)** — le `bookmark` à `.font(.system(size: 48))` ne
   scalait pas ; sous « Larger Text » l'icône restait à 48pt pendant que le texte grossissait,
   déséquilibrant la composition. `ContentUnavailableView` scale glyphe **et** texte de
   concert.
3. **Couleurs figées** — `theme.textMuted` / `theme.textSecondary` codées sur l'icône et les
   textes, là où le composant natif emploie `.secondary` sémantique (adaptatif light/dark/high
   contrast sans intervention).

## Correction appliquée (1 fichier Swift, 0 clé i18n)

- **Adoption du composant natif** : la `VStack` hand-rolled → `AdaptiveContentUnavailableView`
  (même idiome que `FeedView` / `CreateShareLinkView`). Sur iOS 17+ c'est le vrai
  `ContentUnavailableView` système ; sur iOS 16 le repli de l'atome de compat.
- **Réutilisation des clés i18n existantes** : `bookmarks.empty.title` et
  `bookmarks.empty.subtitle` (déjà au catalogue) sont passées telles quelles à
  `title` / `description` → **0 clé neuve**, aucun changement au catalogue `Localizable.xcstrings`.
- **`.padding(.top, 80)` conservé** → offset vertical de l'état vide inchangé dans la
  `LazyVStack` parente.

Gains : Dynamic Type complet (glyphe + texte scalent ensemble), regroupement VoiceOver natif
(le titre + la description sont lus comme un seul élément d'état vide HIG), couleurs sémantiques
adaptatives, **−12 lignes de code dupliqué** remplacées par un appel au composant partagé.

## Périmètre / non-régression

- **1 fichier Swift**, 0 clé i18n, 0 logique, 0 mutation d'état, 0 test neuf. `import MeeshyUI`
  ajouté explicitement par cohérence avec la convention de migration (parité `FeedView`,
  165i) — `AdaptiveContentUnavailableView` est de toute façon atteignable via
  `@_exported import MeeshyUI` (`MeeshyUIExports.swift`).
- `theme` (EnvironmentObject) reste utilisé pour `theme.backgroundGradient` (fond de l'écran)
  → import et injection inchangés.
- Aucun test ne référence `BookmarksView` → aucune régression de test.
- L'état chargement (`ProgressView`), la pagination et le `fullScreenCover` story sont
  **intacts**.

## Statut

**TERMINÉE** — état vide de `BookmarksView` migré vers le composant natif
`ContentUnavailableView` (via l'atome de compat SDK) : Dynamic Type complet, VoiceOver natif,
couleurs sémantiques, design system réutilisé. Ne plus re-flagger cette surface.

---

## Analyses corrigées & complètes (ne pas reproduire)

- `BookmarksView` — état vide hand-rolled (`VStack` + glyphe figé 48pt + `theme.text*`) →
  `AdaptiveContentUnavailableView` (natif `ContentUnavailableView` iOS 17+, repli iOS 16),
  clés `bookmarks.empty.title/subtitle` réutilisées (0 i18n neuf), `import MeeshyUI` explicite.
  **SOLDÉ 167i.**
