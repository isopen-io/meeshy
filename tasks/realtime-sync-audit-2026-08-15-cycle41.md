# Cycle 41 — la règle était écrite, et appliquée à une seule des deux branches

> Piste ouverte au cycle 38, reconduite telle quelle au cycle 39, instruite ici.
>
> **Numérotation.** Ce cycle a d'abord porté le numéro 40. Une autre session de
> la même routine a livré son propre cycle 40 sur `main` pendant que celui-ci
> travaillait (« une règle peut avoir tous ses consommateurs et aucun
> déclencheur »), et avait elle-même renuméroté depuis 39 pour la même raison.
> Renuméroté à la main, comme la fois précédente. La leçon 273 disait de relire
> `main` sur les FICHIERS visés avant d'ouvrir la PR : elle a fonctionné — aucune
> collision de CODE ici, les deux cycles touchent des fichiers disjoints — mais
> elle ne couvrait pas les compteurs partagés (numéro de cycle, numéro de leçon),
> qui n'appartiennent à aucun fichier visé. Voir leçon 275, § coordination.

## Le défaut

`read-status:updated` de `type: 'read'` transporte deux champs qui ne décrivent
pas la conversation mais **une personne** :

| Champ | Ce qu'il dit de l'acteur |
|---|---|
| `lastReadAt` | quand il a rattrapé son retard pour la dernière fois |
| `unreadCount` | de combien il est encore en retard sur ce fil |

Ils existent pour la synchronisation **multi-appareils** de l'acteur : ses autres
sessions recalent leur curseur sans refetch. Ils partaient pourtant dans
l'ÉVENTAIL — `emitToConversationParticipants` chaîne la room de conversation ET
la room personnelle de chaque participant actif — donc **chaque pair recevait la
frontière de lecture et l'arriéré de celui qui venait de lire**.

## Ce qui rend le défaut remarquable

Le raisonnement qui l'interdit était **déjà écrit dans le fichier**, à quinze
lignes de là, mais appliqué à l'autre branche seulement. Le commentaire du
`type: 'received'` justifie l'ABSENCE de ces champs ainsi :

> « […] which the client would drop anyway, and which would needlessly disclose
> the actor's backlog to every peer in the room. »

La phrase vaut **mot pour mot** pour le `type: 'read'`, où ils SONT diffusés à
toute la conversation. Une règle de confidentialité énoncée, admise, et honorée
sur une branche sur deux.

Le second angle est celui du consentement. Cette diffusion est gardée par
`shouldShowReadReceipts` — une préférence produit qui consent à « j'ai lu ton
message ». Elle ne consent pas à publier un arriéré. L'utilisateur qui ACTIVE
ses accusés de lecture était celui qui diffusait le plus.

## Les deux sites

Le même défaut, deux fois, dans les deux routes qui émettent l'événement :

| Site | Fonction |
|---|---|
| `services/gateway/src/routes/message-read-status.ts` | `broadcastReadStatusUpdate` |
| `services/gateway/src/routes/conversations/messages.ts` | `broadcastReadStatus` |

Les quatre autres émetteurs de l'événement sont **indemnes**, et pour une raison
qui tient :

| Émetteur | Pourquoi |
|---|---|
| `ConversationHandler._resyncReadStatusToSocket` | `socket.emit` — un seul destinataire, pas d'éventail |
| `MessageHandler.autoDeliverToOnlineRecipients` | `type: 'received'` — les champs n'y sont jamais |
| drain (`MeeshySocketIOManager`) | `type: 'received'` — idem |
| `routes/messages.ts` | `type: 'read'` mais ne construit pas `actorReadSync` |

## Le correctif

Deux audiences pour un événement, donc deux payloads :

```ts
emitToConversationParticipants({
  io, conversationId, participants, events,
  payload: peerPayload,                                   // sans les deux champs
  exceptRoom: actorReadSync ? ROOMS.user(personalRoomKey) : null,
});
if (actorReadSync) {
  const actorPayload = { ...peerPayload, ...actorReadSync };
  io.to(ROOMS.user(personalRoomKey)).emit(...)            // la version complète
}
```

### `exceptRoom` n'est pas décoratif — c'est la moitié qui coûte

Retirer la room personnelle de l'acteur de la chaîne **ne suffit pas** : la room
de conversation est chaînée aussi, et elle tient ses sockets dès qu'il a le fil
ouvert. Sans `.except()`, il recevrait la copie des pairs EN PLUS de la sienne —
la garantie « une seule copie par socket » que `emitToConversationParticipants`
revendique dans sa toute première propriété tomberait, et elle tomberait
précisément sur l'événement où les deux copies **diffèrent**. Un client qui
applique la dernière reçue verrait son curseur osciller.

L'invariant qui rend l'exclusion sûre est vérifié aux deux bouts d'`AuthHandler` :
toute session rejoint `ROOMS.user(userId ?? participantId)` à l'authentification,
compte ou pas, AVANT de rejoindre la moindre room de conversation. L'acteur
exclu de l'éventail est donc toujours joignable par le canal qui le remplace.

### L'exclusion est conditionnée à `actorReadSync`

Sur un `received`, les deux payloads seraient identiques : exclure l'acteur lui
coûterait l'événement sans rien protéger. La condition n'est pas une précaution,
c'est la seule forme correcte.

## Ce que ça coûte aux clients : rien

Vérifié dans le code, pas repris d'un cycle précédent :

| Consommateur | Lit les deux champs ? | Effet |
|---|---|---|
| iOS `ConversationStoreSocketBridge` | oui — `guard event.type == "read", let lastReadAt, let unreadCount` **puis** `event.userId == me` | aucun : un appareil de l'acteur reçoit toujours la version complète par sa room personnelle ; un pair perd exactement ce que son `guard` jetait déjà |
| web `presence.service.ts` | non — ne lit `unreadCount` que sur `conversation:unread-updated`, un autre événement | aucun |
| Android `ReadStatusUpdatedEvent` | ne déclare aucun des deux | aucun |

**Un pair ne les recevait que pour les jeter.** C'est ce qui rend la bascule
serveur indolore et le défaut réel : la donnée partait sans destinataire.

## Gates

- [x] 4 RED discriminants vus rouges sur le site 1 avant correctif
      (champs dans l'éventail / pas d'émission ciblée / pas d'exclusion / cas anonyme)
- [x] 2 RED discriminants vus rouges sur le site 2
- [x] 3 non-régressions vertes d'emblée, dont deux gardes anti-sur-correction :
      le `summary` continue d'atteindre les pairs ; le `received` garde son
      éventail entier et son `excepts` vide
- [x] 1 test préexistant réparé (`seenRooms dedup`) — son double `io` ne
      connaissait pas `except` ; c'est le double qui était incomplet, pas le
      correctif qui régresse
- [x] `bunx tsc --noEmit` gateway : 0
- [x] Suite gateway complète : voir § Validation
- [x] Contrat partagé + miroir iOS + miroir SDK consommateur + note Android + README socketio

## Écarté délibérément

**Faire porter les deux champs par `conversation:unread-updated`.** Ce canal
existe déjà, va déjà à la seule room personnelle de l'acteur, et porte déjà
`unreadCount` — il suffirait de lui ajouter `lastReadAt`. Écarté parce qu'il
impose une migration à iOS : tant que le client n'écoute pas le nouveau champ
sur ce canal, **la synchro multi-appareils du curseur régresse**. Le correctif
retenu ne demande aucun changement client. Une correction de confidentialité qui
casse une fonctionnalité en attendant trois releases clientes n'est pas une
correction, c'est un échange.

**Retirer la room de conversation de l'éventail.** Elle est redondante avec les
rooms personnelles dans ce fan-out précis, et sa suppression rendrait
`exceptRoom` inutile. Écarté : l'unité est partagée par sept appelants, la
redondance n'est démontrée que pour celui-ci, et le gain serait une ligne contre
un risque de perte d'événement sur six sites non instruits.

## Validation

- `bunx tsc --noEmit` gateway : propre
- `packages/shared` : build propre
- Suite gateway complète : voir CHANGELOG et le rapport de PR

## Piste pour le cycle suivant — repérée, NON livrée

`routes/messages.ts` (`POST /messages/:id/read`) émet un `type: 'read'` qui ne
construit **pas** `actorReadSync` : il diffuse le résumé et rien d'autre. Ce
n'était pas une fuite, c'est le symétrique — l'acteur qui passe par cette route
ne reçoit sur AUCUN canal la frontière et l'arriéré que les deux autres routes
lui donnent, donc ses autres appareils ne recalent pas leur curseur. Les trois
routes disent « j'ai lu » et deux seulement synchronisent. Reste à établir si
cette route est encore empruntée par un client (iOS poste ses lectures sur
`conversations/messages.ts`) avant de décider entre l'aligner et la retirer.
