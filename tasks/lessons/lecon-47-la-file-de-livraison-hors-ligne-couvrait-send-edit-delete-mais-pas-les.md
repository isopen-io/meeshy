## Leçon 47 — la file de livraison hors-ligne couvrait send/edit/delete mais PAS les réactions (2026-07-08, routine messaging, iter 147)

`RedisDeliveryQueue` + `_drainPendingMessages` rejouent à la reconnexion les `message:new` (Leçon send),
`message:edited` et `message:deleted` (Leçon 45/78) aux participants hors-ligne. Mais `ReactionHandler`
n'avait **aucune** dépendance `deliveryQueue` : `reaction:added`/`reaction:removed` n'étaient émis QUE vers la
room conversation live (`_broadcastReactionEventWithConversationId` → `io.to(ROOMS.conversation(...))`). Un pair
hors-ligne ne recevait donc jamais la réaction et ses compteurs de réactions restaient périmés jusqu'à un refetch
complet sans rapport — exactement le trou que Leçon 45/78 avaient bouché pour les éditions/suppressions, laissé
béant sur le jumeau « réaction ».

**Scénario de perte** : A réagit 👍 au message de B ; C (participant, hors-ligne) rate l'emit live. À la
reconnexion, `_drainPendingMessages` ne draine que send/edit/delete → C ne voit jamais le 👍 tant qu'il ne
recharge pas toute la conversation.

**Fix** : symétrie stricte avec `MessageHandler`. (1) `QueuedMessagePayload.eventType` gagne
`'reaction-added' | 'reaction-removed'` (shared). (2) `_drainedEventName` mappe ces types vers
`REACTION_ADDED`/`REACTION_REMOVED`. (3) `ReactionHandler` reçoit `deliveryQueue` (setter injecté par
`MeeshySocketIOManager.setDeliveryQueue`, même instance que MessageHandler) + un
`_enqueueOfflineReactionEvent` copié sur `_enqueueOfflineEventForParticipants` — exclut l'acteur par **id
participant** (Leçon 46 : exclure sur l'identité de l'APPELANT, `participantId` du réacteur, jamais sur le
contenu) et saute tout pair en ligne (`connectedUsers.has`). Le swap mono-réaction met aussi en file la
suppression de l'emoji remplacé. Les entrées réaction ne portent jamais d'accusé de livraison
(`_emitDeliveryForDrainedMessages` filtre déjà `eventType === 'new'`). Tests RED→GREEN : 6 tests d'enqueue
`ReactionHandler` + mapping drain `MeeshySocketIOManager` + forward setter. 1130 tests socketio verts, tsc OK.

**Règle réutilisable** : quand une file de rattrapage hors-ligne existe pour un sous-ensemble d'événements de
mutation d'un même agrégat (message : new/edit/delete), énumérer TOUTES les mutations de cet agrégat visibles
côté client (réactions, épinglage, receipts…) et vérifier que chacune passe par la même file. Un handler qui
n'a pas la dépendance `deliveryQueue` du tout est le signal : il ne fait que du broadcast live et perd
silencieusement l'état pour les hors-ligne. La parité « live + rejeu » doit être exhaustive, pas
échantillonnée.
