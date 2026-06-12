# Iteration 38 — Plan d'implémentation (2026-06-12)

## Objectif
Lot désigné par le plan iter 37 : **F4** — remplacer les pollings courts du dashboard
admin agent par un push Socket.IO unifié. Un canal Redis `agent:admin-event`
(publié par le service agent ET les routes gateway), relayé par la gateway vers la room
`admin:agent` (rôle BIGBOSS|ADMIN vérifié au join), consommé côté web par un hook
`useAgentAdminEvents` qui déclenche des refetch REST ciblés et debouncés.

## Étapes (TDD : RED → GREEN)

### Phase 1 — Types partagés
- [x] `packages/shared/types/socketio-events.ts` :
      `CLIENT_EVENTS.ADMIN_AGENT_SUBSCRIBE/UNSUBSCRIBE` (`admin:agent-subscribe|unsubscribe`),
      `SERVER_EVENTS.AGENT_ADMIN_EVENT` (`agent:admin-event`), room `admin:agent`
      (`ROOMS`), const `AGENT_ADMIN_EVENT_CHANNEL`, type `AgentAdminEventData`
      (`kind: 'delivery-queue'|'scan'|'config'`, `conversationId?`), entrées des maps
      ClientToServerEvents/ServerToClientEvents.

### Phase 2 — Service agent : publications Redis
- [x] RED : tests `redis-delivery-queue` (publish sur enqueue/merge/poll-deliver/
      deleteById/editMessageById/cancelForConversation/clearAll) + scanner
      (publish scan start/end dans `processConversation`).
- [x] GREEN : `redis-delivery-queue.ts` — `notifyAdmins(conversationId?)` fire-and-forget
      (`redis.publish` + catch) appelé aux 7 points de mutation ;
      `conversation-scanner.ts` — publish `{kind:'scan', conversationId}` après
      `updateScanStatus(starting)` et dans le `finally`.

### Phase 3 — Gateway : relay + room admin + publications routes
- [x] RED : test `AdminAgentHandler` (join refusé USER, accepté ADMIN/BIGBOSS, ack,
      leave) + test relay (message Redis → emit room, payload invalide ignoré).
- [x] GREEN :
      - `socketio/handlers/AdminAgentHandler.ts` — deps `{prisma, socketToUser}`,
        `handleSubscribe(socket, cb)` : userId via socketToUser → lookup rôle Prisma →
        join `admin:agent` + ack ; `handleUnsubscribe` : leave.
      - `socketio/AgentAdminRelay.ts` — subscriber ioredis dédié (`REDIS_URL`),
        subscribe `AGENT_ADMIN_EVENT_CHANNEL`, parse/valide kind, `io.to(room).emit`.
        Démarré dans `MeeshySocketIOManager.initialize()`, stoppé au shutdown.
      - Wiring `_setupSocketEvents` (2 `socket.on`).
      - `routes/admin/agent.ts` — publish `{kind:'config'}` sur PUT/DELETE config,
        stop, trigger, assign/unlock ; `{kind:'delivery-queue'}` sur DELETE/PATCH
        delivery-queue (fire-and-forget via `getCacheStore().publish`).

### Phase 4 — Web : hook + suppression des pollings
- [x] RED : test `use-agent-admin-events` (emit subscribe au mount, filtre kinds +
      conversationId, debounce onChange, unsubscribe au unmount, resubscribe+onChange
      au reconnect).
- [x] GREEN : `hooks/admin/use-agent-admin-events.ts` — modèle `useSocialSocket`
      (handlersRef), options `{kinds, conversationId?, onChange, debounceMs=400,
      enabled}`, listener `connect` pour resubscribe + resync.
- [x] Substitutions :
      - `DeliveryQueuePanel.tsx` : interval 10 s → hook (kinds queue+scan) + filet 60 s
      - `AgentConversationsTab.tsx` : interval 10 s → hook (kinds config+scan) + filet 60 s
      - `AgentScheduleTimeline.tsx` : interval 30 s → hook (3 kinds, scoped conversationId)
      - `TriggerSchedulingModal.tsx` : interval 30 s → hook (idem, `enabled: open`)
      - `AgentLiveTab.tsx` : hook (kind scan, scoped) en plus du autoRefresh opt-in existant

### Phase 5 — Vérification & livraison
- [x] Jest gateway (suites handlers + relay + agent-routes), agent (queue + scanner),
      web (hook) verts ; baseline des suites touchées identique à main
- [ ] Commit + push `claude/inspiring-euler-a9t7zd`, PR vers `main`, CI verte, merge


## Hors périmètre (consigné dans l'analyse)
- F2 : flip `SOCKET_LANG_FILTER` (validation staging)
- F10 : scalaire `conversationId` sur Notification (volumétrie)
- F14 : `formatLastSeen` vivant (décision produit)
- F15 : tick UI 10 s du timeline (coût réseau nul)
- F16 : publish `kind:'config'` depuis agent-topics.ts

## Continuité
Iter 39+ : F2 (mesure staging — dernier gros levier bande passante), F16 (1 ligne,
peut accompagner n'importe quel lot), F10/F14/F15 (opportunistes).

## Statut (mis à jour en fin d'itération)
- [x] Phase 1 — types partagés
- [x] Phase 2 — service agent publie
- [x] Phase 3 — gateway relay + room + routes
- [x] Phase 4 — web hook + 5 composants sans polling court
- [ ] Phase 5 — CI verte, mergé dans main
