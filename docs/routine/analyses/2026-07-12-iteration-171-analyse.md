# Iteration 171 — Analyse d'optimisation (2026-07-12)

## Protocole (démarrage)
`main` @ `2cbf13b` (derniers merges : audit appels — refus `reason=rejected`, Android media
auto-download `#1881`). Branche `claude/brave-archimedes-eq3y7r` réinitialisée sur `origin/main`
(0/0). Ce cycle prend **171**.

PRs ouvertes (périmètres à NE PAS toucher) :
- `#1883` — iOS WebRTC delegate identity guard (`P2PWebRTCClient.swift`, `WebRTCService.swift`)
- `#1880` — web comments like-state (`apps/web/lib/reactions.ts`, `CommentList`/`CommentThread`,
  `use-comment-mutations.ts`)
- `#1879` — web calls ring timeout (`apps/web/components/video-call/CallManager.tsx`)
- `#1842` — dependabot build-tools (racine)

Cible retenue hors de tous ces périmètres : le gateway (`services/gateway/src/socketio/`), zone
appels — **Priorité 1** (feature la plus récemment développée) et vérifiable via `jest` (bun).

---

## Cible retenue : F129 — `forceEndOrphanedCallAfterOptimisticBroadcast` écrit `CallParticipant.leftAt` sans évincer `signalSessionCache` → ré-ouverture de la faille de relais de signal CVE-001 sur le chemin d'erreur

### Current state
Le commit `3c91529` (« evict signalSessionCache entry when a participant leaves — audit #10
regression ») a posé un **invariant** documenté en toutes lettres dans le code
(`CallEventsHandler.ts:203-213`) :

> *Every path that writes `CallParticipant.leftAt` for this call must evict the entry so the very
> next `call:signal` re-reads.*

Ce commit a ajouté `invalidateSignalSession()` sur les **cinq chemins nominaux** : `call:leave`
(`:2132`), `call:force-leave` (`:2364`), `call:end` (`:3026`), et les deux branches de disconnect
(`:643`, `:701`).

Mais le helper de **récupération d'erreur** partagé
`forceEndOrphanedCallAfterOptimisticBroadcast` (`CallEventsHandler.ts:883-929`) — invoqué depuis
les `catch` de ces mêmes trois handlers (`call:leave` `:2234`, `call:force-leave` `:2436`,
`call:end` `:3110`) — appelait `forceEndOrphanedCallSession` (qui **stampe `leftAt`** sur tous les
participants encore ouverts : `CallService.ts:450-453`) **sans** appeler `invalidateSignalSession`.
Il évinçait pourtant déjà les sockets de la room (`evictCallRoomSockets`, `:925`), en miroir des
chemins nominaux — mais l'éviction du cache de signal manquait.

### Problems identified
1. **Faille CVE-001 ré-ouverte sur le chemin d'erreur.** Quand `endCall()`/`leaveCall()` lève une
   erreur DB réelle (non-P2034 — les conflits transitoires P2034 sont avalés, donc le throw est un
   échec authentique), sa transaction *rollback* et l'éviction inline du chemin nominal
   (`:2132/:2364/:3026`) est sautée. Le helper de récupération force alors la fin de session et
   stampe `leftAt` en base — **mais laisse l'entrée de cache stale intacte** (TTL 2 s).
2. **Fenêtre de relais.** Pendant ≤ 2 s, un `call:signal` de type `offer`/`ice-restart`/
   `ice-candidate` émis par le participant qui vient de partir est validé par `findSender`
   (`:2534-2537`) contre le snapshot caché (`!p.leftAt` encore vrai), passe le garde CVE-001
   « l'émetteur est bien un participant », et est **relayé** au pair restant — un participant parti
   qui signale dans un appel terminé. (`answer` est sûr car il force toujours une lecture fraîche.)

### Root cause
L'invariant « tout write de `leftAt` évince le cache » n'était honoré que sur les chemins nominaux.
Le helper de récupération partagé — atteint depuis les trois `catch` — l'omettait, exactement sur
le chemin que le commit `3c91529` avait manqué.

### Business impact
**Priorité 1 — feature appels (récemment et intensément développée).** Défaut de sécurité/
correction du relais de signalisation WebRTC : un pair parti peut polluer la négociation ICE d'un
appel terminé pendant une fenêtre de 2 s, sur le chemin de récupération d'erreur. Faible fréquence
(exige un throw DB non transitoire) mais impact sécurité identique à la CVE que le commit précédent
visait à fermer.

### Technical impact
Aucune donnée corrompue. Divergence purement en mémoire (cache de signal) sur un chemin d'erreur.
La correction restaure la cohérence « un seul invariant, honoré partout » entre chemins nominaux et
chemins de récupération.

### Risk assessment
Très faible. Ajout d'un unique appel idempotent (`this.invalidateSignalSession(callId)`) après le
garde `if (!forceEnded) return;` (donc uniquement quand `forceEndOrphanedCallSession` a
effectivement écrit `leftAt`). Aucun contrat modifié : mêmes events, mêmes broadcasts, mêmes acks.
Les trois tests nominaux existants restent verts.

### Proposed improvements
Ajouter `this.invalidateSignalSession(callId);` dans
`forceEndOrphanedCallAfterOptimisticBroadcast`, immédiatement après `if (!forceEnded) return;`
(un `false` = no-op de force-end = aucun `leftAt` écrit = rien à évincer).

### Expected benefits
- Invariant « tout write de `leftAt` évince le cache de signal » honoré sur **100 %** des chemins
  (nominaux + récupération).
- Fenêtre de relais de signal fermée sur le chemin d'erreur des trois handlers terminaux.

### Implementation complexity
Triviale : 1 ligne de production + 1 test de régression (RED→GREEN) dans la suite existante
`CallEventsHandler-signal-cache-invalidation.test.ts`.

### Validation criteria
- Nouveau test : `mockEndCall` reject non-autorisation → `forceEndOrphanedCallSession` résout →
  `signalSessionCache.has(CALL_ID) === false`. RED avant fix, GREEN après.
- Les trois tests nominaux (`call:leave`/`call:force-leave`/`call:end`) restent verts.
- Suite gateway complète verte (aucune régression).

## Autres zones examinées et écartées (contexte)
- Le fix « refus → `status: rejected` » (`CallService.ts:1716-1720`) est correctement câblé.
- `updateCallStatus` ancre encore `duration` sur `startedAt` (`:694`) au lieu d'`answeredAt`, mais
  n'est appelé qu'avec des statuts non terminaux (`active`/`reconnecting`) → incohérence latente,
  pas un bug vivant. Candidat plus faible, consigné pour une itération future.
