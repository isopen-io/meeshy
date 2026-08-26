# Cycle 100 — six handlers de plus contraints par le contrat ; le seam `(string, unknown)` de la diffusion sociale fermé

## D'où part ce cycle, et ce qu'une routine sœur a fait entre-temps

Le cycle 99 a typé le `Socket` d'UN handler (`ConversationHandler`) contre
`ServerToClientEvents`, et laissé en suivi explicite : « basculer les autres un
par un ; chacun peut révéler un événement non déclaré ».

En instruisant ce suivi (flip des dix handlers restants, puis `tsc`), le
compilateur a nommé un défaut de production : le chemin REST/ZMQ
(`_broadcastNewMessage`) émettait `message:new` **sans l'enveloppe E2EE** que le
chemin WebSocket sert — donc, côté iOS, tout DM chiffré (routé en REST par
`socketFirstEligible`) arrivait indéchiffrable en direct côté web.

**Une routine sœur (cycle 99 bis, `7924503d`, mergée dans `f13b7967`) a corrigé
ce MÊME défaut pendant ce cycle**, et mieux : elle a extrait
`socketio/messageNewPayload.ts`, source UNIQUE des champs dérivés de la ligne
message, appelée par les deux producteurs — exactement la « vraie sortie » qu'un
correctif ponctuel n'aurait fait que reporter. J'avais moi-même corrigé
`_broadcastNewMessage` et posé un témoin de parité ; en repullant `main` avant de
pousser, j'ai constaté la redondance et **abandonné ma correction et mon témoin
au profit du helper partagé de 99 bis**, structurellement supérieur. Vérifié : le
helper couvre à l'identique les cinq champs E2EE, `maxViewOnceCount`,
`storyReplyToId`, `forwardedFromId`/`ConversationId`.

Reste donc de ce cycle ce qui NE recoupe PAS 99 bis, et qui avance le suivi du
cycle 99 : **le typage des handlers**.

## Ce qui est livré : 6 handlers basculés sur `MeeshySocket`

`ConversationHandler` (cycle 99) + les six ajoutés ici = **7 handlers** dont
l'émission est désormais vérifiée à la compilation contre `ServerToClientEvents` :
émettre un nom absent du contrat, ou un payload d'une autre forme que celle
déclarée, ne compile plus.

| handler | ce que le flip a exigé |
|---|---|
| `SocialEventsHandler` | **le trou structurel** — détaillé ci-dessous |
| `AttachmentReactionHandler` | flip propre, 0 erreur |
| `CommentReactionHandler` | flip propre, 0 erreur |
| `LocationHandler` | flip propre, 0 erreur |
| `StatusHandler` | flip propre, 0 erreur |
| `AdminAgentHandler` | flip propre, 0 erreur |

### `SocialEventsHandler` : quatre seams `(event: string, data: unknown)`

Ce handler échappait ENTIÈREMENT à la garde du cycle 99, et pas par oubli
d'import. Ses **vingt-et-un** sites de diffusion sociale (posts, stories,
statuts, commentaires) ne touchent jamais `io.emit` directement : ils passent par
quatre helpers privés déclarés `(event: string, data: unknown)`.

> Un seam qui prend `(string, unknown)` annule le contrat de tout ce qui passe
> par lui. La garde ne vaut que jusqu'au premier paramètre non typé — typer
> `this.io` ne changeait rien, puisque à l'intérieur du helper `event` est un
> `string` quelconque et `data` un `unknown`.

C'est le chemin le PLUS exposé : une diffusion Socket.IO n'a **aucun
sérialiseur** — ni `fast-json-stringify` pour retirer un champ de trop, ni schéma
de réponse pour signaler un manquant. Le typage de l'émission est la seule garde
entre le producteur et les décodeurs iOS/Android/web, tous écrits contre
`ServerToClientEvents`.

Correctif : les quatre helpers deviennent génériques,
`<E extends keyof ServerToClientEvents>(event: E, data: Parameters<ServerToClientEvents[E]>[0])`.
Un UNIQUE cast subsiste, documenté, sur le point exact que l'inférence de
`socket.io` (`DecorateAcknowledgementsWithMultipleResponses`) ne sait pas
résoudre sur un `E` GÉNÉRIQUE — elle le résout pour tout `E` concret, aucun de
nos événements serveur→client ne portant d'accusé de réception. Ce cast ne
blanchit rien : le couple `(event, data)` est déjà vérifié à la frontière des
helpers, donc aux vingt-et-un sites d'appel. L'écrire dans les helpers eux-mêmes
aurait rouvert le seam — quatre fois.

## Gates

- **`tsc` passerelle : 0 erreur.**
- **`src/socketio` : 48 suites / 1600 tests verts** (dont
  `message-new-producer-parity.test.ts` de 99 bis).
- Rebasé proprement sur `origin/main` (`f13b7967`), sans conflit : les six
  fichiers touchés ne recoupent aucun changement amont.

## Suivis

- **4 handlers RENDUS à `socket.io` (non basculés) : `MessageHandler`,
  `AuthHandler`, `ReactionHandler`, `PostReactionHandler`.** Leur flip révèle du
  blanchiment par `unknown` qui exige un typage par-handler (chacun un lot, comme
  le cadrait le cycle 99) :
  - `AuthHandler` émet `AUTHENTICATED` avec `user: { id, language, isAnonymous }`
    quand `AuthenticatedEventData.user` est un `SocketIOUser` complet (sans
    `language`). Mensonge de contrat LATENT — le web ignore le payload, iOS ne
    l'écoute pas — à trancher (type dédié, ou servir un `SocketIOUser`).
  - `ReactionHandler` / `PostReactionHandler` blanchissent `updateEvent: unknown`
    dans leur helper ; `createUpdateEvent` rend un `ReactionUpdateEvent`
    structurellement identique à `ReactionUpdateEventData`. Typer le helper (à la
    manière de `SocialEventsHandler`) ferme le seam.
  - `MessageHandler._buildMessagePayload` rend `unknown` : c'est LA source du
    fait que le contrat ne contraignait pas le producteur WebSocket de
    `message:new`. Lui donner un type de retour honnête est le geste qui aurait
    fait tomber le défaut de 99/99 bis à la compilation.

- **`SocketIOMessage` sous-déclare `message:new`** d'une vingtaine de champs
  (E2EE, réacheminement, vue-unique, `attachments`, `location`,
  `trackingLinks`…). Le rendre honnête transformerait la parité des deux
  producteurs d'un témoin runtime (99 bis) en garde à la compilation. Lot à part,
  large surface de consommation.

- **Android** n'a pas été confronté sur `message:new` ce cycle ; son décodeur
  d'enveloppe E2EE est à vérifier au même titre que web/iOS.
