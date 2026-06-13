# Iteration 38 — Analyse d'optimisation (2026-06-12)

## Contexte
Suite iter 37 (présence live contacts/pickers via `useLiveUserStatus`, mergé). Le plan
iter 37 désigne pour iter 38 : **F4 — pollings admin → events Socket.IO**, plus gros lot
restant de la liste consignée. Audit complet du dashboard admin agent (web + gateway +
service agent) mené sur cette itération.

## Constat : 4 pollings REST aveugles sur le dashboard admin agent

| Composant | Endpoint pollé | Intervalle | Coût |
|-----------|----------------|------------|------|
| `DeliveryQueuePanel.tsx:44` | `GET /admin/agent/delivery-queue` | **10 s** | full queue (N items × payload action complet) |
| `AgentConversationsTab.tsx:86` | `GET /admin/agent/configs?page=…` | **10 s** | page de configs + counts |
| `AgentScheduleTimeline.tsx:70` | `GET /admin/agent/configs/:id/schedule` | **30 s** | schedule 24 h + budget + burst |
| `TriggerSchedulingModal.tsx:118` | `GET /admin/agent/configs/:id/schedule` | **30 s** | idem (modal ouverte) |
| `AgentLiveTab.tsx:414` | `GET /admin/agent/configs/:id/live` | 15 s (opt-in) | profils + analytics + cache Redis |

Un onglet admin ouvert génère **6 à 12 requêtes/minute** en continu, que les données aient
changé ou non — la delivery queue est souvent VIDE et le schedule ne change que lors d'un
scan ou d'une édition. État de l'art (dashboards Slack/Discord/Linear) : push serveur,
zéro polling à intervalle court ; le REST ne sert qu'au fetch initial et au resync.

À l'inverse, la latence de fraîcheur est mauvaise : une action de l'agent (enqueue d'un
message, scan déclenché) n'apparaît qu'au prochain tick (jusqu'à 10–30 s), alors que
l'infrastructure temps réel (Socket.IO + Redis pub/sub) existe déjà et est utilisée
partout ailleurs dans le produit.

## Cartographie des producteurs de changement

Les données pollées mutent en DEUX endroits :

### 1. Gateway (mutations admin, REST)
`services/gateway/src/routes/admin/agent.ts` :
- PUT/DELETE `/configs/:conversationId` (upsert/suppression config — publie déjà
  `agent:config-invalidated` sur Redis, l.233)
- POST `/configs/:conversationId/stop` (clear `scanStartedAt`, l.1369)
- POST `/configs/:conversationId/trigger` (publie `agent:trigger-scan`, l.1414)
- POST `/roles/:conversationId/:userId/assign|unlock`
- DELETE/PATCH `/delivery-queue/:id` (via `AgentHttpClient` → service agent)

### 2. Service agent (mutations autonomes — invisibles de la gateway)
`services/agent/src/delivery/redis-delivery-queue.ts` : `enqueue`, `mergeIntoExisting`,
`poll`→`deliver`→`removeItem`, `deleteById`, `editMessageById`, `cancelForConversation`,
`clearAll`.
`services/agent/src/scheduler/conversation-scanner.ts` : `processConversation` (set/clear
`scanStartedAt` → états live et configs list).

Le pattern Redis pub/sub inter-services existe déjà dans les deux sens :
gateway → agent (`agent:trigger-scan`, `agent:config-invalidated`, souscrits par
`conversation-scanner.ts:72` et `config-cache.ts:97` via `redis.duplicate()`).
Il manque uniquement le sens **agent → gateway**.

## Infrastructure Socket.IO existante (réutilisable telle quelle)

- Conventions : events `entity:action-word`, types dans
  `packages/shared/types/socketio-events.ts`, rooms via `ROOMS`.
- Émission : `MeeshySocketIOManager` (singleton), `io.to(room).emit(...)`.
- **Aucune room admin n'existe** ; la vérification de rôle REST est
  `requireAgentAdmin()` (`agent.ts:22` — BIGBOSS|ADMIN). À répliquer à la souscription
  socket (lookup Prisma du rôle au join, une fois).
- Web : singleton `meeshy-socketio.service.ts` ; précédent de hook de souscription
  par room : `hooks/social/use-social-socket.ts` (emit subscribe au mount, listeners
  via `handlersRef`, cleanup symétrique).

## Décision iter 38 — F4 : push admin unifié `agent:admin-event`

Architecture en UN canal et UNE room (pureté, multi-instance-safe) :

```
service agent (queue/scan)  ──publish──▶ Redis 'agent:admin-event' ──▶ gateway relay
gateway (routes mutations)  ──publish──▶        {kind, conversationId?}      │
                                                                              ▼
                                                       io.to('admin:agent').emit('agent:admin-event')
                                                                              │
web: useAgentAdminEvents({kinds, conversationId?, onChange})  ◀──────────────┘
     → refetch REST ciblé, debouncé — plus de polling court
```

- `kind ∈ {'delivery-queue', 'scan', 'config'}` — payload minimal (pas de données
  métier sur le fil : le client refetch l'endpoint REST qu'il connaît déjà, zéro
  duplication de sérialisation, pas de risque de fuite hors room).
- Les mutations gateway passent AUSSI par Redis publish (pas d'emit direct) : un seul
  chemin, fonctionne si plusieurs instances gateway (sockets admin sur une autre
  instance).
- Room `admin:agent` joignable uniquement après vérification du rôle (BIGBOSS|ADMIN)
  côté serveur à la souscription — ack `{success}` au client.
- Web : intervalles courts supprimés ; fetch initial conservé ; refetch sur event
  (debounce 400 ms) + au reconnect socket ; filet de sécurité long (60–120 s) conservé
  sur les deux vues critiques (queue, configs) — dégradation gracieuse si le socket
  est down, conforme au principe Offline Graceful Degradation.

### Gains
- **Bande passante / charge** : ~6-12 req/min/admin → ~0 en régime stable (events
  uniquement quand l'état change réellement) ; filet 60-120 s au lieu de 10 s = ÷6 à ÷12
  même en mode dégradé.
- **Latence de fraîcheur** : 10–30 s → < 1 s (un enqueue de l'agent apparaît
  instantanément dans le panneau queue ; un scan en cours s'affiche en live).
- **Unification** : le dashboard admin rejoint le modèle temps réel du reste du produit
  (messages, réactions, présence) — même infra, mêmes conventions.

## Constats consignés pour itérations futures (non traités ici)

| # | Constat | Localisation | Impact | Raison du report |
|---|---------|--------------|--------|------------------|
| F2 | `SOCKET_LANG_FILTER` OFF par défaut | `MessageHandler.ts:580` | HAUT (~75 % BP multilingue) | Validation staging requise |
| F10 | Dénormaliser `conversationId` scalaire + index sur `Notification` | `schema.prisma` Notification | FAIBLE | Utile seulement à fort volume |
| F14 | `formatLastSeen` texte figé au fetch | `app/contacts` page | FAIBLE | Décision produit granularité |
| F15 | `AgentScheduleTimeline` garde un tick UI 10 s (`setNow`) — possible rAF/visibilité | `AgentScheduleTimeline.tsx:75` | TRÈS FAIBLE | Horloge purement locale, coût nul réseau |
| F16 | `agent-topics.ts` mutations topics pourraient aussi publier `kind:'config'` | `routes/admin/agent-topics.ts` | FAIBLE | L'onglet topics ne polle pas aujourd'hui |

## Gain estimé global
Dernier foyer de polling court du web éliminé pour les admins ; UX admin temps réel
(« voir l'agent travailler ») ; trafic admin divisé par ~10 ; un seul canal et un seul
event à maintenir.
