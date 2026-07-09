# Realtime sync audit — 2026-07-05 (continuous-improvement pass)

Audit ciblé sur le cycle de vie WebSocket, la reconnexion, la détection de gaps et
l'ordre de livraison (typing/reactions/read-receipts/messages). 4 findings, classés
par sévérité. #1 corrigé dans ce passage ; #2-#4 documentés pour un suivi séparé
(changements plus larges, nécessitent un environnement macOS avec toolchain Swift
pour compiler/tester — indisponible dans cet environnement Linux).

## 1. `ConversationSocketHandler.deinit` — typing roster jamais nettoyé au teardown — ✅ Corrigé

`apps/ios/Meeshy/Features/Main/ViewModels/ConversationSocketHandler.swift:178-206`

`deinit` lançait `Task { @MainActor [weak self] in self?.delegate?.typingUsernames.removeAll() }`.
Capturer `self` faiblement DANS le `deinit` de `self` est du code mort : ARC met les
références faibles vers `self` à `nil` dès l'entrée dans `deinit`, donc le corps du
Task voit `self` déjà nil quand il s'exécute. Un pair en train de taper au moment où
le handler est détruit (conversation fermée pendant que le ViewModel/delegate
survit, ex. cache de navigation) laissait un nom "typing…" fantôme indéfiniment.

**Fix** : `delegate` passe en `nonisolated(unsafe)` (même rationale documentée pour
les propriétés `Timer`/`Bool` juste au-dessus dans le fichier — `self` est référencé
de manière unique à ce point, donc pas de race réelle). `deinit` snapshot
`delegate` dans une `let` locale AVANT de lancer le `Task`, et passe ce snapshot
(pas `self`) au `Task @MainActor`. Test de régression :
`ConversationSocketHandlerTests.test_deinit_clearsStaleTypingIndicatorsOnDelegate`
(force la désallocation via un scope `do {}`, attend le `Task`, vérifie
`delegate.typingUsernames.isEmpty`).

⚠️ **Non vérifié par compilation** — pas de toolchain Swift dans cet environnement
Linux. À valider avec `./apps/ios/meeshy.sh test` (ou CI) avant de considérer ce
correctif définitivement clos.

## 2. Deux boucles de reconnexion non coordonnées — risque de thrash réseau flaky

`packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift:1386-1421`
(`observeNetworkRecovery`/`scheduleReconnectWithBackoff`) vs. `:1468-1481`
(reconnect natif Socket.IO `.reconnects(true)/.reconnectAttempts(-1)`) vs.
`:1589-1599` (`forceReconnect`)

Deux boucles de reconnexion indépendantes coexistent : la boucle infinie native de
Socket.IO, et une boucle app-level pilotée par `NetworkMonitor` qui appelle
`forceReconnect()`. `forceReconnect()` appelle inconditionnellement
`suspendTransport()` (met `socket`/`manager` à nil) puis `connect()`, ce qui
contourne le garde de ré-entrance de `connect()` (`if let socket, socket.status ==
.connected || .connecting { return }`) puisque ce garde teste un `socket` qui vient
d'être nil'd.

**Scénario de défaillance** : sur un handoff WiFi/cellulaire instable,
`NetworkMonitor.$isOffline` bascule faux→vrai→faux en rafale ; chaque reprise
appelle `handleNetworkBackOnline()` → `forceReconnect()`, avortant le handshake que
la boucle native Socket.IO avait déjà en cours — le socket peut être détruit à
répétition avant de finir un handshake et ne jamais converger, prolongeant la
fenêtre d'indisponibilité (messages/réactions/typing).

**Piste de fix** : gater `forceReconnect()`/`scheduleReconnectWithBackoff()` sur
`connectionState` (no-op si déjà `.connecting`/`.reconnecting`), ou supprimer l'une
des deux boucles concurrentes.

## 3. Pas de détection de gap/séquence pour message/reaction/read-receipt

`packages/MeeshySDK/Sources/MeeshySDK/Sync/SyncSeqState.swift:42-44` (commentaire :
seul `notification:new` est câblé) + `MessageSocketManager.swift:2868`

`SyncSeqTracker` (compteur `_seq` monotone par user, détection de gap) n'est câblé
QUE sur `notification:new`. `message:new`, `reaction:added/removed`,
`read-status:updated`, `typing:*` ne portent aucun numéro de séquence — la seule
récupération de broadcasts manqués passe par `didReconnect` →
`syncMissedMessages()` (`ConversationViewModel.swift:3357`), qui ne se déclenche
que sur un vrai cycle socket `disconnect`/`connect`.

**Scénario de défaillance** : si le transport se bloque silencieusement sans émettre
de `disconnect` (suspension OS brève, stall TCP silencieux, race de rejoin de room
côté gateway) pendant qu'un message/reaction broadcast, l'event est perdu sans
signal de gap — `didReconnect` ne se déclenche jamais, donc le client n'a aucun
déclencheur de réconciliation avant le prochain refresh REST sans rapport.

**Piste de fix** : étendre le mécanisme `_seq` (ou un compteur par conversation) aux
broadcasts message/reaction pour que `ConversationSyncEngine` détecte et répare les
gaps silencieux indépendamment des déconnexions au niveau transport.

## 4. Reactions/typing sans protection contre le désordre de livraison

`apps/ios/Meeshy/Features/Main/ViewModels/ConversationSocketHandler.swift:699-717`
(`removeReaction`) vs. `:653-696` (`appendReaction`)

`removeReaction`/`appendReaction` appliquent une sémantique set-diff/set-union clé
`(emoji, participantId)` sans vérification timestamp/version. Sûr en livraison
ordonnée, mais si un `reaction:removed` pour un toggle plus ancien arrive après un
`reaction:added` plus récent pour la même paire (réordonnancement en rafale de
reconnexion, aucun des deux events ne portant de jeton d'ordre — cf. finding #3),
l'état local final s'inverse jusqu'à la prochaine réconciliation REST.

**Piste de fix** : estampiller les events reaction avec `updatedAt`/version serveur
(déjà présent via `ReactionUpdateEvent.timestamp`) et ignorer une application dont
le timestamp est plus ancien que le dernier appliqué pour ce tuple
`(messageId, emoji, participantId)`.

## 5. Dedup read/delivery receipt : clé sur la constante `"latest"` avale un message plus récent — ✅ Corrigé 2026-07-06

`services/gateway/src/services/MessageReadStatusService.ts` — `markMessagesAsRead`
et `markMessagesAsReceived`

Le garde de déduplication à 2 s construisait sa clé sur `latestMessageId ?? "latest"`
ET faisait son early-return AVANT de résoudre le message réel en base. Pour les
nombreux appelants sans `latestMessageId` (`routes/conversations/messages.ts`,
`routes/message-read-status.ts`), deux appels rapprochés qui résolvent des
messages *différents* entraient donc en collision sur la clé constante `"latest"`
— le second était silencieusement ignoré. Le commentaire inline (« keyed by
messageId … so a genuinely newer message is never dropped ») était donc faux pour
ce chemin.

**Scénario de défaillance** : participant P lit la conversation C → `markMessagesAsRead(P, C)`
(sans id) résout M5, avance le curseur, pose la clé `P:C:read:latest`. 500 ms plus
tard M6 arrive. 800 ms : `markMessagesAsRead(P, C)` (sans id) → clé `P:C:read:latest`
présente et < 2000 ms → return anticipé sans requête. Le curseur reste à M5 ;
`getUnreadCount` renvoie 1 et le tick « lu » de l'expéditeur n'avance pas vers M6
jusqu'à expiration de la fenêtre.

**Fix** : résoudre le message le plus récent AVANT le garde de dédup et construire
la clé sur le `messageId` **résolu** (`…:read:${messageId}` / `…:received:${messageId}`).
Un message réellement plus récent produit désormais une clé distincte et n'est
jamais avalé ; seuls les vrais doublons (même message dans la fenêtre) sont
dédupliqués. Tests de régression :
`MessageReadStatusService.test.ts` → describe « dedup key reflects the resolved
latest message (regression) » (3 tests : avance vers un message plus récent
après un mark sans id, pour read ET received ; conservation du dédup sur le même
message). Vérifié : suite gateway complète 508/508 suites, 13767 tests verts,
`tsc --noEmit` OK.

## 6. `markMessagesAsRead` n'avançait jamais le curseur de livraison — "lu" sans "livré" (invariant read⇒delivered violé) — ✅ Corrigé 2026-07-07

`services/gateway/src/services/MessageReadStatusService.ts` — `markMessagesAsRead`

`markMessagesAsRead` n'avançait que le curseur de LECTURE (`lastReadMessageId`/
`lastReadAt`) et ne figeait que `readAt`. Il ne touchait jamais
`lastDeliveredMessageId`/`lastDeliveredAt` ni ne figeait `deliveredAt`/`receivedAt`.
Or les lecteurs de statut (`getLatestMessageSummary`, `getConversationReadStatuses`,
`getMessageReadStatus`, `getMessageStatusDetails`) comptent livré et lu de manière
**indépendante** (curseur `lastDeliveredAt >= createdAt` vs `lastReadAt >= createdAt`).

**Scénario de défaillance** : A envoie M à B pendant que B est hors-ligne (donc
`_autoDeliverToOnlineRecipients` ne marque jamais B « reçu », aucun accusé de
livraison/drain de reconnexion ne passe pour M). B ouvre la conversation →
`POST /conversations/C/mark-as-read` → `markMessagesAsRead(B, C)` avance `lastReadAt`
mais laisse `lastDeliveredAt` null. Le broadcast de coche de l'expéditeur via
`getLatestMessageSummary` renvoie alors `{ deliveredCount: 0, readCount: 1 }` — un
état impossible (la lecture implique strictement la livraison). L'expéditeur voit
la coche « lu » DEVANT la coche « livré », et les onglets `delivered`/`read` de
`getMessageStatusDetails` se contredisent (lecteur listé sous « lu » mais absent de
« livré »).

**Fix** : après l'avance du curseur de lecture et le gel `readAt`, `markMessagesAsRead`
avance aussi le curseur de livraison (`_advanceCursor` sur `lastDeliveredMessageId`/
`lastDeliveredAt`) et fige `deliveredAt`/`receivedAt` sur la même fenêtre (borne
`prevDeliveredAt` lue en même temps que `prevReadAt`). Les deux opérations sont
idempotentes — le garde de curseur no-op si la livraison est déjà en avance, le gel
est write-once — donc coût nul sur le chemin sain livré-puis-lu. Corrige d'un coup
les 4 lecteurs (curseurs ET entrées gelées). Tests de régression :
`MessageReadStatusService.test.ts` → 2 tests (« read implies delivered: also
advances the delivery cursor » + « frozen status entries carry deliveredAt/receivedAt »).
Vérifié : suite `MessageReadStatusService` 153/153, suites voisines
(MessagingService/MessageHandler/routes/socketio) 18 suites 1160 tests verts,
`tsc --noEmit` OK.

## 7. Utilisateur anonyme dans une salle personnelle nue — `conversation:unread-updated` jamais reçu — ✅ Corrigé 2026-07-07

`services/gateway/src/socketio/handlers/AuthHandler.ts` — `_authenticateAnonymousUser`
(jointure) vs. `MessageHandler._updateUnreadCounts` / `MeeshySocketIOManager.broadcastMessage`
+ `routes/conversations/messages.ts` + `routes/message-read-status.ts` (émission)

Le chemin JWT rejoint la salle personnelle via `socket.join(ROOMS.user(user.id))`
(= `user:<userId>`). Le chemin anonyme rejoignait une salle **nue**
`socket.join(socketUser.id)` (= `<participantId>`, sans préfixe `user:`). Or **tous**
les émetteurs d'événements personnels adressent `io.to(ROOMS.user(participant.userId ??
participant.id))` — pour un anonyme (pas de `userId`), cela résout `user:<participantId>`,
une salle qu'aucun socket anonyme ne rejoint jamais.

**Scénario de défaillance** : un anonyme A (participant `pA`, sans `userId`) est connecté,
joint à la conversation C mais posé sur la liste / une autre conversation. B envoie un
message dans C → `broadcastNewMessage → _updateUnreadCounts` calcule `unreadCount = 1`
pour `pA` et émet `CONVERSATION_UNREAD_UPDATED` vers `ROOMS.user(pA)` = `"user:pA"`. Le
socket de A est dans la salle `"pA"`, pas `"user:pA"` → l'event est **droppé**. Le badge
de non-lus de A reste figé jusqu'à un refetch REST sans rapport. Le repli `?? participant.id`
présent dans les deux sites d'émission montrait l'intention de servir les anonymes ; la
livraison échouait par pure divergence salle-de-jointure vs salle-d'émission (les
destinataires enregistrés n'étaient pas touchés, d'où le silence du bug).

**Fix** : le chemin anonyme rejoint désormais `ROOMS.user(socketUser.id)`, alignant
jointure et émission sur la convention unique (la même qu'utilisent notifications,
`CONVERSATION_UPDATED`, `emitWithSeq`, etc.). Balayage exhaustif préalable de tous les
`io.to(...)`/`io.in(...)` du gateway : **aucun** émetteur ne ciblait la salle nue
`<participantId>` — elle était morte — donc zéro régression. Test de régression :
`AuthHandler.test.ts` → « joins the anonymous socket to the ROOMS.user personal room
emitters target (regression: unread badge) » (RED→GREEN vérifié : la jointure asserte
`user:anon-123` et **jamais** `anon-123`). Vérifié : 52 tests AuthHandler verts,
`tsc --noEmit` OK.

## 8. `message:new.senderId` émis en Participant.id sur le chemin WS `message:send` (vs User.id sur REST/ZMQ) — auto-message multi-device jamais réconcilié — ✅ Corrigé 2026-07-09

`services/gateway/src/socketio/handlers/MessageHandler.ts` — `_buildMessagePayload`
(chemin WS `message:send` → `broadcastNewMessage`) vs. `MeeshySocketIOManager.broadcastMessage`
(chemin REST `POST /messages` + re-broadcast ZMQ traduction).

Le champ `senderId` du payload `message:new` (`MESSAGE_NEW`) était construit dans deux
writers, en **deux id-spaces différents**. `Message.senderId` est un `Participant.id`
(schema.prisma:546 → relation `MessageSender` vers `Participant`). Le writer REST/ZMQ
(`broadcastMessage`, l.1846) le **résolvait** vers le `User.id` via
`senderParticipant?.userId || senderParticipant?.user?.id || message.senderId`, avec le
commentaire explicite « les clients comparent senderId avec leur userId ». Le writer WS
(`_buildMessagePayload`, l.1360) émettait le `message.senderId` **brut** (Participant.id).
Or les clients comparent ce champ à leur propre `User.id` :
`apps/web/hooks/queries/use-socket-cache-sync.ts:156` (`isOwnMessage = message.senderId
=== currentUser.id`, qui garde la promotion de l'optimistic) et
`use-conversation-messages-rq.ts:210`.

**Scénario de défaillance** : l'utilisateur A (User.id `A`, Participant.id `pA`) envoie
un texte via le chemin WS primaire `message:send`. `message:new` est émis avec
`senderId = pA`. Sur un **autre device** de A (multi-device), le handler calcule
`isOwnMessage = (pA === A)` → **faux** : la bulle optimistic n'est jamais réconciliée
(le remplacement par `_serverMessageId` est sauté) → A voit son propre message en
**double**, rendu comme une bulle entrante. La même action via REST `POST /messages`
touche l'autre writer (`senderId = A`) et réconcilie correctement — le comportement
divergeait donc purement selon le transport d'envoi.

**Fix** : `_buildMessagePayload` résout désormais `senderId` de façon identique au writer
REST/ZMQ — `senderParticipant?.userId ?? senderUser?.id ?? message.senderId` (fallback
Participant.id pour les anonymes sans `userId`, cohérent avec la convention de salle
anonyme). Aucun nouveau query : `sender.userId`/`sender.user` sont déjà chargés (utilisés
plus bas dans le même objet `sender`). Même idiome de résolution qu'à deux autres endroits
déjà en place (`MeeshySocketIOManager.ts:1846`, `MessagingService.ts:451` pour la
sérialisation REST) — pas de sibling-drift restant. Le champ `sender.id` (Participant.id)
reste disponible pour les consommateurs qui en ont besoin ; `CONVERSATION_UPDATED` garde
volontairement le `senderId` brut (cohérent entre ses deux writers, consommateur distinct).
Test de régression : `MessageHandler.test.ts` → « exposes the sender User.id (not
Participant.id) in the message:new senderId — matches the REST/ZMQ writer contract » (RED→GREEN
vérifié : tous les payloads `message:new` émis assertent `senderId === USER_ID` et jamais
`PARTICIPANT_ID`). Vérifié : suites `MessageHandler` 7/7 (434 tests), suite gateway complète
verte, `tsc --noEmit` OK.

## Priorisation suggérée pour le suivi

| Priorité | Item | Raison |
|---|------|--------|
| ~~P1~~ | ~~#1 deinit typing leak~~ | ✅ Corrigé 2026-07-05 (à vérifier en CI macOS) |
| ~~P1~~ | ~~#5 dedup read/delivery sur clé constante~~ | ✅ Corrigé 2026-07-06 (gateway, vérifié 13767 tests verts) |
| ~~P1~~ | ~~#6 markMessagesAsRead n'avance pas le curseur de livraison (read⇒delivered)~~ | ✅ Corrigé 2026-07-07 (gateway, vérifié 153 + 1160 tests verts) |
| ~~P1~~ | ~~#7 anonyme dans salle personnelle nue — unread jamais reçu~~ | ✅ Corrigé 2026-07-07 (gateway, vérifié 52 tests verts + tsc OK) |
| ~~P1~~ | ~~#8 message:new.senderId en Participant.id sur le chemin WS (auto-message multi-device non réconcilié)~~ | ✅ Corrigé 2026-07-09 (gateway, vérifié 516 suites / 14008 tests verts + tsc OK) |
| P2 | #2 double boucle reconnexion | Peut prolonger une coupure déjà en cours, pas de perte de données mais UX dégradée |
| P2 | #3 pas de gap detection message/reaction | Silencieux — aucune donnée perdue de façon visible pour l'utilisateur avant refetch, mais viole "eventual consistency garantie" |
| P3 | #4 reaction reorder | Fenêtre étroite (dépend de #3 pour se manifester), corrigible avec le timestamp déjà présent au payload |
