# Plan — Itération 75i (2026-06-30) — iOS

## Objectif
Dynamic Type / accessibilité (4y11) de `VoiceProfileManageView` — écran de gestion du
profil vocal entièrement composé de texte de lecture. Un seul fichier de production, sweep
typographique mécanique, borné, épuré, disjoint des PR iOS en vol (71i–74i).

## Base
`main` HEAD (resync avant de commencer). Branche `claude/upbeat-euler-nbbwqv`.

## Changements
`apps/ios/Meeshy/Features/Main/Views/VoiceProfileManageView.swift`
- **28** `.font(.system(size: X, …))` → `.font(MeeshyFont.relative(X, weight:, design:))`
  (weight + design préservés, dont `.monospaced`/`.rounded`). Tout le texte de lecture +
  glyphes inline accolés à un libellé.
- **3 sites gardés figés** : `xmark.circle.fill` (28, chrome fermeture),
  `person.wave.2.fill` (64, illustration état vide), icône sémaphore de statut (28, ancre
  fixe de rangée).
- `import MeeshyUI` déjà présent — aucune dépendance ajoutée.

## Hors-scope (différé)
- Les 3 sites figés.
- Littéraux FR non localisés `statusLabel`/`statusDescription` (classe i18n distincte).

## Vérification
- Pas de nouveau test (sweep pur ; parité 55i/71i/72i/74i).
- Gate = CI `iOS Tests` (compile Xcode 26.1.x + tests simu 18.2).
- Pas de build SwiftUI local (Linux).

## Merge
Après CI verte : merge dans `main`, supprimer la branche, mettre à jour `branch-tracking.md`.

## Statut : ⏳ push + CI → merge main
