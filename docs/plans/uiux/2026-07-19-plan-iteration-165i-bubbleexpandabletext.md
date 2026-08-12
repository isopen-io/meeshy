# Plan Itération 165i — `BubbleExpandableText` Dynamic Type

**Date** : 2026-07-19 · **Piste** : iOS (`i`) · **Branche** : `claude/laughing-thompson-6vvox5`
**Base** : `main` HEAD `efedb69` · **Gate** : CI `iOS Tests`

## Objectif

Migrer le seul `.font(.system(size:))` résiduel du composant cœur `BubbleExpandableText` (bouton « Voir
plus » de dépliage de bulle) vers `MeeshyFont.relative` pour respecter Dynamic Type, sans toucher la
logique de troncature ni l'accessibilité (déjà en place).

## Étapes

1. **RED/constat** : `grep .font(.system(size:` → 1 occurrence ligne 80 (`Text("Voir plus")`, 12 semibold),
   surface fraîche (0 `relative`, 0 doctrine). Vérifier `import MeeshyUI` présent (oui, ligne 3).
2. **Vérifier absence de gel** : cellule `minHeight: 24` = hauteur minimale (pas dimension fixe) → migrer,
   pas figer. Cible tactile 44pt portée par `contentShape` (indépendant de la police).
3. **Vérifier tests** : `BubbleExpandableTextLayoutTests` n'assert que `truncateLimit` → pas de collision.
4. **GREEN** : swap `.font(.system(size: 12, weight: .semibold))` →
   `.font(MeeshyFont.relative(12, weight: .semibold))` (1 ligne).
5. **Docs** : analyse + ce plan + entrée `branch-tracking.md`.
6. **Commit + push** sur la branche de travail. Gate = CI `iOS Tests`.

## Non-objectifs

- Ne PAS toucher `MessageTextRenderer` (renderer séparé, `fontSize: 15`, hors périmètre).
- Ne PAS modifier la logique (`exceeds`/`truncateAtWord`/`isExpanded`/`Equatable`).
- Ne PAS ajouter de clé i18n (déjà `String(localized:)`) ni de test neuf.

## Risque

Minimal : 1 ligne cosmétique, 0 logique, aucun test n'assert sur la police.
