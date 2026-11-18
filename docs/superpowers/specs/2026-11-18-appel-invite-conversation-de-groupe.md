# Inviter quelqu'un dans un appel l'ajoute à une conversation de groupe, trouvée ou créée, où l'appel continue

Issue : #19650 (parent #19238, le cas de Grace). Décision porteur du 2026-11-18.
Dimensions visées : Sécurité, Cohérence (iOS, web, Android), Simplicité d'usage, Complétude, Compatibilité.

## 1. Le constat

Un invité ajouté à un appel lancé dans une conversation DIRECTE n'est membre d'aucune conversation. Tout ce qui garde la conversation (noms, session active, messages, transcription, résumé) le refuse, ou exige une exception `invitedUserIds` à chaque endroit. En recette staging, l'invité iOS voit le participant web en « ? » : `GET /conversations/:id/active-call` lui répond 404 (il n'est pas membre), alors que `GET /calls/:id`, qui lit `invitedUserIds` depuis 17c33a8402, lui répond avec les noms.

Mesuré dans l'arbre (origin/dev dfd1b74eb6) :

- `call:invite-participant` (`socketio/call-invite-events.ts`) autorise par `authorizeCallInvitation` (`services/calls/callInvitation.ts`) : l'inviteur est connecté à l'appel, l'invité est son ami accepté (`amitieAcceptee`), il n'est pas banni de la conversation, et l'appel compte moins de `CALL_MAX_PARTICIPANTS` actifs. L'invitation est notée sur `CallSession.invitedUserIds`. L'invité qui décroche reçoit une participation INACTIVE `call-guest` (`resolveInvitedGuestParticipantId`).
- `CALL_MAX_PARTICIPANTS = 6` (`packages/shared/types/call-rules.ts`), miroirs `CallRules.maxParticipants` (Swift) et `CallRulesContractTest` (Kotlin).
- La réservation d'appel d'une conversation est `Conversation.activeCallId`, tenue par `ActiveCallClaim` (compare-and-swap).
- Le message « Appel … en cours » (`createLiveCallMessage`) et le résumé de fin (`createCallSummaryMessage`) partagent un `clientMessageId` déterministe et vivent dans `CallSession.conversationId`.
- `call:reaction` est relayé à la room de l'appel et compté sur `CallSession.reactionCounts` ; il n'atteint jamais la conversation.
- `isDuoCall` (dfd1b74eb6) : un appel n'est un duo que si sa conversation est `direct` ET sans invitation.
- `call:join` résout la participation par l'appel (`resolveJoinParticipantId`, depuis `call.conversationId`), jamais par le `conversationId` envoyé par le client.
- Un groupe ajouté par la porte d'ajout reçoit `NEW_MEMBER_PERMISSIONS` (`canViewHistory: false`) : le plancher d'historique (`historyFloor.ts`) ne lui ouvre que ce qui est écrit depuis son arrivée.
- `newMemberRefusal` ferme l'entrée d'une conversation externe et d'un tête-à-tête chiffré de bout en bout (#16188). Un groupe ne peut pas naître `e2ee` (`decideCreationRegime`, `end-to-end-direct-only`).

## 2. La règle

1. **Appel lancé depuis une conversation de GROUPE** (`group`, `public`) : inviter quelqu'un, c'est l'ajouter comme membre de cette conversation, puis le faire sonner. S'il en est déjà membre actif, il sonne seulement.
2. **Appel lancé depuis une conversation DIRECTE** : à la première invitation, la passerelle cherche la conversation de groupe dont les membres actifs sont EXACTEMENT les participants présents de l'appel plus l'invité. Elle la crée si elle n'existe pas. L'appel est rattaché à cette conversation : les clients y basculent sans couper le média, puisque toute la signalisation WebRTC est adressée par `callId`. Les invitations suivantes suivent la règle 1, l'appel vivant désormais dans un groupe.
3. **Réactions et messages pendant l'appel** : ils vont dans la conversation de l'appel. Transcription et résumé y vivent.
4. **Plafond** : un appel réunit MOINS de 6 personnes (5 au plus).
5. **La conversation directe d'origine reste intacte**, et un ancien client qui ignore la bascule continue l'appel.

## 3. Décisions par défaut (à confirmer par le porteur, tracées sur #19650 avec le label `décision-par-défaut`)

| # | Question | Défaut retenu | Pourquoi | Alternative |
|---|---|---|---|---|
| D1 | « Moins de 6 personnes » | `CALL_MAX_PARTICIPANTS` passe de 6 à **5**, pour tous les appels (règle « un jeu » de `call-rules.ts`). Les invitations en cours de sonnerie comptent. | Lecture stricte de la décision. Un ancien client qui croit 6 reçoit `MAX_PARTICIPANTS_REACHED`, qu'il sait déjà lire. | Garder 6 : un littéral à remettre. |
| D2 | Dans un groupe, qui peut faire entrer quelqu'un par l'appel ? | **Tout membre ACTIF connecté à l'appel**, sous la porte d'invitation (ami accepté), et sous toutes les gardes d'entrée de la conversation. Le rang modérateur de `POST /conversations/:id/participants` n'est pas exigé. | La décision assimile l'invitation à l'appel à l'invitation dans la conversation. Ce membre pouvait déjà faire entendre l'appel à cet ami. L'historique reste fermé au nouveau membre (`canViewHistory: false`). Un administrateur peut le retirer ou le bannir. | Exiger MODERATOR+ : un membre simple d'un groupe d'amis ne pourrait plus inviter personne, régression nette de #8433. |
| D3 | Tête-à-tête chiffré de bout en bout | **Pas de bascule.** L'invitation suit le chemin d'aujourd'hui (invité `call-guest` de CET appel). Aucun groupe n'est créé. | Un groupe ne peut naître que `server`/`hybrid`. Créer en silence une conversation lisible par le serveur à partir d'une conversation chiffrée ferait taper l'utilisateur en clair sans qu'il l'ait choisi (#12949, fail-closed). Le défaut « ? » de l'invité y est soldé par la lecture par `callId` (§ 7.1). | Créer le groupe lisible en le disant à l'écran : décision produit. |
| D4 | Où vont les réactions ? | **Sur la bulle d'appel** de la conversation : chaque emoji envoyé pendant l'appel devient la réaction de son auteur sur le message « Appel … en cours » (ajout seul, idempotent). Elle part en `reaction:added` à la conversation, sans notification poussée. Le relais `call:reaction-received` et le compte `reactionCounts` ne changent pas. | Visible dans la conversation, persistant, sans pourriel : la limite est de 5 réactions par seconde, soit 5 messages par seconde et par personne si chaque emoji devenait un message. Rendu déjà présent sur les trois clients. Un ancien client en profite sans mise à jour. | Un message par réaction (avec un pas de 2 s par auteur). |
| D5 | Un appel direct qui sonne encore | L'invitation dans un appel DIRECT exige qu'il soit **décroché** (`answeredAt`). Sinon : `CALL_NOT_ACTIVE`. | « Les participants présents » n'existent qu'après le décroché. Cela évite de basculer un appel que l'appelé est en train de prendre sur la conversation directe. | Basculer quand même : il faudrait alors réécrire la sonnerie en cours. |
| D6 | Navigation | **Aucune navigation forcée.** Le fil ouvert reste ouvert. Ce qui pointe la conversation de l'appel (« Ouvrir la conversation » depuis l'écran d'appel, la pilule de retour à l'appel) pointe désormais le groupe. | Ne jamais arracher l'écran sous le doigt. | Ouvrir le groupe d'office. |

## 4. Le contrat

### 4.1 Événement nouveau : `call:conversation-changed` (serveur → client)

- Nom : `SERVER_EVENTS.CALL_CONVERSATION_CHANGED = 'call:conversation-changed'` (`packages/shared/types/socketio-events/event-names.ts`), entrée dans `event-maps.ts`.
- Audience : `ROOMS.call(callId)`, c'est-à-dire toutes les sockets dans la room de l'appel, l'invité compris s'il y est déjà.
- Moment : juste après la bascule (§ 5.3), AVANT `call:participant-invited` et avant la sonnerie de l'invité.
- Charge (`packages/shared/types/call-controls.ts`) :

```ts
export type CallConversationChangedEvent = {
  readonly callId: string;
  /** La conversation où l'appel vit désormais (groupe trouvé ou créé). */
  readonly conversationId: string;
  /** La conversation d'origine (le tête-à-tête), qui reste intacte. */
  readonly previousConversationId: string;
  readonly conversationType: 'group';
  /** Titre du groupe, `null` pour un groupe sans titre : le client le compose depuis les membres. */
  readonly conversationTitle: string | null;
  /** Les membres actifs du groupe (userId), l'invité compris. */
  readonly memberUserIds: readonly string[];
  /** `true` quand la passerelle vient de créer le groupe. */
  readonly created: boolean;
  readonly reason: 'invitation';
};
```

Un client qui ne connaît pas l'événement l'ignore (rétrocompatibilité, § 6).

### 4.2 Événements existants, inchangés dans leur forme

- `call:invite-participant` (client → serveur) : `{ callId, userId }`, accusé `CallControlAck`. **Aucun code d'erreur nouveau** : on reste dans `CALL_CONTROL_ERROR_CODES`.

  | Situation | Code |
  |---|---|
  | invité banni de la conversation, bloqué avec un participant présent, refusé par une communauté privée, conversation externe | `PERMISSION_DENIED` |
  | pas ami accepté avec l'inviteur | `NOT_A_CONTACT` |
  | actifs + invitations qui sonnent + 1 > `CALL_MAX_PARTICIPANTS` | `MAX_PARTICIPANTS_REACHED` |
  | appel terminé, ou appel direct pas encore décroché (D5) | `CALL_NOT_ACTIVE` |
  | conversation close (410 côté REST) | `CALL_NOT_ACTIVE` |
  | création du groupe impossible (`SERVER_AT_REST_UNAVAILABLE`, base) | `INTERNAL_ERROR` |

- `call:participant-invited`, `call:initiated` (copie de l'invité), push VoIP / APNs / FCM de l'invité : même forme. Ils portent désormais `conversationId` = le groupe, `conversationType: 'group'` et `conversationTitle`.
- `call:reaction` / `call:reaction-received` : inchangés. La réaction est EN PLUS posée sur la bulle d'appel (D4), par `reaction:added`, l'événement de réaction de message existant.
- `conversation:new` : envoyé à chaque membre d'un groupe CRÉÉ pour l'appel, aussitôt (le groupe n'est pas « silencieux jusqu'au premier message » : l'appel est son activité). Les sockets connectées de chaque membre rejoignent `ROOMS.conversation(groupId)` avant l'annonce.
- Admission dans un groupe existant : `conversation:joined`, effectif et éventail par le site unique `announceMembershipAdmission`, et message d'arrivée « X a ajouté Y » (`postJoinSystemMessage`), comme la porte d'ajout.

### 4.3 Schéma

- `CallSession.originConversationId String? @db.ObjectId` : la conversation directe d'origine, écrite UNE fois par la bascule, absente sinon. Champ optionnel : aucune migration de données, aucun index (il se lit toujours par `callId`). Il n'est pas servi aux clients (il ne figure pas dans `callSessionSchema`).

### 4.4 Routes

- `GET /conversations/:id/active-call` : quand aucun appel vivant n'a `conversationId = :id`, la route sert l'appel vivant qui détient la réservation `Conversation(:id).activeCallId` SI sa `originConversationId = :id`. La garde reste la même : le demandeur est membre actif de `:id`, sinon 404 comme une conversation inexistante (#8116). La session servie porte `conversationId` = le groupe. C'est ce qui garde la « Rejoindre » de la bulle d'origine et la reprise d'un ancien client.
- Aucune route nouvelle. `GET /calls/:id` (lecture par `callId`) devient le chemin des noms côté clients (§ 7).

### 4.5 Constante

- `CALL_MAX_PARTICIPANTS = 5` (D1), avec ses miroirs Swift et Kotlin et les témoins de relations de `call-rules.test.ts`.

## 5. La passerelle

### 5.1 Le chemin d'une invitation

`call-invite-events.ts` orchestre ; une fonction pure décide du chemin :

```
authorizeCallInvitation (gardes communes, § 5.2)
  → callInvitationRoute(session) :
      conversation group|public            → 'admit-member'
      conversation direct, e2ee            → 'legacy-guest'    (D3, comportement d'aujourd'hui)
      conversation direct, server|hybrid   → 'rebranch'
  'admit-member' : admitConversationMember(invité) si pas déjà membre actif
  'rebranch'     : findOrCreateCallGroup → rebranchCall (§ 5.3) → admit-member n'est plus nécessaire (l'invité est fondateur ou membre du groupe trouvé)
  → recordCallInvitation (invitedUserIds, conservé : il dit « invité, pas encore là » et sert le chemin legacy)
  → emit call:conversation-changed (si bascule) → emit call:participant-invited
  → ring (conversationId = conversation de l'appel) → armExpiry
```

### 5.2 Gardes (fail-closed, toutes avant la première écriture)

1. Session vivante, inviteur connecté (`activeCallStanding`), invité ni l'inviteur ni déjà dans l'appel.
2. Appel direct : décroché (D5).
3. Plafond : `actifs + invitations qui sonnent + 1 ≤ CALL_MAX_PARTICIPANTS`. Les invitations qui sonnent se lisent dans `CallInvitationLifecycle` (nouvelle méthode `pendingFor(callId)`).
4. `amitieAcceptee(inviteur, invité)`, inchangé.
5. Blocage : `isBlockedBetween(invité, p)` pour chaque participant ACTIF de l'appel → `PERMISSION_DENIED`.
6. Conversation cible (celle de l'appel, ou le groupe trouvé) : ni close ni supprimée, `newMemberRefusal` nul, invité non banni (`resolveConversationEntry`), admission de communauté privée (`planSalonEntry`).
7. `decideDirectOpening(inviteur, invité)` alimente les colonnes de demande comme la porte d'ajout ; entre amis acceptés, l'ouverture est directe.

### 5.3 Trouver ou créer le groupe, puis basculer l'appel

**Ensemble cible** `S` = les `userId` des participants ACTIFS (non partis) de l'appel ∪ {invité}. |S| ≤ `CALL_MAX_PARTICIPANTS`.

**Correspondance EXACTE** (`findExactCallGroup`), jamais un sur-ensemble ni un sous-ensemble :

- candidats : conversations `type = 'group'` dont l'inviteur est membre actif, `isActive`, `closedAt`/`deletedAt` nuls, `communityId` nul (pas un salon), pas `isAnnouncementChannel`, mode non `e2ee` ;
- un candidat est retenu si ses participants ACTIFS (tous types, anonymes compris) sont exactement `S` : même cardinal, même ensemble. Un ancien membre parti ou banni (`isActive: false`) ne compte pas ;
- exclus : un candidat dont la réservation `activeCallId` est tenue par un autre appel vivant ;
- départage : `lastMessageAt` le plus récent.

**Création** (`createCallGroup`) quand rien ne correspond : `type: 'group'`, sans titre, régime `implicitConversationRegime` (`server`, la garde `conversation-create-sealed-sweep.test.ts` le vérifie), l'inviteur `creator` et les autres `member`, `FOUNDING_MEMBER_PERMISSIONS`, langue de chacun par `recipientLanguage`. Le groupe naît SANS annonce. Il n'est annoncé qu'après la bascule gagnée.

**Bascule** (`rebranchCall`, compare-and-swap, sans transaction multi-documents) :

1. `activeCallClaim.claim(G, callId)`. Si la réservation est perdue : candidat suivant, ou création.
2. `callSession.updateMany({ where: { id, conversationId: D, endedAt non posé }, data: { conversationId: G, originConversationId: D, version: { increment: 1 } } })`.
   - `count = 0` (une invitation concurrente a basculé la première) : rendre la réservation de G, supprimer G s'il vient d'être créé (vide, jamais annoncé), relire la session et reprendre en `'admit-member'` sur la conversation gagnante.
3. Réservation de D : **conservée** pendant l'appel. La ligne de D continue de dire « Appel en cours », et `active-call` de D sert l'appel (§ 4.4).
4. Les lignes `CallParticipant` de l'appel sont repointées vers les `Participant` de G (même `userId`). Par construction, chacun est membre de G.
5. Message « Appel … en cours » créé dans G (`createLiveCallMessage`), diffusé par `message:new`. Celui de D reste en place.
6. `joinUserToConversationRoom` pour chaque membre, `conversation:new` si G est créé, puis `call:conversation-changed`.

### 5.4 Pendant l'appel et à sa fin

- `isDuoCall` lit `group` : le groupe continue quand un membre raccroche (dfd1b74eb6). La grâce du survivant seul (#9109) s'applique.
- Fin : la libération rend les DEUX réservations, `conversationId` et `originConversationId` (`ActiveCallClaim.release` relit `originConversationId` et la libère par compare-and-clear).
- Résumé : il est édité en place dans G, comme aujourd'hui. Le message « en cours » de D reçoit le MÊME état terminal (édition seulement, jamais une création), diffusé par `message:edited` à D. L'engagement d'appel n'est crédité qu'une fois (G).
- Transcription, enregistrement et journal suivent `CallSession`. Ils vivent dans G.
- Messages : un client à jour envoie dans G. Un ancien client continue d'écrire dans D (dégradation acceptée, § 6).

### 5.5 Fichiers

Budget : `CallService.ts` (2 869 lignes) et `CallEventsHandler.ts` (4 047) sont hors budget. **Aucune ligne nette ne s'y ajoute.** Le câblage passe par des modules neufs et par les fabriques de dépendances existantes. Si un accesseur manque (la réservation d'appel), on extrait d'abord.

| Fichier | Rôle |
|---|---|
| `services/gateway/src/services/calls/callInvitationRoute.ts` (neuf) | pur : `'admit-member' \| 'rebranch' \| 'legacy-guest'` |
| `services/gateway/src/services/calls/callGroupConversation.ts` (neuf) | `exactMembers(S)`, `findExactCallGroup`, `createCallGroup` |
| `services/gateway/src/services/calls/callConversationRebranch.ts` (neuf) | `rebranchCall` (§ 5.3, étapes 1 à 6) |
| `services/gateway/src/services/calls/originConversationCall.ts` (neuf) | alias `active-call` de D ; état terminal du message « en cours » de D |
| `services/gateway/src/services/calls/callReactionOnBubble.ts` (neuf) | réaction de l'auteur sur la bulle d'appel (D4), ajout seul, sans notification, ignorée en `e2ee` |
| `services/gateway/src/services/conversations/memberAdmission.ts` (neuf) | `admitConversationMember`, EXTRAIT de `admitOneParticipant` (`routes/conversations/participants-writes.ts`), que la route consomme ensuite. Option `notifyInvitee: false` pour l'appel : la sonnerie est la notification |
| `services/gateway/src/services/calls/callInvitation.ts` | gardes D5, plafond avec invitations qui sonnent, blocage |
| `services/gateway/src/socketio/call-invite-events.ts` | orchestration § 5.1 |
| `services/gateway/src/socketio/call-invite-lifecycle.ts` | `pendingFor(callId)` |
| `services/gateway/src/socketio/call-reaction-events.ts` | dépendance `reflectOnBubble` après le relais |
| `services/gateway/src/services/calls/activeCallClaim.ts` | libération de l'origine |
| `services/gateway/src/routes/calls-consultation.ts` | alias `active-call` |
| `services/gateway/src/socketio/callMessageBroadcasters.ts` | déclenche l'état terminal du message de D après celui de G |
| `packages/shared/prisma/schema.prisma` | `CallSession.originConversationId` |
| `packages/shared/types/call-rules.ts`, `call-controls.ts`, `socketio-events/event-names.ts`, `event-maps.ts` | constante, type, nom, carte |

### 5.6 Témoins (rouges d'abord, `bun test` dans `services/gateway`)

1. `callGroupConversation` : trouve le groupe aux membres actifs exactement `S` ; ignore un sur-ensemble (S + 1), un sous-ensemble, un salon de communauté, un groupe clos ou supprimé, un groupe `e2ee`, un groupe dont la réservation est tenue par un appel vivant ; compte un ancien membre banni ou parti comme absent ; départage par `lastMessageAt` ; rend `null` sans candidat.
2. `createCallGroup` : groupe `group`, membres `S`, inviteur `creator`, régime `server` posé à la création ; pas d'annonce avant la bascule.
3. `rebranchCall` : déplace `conversationId`, pose `originConversationId`, prend la réservation de G et garde celle de D, repointe les `CallParticipant`, crée le message « en cours » dans G, émet `call:conversation-changed` avec la charge du § 4.1 à `call:<callId>` AVANT `call:participant-invited`.
4. Course : deux invitations simultanées dans le même appel direct ⇒ une seule bascule ; le groupe créé par la perdante est supprimé ; la seconde invitation admet son invité dans le groupe gagnant.
5. Groupe : l'invité devient membre actif `member`, `canViewHistory: false`, message d'arrivée posté, puis il sonne avec `conversationId` = le groupe ; déjà membre ⇒ il sonne seulement, rien n'est écrit.
6. Refus sans écriture : banni ⇒ `PERMISSION_DENIED` ; bloqué avec un participant présent ⇒ `PERMISSION_DENIED` ; communauté privée ⇒ `PERMISSION_DENIED` ; 4 actifs + 1 qui sonne ⇒ `MAX_PARTICIPANTS_REACHED` ; appel direct non décroché ⇒ `CALL_NOT_ACTIVE`.
7. Tête-à-tête `e2ee` ⇒ chemin `call-guest` d'aujourd'hui, aucun `conversation.create`, aucun `call:conversation-changed`.
8. `GET /conversations/D/active-call` après bascule : sert l'appel (`conversationId` = G) à un membre de D ; 404 pour un non-membre, inchangé.
9. Fin d'un appel basculé : les deux réservations sont rendues ; le message de G et celui de D passent au même état terminal ; l'engagement est crédité une fois.
10. Réaction : posée une fois par auteur et par emoji sur la bulle de G (idempotente), `reaction:added` à la conversation, aucune notification ; ignorée en `e2ee` ; relais `call:reaction-received` et `reactionCounts` inchangés.
11. `CALL_MAX_PARTICIPANTS === 5`, les relations de `call-rules.test.ts` tiennent ; `conversation-create-sealed-sweep.test.ts` reste vert ; les suites de `participants-writes` restent vertes après l'extraction.

Les lots crypto, accès et migration passent l'agent `auditeur-adversarial` avant fusion : ici l'admission par l'appel (D2) et la bascule.

## 6. Rétrocompatibilité

| Client | Contre le nouveau serveur |
|---|---|
| Ancien client dans l'appel au moment de la bascule | Ignore `call:conversation-changed`. Le média continue (signalisation par `callId`). `call:join`, `call:leave`, les battements et la reprise passent par `callId`. Sa reprise après coupure par `active-call` de D est servie par l'alias (§ 4.4). `call:check-active` le trouve par son adhésion au groupe. Ses réactions apparaissent sur la bulle (D4). Ses messages vont dans D : dégradation acceptée, D reste intacte. |
| Ancien client invité | Reçoit `call:initiated` avec `conversationId` = le groupe dont il est membre. Il décroche par le chemin ordinaire de membre. Le « ? » disparaît même sans mise à jour, puisque `active-call` lui répond. |
| Ancien serveur, nouveau client | Pas d'événement de bascule : le client garde la conversation d'origine, comme aujourd'hui. Il lit les noms par `callId` (§ 7). |
| Plafond 6 → 5 | Un ancien client qui offre la 6e place reçoit `MAX_PARTICIPANTS_REACHED`, déjà rendu. |

Rien ne se retire : `invitedUserIds`, le chemin `call-guest` (servi en `e2ee`), `call:reaction-received` et `reactionCounts` restent.

## 7. Les clients

Commun aux trois : à `call:conversation-changed` pour l'appel EN COURS (même `callId`), le client remplace la conversation de l'appel par `conversationId`, marque l'appel comme appel de groupe avec `conversationTitle`, et pointe vers le groupe tout ce qui ouvre « la conversation de l'appel ». Il ne navigue pas d'office (D6). Pour un autre `callId`, il ignore. La liste des conversations reçoit le groupe par `conversation:new`, qu'elle lit déjà.

### 7.1 iOS (`apps/ios` + `packages/MeeshySDK`)

SDK :

- `Sockets/SocketEvent.swift` : `case callConversationChanged = "call:conversation-changed"`.
- `Sockets/MessageSocketManager+CallControls.swift` : `CallConversationChangedEvent` (Decodable, champs du § 4.1) et `CallControlSocketEvent.conversationChanged`, routés dans `callControlRoutes`.
- `Models/CallModels.swift` : `ActiveCallParticipant` décode `isMuted: Bool?` et `isVideoOff: Bool?`, servis par `toCallParticipantResponse`. Un champ absent reste toléré.
- `Services/ActiveCallService.swift` : `ActiveCallServiceProviding.callSession(callId:)` lit `CallsEndpoint.byCallId` (`GET /calls/:id`), qui marche pour un membre comme pour un invité `call-guest` (D3).
- `Models/CallRules.swift` : `maxParticipants = 5`.

App :

- `Features/Call/Services/CallControlsController.swift` : `.conversationChanged` est remis à l'hôte.
- `Features/Call/Services/CallManager+GroupMesh.swift` : `adoptCallConversation(_:)` marque d'abord G dans le maillage (`markGroupConversation(G, title)`), puis pose `conversationId = G`, de sorte que `isGroupCall` ne retombe jamais à faux. Elle rafraîchit CallKit (`CXCallUpdate.localizedCallerName` = titre du groupe ou noms composés) et relance `syncWithHost()`.
- `Features/Call/Services/GroupCallMeshCoordinator.swift`, défaut indépendant à corriger :
  - `receive()` admet aujourd'hui un membre découvert par son offre avec `isVideoEnabled = host.isLocalVideoEnabled`, c'est-à-dire MA caméra. Il doit prendre l'état de SA caméra : `knownSession` (`!isVideoOff`, micro `isMuted`) quand la session est lue, sinon `false`, jusqu'à la lecture ou au premier `media-toggled` ;
  - `enrich(with:)` applique aussi les états médias servis, pas seulement nom et avatar ;
  - `enrichNamesIfNeeded()` lit `activeCalls.callSession(callId:)`, et non plus `activeCall(conversationId:)`.
- `Features/Call/Services/GroupCallRoster.swift` : `GroupCallArrival` porte l'état micro si ce n'est pas déjà le cas.

Témoins (XCTest, `test_{méthode}_{condition}_{attendu}`) :

- `test_receive_offerFromUnknownMemberWhileLocalCameraOn_doesNotCopyLocalCamera`
- `test_receive_offerFromUnknownMemberWithServedCameraOff_admitsVideoDisabled`
- `test_enrich_servedMediaState_appliedToRoster`
- `test_enrichNamesIfNeeded_readsSessionByCallId_neverByConversation` (le double compte `callSession(callId:)` = 1, `activeCall(conversationId:)` = 0)
- `test_adoptCallConversation_currentCall_rebindsConversationAndStaysGroup`
- `test_adoptCallConversation_otherCall_ignored`
- SDK : décodage de `CallConversationChangedEvent` ; `ActiveCallParticipant` avec et sans `isMuted`/`isVideoOff` ; miroir `CallRules.maxParticipants == 5`.

Gardes : fichiers de test inscrits au projet (pbxproj commité, ou `xcodegen generate`), puis `check_test_registration.sh`, `check_house_rules.sh`, `check_cohesion_budget.sh`, `node scripts/check-accent-color-hardcoding.mjs`, rejoués sur l'arbre fusionné. Ne démarrer aucun simulateur sans accord : la recette à trois appareils est un lot à part.

### 7.2 Web (`apps/web`)

- `src/lib/calls/call-socket-bridge.ts` : `SERVER_EVENTS.CALL_CONVERSATION_CHANGED` dans `CALL_SERVER_EVENTS`.
- `src/lib/calls/call-decode.ts` : `decodeConversationChanged(payload)`, qui rend `null` sur une charge malformée.
- `src/lib/calls/call-store.ts` : fonction pure `switchCallConversation(state, { callId, conversationId, title })`. Elle change `call.conversationId`, passe `isGroup: true` et pose le titre, seulement si `callId` correspond.
- `src/lib/calls/engine-controls.ts` : `receive()` traite l'événement par `deps.update(switchCallConversation…)`. `engine.ts` (1 132 lignes) ne reçoit rien.
- Les noms des membres se lisent déjà par la session de l'appel. Vérifier que `call-people.ts` / `call-header-names.ts` ne dépendent pas d'une lecture par conversation, sinon les passer par `callId`.
- `src/lib/calls/` (miroir de règle) : le plafond vient de `@meeshy/shared` (`call-rules.test.ts` côté web).

Témoins (`bun test` complet depuis `apps/web`, puis build et cliquets) :

- l'événement pour l'appel courant ⇒ `liveCallIn(state, G)` rend l'appel, `liveCallIn(state, D)` rend `null`, `isGroup` est vrai et le titre est posé ;
- un autre `callId`, ou une charge malformée ⇒ état inchangé ;
- le pont écoute `call:conversation-changed`.

### 7.3 Android (`apps/android`)

- `core/model/.../socket/SocketEventNames.kt` : `CALL_CONVERSATION_CHANGED`.
- `core/model/.../call/CallSocialEvents.kt` : `data class CallConversationChanged` ; parseur `CallSocialEventParser.conversationChanged`.
- `sdk-core/.../socket/CallSocialSignalManager.kt` : flux `conversationChanged` et route.
- `feature/calls/.../CallViewModel.kt` (948 lignes) : collecte, puis met à jour `CallUiState.conversationId`, la nature groupe et le titre, par une fonction pure extraite (`CallConversationSwitch.kt`, neuf) pour ne pas grossir le ViewModel.
- Les capacités qui gardent leur propre `conversationId` (`GroupCallMesh.kt`, `CallCaptionsCapability.kt`, `CallOwnSpeechCapability.kt`, `CallRecordingCapability.kt`, `CallLiveFrameController.kt`) lisent un seul porteur, `CallConversationBinding` (StateFlow, neuf). On ne recopie pas la valeur dans cinq champs.
- `GroupCallMesh.kt` : vérifier le même défaut que iOS (état caméra d'un membre découvert par son offre) et le corriger à l'identique s'il existe.
- Miroir du plafond : `CallRulesContractTest` à 5.

Témoins : parseur (charge complète, malformée) ; `CallConversationSwitch` (même `callId` ⇒ bascule ; autre ⇒ rien) ; `CallConversationBinding` lu par le maillage et les capacités. Preuve : `assembleDebug` + `testDebugUnitTest` verts par `workflow_dispatch` d'`android.yml`, le seul compilateur Android joignable.

## 8. Ordre des lots

1. Contrat partagé (constante, type, nom, carte, schéma) : petit, en premier, il débloque tout.
2. Passerelle : extraction de l'admission, puis groupe exact et création, bascule, alias et origine, réactions sur la bulle. Auditeur adversarial.
3. iOS (SDK + app), dont le défaut caméra et la lecture par `callId`, livrables indépendamment de 2.
4. Web.
5. Android.
6. Recette staging à trois (deux iOS + web) : chacun voit et entend les deux autres, noms compris, l'invité aussi ; un raccroché laisse les deux autres en appel ; réactions sur la bulle du groupe ; la conversation directe garde sa bulle, terminale à la fin.

## 9. Risques

- **Admission par l'appel (D2)** : un membre simple fait entrer un ami sans le rang modérateur. Bornée par l'amitié acceptée, le plancher d'historique et le plafond ; tracée en décision par défaut, et l'auditeur adversarial la relit.
- **Plafond 6 → 5 (D1)** : touche aussi les appels lancés depuis un grand groupe. Un littéral et ses miroirs.
- **Course de bascule** : sans transaction multi-documents, l'ordre « réserver G → CAS session → repointer » laisse une fenêtre. La perdante défait ce qu'elle a écrit (réservation, groupe vide) ; un groupe vide orphelin reste possible si le processus meurt entre la création et la suppression. Il est invisible (jamais annoncé, aucun message).
- **Groupe trouvé = groupe vécu** : l'appel et sa bulle arrivent dans un groupe où ces personnes discutent déjà. C'est l'intention de la décision, mais une invitation suivante y ajoute durablement un membre (règle 1).
- **Ancien client** : ses messages tapés pendant l'appel vont dans D.
- **Rendu d'une bulle d'appel « en cours » à deux endroits** (D et G) : les deux passent au même état terminal à la fin. Une fin perdue (processus tué) laisse celle de D « en cours » jusqu'au ramasse-miettes, comme aujourd'hui pour une seule bulle.
- **Budgets** : `CallService.ts` et `CallEventsHandler.ts` hors budget. Tout câblage qui exigerait d'y ajouter impose une extraction d'abord, et le lot grossit d'autant.
- **E2EE (D3)** : l'appel chiffré reste sur l'ancien modèle d'invité. Le « ? » y est soldé par la lecture par `callId`, mais réactions et messages n'y entrent pas dans une conversation commune.
