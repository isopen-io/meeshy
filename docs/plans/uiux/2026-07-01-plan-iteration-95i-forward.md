# Plan — Iteration 95i (2026-07-01) — ForwardPickerSheet

## Objectif
iOS exclusivement. Rendre `ForwardPickerSheet` (feuille « Forward ») compatible Dynamic Type :
migrer 7/8 `.font(.system(size:))` → `MeeshyFont.relative(...)`, garder figé le héros décoratif 40pt
(+ `.accessibilityHidden`), et aligner la colonne d'envoi (paperplane scale comme le checkmark
`.title2` déjà scalable).

## Base de départ
`main` HEAD (`6b8abcbb`, post-94i #1243). Branche `claude/upbeat-euler-512kep` resync sur `origin/main`.

## Contexte de contention
Essaim iOS dense (doublons de PR). `ForwardPickerSheet` = hors-radar (0 PR, 0 mention). Continuité
thématique avec 94i (`SharePickerView`, famille partage/transfert).

## Étapes
1. [x] Resync sur `main` (inclut 94i), `list_pull_requests` → surface hors-radar.
2. [x] Lire `ForwardPickerSheet`, confirmer 8 sites + accès transitif `MeeshyFont` (via `MeeshyColors`).
3. [x] Migrer 7 sites (état vide, bannière, ligne de conv, bouton envoi).
4. [x] Garder figé héros 40pt + commentaire + `.accessibilityHidden`.
5. [x] Vérifier : 7 `relative` + 1 `.system(size:)` figé (+ checkmark `.title2` intact) = cohérent.
6. [x] Docs analyse + plan (`-95i-forward`) + `branch-tracking.md`.
7. [ ] Commit + push `claude/upbeat-euler-512kep`.
8. [ ] PR, attendre CI `iOS Tests` verte.
9. [ ] Merger dans `main`, supprimer la branche mergée.

## Contraintes respectées
- 1 fichier de production, 0 logique, 0 clé i18n, 0 test neuf, 0 import ajouté (transitivité).
- Palette + layout par défaut inchangés → zéro régression à `.large`.

## Gate
CI `ios-tests.yml` (compile Xcode 26.1.x + tests simulateur iOS 18.2). Merge après CI verte.
