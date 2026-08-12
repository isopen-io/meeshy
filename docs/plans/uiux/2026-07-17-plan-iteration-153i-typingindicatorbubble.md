# Plan — Itération 153i : Dynamic Type de `TypingIndicatorBubble`

**Date** : 2026-07-17
**Piste** : iOS (`i`)
**Branche** : `claude/laughing-thompson-yl81k3`
**Base** : `main` HEAD (`14030ae`)
**Surface** : `apps/ios/Meeshy/Features/Main/Views/MessageListViewController.swift` → `TypingIndicatorBubble`

## Objectif

Rendre le libellé « X écrit… » de l'indicateur de frappe conforme au Dynamic Type, sans toucher ni la
logique d'animation, ni l'accessibilité (déjà complète), ni le corps de bulle voisin (hors périmètre).

## Étapes

1. [x] Sync `main`, vérifier la branche de travail au HEAD, recenser les PR iOS ouvertes (0 contention sur `MessageListViewController`).
2. [x] Confirmer que la surface est fraîche (1 `.system`, 0 `relative`, 0 doctrine) et que la bulle est padding-sizée (pas de `.frame` figée).
3. [x] Migrer `.font(.system(size: 12, weight: .medium))` → `MeeshyFont.relative(12, weight: .medium)` + commentaire de doctrine.
4. [x] Rédiger l'analyse (`docs/analyses/uiux/2026-07-17-iteration-153i-typingindicatorbubble.md`).
5. [x] Mettre à jour le pointeur autoritaire (`branch-tracking.md`).
6. [ ] Commit + push sur `claude/laughing-thompson-yl81k3`.

## Risques / non-régression

- Swap 1:1 vers un helper `public` déjà importé (`MeeshyUI`) → aucun nouveau symbole/dépendance.
- Pas de `.frame` figée sur la bulle → le scaler ne clampe pas.
- A11y inchangée (`.accessibilityElement(children: .combine)` + `.accessibilityLabel(label)`).
- Points de l'animation = `Circle` décoratifs, non `.font` → figés par nature.

## Gate

CI `iOS Tests` (`xcodegen generate` → `build-for-testing` → `test-without-building`).
