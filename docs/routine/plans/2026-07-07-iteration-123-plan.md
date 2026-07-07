# Iteration 123 — Plan d'implémentation (2026-07-07)

## Objectives
Fermer un gap privacy/consentement dans la feature d'appel : un callee répondant à un appel AUDIO-ONLY
activait quand même sa caméra et transmettait de la vidéo live, côté gateway (persistance) et web
(acquisition média réelle).

## Affected modules
- `services/gateway/src/services/CallService.ts` — `joinCallAttempt` : gate `isVideoEnabled` sur
  `call.metadata.type`, miroir de la garde déjà présente pour l'initiateur.
- `services/gateway/src/__tests__/unit/services/CallService.test.ts` — +1 test (`joinCall` describe).
- `apps/web/lib/calls/call-media-constraints.ts` — nouveau : source unique des contraintes média call
  (`AUDIO_CONSTRAINTS`, `VIDEO_CONSTRAINTS`, `getCallMediaConstraints`, `stopPreauthorizedStream`).
- `apps/web/hooks/conversations/use-video-call.ts` — refactor pour consommer la source unique (comportement
  caller inchangé).
- `apps/web/components/video-call/CallManager.tsx` — `handleAcceptCall` : pré-authorization média gated par
  `incomingCall.type` avant `call:join`, `settings.videoEnabled` dérivé (plus de `true` hardcodé), cleanup
  sur échec post-acquisition.
- `apps/web/__tests__/components/video-call/CallManager.acceptCall.test.tsx` — +3 tests + mock
  `getUserMedia`.
- `apps/web/lib/calls/__tests__/call-media-constraints.test.ts` — nouveau, 4 tests unitaires du helper.

## Implementation phases
1. **RED (gateway)** — nouveau test `joinCall` : joiner envoie `videoEnabled:true` sur un appel
   `metadata.type:'audio'`, attend `isVideoEnabled:false` persisté. Confirmé rouge (`Received value: true`)
   contre le code non patché. ✅
2. **GREEN (gateway)** — lecture `call.metadata.type` (pattern déjà établi ligne ~2065) + garde ternaire
   miroir de `initiateCall`. ✅
3. **RED (web)** — 3 nouveaux tests `CallManager.acceptCall.test.tsx` (audio→video:false, video→video:true,
   permission refusée→jamais de call:join). Confirmé rouge via patch scopé au seul diff source (tests
   inchangés, `git checkout --` des 2 fichiers source, re-run, 3/5 rouges) puis ré-application du patch. ✅
4. **GREEN (web)** — extraction du helper partagé, refactor `use-video-call.ts`, pré-authorization dans
   `handleAcceptCall` mirrorant le pattern caller existant. ✅
5. **Validation** — suites ciblées + filtrées + `tsc --noEmit` des deux services (voir analyse). ✅

## Dependencies
Aucune — changement local à `joinCallAttempt` (gateway) et au flux d'acceptation d'appel (web), aucun
changement de schéma d'event Socket.IO (le champ `type` existe déjà sur `CallInitiatedEvent`/`metadata`).

## Estimated risks
Faible. Gateway : la garde est un simple resserrement (un joiner ne peut plus mentir sur `videoEnabled`
pour un appel dont le type serveur dit `audio`) — aucun appelant légitime n'envoie `videoEnabled:true` sur
un appel audio. Web : le flux caller existant est inchangé (refactor pur, mêmes constantes) ; le flux
callee gagne un `getUserMedia` qu'il n'avait jamais avant — risque résiduel : un navigateur qui refuse la
permission bloque maintenant l'acceptation de l'appel AVANT `call:join` plutôt qu'après (comportement jugé
strictement meilleur : évite un état "in call" sans stream, testé explicitement).

## Rollback strategy
Revert du commit — diff localisé à 6 fichiers source/test + 1 nouveau fichier lib + 1 nouveau fichier test,
aucun changement de schéma persistant (le champ `metadata.type` existe déjà en prod depuis `initiateCall`).

## Validation criteria
- [x] Gateway `CallService.test.ts` : 179/179.
- [x] Gateway suite filtrée `*[Cc]all*` : 31/31 suites, 864/864 tests.
- [x] Gateway `tsc --noEmit` : 0 erreur.
- [x] Web `CallManager.acceptCall.test.tsx` : 5/5 (RED→GREEN prouvé).
- [x] Web `use-video-call.test.tsx` : 46/46 (pas de régression du refactor).
- [x] Web `lib/calls/__tests__/call-media-constraints.test.ts` : 4/4.
- [x] Web suite filtrée `*[Cc]all*|webrtc*` : 21 suites, 430 tests.
- [x] Web `tsc --noEmit` : 1535 erreurs avant/après identique (confirmé par stash scopé).
- [ ] Suite complète gateway (`bun run test:coverage`) — en cours.
- [ ] Suite complète web (`npx jest --maxWorkers=50%`) — en cours.
- [ ] Commit + push.

## Completion status
Fix + tests ciblés verts. Suites complètes en cours de validation avant commit/push.

## Progress tracking
- [x] Analyse + plan.
- [x] Tests RED puis fix GREEN (gateway + web).
- [x] Suites ciblées + filtrées vertes.
- [ ] Suites complètes (parité CI).
- [ ] Commit + push.
- [ ] Merge sur main après pull/résolution manuelle + CI verte.

## Future improvements
Inchangé (voir analyse) : items J, C6, CALL-DIAG retagging, `forceEndCall` room Socket.IO (couvert par PR
#1601 en cours), threading TTL complet, `negotiate()` guard spéculatif ; nouveau : ré-auditer le chemin
JOIN iOS pour la même classe de bug (`incomingCall.type` bien respecté par CallKit `hasVideo` à
l'initiation, non revérifié pour le join) lors d'une session avec accès Xcode/simulateur.
