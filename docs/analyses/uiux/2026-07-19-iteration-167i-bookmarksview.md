# Itération 167i — Analyse UI/UX iOS : `BookmarksView` (VoiceOver de l'état vide)

**Date** : 2026-07-19
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Views/BookmarksView.swift` (`emptyState`)
**Base** : `main` HEAD (`efedb69e4`)
**Branche** : `claude/laughing-thompson-v1pxwv`
**Gate** : CI `iOS Tests`
**Catégorie** : Accessibilité — VoiceOver (regroupement de l'état vide)

## Contexte

`BookmarksView` est l'écran « Favoris » (liste des posts sauvegardés). La liste elle-même est
composée de `FeedPostCard` — un composant **déjà traité** (128i) qui porte sa propre sémantique
VoiceOver. La **seule surface propre** à `BookmarksView` est son `emptyState` (état « Aucun favori »).

La typographie de cet écran est **déjà sémantique** (`.body.weight(.semibold)`, `.subheadline`)
→ **0 conversion Dynamic Type**. Le seul `.font(.system(size: 48))` est le **glyphe héros
décoratif** `bookmark` (≥40pt, gelé par doctrine 84i) et il porte **déjà** `.accessibilityHidden(true)`.

Numéro **167i** : strictement au-dessus du plus haut en vol (166i = `MessageTranscriptionDetailView`,
PR #2030 ; 165i = `StatsTimelineChart`, PR #2028). `BookmarksView` n'est ciblée par **aucune PR
ouverte** au run (vérifié via `list_pull_requests`) → 0 contention.

## Constat (avant 167i)

L'état vide (`emptyState`) est un `VStack` de trois éléments :
1. `Image(systemName: "bookmark")` — décoratif, **déjà masqué** (`.accessibilityHidden(true)`) ;
2. `Text("Aucun favori")` — titre ;
3. `Text("Les posts que vous sauvegardez apparaitront ici")` — sous-titre.

Sans regroupement, VoiceOver posait **deux arrêts** distincts (titre puis sous-titre), fragmentant
un message unique — l'état vide se lit mieux en une seule annonce. C'est exactement le déficit
soldé sur les états vides frères (142i `FriendRequestListView`).

## Correction appliquée (1 fichier, 0 logique, 0 changement visuel)

- **`emptyState` → 1 élément VoiceOver** : `.accessibilityElement(children: .combine)` sur le
  `VStack`. Le glyphe restant `.accessibilityHidden(true)` → `combine` fusionne les deux `Text` en
  une annonce : *« Aucun favori, Les posts que vous sauvegardez apparaitront ici »*.

Aucun changement de layout, de couleur, de copie visible. Les libellés (`bookmarks.empty.title`,
`bookmarks.empty.subtitle`) sont **déjà localisés** (code-only via `defaultValue`) et **réutilisés
tels quels** → **0 clé i18n neuve**, 0 édition xcstrings.

## Test (1 fichier neuf)

`MeeshyTests/Unit/Views/BookmarksViewAccessibilityTests.swift` — garde source-level (même pattern
que `CallDetailSheetAccessibilityTests` / `ConversationDashboardViewAccessibilityTests`) :
- `test_emptyState_hidesDecorativeHeroIconFromVoiceOver` — assert `.accessibilityHidden(true)` dans
  `emptyState` (verrouille le masquage du glyphe héros).
- `test_emptyState_combinesTitleAndSubtitleIntoSingleAccessibilityElement` — assert
  `.accessibilityElement(children: .combine)`.

**Phasage** : le nom `BookmarksViewAccessibilityTests` matche le token `Bookmark` de
`FINAL_PHASE_CLASS_PATTERN` → **phase 2**. Sans impact : la suite est une **lecture source pure**
(aucune mutation d'état persistant, aucun login/logout) → inoffensive quelle que soit la phase.

## Périmètre / non-régression

- **1 fichier prod + 1 fichier test**, 0 logique métier, 0 mutation d'état, 0 clé i18n neuve,
  0 changement visuel. `MeeshySDK` déjà importé.
- Glyphe héros décoratif (48pt) déjà gelé + masqué (doctrine 84i) — non touché.
- Les rangées `FeedPostCard` (128i) et le `ProgressView` de pagination natif ne sont pas touchés.
- Aucun test existant ne référence `BookmarksView` (le `BookmarksViewModelTests` teste le ViewModel,
  pas la vue) → aucune régression.

## Statut

**TERMINÉE** — état vide de `BookmarksView` désormais un élément VoiceOver unique (titre + sous-titre
en une annonce, glyphe héros masqué). Ne plus re-flagger cette surface pour VoiceOver ni Dynamic Type.

---

## Analyses corrigées & complètes (ne pas reproduire)

- `BookmarksView` — typographie déjà sémantique (Dynamic Type soldé implicitement) ; glyphe héros
  décoratif gelé+masqué (84i). **167i** : `emptyState` regroupé en un élément VoiceOver
  (`children: .combine`, glyphe déjà `.accessibilityHidden(true)`). **SOLDÉ.**
