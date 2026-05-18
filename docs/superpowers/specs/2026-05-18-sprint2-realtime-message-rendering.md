# Sprint 2 — Rendu temps reel des messages dans la conversation

**Status:** Draft (2026-05-18)

**Scope:**
- iOS — `apps/ios/Meeshy/Features/Main/Views/MessageListViewController.swift`
- iOS — `apps/ios/Meeshy/Features/Main/ViewModels/ConversationSocketHandler.swift`
- iOS — `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift`
- iOS — `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift` (binding du bouton scroll-to-bottom)
- iOS / SDK — `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor.swift`
- Gateway — `services/gateway/src/socketio/MeeshySocketIOManager.ts` (verification uniquement, voir Root Causes)
- Gateway — `services/gateway/src/socketio/handlers/MessageHandler.ts` (verification de `_broadcastNewMessage`)

Lecture seule (chaine du bug, non modifies) : `MessageRecord+ToMessage.swift`, `MessageStore.swift`,
`BubbleContentBuilder.swift`, `BubbleStandardLayout.swift`, `MessageListView.swift`,
`ConversationView+ScrollIndicators.swift`.

---

## Problem / Symptoms

Sur l'ecran de conversation, quatre symptomes lies sont observes a la reception
temps reel des messages :

- **(A)** Un message recu via Socket.IO n'apparait pas immediatement dans la
  collection. Il faut quitter/rouvrir la conversation ou declencher un refresh
  REST pour le voir.
- **(B)** Certaines cellules affichent uniquement l'icone "ajouter une reaction",
  sans bulle de message — cellules vides / cassees.
- **(C)** Des trous dans le listing : messages manquants, ruptures de continuite,
  notamment apres un envoi rapide, une reception concurrente ou une pagination.
- **(D)** Le bouton "scroll-to-bottom" (qui capture les derniers messages) se
  comporte mal : le badge non-lu ne se remet pas a zero de maniere fiable.

---

## Root Causes

| ID | Cause | Symptome | Fichier:ligne (verifie 2026-05-18) |
|----|-------|----------|-----------------------------------|
| RC2.1 | Aucun auto-scroll a l'arrivee d'un message. `applySnapshot` insere en index 0 de la collection inversee sans jamais scroller, meme quand l'utilisateur est en bas. `ConversationViewModel.newMessageAppended` est un etat mort, observe par personne. | A | `MessageListViewController.swift:336-363` (`applySnapshot`) ; `ConversationViewModel.swift:127` (decl. `newMessageAppended`), `:723` (incr.) ; `ConversationSocketHandler.swift:338` (incr.) |
| RC2.2 | **Cause majeure.** Le chemin d'ingestion socket persiste un `MessageRecord` tronque. `IncomingMessageData` ne porte que 6 champs (`id, conversationId, senderId, content, createdAt, computedState`). `reconcileBatchSync` code en dur le reste : `attachmentsJson: nil, reactionsJson: nil, senderName: nil, messageType: "text", originalLanguage: "fr", replyToJson: nil, isEncrypted: false, encryptedPayload: nil`. Un message media-only ou chiffre recu via socket devient une bulle vide. | B, C | `MessagePersistenceActor.swift:52-69` (`IncomingMessageData`), `:232-283` (`reconcileBatchSync`). Chemin REST correct : `:703-1010` (`upsertFromAPIMessages`) |
| RC2.3 | Trous dans le listing, trois sous-causes : **(a)** les lignes vides de RC2.2 occupent un slot et ressemblent a un trou ; **(b)** course optimiste cote iOS — le handler `message:new` reconcilie l'optimiste en scannant `pendingServerIds` *par valeur serverId* (`apiMsg.id`), map peuplee seulement APRES le retour du POST REST ; si le broadcast arrive avant, le handler tombe dans la branche `senderId == userId` et **drop le message** ; **(c)** desync de fenetre entre deux requetes GRDB independantes. | C | `ConversationSocketHandler.swift:241-285` (branche reconciliation), `:308` (drop `senderId == userId`) ; `ConversationViewModel.swift:1585` (peuplement `pendingServerIds`) ; `MessageStore.swift:43-92` (`fetchMessageWindow`) |
| RC2.4 | Le badge non-lu est remis a zero uniquement par `scrollViewDidScroll` quand le seuil near-bottom est franchi. Un scroll programmatique (`scrollToBottom`) ne declenche pas `scrollViewDidScroll` de maniere fiable, donc `isCurrentlyNearBottom` reste desynchronise et `pendingUnreadCount` n'est jamais purge. | D | `MessageListViewController.swift:30` (`isCurrentlyNearBottom`), `:402-405` (`scrollToBottom`), `:564-572` (reset dans `scrollViewDidScroll`) ; `ConversationView+ScrollIndicators.swift:45-50` (handler bouton) ; `MessageListView.swift:420-423` (`scrollToBottomTrigger`) |

### Correction notable du materiel de base — RC2.3(b), volet gateway

Le materiel de base affirmait que `message:new` n'embarque jamais de
`clientMessageId` et qu'une modification gateway etait requise. **C'est
inexact pour le chemin live.** Verification du code 2026-05-18 :

- Le handler live de `message:send` / `message:send-with-attachments` est
  `MessageHandler.handleMessageSend` (`MessageHandler.ts:95`) et
  `handleMessageSendWithAttachments` (`MessageHandler.ts:290`). Les deux
  construisent le payload via `_buildMessagePayload`
  (`MessageHandler.ts:484`, definition `:827`), qui **inclut deja**
  `clientMessageId` (`MessageHandler.ts:850`).
- Le broadcast est deja scinde en deux payloads
  (`MessageHandler.ts:522-558`) : `senderPayload` (conserve
  `clientMessageId`, envoye a `ROOMS.user(senderUserId)` — tous les
  appareils du sender) et `broadcastPayload` (`delete
  broadcastPayload.clientMessageId`, envoye aux autres participants).
- Cote SDK, `APIMessage.clientMessageId: String?` existe et se decode via
  `decodeIfPresent` (`MessageModels.swift:127`, `:169`, `:190`).
- Le `tempId` iOS **est** le `clientMessageId` : il est transmis tel quel
  dans le body REST (`ConversationViewModel.swift:1564`) et dans le
  fallback socket (`:1658`).

Le seul code gateway qui omet encore `clientMessageId` est
`_broadcastNewMessage` dans `MeeshySocketIOManager.ts:1213` (payload
construit `:1280-1341`). **Ce chemin n'est PAS celui de `message:send`** :
`message:send` est route vers `messageHandler` (`MeeshySocketIOManager.ts:535-540`).
`_broadcastNewMessage` reste appele par `broadcastMessage` (chemin REST →
broadcast et drain pending). Conclusion :

> Le gateway n'a **aucune modification fonctionnelle requise** pour Sprint 2.
> La tache T2 se reduit a (1) une verification que le payload sender
> contient bien `clientMessageId` cote production, et (2) optionnellement
> propager `clientMessageId` dans le payload `_broadcastNewMessage`
> (`MeeshySocketIOManager.ts:1280-1341`) pour homogeneite si le chemin
> `broadcastMessage` peut servir un echo au sender. Le vrai correctif
> RC2.3(b) est **entierement cote iOS**.

---

## L'enchainement de la bulle vide (RC2.2 en detail)

```
ConversationSocketHandler.subscribeToSocket (message:new, :224)
  → branche "message d'autrui" :320-330
  → MessagePersistenceActor.IncomingMessageData(id, convId, senderId,
      content, createdAt, computedState)              ← 6 champs seulement
  → bufferIncoming → reconcileBatchSync (:232-283)
      insert MessageRecord avec attachmentsJson: nil, reactionsJson: nil,
      replyToJson: nil, senderName: nil, messageType: "text",
      originalLanguage: "fr", isEncrypted: false, encryptedPayload: nil
  → MessageStore.refreshFromDB → store.message(for:)
  → MessageRecord.toMessage (MessageRecord+ToMessage.swift:10)
      attachmentsJson == nil → uiAttachments = [] (:33-39)
      content == nil        → Message(content: "")  (:97)
  → BubbleContentBuilder : text = nil, attachments = .none
  → BubbleStandardLayout.contentStack ne matche aucune branche → rien
  → reactionsOverlay attache inconditionnellement → cellule vide + icone reaction
```

Un message texte non chiffre venant d'un autre utilisateur "marche" par
chance parce que `content` est non-nil et que `messageType` est reellement
`"text"`. Tout le reste casse :
- message media-only : `content == nil`, `attachmentsJson == nil` → bulle vide.
- message chiffre (DM) : `isEncrypted` force a `false`, `encryptedPayload`
  perdu → le pipeline de dechiffrement ne tourne jamais → contenu vide.
- message avec reply / forward / mentions : metadonnees perdues.

---

## Design / Solution

### Vue d'ensemble

```
AVANT (socket)  : apiMsg → IncomingMessageData(6 champs) → reconcileBatchSync → MessageRecord tronque
APRES (socket)  : apiMsg → APIMessage complet → upsertFromAPIMessages (meme chemin que REST) → MessageRecord complet
```

Principe directeur : **le handler socket detient deja l'`APIMessage`
entierement decode (`apiMsg`)**. La solution consiste a router l'ingestion
socket par le meme chemin que REST — `upsertFromAPIMessages` — au lieu de
fabriquer un `IncomingMessageData` appauvri. C'est la cle de voute (RC2.2),
elle resout B et une grande partie de C.

### iOS — RC2.2 : persistance complete depuis le socket (cle de voute)

`MessagePersistenceActor` expose deja `upsertFromAPIMessages(_ apiMessages:
[APIMessage])` (`MessagePersistenceActor.swift:703`), qui ecrit le
`MessageRecord` complet (attachments, reactions, sender, reply, forward,
type, langue, mentions, effets) et reconcilie correctement les optimistes
via `PendingIdRecord` + lookup PK + scan `serverId`.

1. Ajouter un point d'entree bufferise pour les `APIMessage` complets sur
   l'actor — meme modele que `bufferIncoming` mais portant `[APIMessage]` :

   ```swift
   // MessagePersistenceActor — nouvelle WriteOperation
   enum WriteOperation: Sendable {
       case reconcileBatch([IncomingMessageData])
       case upsertAPIMessages([APIMessage])           // <-- nouveau
       case batchDeliveryUpdate(conversationId: String, event: MessageEvent)
   }

   public func bufferIncomingAPIMessages(_ messages: [APIMessage]) {
       writeContinuation.yield(.upsertAPIMessages(messages))
   }
   ```

   Dans `start()` (`:80-105`), traiter le nouveau cas en appelant
   `upsertFromAPIMessages` ; ce dernier poste deja
   `postMessageStoreRefresh` via son `defer` (`:712`), donc ne PAS reposter.

2. Dans `ConversationSocketHandler.subscribeToSocket`, branche "message
   d'autrui" (`:320-330`), remplacer la construction de
   `IncomingMessageData` par :

   ```swift
   if let persistence = self.persistence {
       await persistence.bufferIncomingAPIMessages([apiMsg])
   }
   ```

   `apiMsg` est l'`APIMessage` brut deja decode en tete de handler (`:224`).
   On le passe tel quel — `upsertFromAPIMessages` resout `senderId`,
   attachments, reactions, reply, etc.

3. Le pipeline de dechiffrement E2EE : aujourd'hui le handler appelle
   `delegate.decryptMessagesIfNeeded(&msgArray)` sur le `Message` domain
   (`:315`) puis persiste le `Message` decode. En routant via `APIMessage`,
   le dechiffrement doit se faire AVANT l'upsert ou etre integre a
   `upsertFromAPIMessages`. Option retenue : conserver le dechiffrement au
   niveau `APIMessage` — `upsertFromAPIMessages` ecrit deja `isEncrypted` /
   `encryptionMode` depuis `api.isEncrypted` / `api.encryptionMode`
   (`:938-939`). Si le contenu chiffre doit etre stocke dechiffre, decoder
   `apiMsg` → dechiffrer → reconstruire un `APIMessage` avec `content`
   clair, OU stocker `encryptedPayload` et laisser `toMessage` + le builder
   dechiffrer a l'affichage. **Decision** : stocker `encryptedPayload`
   (champ deja prevu par le schema GRDB) et conserver la branche
   `decryptMessagesIfNeeded` au moment du `toMessage` — cela evite de
   stocker du clair sur disque et reste coherent avec
   `2026-05-04-ios-persistence-statemachine-design.md` (I6, pipeline E2EE).
   Si `upsertFromAPIMessages` n'ecrit pas `encryptedPayload`
   (verifie : `encryptedPayload: nil` en dur, `:940`), ETENDRE
   `upsertFromAPIMessages` pour le renseigner depuis `apiMsg`.

4. Supprimer / contourner `IncomingMessageData` pour les messages portant
   un `APIMessage` complet. `IncomingMessageData` et `reconcileBatchSync`
   restent utiles si une source ne dispose que des 6 champs (ex.
   NotificationServiceExtension pre-persist) — ne pas les supprimer
   aveuglement ; les marquer comme chemin "donnees minimales" dans un
   commentaire et les garder pour ce cas precis.

### iOS — RC2.3 : reconciliation optimiste fiable par `clientMessageId`

Le gateway echoue deja `clientMessageId` au sender (voir "Correction
notable" plus haut) et `APIMessage.clientMessageId` se decode. Le bug
reside dans `ConversationSocketHandler.swift:241-243` :

```swift
// AVANT — fragile : depend du timing de pendingServerIds (peuple post-REST)
if apiMsg.senderId == userId,
   let tempId = delegate.pendingServerIds.first(where: { $0.value == apiMsg.id })?.key,
   delegate.messageIndex(for: tempId) != nil {
```

```swift
// APRES — robuste : reconcilie par clientMessageId, independant du timing
let reconcileTempId: String? = {
    if let cid = apiMsg.clientMessageId, delegate.messageIndex(for: cid) != nil {
        return cid
    }
    // Fallback retro-compat : ancien chemin par serverId si le payload
    // n'embarque pas clientMessageId (vieux gateway / broadcastPayload).
    return delegate.pendingServerIds.first(where: { $0.value == apiMsg.id })?.key
}()
if apiMsg.senderId == userId, let tempId = reconcileTempId {
    // ... reconciliation existante (applyEvent serverAck, updateServerAckedFields)
}
```

Points cles :
- Le `tempId` optimiste EST le `clientMessageId` (cf.
  `ConversationViewModel.swift:1564`), et la ligne optimiste est inseree en
  GRDB avec `localId = tempId`. `delegate.messageIndex(for: cid)` resout
  donc directement la ligne optimiste, **sans dependre de
  `pendingServerIds`** et donc **sans course avec le retour REST**.
- Si le broadcast `message:new` arrive AVANT le retour du POST REST :
  l'ancien code ne trouvait pas `tempId` (map vide), tombait dans
  `containsMessage` puis `senderId == userId → return` (`:308`) et
  **droppait le message** ; le nouveau code matche par `clientMessageId` et
  reconcilie correctement.
- La branche `senderId == userId { return }` (`:308`) ne doit etre
  atteinte que pour un echo veritablement deja traite. Apres ce fix, ajouter
  une garde : si `apiMsg.clientMessageId != nil` et qu'aucune ligne
  optimiste ne matche, persister via `bufferIncomingAPIMessages` plutot que
  de droper (cas multi-device : autre appareil du meme user).

### iOS — RC2.1 : auto-scroll conditionnel dans `applySnapshot`

Dans `MessageListViewController.applySnapshot` (`:336-363`), apres
`dataSource.apply(...)`, ajouter :

```swift
let delta = newCount - previousSnapshotCount
if delta > 0, !isLoadingOlder, previousSnapshotCount > 0 {
    if isCurrentlyNearBottom {
        scrollToBottom(animated: animated)          // l'utilisateur suit le fil
    } else {
        pendingUnreadCount += delta                  // logique badge existante
        onNewMessagesBadge?(pendingUnreadCount)
    }
}
```

Cela remplace le bloc badge actuel (`:354-359`) par une branche
`if/else` : on scrolle si near-bottom, sinon on incremente le badge. Le
scroll doit se faire APRES `dataSource.apply` pour que l'item existe.
Comme `apply` est asynchrone pour les diffs animes, declencher le
`scrollToBottom` dans le completion handler de `apply` :

```swift
dataSource.apply(snapshot, animatingDifferences: animated) { [weak self] in
    guard let self, scrolled else { return }
    self.scrollToBottom(animated: animated)
}
```

`ConversationViewModel.newMessageAppended` (`:127`) devient pleinement
mort apres ce changement (l'auto-scroll est gere par le controller a
partir du delta de snapshot). **Decision** : supprimer la propriete
`newMessageAppended` et ses sites d'increment (`:723`,
`ConversationSocketHandler.swift:338`) ainsi que le membre du protocole
`ConversationSocketDelegate` (`ConversationSocketHandler.swift:14`).
Verifier qu'aucun `.onChange(of: viewModel.newMessageAppended)` ne subsiste
dans `ConversationView.swift` ; si un handler de scroll en depend, le
retirer (l'auto-scroll vit desormais dans le controller). Si la suppression
elargit trop la surface, alternative minimale : laisser la propriete mais
documenter qu'elle est sans observateur.

### iOS — RC2.4 : reset badge + resync sur scroll programmatique

`scrollToBottom` (`:402-405`) doit, a la fin, resynchroniser explicitement
l'etat near-bottom au lieu de compter sur `scrollViewDidScroll` :

```swift
func scrollToBottom(animated: Bool = true) {
    guard collectionView.numberOfItems(inSection: 0) > 0 else { return }
    collectionView.scrollToItem(at: IndexPath(item: 0, section: 0), at: .top, animated: animated)
    // Resync explicite : un scroll programmatique ne declenche pas
    // scrollViewDidScroll de maniere fiable (pas de phase de drag).
    if !isCurrentlyNearBottom {
        isCurrentlyNearBottom = true
        onNearBottomChanged?(true)
    }
    if pendingUnreadCount > 0 {
        pendingUnreadCount = 0
        onNewMessagesBadge?(0)
    }
}
```

Le handler du bouton dans `ConversationView+ScrollIndicators.swift:45-50`
remet deja `scrollState.unreadBadgeCount = 0` cote SwiftUI ; le fix
ci-dessus garantit la coherence cote controller (source de verite de
`pendingUnreadCount` et `isCurrentlyNearBottom`) pour que le PROCHAIN
`applySnapshot` ne re-incremente pas le badge a tort.

### iOS — RC2.3(c) : desync de fenetre

`MessageStore.refreshFromDB` (`MessageStore.swift:213-258`) lit deja une
fenetre coherente via `fetchMessageWindow` (`:43-92`), declenche par la
notification `messageStoreShouldRefresh`. Apres RC2.2, l'ingestion socket
passe par `upsertFromAPIMessages` qui poste cette meme notification — la
fenetre se recalcule de facon atomique. Aucune modification supplementaire
n'est attendue pour (c) ; si des trous persistent apres T1, instrumenter
`fetchMessageWindow` (log `count` vs `messages.count`) et traiter en T5.

---

## Tasks (TDD — RED / GREEN / REFACTOR)

### T0 — RED : ecrire les tests qui echouent

`MeeshySDKTests` (ou `MessagePersistenceActorTests`) :
- `test_socketIngestion_withMediaAttachment_persistsAttachmentsJson`
- `test_socketIngestion_withReactions_persistsReactionsJson`
- `test_socketIngestion_encryptedMessage_persistsEncryptedPayload`

`ConversationSocketHandlerTests` :
- `test_messageNew_ownMessage_reconcilesOptimisticByClientMessageId`
- `test_messageNew_arrivingBeforeRestResponse_doesNotDropMessage`

`MessageListViewControllerTests` (ou test UI) :
- `test_applySnapshot_whenNearBottom_scrollsToBottom`
- `test_scrollToBottom_resetsPendingUnreadCount`

Mocks selon convention : `Mock{Service}` conforme a `{Service}Providing`,
stubs `Result<T, Error>`, compteurs d'appels. Nommage
`test_{method}_{condition}_{expectedResult}`.

### T1 — GREEN (RC2.2) : router l'ingestion socket vers `APIMessage` complet
- Ajouter `WriteOperation.upsertAPIMessages` + `bufferIncomingAPIMessages`
  sur `MessagePersistenceActor`.
- Etendre `upsertFromAPIMessages` pour renseigner `encryptedPayload` depuis
  `apiMsg` (actuellement `nil` en dur, `:940`).
- Brancher `ConversationSocketHandler` branche "message d'autrui"
  (`:320-330`) sur `bufferIncomingAPIMessages([apiMsg])`.

### T2 — GREEN (RC2.3) : reconciliation par `clientMessageId`
- iOS : reconcilier l'optimiste par `apiMsg.clientMessageId`
  (`ConversationSocketHandler.swift:241-243`), fallback `pendingServerIds`
  pour retro-compat.
- Gateway : **verification uniquement** que `senderPayload` contient
  `clientMessageId` (`MessageHandler.ts:850`, broadcast `:553`).
  Optionnel : propager `clientMessageId` dans le payload de
  `_broadcastNewMessage` (`MeeshySocketIOManager.ts:1280-1341`) pour
  homogeneite. Aucune modification fonctionnelle obligatoire cote gateway.

### T3 — GREEN (RC2.1) : auto-scroll conditionnel
- `applySnapshot` : `scrollToBottom` si near-bottom, sinon incrementer le
  badge. Declencher le scroll dans le completion handler de
  `dataSource.apply`.
- Supprimer (ou documenter comme mort) `newMessageAppended`.

### T4 — GREEN (RC2.4) : reset badge + resync near-bottom sur scroll programmatique
- `scrollToBottom` resynchronise `isCurrentlyNearBottom` et purge
  `pendingUnreadCount`.

### T5 — REFACTOR : reduire les sauts asynchrones de l'ingestion
Aujourd'hui : socket → buffer (`AsyncStream`) → ecriture GRDB → notification
`messageStoreShouldRefresh` → `refreshFromDB` → `messagesDidChange` →
`applySnapshot`. Evaluer si certains hops sont compressibles SANS
reintroduire de course (l'`AsyncStream` serial buffer protege contre la
re-entrance de l'actor — cf. `2026-05-04` C6). Ne refactorer que si gain net.

### T6 — VERIF
- `./apps/ios/meeshy.sh test` vert.
- Gateway `tsc` vert (`cd services/gateway && pnpm tsc --noEmit`).
- Test manuel deux comptes : envoi texte, image, audio, DM chiffre ;
  reception rapide concurrente ; pagination.

---

## Risks

- **Cause partagee avec Sprint 3.** RC2.2 et RC2.3 modifient la zone de
  reconciliation d'echo de `ConversationSocketHandler.swift` (~lignes
  `241-308`). Le Sprint 3 (RC3.3) touche la meme zone. **Sprint 2 doit etre
  fait AVANT Sprint 3**, sequentiellement sur la meme branche. Voir
  "Coordination & Merge".
- **Changement cross-stack — attenue.** Le materiel de base annoncait une
  modification gateway obligatoire. Verification 2026-05-18 : le gateway
  echoue deja `clientMessageId` au sender. T2 cote gateway se reduit a une
  verification ; le correctif reel est iOS-only. Risque de deploiement
  coordonne quasi nul. Conserver neanmoins la verification en production
  (le payload sender doit reellement porter `clientMessageId`).
- **Retro-compat client.** Un ancien client iOS ignore deja
  `clientMessageId` (`decodeIfPresent`, `MessageModels.swift:190`). Le
  nouveau code conserve le fallback `pendingServerIds`, donc un payload sans
  `clientMessageId` (`broadcastPayload` aux non-senders, ou vieux gateway)
  reste gere.
- **Schema de reponse Fastify.** Si une route renvoie `clientMessageId`
  dans un body REST, verifier qu'aucun `response` schema Fastify ne le
  strip. Le contrat REST `MessageSendResponse` echoue deja
  `clientMessageId` (`MessageModels.swift:287`) — verifier le schema de
  `POST /messages`.
- **`DecodingError data.message Int`.** Type-mismatch connu lors du decodage
  socket. Sprint 2 touche le decodage d'ingestion : profiter du passage pour
  rendre le champ tolerant (decoder en `String`/`Int` puis normaliser, ou
  `decodeIfPresent` avec coercition). A traiter dans `APIMessage` /
  `MessageModels.swift` si la trace pointe la.
- **Migration GRDB.** Router le socket vers `upsertFromAPIMessages` ecrit
  des colonnes (`attachmentsJson`, `reactionsJson`, `senderName`,
  `replyToJson`, `mentionedUsersJson`, `encryptedPayload`) qui existent deja
  dans le schema `MessageRecord` (35+ champs depuis la refonte
  `2026-05-04`). **Aucune migration de schema requise** — seul le chemin
  socket ne les remplissait pas. Verifier qu'`encryptedPayload` est bien une
  colonne existante avant T1.

---

## Acceptance Criteria / Verification

1. Un message texte recu via socket apparait immediatement ; si l'utilisateur
   est en bas, la vue auto-scrolle sur le nouveau message.
2. Un message image / video / audio recu via socket affiche sa bulle media
   complete — plus aucune cellule vide avec icone de reaction seule.
3. Un message chiffre (DM) recu via socket affiche son contenu dechiffre.
4. Aucun trou dans le listing apres envoi rapide, reception concurrente ou
   pagination.
5. Le bouton scroll-to-bottom remet le badge non-lu a zero et capture le
   dernier message ; `isCurrentlyNearBottom` est resynchronise.
6. `./apps/ios/meeshy.sh test` vert ET gateway `tsc` vert.
7. Le materiel de base affirmait un correctif gateway : verifier en
   production que le payload `message:new` adresse au sender contient bien
   `clientMessageId`.

---

## Files

### iOS — modifies
- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationSocketHandler.swift`
  — RC2.2 (branche ingestion `:320-330` → `bufferIncomingAPIMessages`),
  RC2.3 (reconciliation par `clientMessageId` `:241-243`), suppression
  membre `newMessageAppended` du protocole `:14` + incrementation `:338`.
- `apps/ios/Meeshy/Features/Main/Views/MessageListViewController.swift`
  — RC2.1 (auto-scroll dans `applySnapshot` `:336-363`), RC2.4
  (`scrollToBottom` resync `:402-405`).
- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift`
  — RC2.1 (suppression `newMessageAppended` `:127`, `:723`).
- `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift`
  — retrait d'un eventuel `.onChange(of:viewModel.newMessageAppended)`.

### SDK — modifie
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor.swift`
  — RC2.2 (`WriteOperation.upsertAPIMessages`, `bufferIncomingAPIMessages`,
  traitement dans `start()` `:80-105`, `encryptedPayload` dans
  `upsertFromAPIMessages` `:940`).
- `packages/MeeshySDK/Sources/MeeshySDK/Models/MessageModels.swift`
  — eventuellement, decodage tolerant pour le `DecodingError data.message Int`.

### Gateway — verification (modification optionnelle uniquement)
- `services/gateway/src/socketio/handlers/MessageHandler.ts`
  — verifier `_buildMessagePayload` `:850` et split-broadcast `:522-558`.
- `services/gateway/src/socketio/MeeshySocketIOManager.ts`
  — optionnel : propager `clientMessageId` dans `_broadcastNewMessage`
  `:1280-1341`.

### Lecture seule (chaine du bug, non modifies)
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessageRecord+ToMessage.swift`
  — `:33-39` (attachments vides), `:97` (`content ?? ""`).
- `apps/ios/Meeshy/Features/Main/Stores/MessageStore.swift`
  — `:43-92` (`fetchMessageWindow`), `:213-258` (`refreshFromDB`).
- `apps/ios/Meeshy/Features/Main/Views/MessageListView.swift`
  — `:420-423` (`scrollToBottomTrigger`).
- `apps/ios/Meeshy/Features/Main/Views/ConversationView+ScrollIndicators.swift`
  — `:45-50` (handler bouton).
- `BubbleContentBuilder.swift`, `BubbleStandardLayout.swift`.

### Symbole NON localise
- `BubbleStandardLayout.contentStack` aux lignes `:391-440` et
  `reactionsOverlay` `:304-308` cites par le materiel de base : non
  re-verifies dans ce passage (fichier `BubbleStandardLayout.swift` non
  ouvert ligne a ligne). L'enchainement logique reste valide ; les numeros
  de ligne de ce fichier precis sont a confirmer au moment de
  l'implementation. Tous les autres numeros de ce document ont ete verifies
  sur le code de travail au 2026-05-18.

### Fichiers nouveaux
Sprint 2 ne propose **aucun nouveau fichier `.swift`**. Tout le travail
s'inscrit dans des fichiers existants. Aucune entree `project.pbxproj` a
ajouter. Les nouveaux fichiers de tests (`MessagePersistenceActorTests`,
`ConversationSocketHandlerTests`, `MessageListViewControllerTests`) — s'ils
n'existent pas deja — devront etre ajoutes au target de test correspondant
dans `project.pbxproj`.

---

## Coordination & Merge

Ce document est l'un de trois specs de sprint rediges en parallele :

| Sprint | Fichier | Sujet |
|--------|---------|-------|
| Sprint 1 | `2026-05-18-sprint1-typing-indicator.md` | Indicateur de saisie (typing) |
| **Sprint 2** | **`2026-05-18-sprint2-realtime-message-rendering.md`** (ce doc) | Rendu temps reel des messages |
| Sprint 3 | `2026-05-18-sprint3-optimistic-media.md` | Media optimiste |

### Ordre d'execution recommande

**Sprint 2 (ce doc) D'ABORD, puis Sprint 3, puis Sprint 1.**

Raison : Sprint 2 et Sprint 3 modifient TOUS LES DEUX
`ConversationSocketHandler.swift` dans la zone de reconciliation d'echo
(~lignes `241-308`, decrite "~257-302" dans le materiel de base — l'ecart
vient des modifications non commitees au moment de la redaction). Ils
**doivent etre sequentiels sur la meme branche** (ou merges dans l'ordre
strict Sprint 2 → Sprint 3). Ils **ne peuvent pas** etre menes dans des
worktrees independants sans conflit.

Sprint 1 (typing) est **totalement independant** de Sprint 2 — aucun
fichier partage — et peut avancer en parallele dans son propre worktree.

### Carte de merge — fichiers touches par Sprint 2

| Fichier | Sprint 2 | Aussi touche par Sprint 3 ? |
|---------|----------|------------------------------|
| `ConversationSocketHandler.swift` | OUI — RC2.2, RC2.3 (zone reconciliation echo `:241-308`) | **OUI — conflit garanti.** Sprint 3 RC3.3 modifie la meme zone. Sequentiel obligatoire. |
| `MessageListViewController.swift` | OUI — RC2.1, RC2.4 | A confirmer par le merger ; Sprint 3 (media optimiste) peut toucher `applySnapshot`. Surveiller. |
| `ConversationViewModel.swift` | OUI — RC2.1 (suppression `newMessageAppended`) | Probable — Sprint 3 (envoi media optimiste) touche le ViewModel. Surveiller la zone d'envoi/optimiste. |
| `ConversationView.swift` | OUI — retrait `onChange` | Possible. Surveiller. |
| `MessagePersistenceActor.swift` | OUI — `WriteOperation`, `bufferIncomingAPIMessages`, `upsertFromAPIMessages` | Probable — Sprint 3 (media optimiste) ecrit aussi via l'actor. **Coordonner l'enum `WriteOperation`.** |
| `MessageModels.swift` | PEUT-ETRE — decodage tolerant | Possible. Surveiller. |
| `MessageHandler.ts` (gateway) | NON (verification seule) | A confirmer. |
| `MeeshySocketIOManager.ts` (gateway) | NON (modification optionnelle seule) | A confirmer. |

### project.pbxproj

Sprint 2 n'ajoute **aucun fichier source `.swift`** (uniquement des fichiers
de tests). Si les fichiers de tests cites en T0 n'existent pas encore, leurs
entrees `project.pbxproj` (target de test) devront etre reconciliees. Par la
regle CLAUDE.md, le **dernier worktree a merger possede `project.pbxproj`**.
Sprint 2 etant merge avant Sprint 3, c'est Sprint 3 (ou le worktree final)
qui reconcilie les entrees `project.pbxproj`. Le merger doit s'assurer que
les entrees de tests ajoutees par Sprint 2 sont preservees lors de la
resolution finale du `project.pbxproj`.
