# Plan d'implémentation — Iteration 181

## Objectifs
Normaliser (BCP-47, via SSOT `normalizeLanguageCode`) le dernier site
d'agrégation de codes langue non branché : la stat publique `spokenLanguages` /
`languageCount` du preview de share-link anonyme. Éliminer le gonflement du
compteur et la fuite de codes région bruts (`'pt-br'`) dans une réponse publique.

## Modules affectés
- `packages/shared/utils/conversation-helpers.ts` — nouveau helper pur
  `computeSpokenLanguages` (+ type `SpokenLanguageParticipant`).
- `packages/shared/__tests__/conversation-helpers.test.ts` — +7 tests.
- `services/gateway/src/routes/anonymous.ts` — remplace le bloc inline par
  l'appel au helper (import ajouté).

## Phases
1. **RED** — écrire les 7 tests `computeSpokenLanguages` (dédup variante région,
   codes catalogue-résolubles, anonyme normalisé, participants vides, liste mixte,
   liste vide).
2. **GREEN** — implémenter `computeSpokenLanguages` (membre →
   `resolveUserLanguagesOrdered`, anonyme → `normalizeLanguageCode` fallback).
3. **WIRE** — brancher `anonymous.ts` sur le helper ; build shared ; régénérer le
   client Prisma ; `tsc --noEmit` gateway.
4. **VALIDATE** — suite shared complète, exit code tsc gateway.

## Dépendances
- `resolveUserLanguagesOrdered` + `normalizeLanguageCode` (déjà présents/testés).
- Client Prisma généré pour le typecheck gateway.

## Risques estimés
Très faibles. Type de retour et forme de réponse inchangés ; seule évolution =
effondrement des variantes région (strictement une correction). Aucune requête DB
modifiée.

## Stratégie de rollback
Revert du commit unique — helper isolé + une substitution mécanique gateway.

## Critères de validation
- shared : 46 fichiers / 1371 tests verts (7 nouveaux).
- gateway : `tsc --noEmit` exit 0.
- `computeSpokenLanguages` présent dans `dist/`.

## Statut d'achèvement
**COMPLET** — helper implémenté + testé, gateway rebranché, validations vertes.

## Suivi de progression
- [x] RED (7 tests)
- [x] GREEN (`computeSpokenLanguages`)
- [x] WIRE (`anonymous.ts`)
- [x] VALIDATE (shared 1371 verts, gateway tsc 0)
- [x] Docs analyse + plan

## Améliorations futures
Voir la section « Backlog » de l'analyse 181 (Candidats 2/3/4, F69).
