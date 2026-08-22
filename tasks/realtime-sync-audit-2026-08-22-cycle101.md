# Cycle 101 — une édition faite en WebSocket n'atteignait aucun client iOS ; le contrat de `message:new`/`message:edited` cesse de mentir

## D'où part ce cycle

Le cycle 100 a basculé sept handlers Socket.IO sur `MeeshySocket` et laissé
quatre handlers RENDUS au `Socket` nu de socket.io, avec pour chacun la raison du
blanchiment. Le premier de sa liste :

> `MessageHandler._buildMessagePayload` rend `unknown` : c'est LA source du fait
> que le contrat ne contraignait pas le producteur WebSocket de `message:new`.
> Lui donner un type de retour honnête est le geste qui aurait fait tomber le
> défaut de 99/99 bis à la compilation.

Ce cycle instruit ce suivi-là. Le basculement a effectivement nommé un défaut de
production — mais pas sur `message:new`, sur son jumeau `message:edited`.

## Le défaut : une édition faite depuis le web n'atteignait AUCUN client iOS

`message:edited` est déclaré `(message: SocketIOMessage) => void` — **le même
contrat que `message:new`** — et `SocketIOMessage` rend sept champs
OBLIGATOIRES. L'événement a TROIS producteurs :

| producteur | transport | noyau servi |
|---|---|---|
| `MeeshySocketIOManager._broadcastCallMessageEdited` | transition live→terminal d'un appel | complet |
| `broadcastMessageMutation` | les cinq routes REST de mutation | complet (les appelants passent le message transformé) |
| `MessageHandler.handleMessageEdit` | socket `message:edit` | **`senderId`, `messageType`, `createdAt` absents** |

Le troisième construisait sa charge utile à la main, à partir d'un littéral de
sept clés (`updatedMessage`).

Ce n'est pas une omission cosmétique. `APIMessage`, le décodeur iOS de
`message:edited` (`MessageSocketManager.swift:3299`), lit ces champs sans repli :

```swift
senderId  = try c.decode(String.self, forKey: .senderId)   // MessageModels.swift:506
createdAt = try c.decode(Date.self,   forKey: .createdAt)  // MessageModels.swift:530
```

Une clé absente fait échouer le décodage du message ENTIER ; `decode(_:from:)`
journalise `decode DROP` et rend la main. **Toute édition passée par le transport
WebSocket était donc silencieusement jetée par chaque client iOS de la
conversation** — la bulle y gardait le texte d'avant jusqu'à une relecture
complète, que rien ne déclenche spontanément.

### Les trois clients relevés — un seul casse, et c'est structurel

Le défaut ne se voyait nulle part ailleurs, et la raison n'est pas la chance :
**seul iOS consomme cette charge utile comme une DONNÉE.**

| client | ce qu'il fait de `message:edited` | effet |
|---|---|---|
| **iOS** | décode en `APIMessage` et applique le résultat | `try c.decode` sans repli sur `senderId`/`createdAt` ⇒ **décodage rejeté, édition perdue** |
| Android | décode en `ApiMessage`, puis **ignore la charge** et appelle `messageRepository.refresh(conversationId)` | `senderId`/`createdAt`/`messageType` ont des défauts Kotlin ; seul `conversationId` est lu ⇒ intact |
| web | fusionne `{ ...cached, ...editedPayload }` | les trois clés manquantes viennent de la ligne en cache ⇒ intact |

Deux enseignements :

1. **Le côté d'où vient l'édition ne voit jamais rien.** Le web, qui émet sur ce
   transport, est aussi celui que la fusion protège. iOS édite par REST
   (`PUT /messages/:messageId`, cf. l'en-tête de `broadcastMessageMutation.ts`) :
   il n'est jamais l'ÉMETTEUR de ce transport-ci, seulement son destinataire —
   la moitié qui échoue.
2. **Un client qui traite l'événement comme un simple SIGNAL est insensible aux
   défauts de forme de sa charge utile** — et donc incapable de les révéler.
   Android est vert ici pour la même raison qui l'a rendu aveugle ailleurs.

C'est le patron « deux moitiés cohérentes séparément » du cycle 97, appliqué à
un producteur et un décodeur : chacun est irréprochable seul.

## Comment le compilateur l'a nommé

Le défaut vivait dans un fichier que rien ne vérifiait. `broadcastNewMessage`
construisait son payload en `unknown`, puis l'enrichissait par SIX mutations à
travers un cast :

```ts
const messagePayload: unknown = this._buildMessagePayload(…);
if (originalMsg) (messagePayload as Record<string, unknown>).forwardedFrom = …;
```

Un `Record<string, unknown>` ne satisfait aucun des sept champs requis de
`SocketIOMessage` : typer `this.io` aurait fait échouer les cinq émissions
`message:new` de la méthode. **C'est pour cela que ce handler était resté rendu
à socket.io** — et, l'étant, il ne vérifiait pas non plus son émission
`message:edited`, deux cents lignes plus haut.

Les enrichissements sont donc recomposés par étalement IMMUABLE (chaque bloc rend
un fragment au lieu de muter le payload), le type inféré de
`buildMessageNewPayload` survit jusqu'à l'émission, et le handler bascule sur
`MeeshySocket` / `MeeshyIOServer`. Des huit erreurs que `tsc` a alors levées,
sept étaient de la plomberie ; **la huitième était le défaut**, en toutes lettres :

```
error TS2345: … is missing the following properties from type 'SocketIOMessage':
senderId, messageType, createdAt
```

## Le correctif, et le piège qu'il évite

Le noyau requis passe par une unité partagée par les trois producteurs
(`messageEditedPayload.ts`), et le `select` de l'édition socket gagne
`messageType` (une colonne de plus sur un `select` déjà là, aucun aller-retour).

Le point non évident est `senderId`. `Message.senderId` est un `Participant.id`,
alors que les clients comparent ce champ à leur propre `User.id` pour reconnaître
leurs messages. Servir la colonne brute aurait réparé le DÉCODAGE en installant
une divergence de SENS, celle-là muette. La règle — déjà encodée dans
`buildMessageNewPayload` — est extraite en `wireSenderId.ts` et partagée par les
producteurs des deux événements ; son paramètre est STRUCTUREL, parce que les
trois producteurs partent de `select` différents et qu'exiger le type complet
aurait forcé un cast à chaque site, c'est-à-dire réintroduit pour appeler l'unité
le blanchiment qu'elle existe pour retirer.

## Second lot : `SocketIOMessage` cesse de sous-déclarer

Suivi nommé par le cycle 100 (« lot à part, large surface de consommation »).
Le contrat déclarait **quatorze** champs quand les producteurs en servent une
trentaine : ni l'enveloppe E2EE, ni les pièces jointes, ni les traductions, ni
`location`, ni `postReplyTo`, ni `clientMessageId`, ni la vue-unique n'y
figuraient.

Ce n'est pas une imprécision sans suite : les décodeurs iOS, Android et web sont
écrits CONTRE ce contrat, et un champ qui n'y figure pas doit être transcrit
indépendamment par chacun des trois — le mécanisme exact qui a produit les deux
transcriptions divergentes de `conversation:join-error` au cycle 99.

Ce qui reste `unknown` l'est PAR DÉCISION : `replyTo`, `attachments`,
`translations` et `metadata` ont une forme délibérément différente d'un transport
à l'autre (l'en-tête de `messageNewPayload.ts` énumère les écarts et leur
raison). Entre deux producteurs qui se contredisent, ne rien affirmer est plus
honnête que d'en couronner un — règle du cycle 91.

Deux corrections sont tombées de ce lot :

- **`senderId` était documenté faux.** La ligne portait
  `// Participant.id (unified)` depuis toujours, alors que les deux producteurs
  servent délibérément le `User.id`. Un commentaire qui énonce une contrainte est
  une AFFIRMATION (cycle 94) ; celle-ci était fausse et à contre-sens du code.
- **`clientMessageId` et `effectFlags` partaient sur le fil en `unknown`.**
  `Message` ne les déclare pas ; `buildMessageNewPayload` les lit à travers un
  `Record<string, unknown>` et les émettait crus. Aucun producteur ne promettait
  donc le type que les décodeurs attendent. Les deux lectures sont désormais
  GARDÉES (`typeof … === 'string' | 'number'`).

## Portée de la garde — à ne pas surestimer

La passerelle compile en `strict: false` / `strictNullChecks: false`. Déclarer un
champ dans `SocketIOMessage` fait donc tomber une émission dont la clé **manque**
ou dont le **type** est incompatible — jamais une qui sert `undefined` là où le
contrat promet une valeur. C'est ce qui a suffi ici (les trois clés manquaient),
et c'est écrit dans l'en-tête du contrat pour qu'on ne lise pas la déclaration
comme une garantie de nullité.

De même, les champs ajoutés étant OPTIONNELS, ce lot ne transforme PAS le témoin
de parité runtime du cycle 99 bis en garde de compilation — le cycle 100
l'espérait ; c'est faux, et un champ optionnel omis par un seul producteur compile
toujours. `message-new-producer-parity.test.ts` reste la seule garde de parité.

## Gates

- **`tsc` passerelle : 0 erreur.**
- **`src/socketio` : 48 suites / 1602 tests verts** (1600 avant ce cycle, +2
  témoins).
- **Web `type-check` : 863 erreurs avant, 863 après**, jeu d'erreurs IDENTIQUE
  (les seuls écarts textuels sont l'ordre non déterministe des membres d'union
  dans des messages sans rapport). Le contrat honnête n'ajoute aucune erreur au
  client qui le consomme.
- **RED prouvé** : les deux témoins tombent sur la production d'avant, et sur
  elle seule (2 échecs / 64 succès).

## Témoins

Deux, SÉPARÉS parce que la séparation est le diagnostic — « le noyau requis
manque » et « le noyau est là mais `senderId` porte la mauvaise identité » sont
deux pannes différentes, et la seconde est le résultat exact d'un correctif naïf.
Le second témoin assert en prime `PARTICIPANT_ID !== USER_ID`, pour qu'il ne
puisse pas passer par coïncidence de fixture.

## Suivis

- **3 handlers restent rendus à socket.io** : `AuthHandler`, `ReactionHandler`,
  `PostReactionHandler` (le cycle 100 en comptait 4 ; `MessageHandler` est
  basculé ici). Les deux handlers de réaction blanchissent `updateEvent: unknown`
  dans leur helper — même recette que `SocialEventsHandler` au cycle 100.
  `AuthHandler` émet `AUTHENTICATED` avec un `user` réduit là où
  `AuthenticatedEventData.user` déclare un `SocketIOUser` complet : mensonge de
  contrat LATENT, à trancher (type dédié, ou servir un `SocketIOUser`).
- **La parité des trois producteurs de `message:edited` n'a pas de témoin
  runtime**, là où `message:new` en a un depuis le cycle 99 bis. Le noyau requis
  est désormais partagé, donc la famille qui a cassé ici ne peut plus diverger ;
  le reste de la charge utile (traductions, pièces jointes, `metadata`) est
  toujours écrit à la main par chaque producteur.
- **Android traite `message:edited` en SIGNAL, pas en donnée** : il décode puis
  jette la charge utile et relit la conversation entière
  (`ChatViewModel:602` → `messageRepository.refresh`). C'est robuste, et c'est
  aussi une relecture complète par édition reçue — à confronter au budget réseau
  du cycle « payload weight » si le volume d'éditions monte. Aucune action ici.
