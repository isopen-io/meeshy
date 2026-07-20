# Plan — Itération 142i : `FriendRequestListView` (VoiceOver-structure)

**Date** : 2026-07-15 · **Piste** : iOS (`i`) · **Base** : `main` HEAD (`424bfed`) ·
**Branche** : `claude/laughing-thompson-f7d2yn` · **Gate** : CI `iOS Tests`

## Objectif

Solder l'accessibilité VoiceOver-structurelle de l'écran « Demandes d'amis » (`FriendRequestListView`).
Surface fraîche, déjà 100 % Dynamic Type côté typographie → le travail porte uniquement sur la structure
VoiceOver (regroupement, en-tête, décor masqué). 0 logique, 0 clé i18n neuve.

## Étapes

1. **Icône d'état vide** : `person.2.slash` → `.accessibilityHidden(true)` + commentaire de gel doctrine
   (icône héros décorative ≥40pt). ✅
2. **État vide regroupé** : `VStack` de l'état vide → `.accessibilityElement(children: .combine)` (titre +
   sous-titre en une annonce). ✅
3. **En-tête** : titre d'écran → `.accessibilityAddTraits(.isHeader)`. ✅
4. **Rangée regroupée** : `VStack` textuel de la rangée → `.accessibilityElement(children: .combine)` — nom +
   pseudo + intention + ancienneté en une annonce ; boutons Accepter/Refuser laissés actionnables. ✅

## Non-régression

- 1 fichier, 0 logique, 0 test neuf, 0 clé i18n neuve.
- Aucun test ne référence `FriendRequestListView`.
- Boutons d'action déjà labellisés → intacts ; palette déjà tokenisée → non touchée.

## Vérification

- `grep '.accessibilityElement(children: .combine)'` → 2 occurrences (état vide + rangée).
- `grep '.accessibilityAddTraits(.isHeader)'` → 1 occurrence (titre).
- `grep '.accessibilityHidden(true)'` → présent sur l'icône d'état vide.
- Gate : CI `iOS Tests` (XcodeGen regenerate + build + suites).

## Statut

**TERMINÉE** — poussée sur `claude/laughing-thompson-f7d2yn`, PR à venir.
