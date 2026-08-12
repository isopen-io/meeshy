# Iteration-176i — `AddParticipantSheet` : états vides natifs (HIG + dédup design-system)

**Date** : 2026-07-20
**Piste** : iOS (suffixe `i`)
**Fichier** : `apps/ios/Meeshy/Features/Main/Components/AddParticipantSheet.swift`
**Type** : HIG native adoption + dédup design-system + Dynamic Type (état vide)
**Base** : `main` HEAD (`9c27504`)

## Contexte

`AddParticipantSheet` est la feuille de recherche/ajout de membres à une conversation.
Elle expose deux **états non-contenu** rendus par des `VStack` custom (glyphe SF Symbol
`.system(size: 32, weight: .light)` figé + `Text`) :

1. `searchPrompt` — état initial (query < 2 caractères) : « Recherchez par nom ou @pseudo »
   (`person.badge.plus`).
2. `emptyResults` — recherche sans résultat : « Aucun utilisateur trouvé » (`person.slash`).

Ces deux blocs sont des **réimplémentations manuelles** de ce que fournit déjà le composant
design-system `AdaptiveContentUnavailableView`
(`packages/MeeshySDK/Sources/MeeshyUI/Compatibility/AdaptiveContentUnavailableView.swift`) :
le `ContentUnavailableView` natif iOS 17+, avec fallback fidèle iOS 16.

Ce composant est **déjà adopté** ailleurs dans l'app (`FeedView`, `StarredMessagesView` — soldé
175i, `CreateShareLinkView`). La présente itération poursuit la piste « 176i+ » du pointeur :
> *traquer d'autres états vides custom réimplémentant `ContentUnavailableView`*.

## Lacunes réelles

| # | Lacune | Impact |
|---|--------|--------|
| 1 | `searchPrompt`/`emptyResults` = `VStack` custom (icône + `Text`) | Duplication du design-system ; incohérence visuelle avec les autres états vides natifs de l'app |
| 2 | Glyphe `.font(.system(size: 32))` **figé** ×2 | L'icône d'état vide ne suit pas Dynamic Type (le natif `ContentUnavailableView` la fait scaler) |
| 3 | Typographie custom (`MeeshyFont.relative(14)`) hors barème HIG | Le natif applique `title3`/`callout` sémantiques cohérents |
| 4 | Regroupement VoiceOver via `.accessibilityElement(children: .combine)` manuel | Le natif fournit le regroupement titre+description d'office |

## Décision

Remplacer les deux `VStack` custom par `AdaptiveContentUnavailableView(title, systemImage:)`,
en **réutilisant les clés i18n existantes** (`participants.add.prompt`,
`participants.add.no-results`) → **0 clé i18n neuve**, parité exacte avec 175i.

- **HIG** : adoption du composant natif `ContentUnavailableView` (iOS 17+) / fallback iOS 16.
- **Dédup** : suppression de 2 réimplémentations d'état vide.
- **Dynamic Type** : suppression des 2 `.system(size: 32)` figés — l'icône native scale.
- **VoiceOver** : regroupement titre natif d'office (les glyphes restent hors-focus).
- Un léger `.padding(.top, 40)` conserve l'aération sous le champ de recherche (les états
  étaient auparavant à `.padding(.top, 60)`).

## Hors-scope (laissé intentionnellement)

- Le glyphe chrome `xmark` 28×28 du header (`.system(size: 10)`) reste **figé** (doctrine 82i/87i).
- La logique de recherche/ajout, le skeleton, le champ de recherche, les rangées `userRow`,
  la palette et les haptics → **inchangés**.
- Migration vers `.searchable` natif : refactor plus large, hors-scope de cette itération.

## Vérification

- `MeeshyUI` déjà importé dans le fichier (ligne 5).
- Aucun test ne référence `searchPrompt`/`emptyResults` (propriétés `private`).
- 1 fichier, 0 logique / 0 réseau / 0 clé i18n neuve / 0 test neuf.
- Gate = CI `iOS Tests`.

## Statut

✅ **Résolu** — états vides migrés vers `AdaptiveContentUnavailableView`.
Restant : `AddParticipantSheet` a désormais un seul `.system(size:)` (xmark chrome, figé à
dessein). Ne plus re-flagger ce fichier pour état vide / Dynamic Type d'icône d'état.
