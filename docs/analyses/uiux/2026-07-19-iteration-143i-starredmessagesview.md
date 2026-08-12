# Itération 143i — Analyse UI/UX iOS : `StarredMessagesView` (état vide → composant natif)

**Date** : 2026-07-19
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Views/StarredMessagesView.swift`
**Base** : `main` HEAD (`efedb69e4`)
**Branche** : `claude/laughing-thompson-rrt0o4`
**Gate** : CI `iOS Tests`

## Contexte

`StarredMessagesView` est l'écran plein des messages favoris (miroir « Starred Messages » de WhatsApp).
La surface est déjà solide côté VoiceOver-structure des rangées (`.accessibilityElement(children: .combine)`
+ `.isButton` + `.accessibilityHint` + `.accessibilityAction`) et Dynamic Type (typographie via
`MeeshyFont.relative`). Le seul reliquat non-natif était l'**état vide hand-rollé** : un `VStack` de 15 lignes
(icône `star.circle` `.font(.system(size: 56))` + titre `MeeshyFont.relative(17)` + sous-titre
`MeeshyFont.relative(13)` avec `padding(.horizontal, 40)` + `.accessibilityHidden` manuel sur l'icône).

Le codebase fournit **déjà** le composant design-system natif-first `AdaptiveContentUnavailableView`
(`packages/MeeshySDK/Sources/MeeshyUI/Compatibility/AdaptiveContentUnavailableView.swift`) : il rend le vrai
`ContentUnavailableView` d'Apple sur iOS 17+ (composant HIG canonique pour les états vides) et une
reproduction fidèle sur iOS 16. Il est **déjà adopté** par `FeedView` et `CreateShareLinkView`.

## Constat (avant 143i)

1. **État vide réinventé** — 15 lignes de `VStack` custom là où Apple fournit `ContentUnavailableView`.
   Violation directe de l'objectif mission « Minimize custom implementations when an Apple component already
   solves the problem ».
2. **Incohérence inter-écrans** — `FeedView`/`CreateShareLinkView` utilisent le composant natif, pas les
   écrans de contenu sauvegardé. Deux traitements visuels d'état vide coexistent dans l'app.
3. **Typographie/centrage manuels** — tailles de police et `padding` codés en dur, là où le composant natif
   gère automatiquement Dynamic Type, le centrage vertical/horizontal, le style large-content iOS 17+, et
   l'accessibilité (`children: .combine`).

## Correction appliquée (1 fichier, 0 logique)

- **État vide** : `VStack` custom (icône + titre + sous-titre) → `AdaptiveContentUnavailableView(title,
  systemImage: "star.circle", description:)`. L'icône `star.circle` et les libellés sont **inchangés**
  (mêmes clés i18n `starred.messages.empty.title` / `.subtitle`). Le composant est centré par le `ZStack`
  englobant existant (`theme.backgroundPrimary` en fond).
- **Gains** : −15 lignes de code custom ; adoption du composant natif Apple (`ContentUnavailableView`) sur
  iOS 17+ ; Dynamic Type + VoiceOver + centrage + style large-content gérés nativement ; parité visuelle avec
  `FeedView`/`CreateShareLinkView` ; adaptation multi-version iOS via le wrapper (fallback iOS 16 intégré).

Aucune police modifiée manuellement (déléguée au composant). **0 clé i18n neuve** (réutilise les clés
existantes). `import MeeshyUI` déjà présent (fournit aussi `MeeshyFont`/`MeeshyColors` toujours utilisés dans
`StarredRow`).

## Périmètre / non-régression

- **1 seul fichier**, 0 logique, 0 mutation d'état, 0 test neuf, 0 clé i18n neuve. `StarredMessagesStore`,
  la navigation (`navigate(to:)`), le `contextMenu`, la toolbar « Tout retirer » et `StarredRow` ne sont
  **pas** touchés.
- Aucun test ne référence `StarredMessagesView` → aucune régression de test.
- Le chemin peuplé (liste des snapshots) est **intact** — seule la branche `store.snapshots.isEmpty` change.

## Statut

**TERMINÉE** — état vide de `StarredMessagesView` soldé côté natif : `AdaptiveContentUnavailableView`
(ContentUnavailableView iOS 17+ / fallback iOS 16), cohérent avec `FeedView`/`CreateShareLinkView`. Ne plus
re-flagger cet état vide.

---

## Analyses corrigées & complètes (ne pas reproduire)

- `StarredMessagesView` — VoiceOver-structure des rangées déjà posée (itérations antérieures) ; état vide
  migré vers le composant natif design-system `AdaptiveContentUnavailableView`. **SOLDÉ 143i.**

## Candidats frais suivants (144i)

- **`BookmarksView`** — état vide hand-rollé similaire (`VStack` icône + titre + sous-titre, `.padding(.top,
  80)` non centré verticalement). Migration vers `AdaptiveContentUnavailableView` recommandée MAIS l'état
  vide y est dans un `ScrollView > LazyVStack` (avec `.refreshable`) → nécessite un soin de centrage vertical
  (GeometryReader / minHeight viewport) au lieu du simple `ZStack` de `StarredMessagesView`. Iteration
  dédiée.
- `SupportView`, `UserStatsView` — déjà denses en a11y (isHeader, combine, hidden). Vérifier avant reprise.
