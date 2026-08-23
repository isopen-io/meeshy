# Cycle 101 bis — le onzième handler basculé, et `SocketIOMessage` cesse de sous-déclarer

## Ce cycle a eu une JUMELLE, mergée pendant qu'il travaillait

Ce cycle et la PR #3355 (cycle 101, `c2f05507`) sont partis du même suivi du
cycle 100 et ont trouvé le MÊME défaut de production, séparément, le même jour :
le producteur WebSocket de `message:edited` omettait `senderId`, `messageType` et
`createdAt`, trois des sept champs que `SocketIOMessage` déclare requis, que le
décodeur iOS lit en `try c.decode` sans repli — donc **toute édition faite depuis
le web était silencieusement jetée par chaque client iOS de la conversation**.

C'est la troisième fois en trois cycles (99 bis, 100, celui-ci) que deux routines
sœurs se rencontrent sur le même défaut. La règle du cycle 100 s'applique telle
quelle : **repuller `main` AVANT de pousser, et abandonner sa propre correction
quand la jumelle est structurellement supérieure.**

Ce qui a été ABANDONNÉ au profit de #3355, après comparaison :

| ce que j'avais | ce que #3355 a de mieux |
|---|---|
| `wireSenderId.ts`, module séparé | `resolveWireSenderId` vit dans `messageEditedPayload.ts`, avec le tableau de parité des trois producteurs — supprimé chez moi, importé de chez eux |
| `buildMessageEditedCore` rendant le seul noyau `{id, conversationId, senderId, messageType, createdAt}` | leur version prend `MessageEditedCoreInputs` et rend AUSSI `content`, `originalLanguage`, `updatedAt`, `isEdited`, `editedAt` — davantage de champs sortis du littéral manuscrit |
| deux témoins runtime | **un cliquet à la COMPILATION** qui dérive les clés requises depuis `SocketIOMessage` lui-même : ajouter un champ requis au contrat cesse de compiler AU PRODUCTEUR |
| — | `AuthHandler`, `ReactionHandler`, `PostReactionHandler` basculés, et `AuthenticatedEventData.user` corrigé (c'était un `SocketIOUser` que l'événement n'a jamais servi) |

Leur correctif est retenu en entier. Restent ici les deux lots qui ne recoupent
PAS #3355.

## Lot 1 — le onzième et dernier handler basculé sur `MeeshySocket`

#3355 a explicitement DIFFÉRÉ le flip de `MessageHandler`, en écrivant dans le
fichier la raison :

> Rendre ce type honnête est nécessaire mais PAS suffisant : mesuré au
> compilateur, le seul blocage restant est alors `messageType`, que
> `buildMessageNewPayload` sert en `string` […] C'est un lot à part.

**Ce lot est fait ici, et la dette annoncée n'existait pas.** Mesuré :
`Message.messageType` EST déjà l'union `MessageType`
(`@meeshy/shared/types/index:309`), donc `message.messageType || 'text'` la rend.
Une fois retiré le vrai blocage, il ne restait ni cast ni validateur à écrire.

Le vrai blocage était le sac de clés. `broadcastNewMessage` construisait son
payload en `unknown`, puis l'enrichissait par SIX mutations à travers un cast :

```ts
const messagePayload: unknown = this._buildMessagePayload(…);
if (originalMsg) (messagePayload as Record<string, unknown>).forwardedFrom = …;
```

Un `Record<string, unknown>` ne satisfait AUCUN des sept champs requis : typer
`this.io` aurait fait échouer les cinq émissions `message:new` de la méthode.

> **Un seam de blanchiment ne protège pas seulement l'expression qui le porte :
> il désarme le contrat de TOUT le fichier.** C'est pour cela que le défaut de
> `message:edited` — deux cents lignes plus haut, sans rapport avec le sac de
> clés — n'était vérifié par rien non plus.

Les six enrichissements (`forwardedFrom`, `forwardedFromConversation`,
`postReplyTo`, `mentionedUsers`, `trackingLinks`, `location`) rendent désormais
chacun un FRAGMENT, composés par étalement immuable — ce que demande d'ailleurs
`CLAUDE.md` (« Immutable data only — no mutation »). Le type inféré de
`buildMessageNewPayload` survit jusqu'à l'émission, et le handler bascule sur
`MeeshySocket` / `MeeshyIOServer`.

**Les onze handlers Socket.IO sont désormais tous contraints par le contrat.**
Le suivi ouvert au cycle 99 est clos.

Effet de bord retiré dans la foulée : le resserrage local
`messageType: (…) as MessageType` que #3355 avait dû poser dans
`MeeshySocketIOManager` pour contourner la dette supposée. Vérifié au
compilateur — il ne retenait rien, et un cast qui ne sert à rien se lit comme un
cast nécessaire.

## Lot 2 — `SocketIOMessage` cesse de sous-déclarer

Suivi nommé par le cycle 100 (« lot à part, large surface de consommation »).
Le contrat déclarait **quatorze** champs quand ses producteurs en servent une
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
  `// Participant.id (unified)` depuis toujours, alors que les producteurs
  servent délibérément le `User.id` (c'est tout l'objet de `resolveWireSenderId`).
  Un commentaire qui énonce une contrainte est une AFFIRMATION (cycle 94) ;
  celle-ci était à contre-sens du code qu'elle décrivait.
- **`clientMessageId` et `effectFlags` partaient sur le fil en `unknown`.**
  `Message` ne les déclare pas ; `buildMessageNewPayload` les lit à travers un
  `Record<string, unknown>` et les émettait crus. Aucun producteur ne promettait
  donc le type que les décodeurs attendent. Le contrat honnête l'a fait
  constater au compilateur ; les deux lectures sont désormais GARDÉES.

### Portée de la garde — à ne pas surestimer

La passerelle compile en `strict: false` / `strictNullChecks: false`. Déclarer un
champ ici fait tomber une émission dont la clé **manque** ou dont le **type** est
incompatible — jamais une qui sert `undefined` là où le contrat promet une
valeur. C'est écrit dans l'en-tête du contrat pour qu'on ne le lise pas comme une
garantie de nullité.

De même, les champs ajoutés étant OPTIONNELS, ce lot ne transforme PAS le témoin
de parité runtime du cycle 99 bis en garde de compilation — le cycle 100
l'espérait ; c'est faux, et un champ optionnel omis par un seul producteur
compile toujours. `message-new-producer-parity.test.ts` reste la seule garde de
parité de `message:new`.

## Les trois clients relevés — un seul cassait, et c'est structurel

Relevé pendant le diagnostic, et conservé ici parce qu'il explique l'invisibilité
du défaut :

| client | ce qu'il fait de `message:edited` | effet |
|---|---|---|
| **iOS** | décode en `APIMessage` et applique le résultat | `try c.decode` sans repli ⇒ **décodage rejeté, édition perdue** |
| Android | décode, puis IGNORE la charge et appelle `messageRepository.refresh(conversationId)` (`ChatViewModel:602`) | seul `conversationId` est lu ⇒ intact |
| web | fusionne `{ ...cached, ...editedPayload }` | les clés manquantes viennent du cache ⇒ intact |

Le client qui ÉMET sur ce transport (le web) est aussi celui que la fusion
protège ; iOS édite par REST et n'est que destinataire — la moitié qui échoue.
Et un client qui traite l'événement en SIGNAL est insensible aux défauts de forme
de sa charge utile, donc incapable de les révéler. C'est la leçon 247.

## Gates

- **`tsc` passerelle : 0 erreur** (après merge de `origin/main`).
- **`src/socketio` : 48 suites / 1602 tests verts** avant merge ; suite complète
  **833 suites / 19 212 tests verts** sur le lot pré-merge. Re-passée après
  merge — cf. la note de livraison.
- **Web `type-check` : 863 erreurs avant, 863 après**, jeu d'erreurs IDENTIQUE
  (les seuls écarts textuels sont l'ordre non déterministe des membres d'union
  dans des messages sans rapport). Le contrat honnête n'ajoute aucune erreur au
  client qui le consomme.
- **RED prouvé** sur les deux témoins d'édition avant leur remplacement par le
  cliquet de #3355 : 2 échecs / 64 succès sur la production d'avant.

## Suivis

- **Les onze handlers sont basculés ; le suivi du cycle 99 est clos.** Le
  prochain grain de garde n'est plus le `Socket` mais les SEAMS internes qui
  subsistent dans les handlers déjà typés (helpers `(event, data)` génériques
  posés au cycle 100 : vérifier qu'aucun nouveau n'est réintroduit).
- **La parité des trois producteurs de `message:edited` n'a pas de témoin
  runtime**, là où `message:new` en a un (99 bis). Le cliquet de #3355 garde le
  NOYAU requis ; le reste de la charge (traductions, pièces jointes, `metadata`)
  est toujours écrit à la main par chaque producteur.
- **`SocketIOMessage` déclare maintenant ce qui voyage, pas ce qui doit
  voyager.** Décider quels champs sont RÉELLEMENT obligatoires pour chaque
  décodeur client (iOS en a sept, le web zéro) est le lot qui permettrait de
  resserrer le contrat plutôt que de le décrire.
