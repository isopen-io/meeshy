# Cycle 103 — `message:edited` : le transport que le contrat ne gouvernait pas

**Date** : 2026-08-23
**Branche** : `claude/keen-hamilton-am8ewp`
**Prédécesseur** : cycle 102 (PR #3360) — `messageType`, une règle écrite quatre fois

---

## Le point de départ

Le cycle 102 a laissé un suivi nommé, et il a été instruit tel quel :

> **Le flip du `MessageHandler` reste ouvert** : `_buildMessagePayload` rend
> `unknown`, et `messageType` est servi en `string` quand le contrat déclare
> l'union `MessageType`. Ce cycle-ci a réparé ce que la colonne CONTIENT ; il
> n'a pas encore contraint ce qu'elle DÉCLARE.

Le suivi était **périmé pour le `MessageHandler`** : le flip avait atterri au
cycle 101 bis (PR #3359), et l'en-tête du fichier le dit — « une dette annoncée
s'est révélée inexistante, et c'est mesuré ». Ce qui restait ouvert, c'est le
suivi VOISIN, hérité du cycle 101 :

> `broadcastMessageMutation` prend `payload: Record<string, unknown>` : le 3e
> producteur de `message:edited` sert le contrat par ACCIDENT (`include`
> large), pas par construction.
>
> `senderId` : le chemin REST sert le `Participant.id` brut là où les deux
> autres servent le `User.id`.

Ces deux lignes décrivent **une seule chose** : un transport hors contrat, et
la valeur fausse qui y vivait parce que rien ne le gouvernait.

---

## D1 — `senderId` : trois producteurs, et un qui parle une autre langue

Le contrat partagé déclare `[SERVER_EVENTS.MESSAGE_EDITED]: (message:
SocketIOMessage) => void`, où `senderId` est ce que les clients comparent à
leur propre identité pour reconnaître leurs bulles. `resolveWireSenderId`
(`socketio/messageEditedPayload.ts`) énonce la règle une fois :

```ts
participant?.userId ?? participant?.user?.id ?? message.senderId ?? undefined
```

Le dernier repli ne sert que l'expéditeur ANONYME, qui n'a pas d'autre identité.

| producteur | `senderId` servi |
|---|---|
| `MessageHandler.handleMessageEdit` (socket) | `User.id` — via `buildMessageEditedCore` |
| `MeeshySocketIOManager.broadcastMessageEdited` | `User.id` — via `buildMessageEditedCore` |
| `PUT /messages/:messageId` (iOS) | **`Participant.id`** |
| `PUT /conversations/:id/messages/:messageId` (web) | **`Participant.id`** |
| `PATCH /messages/:messageId` (Android) | **`Participant.id`** |

Les trois entrées REST étalaient la ligne Prisma BRUTE
(`payload: { ...updatedMessage }`), donc `Message.senderId` — la colonne, qui
porte une clé étrangère `Participant`.

### La cause est structurelle

`broadcastMessageMutation` déclarait `payload: Record<string, unknown>` et
émettait à travers un `PreviewEmitIO` dont la signature est
`emit(event: string, payload: unknown)`. Le cliquet de `messageEditedPayload.ts`
— qui dérive de `SocketIOMessage` la liste des champs REQUIS et refuse de
compiler si le noyau en perd un — **n'avait donc aucune prise sur ce
transport-là**.

Il servait le contrat par ACCIDENT : l'étalement d'un `include` large apportait
les sept clés requises. Elles y étaient toutes, avec la mauvaise VALEUR dans
l'une d'elles. Un sac de clés ne satisfait aucun champ ; il n'y avait rien à
faire tomber.

### Le coût, relevé sur les trois clients plutôt que supposé

- **web, mode de lecture Focal** — le seul chemin VIVANT.
  `handleMessageEdited` fusionne la charge reçue dans la ligne en cache
  (`{ ...m, ...message }`, `use-socket-cache-sync.ts`), donc le `senderId` du
  cache est ÉCRASÉ. `FocalRow` (monté par `FocalThread`) calcule
  `const isMe = message.senderId === currentUser.id` : une bulle à soi bascule
  en bulle d'autrui — alignement, couleur, affordances — à la seconde où son
  auteur l'édite. La bulle CLASSIQUE y échappe : `BubbleMessage` passe par
  `getSenderUserId(message.sender)`, qui lit le porteur et non la colonne.
- **iOS** : indemne, vérifié — `markEdited` n'écrit jamais `senderId`
  (déjà mesuré au cycle 102).
- **Android** : indemne — `ChatViewModel` traite `messageEdited` comme un
  simple signal et relit la liste par REST.

Un chemin vivant, donc, et un contrat que **quatre producteurs sur cinq**
honorent déjà — les deux socket, plus la LISTE REST, qui résout la même règle à
la main (`conversations/messages.ts:1076`, avec son commentaire qui l'explique).
Ce lot ne répare pas seulement le chemin vivant : il retire la possibilité que
le cinquième diverge.

La même charge partant dans la file de livraison hors ligne
(`enqueueOfflineMessageMutation`), le rejeu à la reconnexion reposait le même
mauvais identifiant.

---

## D2 — une garde que la couche AU-DESSUS rendait inatteignable

Découvert en ouvrant la charge du transport ci-dessus : un témoin d'additivité
attendait `originalLanguage: 'en'` (la valeur de la colonne) et recevait `'fr'`.

`PUT /conversations/:id/messages/:messageId` est la SEULE des quatre entrées
d'édition à RÉÉCRIRE `originalLanguage`, et son gestionnaire porte la garde qui
convient, avec le commentaire qui l'explique :

```ts
const claimedCanonicalLanguage = claimedLanguage === undefined
  ? undefined
  : normalizeLanguageCode(claimedLanguage) ?? claimedLanguage;
```

> « l'omettre veut dire "je n'affirme rien sur la langue", pas "c'est du
> français" »

**La garde ne pouvait pas se déclencher.** Son schéma de requête déclarait
`originalLanguage: { type: 'string', description: 'Language code', default: 'fr' }`,
et Fastify active `useDefaults` d'AJV. Mesuré sous les options AJV **exactes**
de `server.ts` :

```
body as the handler sees it: {"content":"x","originalLanguage":"fr"}
```

**Un `default` dans un schéma de REQUÊTE n'est pas une documentation, c'est une
écriture dans `request.body` avant que le gestionnaire ne s'exécute.** Le champ
n'arrivait jamais `undefined`.

C'est la famille « une garde conditionnée à ce qu'elle garde est un no-op »
(`services/gateway/CLAUDE.md`), avec la variante qui la rend invisible : ce
n'est pas le gestionnaire qui est faux, c'est la couche AU-DESSUS de lui qui
rend sa précondition inatteignable. Le code se lit juste, le commentaire dit
vrai, et la règle ne s'applique jamais.

### Piège armé, pas panne — et la distinction est mesurée

Une omission réétiquette le message en FRANÇAIS : en base, ET comme langue
SOURCE de la retraduction, qui rend alors un texte anglais comme du français
dans toutes les langues du Prisme.

Mais **aucun client ne déclenche le défaut aujourd'hui**, et c'est relevé, pas
supposé : le web passe `originalLanguage` en paramètre REQUIS de
`handleEditMessage` ; iOS édite par `PUT /messages/:messageId` et Android par
`PATCH /messages/:messageId`, deux routes qui ne portent pas ce champ.

Le premier appelant qui omettra la clé le déclenchera, en lisant une garde qui
a l'air de le couvrir. Règle du cycle 84 : on ne laisse pas un piège armé au
motif que personne n'a encore marché dessus.

### La jumelle a été cherchée, et il n'y en a pas

Balayage des 95 `default:` des schémas de REQUÊTE de
`services/gateway/src/routes`. La quasi-totalité sont des défauts de pagination
(`limit`, `offset`) — inoffensifs et voulus. Le seul autre candidat,
`conversations/messages.ts:1640` (`originalLanguage`/`messageType` sur le SEND),
n'est **pas** le même défaut : `MessageProcessor` déclare
`originalLanguage: string` REQUIS et ne porte aucune branche d'absence à
défaire. C'est un défaut produit, pas une garde neutralisée.

---

## Les correctifs

### 1. Le contrat descend jusqu'au transport REST

`broadcastMessageMutation` cesse de prendre un sac de clés. Son `payload` est
désormais discriminé par `eventType` :

```ts
export type MessageEditedMutationPayload = ReturnType<typeof buildMessageEditedCore>;
export type MessageDeletedMutationPayload = Anonymized<MessageDeletedEventData>;
```

`Anonymized<T> = { [K in keyof T]: T[K] }` — un mappage homomorphe, qui préserve
les modificateurs et ne change rien à la forme. Ce qu'il change : le résultat
est un type OBJET anonyme et non une `interface`, et seuls les premiers
reçoivent la signature d'index implicite qui les rend assignables à
`Record<string, unknown>`, ce que la file hors ligne attend. Sans lui, gouverner
ce champ aurait obligé à réintroduire au site d'appel le cast que ce lot retire.

**Exiger le NOYAU plutôt que le contrat entier est délibéré.** Les extras que
chaque transport sert en propre (`sender`, `translations`, `validatedMentions`,
`meta`) restent libres — TypeScript n'applique pas le contrôle des propriétés
excédentaires aux clés apportées par ÉTALEMENT — et **le lot reste ADDITIF**.
Ce qui cesse d'être libre, c'est de composer soi-même les champs que le contrat
exige.

### 2. Les trois entrées REST passent par la source unique

```ts
payload: {
  ...messageResponse,
  ...buildMessageEditedCore(updatedMessage as unknown as Message, { … }),
}
```

Étalé APRÈS la charge existante, le noyau n'ajoute rien qui ne soit déjà servi —
il corrige la seule valeur qui était fausse. Les deux
`as unknown as Record<string, unknown>` disparaissent : ils n'étaient pas une
commodité de typage, ils étaient la MARQUE du transport hors contrat.

### 3. Le `default: 'fr'` est retiré du schéma de requête

La garde du gestionnaire devient atteignable. Rien d'autre ne bouge : un
appelant qui envoie la clé est traité exactement comme avant.

---

## Le ROUGE, mesuré

Douze témoins écrits d'abord, joués contre la production d'avant.

**D1** — les trois transports, chacun pour lui-même :

```
Expected: "507f1f77bcf86cd799439011"   (User.id)
Received: "507f1f77bcf86cd799439033"   (Participant.id)
```

sur `PUT /messages/:messageId`, `PUT /conversations/:id/messages/:messageId` et
`PATCH /messages/:messageId`. Les témoins de repli ANONYME passaient AVANT comme
APRÈS — ce sont eux qui rendent l'additivité vérifiable.

**D2** — en remettant le `default: 'fr'` :

```
Tests: 2 failed, 9 skipped, 1 passed
  ● n'écrit PAS `originalLanguage` quand le corps n'en revendique aucune
      Expected path: not "originalLanguage"   Received value: "fr"
  ● laisse la langue STOCKÉE intacte sur le fil — `en` reste `en`
      Expected: "en"   Received: "fr"
```

Le troisième — « écrit la langue REVENDIQUÉE, canonicalisée » — passe dans les
deux états : c'est le témoin d'ADDITIVITÉ.

### Le cliquet a des dents, et c'est mesuré aussi

En rétablissant l'ancienne forme sur un seul site :

```
src/routes/messages.ts(734,9): error TS2322:
  Type '{ …31 more… }' is not assignable to type
  '{ id: string; conversationId: string; senderId: string; … messageType: MessageType; … }'
    Types of property 'messageType' are incompatible.
      Type 'string' is not assignable to type 'MessageType'.
```

Ce que le compilateur nomme là est **le troisième suivi du cycle 102** —
`messageType` servi en `string` là où le contrat déclare l'union. Le cycle 102
a réparé ce que la colonne CONTIENT ; ce lot-ci contraint ce qu'elle DÉCLARE,
sur les trois transports REST, et dans l'ordre que le cycle 102 avait fixé.

---

## Ce qui n'a PAS été fait, et pourquoi

**La RÉPONSE HTTP des trois routes d'édition sert toujours le
`Participant.id`.** Le lot corrige la DIFFUSION, pas la réponse — et la
distinction est appuyée sur une mesure, pas sur une préférence : aucun des
trois clients ne lit le corps de la réponse d'édition. iOS l'écarte
(`_ = try await messageService.edit(…)`), Android n'en lit que le succès
(`when (apiCall { messageApi.edit(…) })`), et les deux appelants web
(`useMessageActions`, `use-stream-messages`) `await` sans utiliser la valeur.

Changer la réponse serait donc un changement de contrat REST sans consommateur
à servir, glissé dans un lot dont ce n'est pas le sujet. Il est nommé en suivi.

---

## Gates

- `tsc --noEmit` passerelle : **0 erreur**
- nouveaux témoins : **12/12**
- suites adjacentes (`broadcastMessageMutation`, `MessageHandlerEditedContract`,
  `messages`, `message-edit-mention-parity`, `message-edit-stale-translation`,
  `conversation-messages-advanced`, `message-mutation-serialization`) :
  **7 suites / 234 tests verts**
- suite complète passerelle : voir la section « Gates » du PR

---

## Suivis nommés

- [ ] **La réponse HTTP des trois routes d'édition sert le `Participant.id`**
      là où la LISTE REST sert le `User.id` (`messages.ts:1076`). Sans
      consommateur aujourd'hui (mesuré ci-dessus), donc sans urgence — mais
      c'est la MÊME divergence, une couche plus haut, et elle s'armera le jour
      où un client lira ce corps.
- [ ] **La règle du `senderId` du fil a maintenant DEUX exemplaires** :
      `resolveWireSenderId` et la résolution manuscrite de
      `conversations/messages.ts:1076`. Le second sert en plus
      `senderParticipantId`, ce que le premier ne fait pas — les fusionner est
      un lot à part, à instruire contre le contrat de la liste.
- [ ] **`PreviewEmitIO.emit(event: string, payload: unknown)`** reste la porte
      non typée par laquelle toute diffusion d'aperçu passe. Ce lot a gouverné
      la CHARGE de `broadcastMessageMutation` ; l'émission elle-même n'est
      toujours pas vérifiée contre `ServerToClientEvents`. C'est le même geste
      que les cycles 99-101 ont fait pour les onze handlers, appliqué à un
      relais.
- [ ] Suivi hérité du cycle 102 — **le web porte le cinquième exemplaire de la
      règle `messageType`** (`determineMessageTypeFromMime(mimeTypes[0])`, deux
      sites) : un lot hétérogène y part en `'image'` là où la canonique dit
      `'file'`. Retrait = changement de contrat client.
- [ ] Suivi hérité du cycle 102 — **un message de LIEU sans pièce jointe reste
      `'text'`** quand le client se tait, et iOS se tait toujours : les lieux
      sont sous-comptés par `ConversationMessageStatsService` pour toute la
      population iOS.
- [ ] **`default:` dans un schéma de REQUÊTE mériterait un cliquet.** Le
      balayage de ce cycle était manuel (95 sites, ouverts un par un pour les
      candidats). Le discriminant n'est pas syntaxique — il faut savoir si le
      gestionnaire distingue l'absence — donc l'outil ne peut pas trancher
      seul ; mais il pourrait geler la liste et forcer à instruire tout site
      NEUF. À décider si un troisième cas apparaît.
