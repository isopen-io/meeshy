# Plan Itération 148i — `StoryViewerContainer` (a11y VoiceOver état d'erreur)

**Date** : 2026-07-16 · **Piste** : iOS (`i`) · **Branche** : `claude/laughing-thompson-ogqlku`
**Base** : `main` HEAD `e19c523` · **Gate** : CI `iOS Tests`

## Objectif
Combler 2 lacunes VoiceOver réelles sur les overlays plein écran du viewer de stories
(`loadingOverlay` + `notFoundOverlay`), sans toucher la logique ni le rendu visuel.

## Périmètre (1 fichier)
`apps/ios/Meeshy/Features/Main/Views/StoryViewerContainer.swift`

## Étapes
1. `closeButton` (partagé par les 2 overlays) : ajouter `.accessibilityLabel(common.close)` sur
   la croix `xmark` icône-only (auparavant sans nom VoiceOver) + commenter le gel du glyphe
   16pt dans son cadre de tap fixe 32×32 (doctrine 82i).
2. `notFoundOverlay` : ajouter `.accessibilityHidden(true)` sur le glyphe hero d'erreur
   `exclamationmark.circle` (décoratif, sens porté par le titre) + commenter le gel (doctrine
   84i/86i).

## Contraintes respectées
- **0 clé i18n neuve** : `common.close` déjà présente dans le fichier → réutilisée.
- **0 police visible modifiée** : les 2 `.system(size:)` restent figées (gels doctrinés).
- **0 logique / 0 test neuf / 1 fichier**. Additif pur (2 modificateurs a11y + 2 commentaires).

## Vérification
- CI `iOS Tests` (compile + snapshots inchangés puisque zéro changement de layout/police).
- Contrôle manuel VoiceOver : croix annoncée « Fermer » ; hero d'erreur retiré du focus.

## Sync
- Base : `main` HEAD `e19c523`. Branche repartie propre depuis `origin/main`.
- Highest iOS en vol au run : 147i (#1980 StatsTimelineChart) → ce lot = **148i**.
- Cibles claimées à ne pas dupliquer : 140i–147i (voir analyse).
