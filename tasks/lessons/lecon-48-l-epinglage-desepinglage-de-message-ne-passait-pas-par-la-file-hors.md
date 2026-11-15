## Leçon 48 — l'épinglage/désépinglage de message ne passait PAS par la file hors-ligne (2026-07-09, routine messaging, iter 150)

Suite directe de la Leçon 47 (qui appliquait la règle « énumérer TOUTES les mutations d'un agrégat message
visibles côté client et vérifier que chacune passe par la file de rattrapage hors-ligne » et bouchait le trou
réactions). Le prochain maillon manquant : **le pin/unpin**. Les routes REST
`PUT/DELETE /conversations/:id/messages/:messageId/pin` (`routes/conversations/messages.ts`) n'émettaient
`message:pinned`/`message:unpinned` QUE vers la room conversation live
(`getManager()?.getIO().to('conversation:...').emit(...)`) — **aucune** dépendance `deliveryQueue`, aucun
enqueue. Un participant hors-ligne au moment de l'épinglage ratait l'emit live et son état de pin restait
périmé jusqu'à un refetch complet sans rapport — exactement le trou déjà bouché pour edit/delete (Leçon 17) et
réactions (Leçon 47), laissé béant sur le jumeau « pin ».

**Scénario de perte** : A épingle le message M ; C (participant, hors-ligne) rate l'emit live. À la
reconnexion, `_drainPendingMessages` ne draine que new/edit/delete/reaction → C ne voit jamais l'épingle.

**Fix** : symétrie stricte. (1) `QueuedMessagePayload.eventType` gagne `'pinned' | 'unpinned'` (shared).
(2) `_drainedEventName` (MeeshySocketIOManager) mappe ces types vers `MESSAGE_PINNED`/`MESSAGE_UNPINNED`.
(3) Nouvelle méthode PUBLIQUE `MeeshySocketIOManager.enqueueOfflineMessageMutation({ conversationId,
actorUserId, eventType, messageId, payload })` — les routes pin/unpin sont REST (pas WS), donc l'enqueue vit
sur le manager (accessible via `getManager()`) plutôt que dans un handler socket. Elle exclut l'acteur **par
userId** (les routes pin tournent sous `requiredAuth` → acteur toujours registered) et saute les pairs en ligne
(`connectedUsers.has(queueKey)`, `queueKey = userId ?? participantId`). Dedup par défaut (messageId) suffisant :
`pinned` et `unpinned` portent des eventTypes distincts donc un pin-puis-unpin garde les deux entrées dans
l'ordre d'enqueue, un toggle répété même-sens supersede en place — pas besoin de `dedupKey` fin comme les
réactions. Les entrées pin ne portent jamais d'accusé (`_emitDeliveryForDrainedMessages` filtre déjà
`eventType === 'new'`). Tests : mapping drain pinned/unpinned + 4 tests `enqueueOfflineMessageMutation`
(exclusion acteur/en-ligne, clé participant pour anonyme, échec lookup avalé) + 2 assertions routes pin/unpin.
464 + 157 tests verts, tsc gateway OK.

**Règle réutilisable (rappel Leçon 47, étendue REST)** : le signal « handler/route qui ne fait que du broadcast
live sans dépendance `deliveryQueue` » vaut AUSSI pour les routes REST, pas seulement les handlers WS. Quand une
mutation d'agrégat message est déclenchée par REST (pin, futur : édition/suppression REST, receipts REST…),
elle doit passer par la MÊME file — via une méthode publique du manager si nécessaire. Reste à auditer côté
même série : `message:read-status` déjà couvert par un chemin dédié ; vérifier au prochain tour si d'autres
mutations REST d'agrégat (mentions résolues, traductions tardives) ont un jumeau hors-ligne manquant.
