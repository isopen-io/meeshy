# Plan — Itération 90i (2026-07-01) — iOS Dynamic Type + a11y `DataExportView`

## Objectif
Rendre l'écran d'export de données RGPD (`DataExportView.swift`) conforme Dynamic Type et
VoiceOver, sans changer le layout par défaut, la logique ni la palette.

## Base
- Branche : `claude/upbeat-euler-ojxbs8` resync sur `main` HEAD (`c8063196`).
- Numéro : `90i` (88i/89i déjà mergés par agents parallèles → prochain libre).

## Étapes
1. [x] Resync branche sur `origin/main`, vérifier 0 PR ouverte (aucune contention).
2. [x] Migrer 16/17 `.font(.system(size:))` → `MeeshyFont.relative(...)` (weight/design préservés).
3. [x] Garder 1 glyphe figé (badge fixe 28×28 `toggleRow`) + commentaire doctrine 86i.
4. [x] VoiceOver : masquer 4 glyphes décoratifs, combiner carte/bannière/en-tête, `.isHeader`
       sur `sectionHeader`, état `.isSelected` + label sur boutons format JSON/CSV.
5. [x] Vérifier `grep` : 1 figé restant, 16 `MeeshyFont.relative`.
6. [ ] Commit + push sur la branche.
7. [ ] Ouvrir PR, attendre CI `ios-tests.yml` verte.
8. [ ] Merger dans `main`, supprimer la branche, mettre à jour `branch-tracking.md`.

## Invariants
- 1 fichier touché, 0 clé i18n neuve, 0 test neuf, 0 changement de logique.
- SDK non touché (`MeeshyFont.relative` déjà en scope via `import MeeshyUI`).

## Gate
CI `ios-tests.yml` (compile Xcode 26.1 + tests simu 18.2) — SwiftUI ne compile pas sous Linux.
