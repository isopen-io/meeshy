# Plan — Iteration 84i (2026-07-01) — iOS Dynamic Type + a11y `EditProfileView`

## Objectif
Rendre `EditProfileView` (écran d'édition du profil) conforme Dynamic Type et combler un trou
VoiceOver, sans changement de comportement ni de layout à taille par défaut.

## Base de départ
`main` HEAD `7f727821` (resync avant démarrage ; branche `claude/upbeat-euler-qtlh54`).
Dernières itérations iOS mergées récentes = 77i (`SharePickerView`), lot 78i palette.
`79i`→`83i` pris par agents parallèles → ce lot = **`84i`** (anti-collision de label).

## Étapes
1. [x] Sélectionner une surface iOS non prise (vérif `list_pull_requests`) → `EditProfileView`
   (21 `.font(.system(size:))` figés, écran cœur, aucune PR ouverte).
2. [x] Confirmer `MeeshyFont.relative` en scope (`import MeeshyUI`) + précédent d'usage app.
3. [x] Migrer 19 fonts texte/glyphe-inline → `MeeshyFont.relative(size, weight:, design:)`
   (weight/design préservés 1:1).
4. [x] Garder figés 2 glyphes (badge `camera.fill` cadre-fixe 30×30 ; héros `checkmark` 48pt)
   avec commentaire d'exception.
5. [x] Ajouter `.accessibilityLabel` sur le `PhotosPicker` image-only (`profile.edit.change_photo`,
   defaultValue EN — cohérent avec les autres clés hors-catalogue du fichier).
6. [x] Grep de contrôle : seules 2 `.system(size:)` restent (lignes 125 & 319, commentées).
7. [x] Rédiger analyse + plan `84i`.
8. [ ] Commit + push ; gate = CI `ios-tests.yml` (compile Xcode 26.1 + tests simu 18.2).
9. [ ] Ouvrir PR ; merge dans `main` après CI verte ; supprimer la branche ; MàJ branch-tracking.

## Risques / points d'attention
- **Mapping conservateur** : `MeeshyFont.relative` mappe vers le `TextStyle` dont la taille par
  défaut est la plus proche → rendu par défaut ~identique, seul le scaling utilisateur change.
- **Cadres fixes 28×28** des tuiles d'icônes (`editableField`/`readOnlyRow`/bio) : les glyphes
  14pt scalent dans une tuile figée ; croissance modérée acceptable (doctrine 71i), pas de débord
  à taille par défaut. Les badges à cadre serré (30×30) sont, eux, gardés figés.
- **Pas de snapshot** couvrant `EditProfileView` (infra limitée à Timeline) → aucun risque baseline.
- SwiftUI ne compile pas sous Linux → validation = CI iOS.
