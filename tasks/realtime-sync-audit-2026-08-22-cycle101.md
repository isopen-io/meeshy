# Cycle 101 — `message:edited` : le transport d'édition PRIMAIRE servait une charge que le décodeur iOS REJETTE

## D'où part ce cycle

Le cycle 100 a basculé six handlers de plus sur `MeeshySocket` (le `Socket` typé
contre `ServerToClientEvents`) et laissé en suivi nommé **quatre handlers rendus
au `Socket` nu** : `MessageHandler`, `AuthHandler`, `ReactionHandler`,
`PostReactionHandler`. Il écrivait, du premier :

> `MessageHandler._buildMessagePayload` rend `unknown` : c'est LA source du fait
> que le contrat ne contraignait pas le producteur WebSocket de `message:new`.
> Lui donner un type de retour honnête est le geste qui aurait fait tomber le
> défaut de 99/99 bis à la compilation.

Ce cycle-ci instruit ce suivi. Le flip des quatre a été **tenté et mesuré** :
`tsc` a nommé **douze** émissions. Onze relevaient de dettes connues ; **la
douzième était une panne en production que personne n'avait vue.**

## Le défaut

`message:edited` a **TROIS producteurs** :

| producteur | transport | employé par |
|---|---|---|
| `MessageHandler.handleMessageEdit` | socket | **le web** (`messaging.service.ts` émet `message:edit`) |
| `MeeshySocketIOManager.broadcastMessageEdited` | interne | résumés d'appel |
| `broadcastMessageMutation` | REST | **iOS** (`PUT /messages/:messageId`) |

Le contrat partagé déclare l'événement comme un `SocketIOMessage`
(`socketio-events.ts:1940`), dont **sept champs sont requis**. Le producteur
socket — celui que son propre commentaire nomme « le transport d'édition
PRIMAIRE » — n'en servait que **quatre**. Son littéral, manuscrit, portait
exactement sept clés :

```ts
const updatedMessage = {
  id, conversationId, content, isEdited, editedAt, originalLanguage, sender,
};
```

Manquaient **`senderId`, `messageType`, `createdAt`**.

### Ce n'était pas un piège armé, c'était une panne

Le décodeur iOS lit ces deux-là **sans tolérance** :

```swift
// APIMessage.init(from:) — MessageModels.swift
conversationId = try c.decode(String.self, forKey: .conversationId)
senderId       = try c.decode(String.self, forKey: .senderId)   // ← absent du fil
createdAt      = try c.decode(Date.self,   forKey: .createdAt)  // ← absent du fil
```

`try c.decode`, pas `decodeIfPresent` — contrairement à ses voisins immédiats.
Une clé absente y fait échouer le décodage du message **ENTIER** ;
`MessageSocketManager.decode` journalise un « decode DROP » et abandonne, si
bien que le sujet `messageEdited` ne publie **jamais rien**.

```
un utilisateur web édite un message
  → la passerelle diffuse la charge partielle à TOUT le salon
  → chaque client iOS présent la rejette au décodage
  → l'édition n'apparaît JAMAIS en direct sur iOS
```

**Et personne ne pouvait le voir depuis les autres clients.** Web → web
marchait : son écouteur est typé `any` et reconstruit un `Message`. Android
marchait : `ApiMessage.senderId` et `.createdAt` y sont `String? = null`. Seul
iOS, le client le PLUS strict, tombait — et en silence, dans un log d'un
processus que personne ne regarde.

> C'est la signature exacte du cycle 99 bis, un événement plus loin : **web →
> web marchait, iOS non.** Deux producteurs cohérents CHACUN avec eux-mêmes, et
> faux ENSEMBLE — la « quatrième famille » (`services/gateway/CLAUDE.md`) : une
> déclaration PRÉSENTE, bien formée, et fausse contre son producteur.

### Le web y perdait aussi quelque chose

Avant ce lot, la charge socket ne portait **aucun** `senderId`. Le web
reconstruit son `Message` depuis la charge reçue (`convertMessageFn`) : après
une édition passée par le socket, il n'en avait donc pas non plus. Servir le bon
identifiant est une réparation pour les deux clients, pas seulement pour iOS.

## Ce qui est livré

### 1. `socketio/messageEditedPayload.ts` — la source unique du noyau

Sur le patron de `messageNewPayload.ts` (cycle 99 bis) : `buildMessageEditedCore`
porte **les champs que le contrat déclare requis**, résolus une seule fois pour
tous les producteurs. Les deux producteurs en-process y passent désormais.

Restent **hors** de l'unité, avec leur raison écrite — même règle que son
jumeau, ces formes sont DÉLIBÉRÉMENT propres à chaque transport et les fusionner
serait un CHANGEMENT, pas un ajout :

- `sender` — passthrough BRUT côté socket (son `select` porte `role`, pas
  `user`), reconstruit et aplati côté manager ;
- `translations` — chaque chemin les obtient par sa propre voie ;
- `attachments`, `metadata`, `messageSource` — servis par les seuls chemins qui
  les chargent.

**Le lot est ADDITIF.** Aucun champ ne disparaît d'aucun transport : le
producteur socket GAGNE trois champs, le manager passe à l'unité **sans que sa
charge change d'une clé** (vérifié champ par champ avant bascule). Un témoin
dédié — « ne perd RIEN de ce que le producteur servait déjà » — passe AVANT et
APRÈS le correctif ; c'est lui qui rend la mesure vérifiable.

### 2. `resolveWireSenderId` — une seule résolution pour les deux événements

`senderId` du fil est un **`User.id`**, jamais le `Participant.id` de la colonne :
les clients le comparent à leur propre `User.id` pour reconnaître leurs messages.
`buildMessageNewPayload` portait cette règle en ligne ; elle est maintenant
écrite **une fois**, et `message:new` comme `message:edited` en dépendent. Sans
quoi la MÊME bulle serait « la mienne » puis « celle d'un autre » selon
l'événement qui l'a touchée en dernier.

### 3. Deux seams `unknown` de plus fermés

Suite directe de la leçon du cycle 100 (« un seam qui prend `unknown` annule le
contrat de tout ce qui passe par lui ») :

| handler | seam | fermé en |
|---|---|---|
| `ReactionHandler` | `_broadcastReactionEventWithConversationId(_, updateEvent: unknown, _)` | `ReactionUpdateEventData` |
| `PostReactionHandler` | `broadcastReactionChange(…, updateEvent: unknown)` | `PostReactionUpdateEventData` |

Les deux `createUpdateEvent` rendaient déjà exactement ces formes : flip propre,
0 erreur. Les deux handlers sont désormais sur `MeeshySocket`.

### 4. `AuthenticatedEventData` cesse de mentir

Le contrat déclarait `user?: SocketIOUser` — onze champs requis (`username`,
`email`, `role`, `isOnline`, `lastActiveAt`…). Les **deux seuls** émetteurs de
`AUTHENTICATED` servent `{ id, language, isAnonymous }` + `version`. `language`
n'existe même pas sur `SocketIOUser`, et un participant ANONYME n'a pas de ligne
`User` d'où tirer le reste.

Relevé avant de trancher : le type n'a **aucun consommateur** hors sa propre
déclaration ; iOS et Android n'écoutent pas l'événement ; le web lit `success`,
`error`, et range `data.user` dans un champ **qu'il ne relit jamais**. La
réparation honnête est donc de **déclarer ce que l'émetteur émet**
(`AuthenticatedEventUser`), pas de fabriquer un `SocketIOUser` que personne ne
demande. `AuthHandler` est basculé sur `MeeshySocket`.

### 5. Un CLIQUET à la compilation, et il n'est pas décoratif

Le flip complet du `MessageHandler` ne se livre pas dans ce cycle (§ Suivis).
Sans garde, le correctif ne serait retenu par rien côté typage. Le cliquet vit
donc dans `messageEditedPayload.ts` : il dérive la liste des champs REQUIS
**depuis le contrat partagé lui-même** et vérifie que le noyau les couvre tous.

> **La première formulation était VACANTE, et c'est mesuré.** Écrite
> `undefined extends SocketIOMessage[K] ? never : K` — la forme qui vient
> d'abord à l'esprit — elle rendait `never` pour TOUTE clé : la passerelle
> compile sous `strictNullChecks: false`, où `undefined extends T` est vrai
> partout. Retirer `createdAt` du noyau ne la faisait pas tomber. Reformulée sur
> le MODIFICATEUR `?` (`Record<string, never> extends Pick<T, K>`), que le
> drapeau n'efface pas.
>
> **ROUGE prouvé séparément pour les trois champs du défaut** : retirer
> `createdAt`, `senderId` ou `messageType` du noyau fait échouer la compilation,
> chacun pour son propre compte. Un cliquet qui ne peut pas tomber n'est pas un
> cliquet — et celui-ci ne pouvait pas, avant d'être mesuré.

## Gates

- **`tsc --noEmit` passerelle : 0 erreur** (baseline avant lot : 0 également).
- **`src/socketio` : 49 suites / 1605 tests verts.**
- **Témoin du lot** : `MessageHandlerEditedContract.test.ts`, 5 témoins.
  **ROUGE prouvé** contre la production d'avant — 4 tombent (`senderId`,
  `createdAt`, `messageType`, `senderId` comme `User.id`), et le 5e (« ne perd
  RIEN ») passe AVANT comme APRÈS, ce qui est exactement ce qu'un témoin
  d'additivité doit faire.
- Le premier jet du témoin tombait sur un **refus d'admission** (`createdAt`
  figé hors de la fenêtre d'édition de 24 h) — donc pour la mauvaise raison,
  sans jamais atteindre le producteur gardé. Corrigé, et le harnais nomme
  désormais le refus quand il y en a un, plutôt que de laisser chercher sur un
  « payload undefined ».

## Suivis

- [ ] **Le flip du `MessageHandler` reste ouvert, et son blocage est MESURÉ.**
      Sept émissions de `message:new` restent hors contrat parce que
      `_buildMessagePayload` rend `unknown` et que les enrichissements
      (`forwardedFrom`, `postReplyTo`, `mentionedUsers`, `trackingLinks`,
      `location`) le MUTENT via `as Record<string, unknown>`. Rendre ce type
      honnête est nécessaire mais **pas suffisant** : le seul blocage restant est
      alors `messageType`, que `buildMessageNewPayload` sert en `string`
      (`message.messageType || 'text'`) quand le contrat déclare l'union
      `MessageType`. **Le caster blanchirait exactement ce que la garde existe
      pour voir** — l'honnête est de valider la colonne contre l'union AU
      PRODUCTEUR. Lot à part, à mesurer contre les trois clients.
- [ ] **Le troisième producteur de `message:edited` n'est pas passé à l'unité.**
      `broadcastMessageMutation` prend `payload: Record<string, unknown>` — un
      seam de charge utile, exactement la famille du cycle 100 mais sur la
      donnée au lieu du nom d'événement. Ses cinq appelants REST étalent la
      ligne Prisma brute, donc servent le contrat par ACCIDENT (l'`include` est
      large), pas par construction : un `select` restrictif posé un jour sur
      l'une de ces routes rouvrirait le défaut sans qu'un témoin tombe.
- [ ] **`senderId` : le chemin REST sert le `Participant.id` brut** là où le
      socket et le manager servent le `User.id`. Vérifié non destructeur côté
      iOS (`markEdited` n'écrit que `content`/`isEdited`/`editedAt`/`updatedAt`,
      jamais `senderId`) ; à instruire côté web, qui reconstruit le message
      entier depuis la charge. Aligner est un CHANGEMENT de sens, donc un lot
      avec relevé des consommateurs.
- [ ] **`SocketIOMessage` sous-déclare toujours `message:new`** d'une vingtaine
      de champs (suivi hérité du cycle 99 bis, inchangé).
- [ ] **Android n'a pas été confronté** sur `message:edited` autrement que par
      lecture de son modèle (`senderId`/`createdAt` optionnels ⇒ tolérant).
