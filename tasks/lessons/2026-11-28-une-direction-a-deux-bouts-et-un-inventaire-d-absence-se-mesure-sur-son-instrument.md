## Une direction a DEUX bouts — et un inventaire d'ABSENCE se mesure d'abord sur son instrument

**Date** : 2026-11-28 · **Issue** : #20791 · **Cycle** : audit de synchro temps réel, à la suite de #20414 / #20778

### Le fait

`packages/shared/CLAUDE.md` affirmait, depuis le 2026-11-14 : « `socket-event-handler-gate`
**ferme la direction MONTANTE**, que les cinq cliquets voisins laissaient ouverte ».
La phrase était vraie d'un bout sur deux.

| ce qu'on garde | descendant (`SERVER_EVENTS`) | montant (`CLIENT_EVENTS`) |
|---|---|---|
| bout **serveur** | `socket-event-emitter-gate` | `socket-event-handler-gate` (#18499) |
| bout **client** | `socket-event-orphan-gate` (#18342) + parity gate | **RIEN** |

La descendante avait ses deux bouts. La montante n'en avait qu'un, et c'est la
phrase elle-même qui empêchait de le voir : elle nommait une DIRECTION là où le
cliquet gardait un BOUT.

> **Une énumération se relit sur la propriété qu'elle nomme.** « Direction
> fermée » et « bout fermé » ont la même longueur et pas le même sens. C'est la
> leçon 261 appliquée non pas à une liste de sites, mais au MOT par lequel une
> garde se décrit.

### Ce que la case vide cachait

Dix canaux montants ont un `socket.on` VIVANT — sa validation Zod, son seau de
débit, ses gardes de participation vivante, ses témoins — et **aucun appelant
dans aucun des trois clients** : les transports SOCKET de l'édition, de la
suppression et des deux sens de la réaction d'un message (les clients passent par
REST), les deux canaux montants du Signal Protocol, l'authentification MANUELLE
du socket, l'abonnement d'une console d'administration, et la resynchronisation
d'un roster de réactions de message.

**Le prix n'est pas celui de #18499, et c'est le point.** Sans ÉCOUTEUR, un canal
SE TAIT — Socket.IO laisse tomber l'événement sans lever d'erreur. Sans
ÉMETTEUR, c'est l'inverse du silence : du code servi, gardé, testé, maintenu
pour personne, et qui se lit partout comme une feature en service. Les deux
moitiés d'une direction ne coûtent pas la même chose ; en garder une et dire
qu'on a gardé la direction fait croire que l'autre a été instruite.

### Le piège qui a failli faire mentir le cliquet

Au premier jet, la garde a inventorié `heartbeat` comme un canal sans émetteur.
**Il en a DEUX** : iOS (`safeEmit("heartbeat", ["clientTime": …])`, 30 s) et
Android (`socket.emit(EVENT_HEARTBEAT, …)`, avec son écoute de `heartbeat:ack`).

La cause n'était pas dans le dépôt : le relevé PARTAGÉ `eventsNamedByClients`
reconnaît un littéral par la forme `entity:action`, et **trois noms déclarés ne
la suivent pas** — `authenticate`, `heartbeat`, et `error` côté `SERVER_EVENTS`,
que l'orphan gate ne voit donc pas non plus.

> **Un inventaire d'ABSENCE est une affirmation sur le monde ; un relevé qui ne
> trouve rien est une affirmation sur l'INSTRUMENT.** Avant d'écrire « personne
> ne cite ce nom », demander : *mon relevé pourrait-il le citer s'il existait ?*
> Une garde qui gèle une absence gèle, en même temps et sans le dire, la forme
> de sa propre regex.

Le remède retenu est étroit — un second relevé, littéral, borné aux noms sans
deux-points — plutôt que de corriger le helper partagé : le corriger déplacerait
les inventaires de deux autres cliquets dans le même lot. La limite restante est
ÉCRITE sur place, et le témoin qui la garde exerce les deux sens (il trouve
`heartbeat`, il ne crédite pas un nom inventé) — sans quoi la prochaine édition
de l'union réinventorierait `heartbeat`, ce qui est exactement ce qui vient
d'arriver.

### Et le commentaire qui l'affirmait disait faux

Le doc-comment de `AuthHandler.handleEnginePong` écrivait « Android n'a jamais
émis de heartbeat applicatif » et « `CLIENT_EVENTS.HEARTBEAT` ne subsiste que
pour iOS ». Les deux sont mesurés faux, et on ne l'a su qu'en confrontant le
relevé au code.

C'est la leçon du cycle 94 — *un commentaire qui ÉNONCE une contrainte est une
affirmation, et se vérifie comme telle* — avec la précision qui la rend
actionnable ici : **ce commentaire décrivait le PARC DES CLIENTS**, c'est-à-dire
la chose la moins susceptible de rester vraie et la moins visible depuis le
fichier qui l'énonce. Un fait sur un autre dépôt-logique vieillit sans qu'aucun
compilateur ne s'en aperçoive.

### La règle, pour la prochaine fois

1. Devant une garde qui dit fermer « une direction », un « sens », « un
   contrat » : **compter les bouts**. Un canal a un émetteur et un récepteur ;
   une donnée a un producteur et un lecteur.
2. Avant de geler une ABSENCE, **prouver que l'instrument verrait la présence** —
   un témoin positif sur un cas connu-vrai, dans le même fichier que
   l'inventaire.
3. Un commentaire qui décrit ce que font les CLIENTS est une mesure périssable :
   la confronter, ou la remplacer par le relevé qui la tient.
