# Iteration 124 — Plan d'implémentation (2026-07-07)

## Objectives
Pas de nouveau bug ciblé cette session : à l'ouverture, 4 PR calling déjà ouvertes (#1597, #1601, #1606,
#1610), toutes issues de sessions routine précédentes, toutes vertes en CI mais non mergées. Objectif de
cette itération : driver le backlog de PR ouvertes jusqu'à `main` plutôt que d'empiler une 5e PR — clôture
manuelle, sans écraser de travail concurrent (résolution de conflits fichier par fichier, jamais de merge
GitHub automatique sur un état `dirty`).

## Investigation préalable (iOS join-path video-gate)
Vague 21 (PR #1614, mergée avant cette session) notait comme piste future : revérifier le chemin JOIN iOS
pour la même classe de bug que le fix privacy web/gateway (callee audio qui active quand même sa caméra).
Audit lecture seule de `CallManager.swift` + `MessageSocketManager.swift` + `VoIPPushManager.swift` :
- `handleIncomingCallNotification(isVideo:)` dérive déjà `isVideoEnabled` du champ serveur-autoritaire
  (`event.type` sur `call:initiated`, avec fallback `mode` pour compat ascendante ; `isVideo` du payload
  VoIP push, jamais un toggle local).
- `emitCallJoinWithAck(callId:)` (SDK) n'envoie **aucun** champ `videoEnabled` dans le payload `call:join`
  — juste `{"callId": callId}`. Le gateway (déjà fixé par #1614) dérive donc `isVideoEnabled` uniquement de
  `call.metadata.type`, jamais d'un signal client iOS.
- Conclusion : **pas de bug iOS équivalent** — la classe de bug (client force `videoEnabled:true` sur un
  appel audio) ne s'applique pas au client iOS, qui ne porte même pas ce champ. Rien à corriger ; piste
  fermée, documentée ici pour ne pas être re-flaguée.

## Affected modules (merge/rebase, pas de nouveau code)
- `#1597` (`fix(web/calls): correct destructured prop name in DraggableParticipantOverlay`) — clean,
  vert, mergé directement (squash).
- `#1610` (`docs(audit-calls): re-verify P0/P1 status...`) — clean, vert, mergé directement (squash).
- `#1601` (`fix(calls): evict sockets from call room on GC force-end`) — conflit sur
  `tasks/calls-fonctionnel-todo.md` uniquement (2 entrées "Vague 21" parallèles) ; source auto-mergeable.
  Rebasé sur `main` post-#1597/#1610, renuméroté en **Vague 22**, revérifié (gateway `CallCleanupService`
  70/70, suite filtrée `[Cc]all` 31/31 suites 867/867, `tsc --noEmit` 0 erreur), poussé.
- `#1606` (`fix(calls): version-bump gap in initiateCall cleanup + web quality-report never emitted`) —
  même type de conflit doc-only. Rebasé sur `main` post-#1597/#1610 (avant que #1601 ne merge — sera
  rerebasé une 2e fois une fois #1601 mergé), renuméroté en **Vague 23**, revérifié (gateway `CallService`
  222/222, suite filtrée `[Cc]all` 31/31 suites 865/865 ; web `use-call-quality` 40/40 ; `tsc --noEmit`
  gateway 0 erreur, web 1203 erreurs avant/après identique — écart de 1 vs baseline expliqué par le fix
  #1597 déjà inclus), poussé.

## Dependencies
Ordre de merge : #1597 → #1610 → #1601 → #1606 (chacun rebasé sur le tip de `main` au moment de son tour,
zéro merge simultané pour éviter un conflit de renumérotation "Vague N" en double).

## Estimated risks
Faible sur les 4 — aucun changement de code ne se recoupe entre les 4 PR (fichiers gateway/web disjoints à
l'exception du fichier doc `tasks/calls-fonctionnel-todo.md`, résolu manuellement à chaque étape). CI verte
sur les 4 avant merge. Pas de force-push sur `main` ; force-push uniquement sur les branches de PR
elles-mêmes après rebase (nécessaire pour mettre à jour un PR existant), jamais sur `main`.

## Rollback strategy
Chaque merge est un commit distinct sur `main` (squash), revert individuel possible sans affecter les
3 autres.

## Validation criteria
- [x] #1597 mergé (clean, CI verte).
- [x] #1610 mergé (clean, CI verte).
- [x] #1601 rebasé + revérifié + poussé ; CI en cours au moment de la rédaction.
- [x] #1606 rebasé + revérifié + poussé ; CI en cours au moment de la rédaction.
- [ ] #1601 mergé sur `main` après CI verte confirmée.
- [ ] #1606 rerebasé sur le nouveau tip de `main` (post-#1601, Vague 22 déjà présente → sa propre entrée
      devient Vague 23 sans nouveau conflit de numérotation), revérifié, poussé, mergé.
- [ ] Pull final de `main` sur la branche routine de cette session, aucun conflit résiduel.

## Progress tracking
- [x] Audit iOS join-path (piste fermée, pas de code à écrire).
- [x] Merge #1597, #1610.
- [x] Rebase + revérification #1601.
- [x] Rebase + revérification #1606.
- [ ] Merge #1601.
- [ ] Rerebase + merge #1606.
- [ ] Pull main final sur la branche de session.

## Future improvements
Rien de nouveau identifié cette session au-delà de l'existant (items J, C6, CALL-DIAG retagging,
`negotiate()` guard spéculatif, threading TTL complet, P0-1 TURN secret prod — nécessite accès SSH,
P1-11 CallKit fulfill() ordering — nécessite device/simulateur réel).
