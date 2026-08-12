# Plan — Itération 82i (iOS Dynamic Type `AudioFullscreenView`)

**Base** : `main` HEAD (post-78i #1162 i18n SharePicker / #ceba09 palette).
**Branche** : `claude/upbeat-euler-l50chc`.
**Gate** : CI `iOS Tests` (ios-tests.yml).

## Objectif
Rendre le lecteur audio plein écran accessible à Dynamic Type : migrer les
sites texte-de-lecture `.font(.system(size:))` → `MeeshyFont.relative`, figer
les glyphes de contrôle/emoji.

## Étapes
1. [x] Vérifier anti-collision (`list_pull_requests`) — `AudioFullscreenView`
   hors de toute PR ouverte.
2. [x] Classer les 26 sites (13 migrés texte / 13 figés glyphes+emoji).
3. [x] Swap `MeeshyFont.relative(size, weight:, design:)` (poids/design préservés).
4. [x] Vérifier compteurs (13/13) + préservation monospaced.
5. [ ] Commit + push + PR ; attendre CI verte.
6. [ ] Merge dans `main`, supprimer la branche, mettre à jour `branch-tracking.md`.

## Non-objectifs
- Aucune modification de logique de lecture / seek / transcription / Prisme.
- Aucun changement de couleur, layout, i18n (déjà localisé).
- Pas de nouveau test (sweep typographique pur).
