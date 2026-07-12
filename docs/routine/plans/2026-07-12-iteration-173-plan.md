# Iteration 173 — Plan : reshape participant du payload REST call

## Objectif
Réparer le strip d'identité (`userId`/`user`) et d'état média
(`isMuted`/`isVideoOff`) de chaque participant sur toutes les réponses REST
`/calls*`, cause d'un crash de décodage `ActiveCallSession` côté iOS
(rejoin / crash-recovery muets).

## Modules affectés
- `packages/shared/types/api-schemas.ts` — fix enum `callSessionMinimalSchema.mode`.
- `services/gateway/src/services/CallService.ts` — nouveau `serializeCallSession()`.
- `services/gateway/src/routes/calls.ts` — appliqué aux 5 routes session-nue.
- Tests : `serializeCallSession.test.ts` (nouveau),
  `calls-active-call-analytics-leak.test.ts` (forme Prisma réaliste),
  `calls-routes.test.ts` (mock étendu).

## Phases
1. ✅ RED — test unitaire mapper (forme Prisma imbriquée) + mise à jour du test
   e2e analytics-leak.
2. ✅ GREEN — `serializeCallSession()` pur + câblage des 5 routes nues.
3. ✅ Exclure explicitement la route join (wrapper `{callSession, iceServers}`).
4. ✅ Fix schema minimal `mode`.
5. ✅ Validation : suite gateway complète + tsc + build shared.

## Risques / Rollback
- Reshape **strictement additif** → risque de régression client ≈ nul.
- Rollback : révert du commit (mapper isolé, câblage localisé).

## Critères de validation
- [x] iOS reçoit `participants[].userId` + `user` + état média sur active-call.
- [x] `analytics` jamais exposé (privacy préservée).
- [x] 528/528 suites gateway vertes.
- [x] tsc gateway propre.

## Statut
**Terminé.**

## Améliorations futures (follow-up)
- **Route join** (`POST /calls/:id/participants`) : contrat `{callSession,
  iceServers}` sérialisé par `callSessionSchema` qui le strippe → mérite un
  schema de réponse dédié (session reshapée + `iceServers`). Non traité ici
  (vérification décodeurs iOS/web join impossible en sandbox Linux).
- Aligner `callSessionSchema.status` sur les statuts réellement émis
  (`initiated`/`connecting`/`reconnecting` manquants) — cosmétique (fjs
  n'applique pas les enums en sortie).
- Envisager de faire du reshape la sortie native des méthodes service
  (retour typé wire) plutôt qu'un post-traitement route.
