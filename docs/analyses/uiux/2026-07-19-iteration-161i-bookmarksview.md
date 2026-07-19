# Itération 161i — Analyse UI/UX iOS : `BookmarksView`

**Date** : 2026-07-19
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Views/BookmarksView.swift`
**Base** : `main` HEAD (main HEAD)
**Branche** : `claude/laughing-thompson-f7d2yn`
**Gate** : CI `iOS Tests`

## Contexte

`BookmarksView` est l'écran « Favoris » (liste de `FeedPostCard` bookmarkées, pull-to-refresh, pagination).
Surface **fraîche**. Typographie déjà entièrement Dynamic Type (`.body/.subheadline`), en-tête natif
(`.navigationTitle`), rangées = `FeedPostCard` (déjà soldée 128i). Le seul reliquat est l'**état vide**.

## Constat (avant 161i)

- **État vide non regroupé pour VoiceOver** : le `VStack` (icône `bookmark` déjà `.accessibilityHidden`,
  titre, sous-titre) expose titre + sous-titre en deux focus séparés. L'icône héros décorative (48pt) était
  masquée mais sans commentaire de gel doctrine explicitant qu'elle reste figée (≥40pt).

## Corrections appliquées (1 fichier, 0 logique)

- **État vide regroupé** : `VStack` → `.accessibilityElement(children: .combine)` → titre + sous-titre lus
  en une seule annonce cohérente (parité 142i `FriendRequestListView`).
- **Icône héros** : commentaire de gel doctrine ajouté (décorative ≥40pt, déjà `.accessibilityHidden(true)`).

Aucune police modifiée (déjà sémantique / figée par doctrine). **0 clé i18n neuve**.

## Périmètre / non-régression

- **1 seul fichier**, 0 logique, 0 mutation d'état, 0 test neuf, 0 clé i18n neuve.
- `BookmarksViewModel`, `FeedPostCard`, la navigation story non touchés.
- Aucun test ne référence `BookmarksView`.

## Statut

**TERMINÉE** — `BookmarksView` soldée (état vide regroupé + icône figée commentée). Ne plus re-flagger.

---

## Note de piste — tarissement du filon a11y-structure

161i confirme le **tarissement** du filon a11y-structure sur les écrans frais. Vérifié cette itération, les
candidats restants sont **déjà state-of-the-art** :
- `StarredMessagesView` : rangée déjà `children: .combine` + `.isButton` + `.accessibilityHint` +
  `.accessibilityAction` ; état vide icône masquée ; toolbar labellisée. **RIEN à faire.**
- `SupportView` (`fieldIcon`) : glyphe 14pt déjà figé-commenté (badge 28×28) + `.accessibilityHidden`.
- `UserStatsView` (`statCard`) : glyphe 20pt déjà figé-commenté (chip 36×36) + `.accessibilityHidden`.

**Conclusion** : le double filon (Dynamic Type + a11y-structure sur écrans isolés) est quasi épuisé. Les
itérations suivantes doivent basculer sur des passes **state-of-the-art plus larges** : composants natifs
(swipe actions, `ShareLink`, `ContentUnavailableView` iOS 17+ pour unifier les états vides), design-system
(extraction d'un composant `EmptyStateView` réutilisable — les états vides icône+titre+sous-titre sont
dupliqués à l'identique dans `BookmarksView`, `FriendRequestListView`, `StarredMessagesView`, etc.), et HIG.

## Analyses corrigées & complètes (ne pas reproduire)

- `BookmarksView` — typographie déjà Dynamic Type ; en-tête natif `.navigationTitle` ; rangées `FeedPostCard`
  (128i) ; état vide regroupé (`children: .combine`) + icône héros figée commentée + masquée. **SOLDÉ 161i.**
