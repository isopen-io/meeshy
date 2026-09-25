## Leçon 42 — Un audit gateway/web-only "SERVER_EVENTS.X, jamais émis" ne prouve pas que X est mort si iOS n'a pas été grep (2026-07-08)
En auditant `SERVER_EVENTS.CALL_FORCE_LEAVE` (`packages/shared/types/socketio-events.ts`), un agent
d'exploration scopé gateway+web a rapporté "aucun émetteur, aucun consommateur, commentaire source dit
'no emitter yet'" — j'ai supprimé la déclaration TS. Un grep `apps/ios` fait APRÈS coup (pas fait par
l'agent, ni par moi avant d'agir) a révélé `MessageSocketManager.swift:3052`
(`socket.on("call:force-leave")`, publie via un `PassthroughSubject` Combine) + `CallManager.swift:3689`
(abonnement réel) + une suite de tests dédiée (`CallManagerTests.swift:3230-3276`, vérifie le teardown et
le report CallKit) — un récepteur RÉEL et TESTÉ, pas mort du tout côté client, juste jamais déclenché
parce que le serveur ne l'émet jamais. Restauré avant tout commit. **Règle : dans un repo cross-platform
(iOS + web + gateway) où un seul côté définit le contrat serveur→client (`packages/shared`), un audit
"jamais émis" scopé à gateway/web ne peut PAS conclure "mort" — il ne voit que la moitié émettrice. Avant
de supprimer/modifier une déclaration `SERVER_EVENTS.X`/`CLIENT_EVENTS.X` sur la base d'un grep
gateway+web, grep AUSSI `apps/ios` et `packages/MeeshySDK` pour un `socket.on("...")`/`socket.emit("...")`
correspondant** — la vraie conclusion peut être "receiver mort des deux côtés" (à supprimer) OU "gap
d'implémentation serveur avec un client déjà prêt" (à décider : implémenter l'émission, ou supprimer le
récepteur en connaissance de cause), et ces deux verdicts appellent des actions opposées. Corollaire :
quand une suite de tests existe UNIQUEMENT pour un chemin qui semble mort ("pourquoi teste-t-on un
comportement jamais déclenché ?"), c'est un signal fort d'un gap d'implémentation ailleurs plutôt que de
code réellement mort — un vrai mort n'aurait généralement pas justifié l'investissement de 6 tests dédiés
dans une suite existante.
