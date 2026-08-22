# Plan — Itération 245 : tri par colonne des couloirs vivants de la Rivière

## Objectifs

Faire respecter à `resolveRiverLivingLanes` son contrat affiché (« par colonne
croissante ») sur les deux plateformes, pour que la navigation latérale
(`resolveRiverStep`) atteigne le voisin de colonne le plus proche sans enjamber
de couloir vivant en partage de colonnes.

## Modules affectés

- `packages/shared/utils/river-lanes.ts` — SSOT (`resolveRiverLivingLanes`).
- `apps/ios/Meeshy/Features/Main/Riviere/Core/RiverLaneResolver.swift` — miroir.
- `packages/shared/__tests__/river-lanes.test.ts` — tests unitaires.
- `packages/shared/fixtures/reading-modes/river-step.vectors.json` — vecteurs
  inter-plateformes.

## Phases d'implémentation

1. **RED** — nouveau `describe('partage de colonnes …')` avec décor 9 voix /
   2 vagues, assertions ordre + pas latéral. Prouvé rouge.
2. **GREEN (TS)** — `.sort((a, b) => a - b)` sur la sortie du résolveur.
3. **Miroir Swift** — `.sorted()` + docstring corrigé (cesser de documenter le
   défaut comme intentionnel).
4. **Vecteurs** — deux cas `colonne-partagee-*` générés en exécutant la loi
   corrigée, ajoutés au JSON (iOS les rejoue).
5. **Validation** — suites river + suite `shared` complète.

## Dépendances

Aucune. Fonction pure, sans I/O.

## Risques estimés

Faible. Tri numérique stable au seul point de lecture. Zéro vecteur existant
modifié (vérifié). Géométrie inchangée.

## Stratégie de rollback

Revert du commit : les quatre fichiers reviennent à l'état `main`, sans effet de
bord (dist non committé, régénéré par la CI).

## Critères de validation

- 3 tests TS RED→GREEN.
- `river-lanes.test.ts` (82), vecteurs `river-step` (22) / `river-lanes` (24) /
  `river-headers` (15) verts.
- `packages/shared` : 2434 tests verts.

## Statut de complétion

**COMPLÉTÉ.** TS + iOS + tests + vecteurs livrés et validés côté TypeScript.
iOS non compilable dans cet environnement — correctif = miroir strict d'un
`sort` d'une ligne, tenu par le vecteur `river-step` rejoué par
`RiverLaneVectorTests`.

## Suivi des progrès

- [x] RED prouvé.
- [x] Fix TS.
- [x] Fix Swift + docstring.
- [x] Vecteurs inter-plateformes.
- [x] Suite shared complète verte.

## Améliorations futures (hors périmètre)

**Réveiller le sous-arbre de tests DMA/Signal** (exclu de jest via
`testPathIgnorePatterns` et de tsc via `exclude`), et corriger le défaut de
correction de `DoubleRatchet.skipMessageKeys` (ne met pas à jour
`messageNumberReceive` après un message out-of-order → désync compteur/chaîne,
câblé en production `SignalProtocolEngine.ts:432`). Lot E2EE à part entière —
détaillé dans `docs/routine/analyses/2026-08-22-iteration-245-analyse.md` §
Remaining work.
