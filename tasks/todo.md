# Cycle 17 — Le badge de non-lus ne bouge jamais pour un message reçu par lien de partage

## Constat

Le cycle 16 a fermé les effets que tout message doit à sa **conversation** (bump de
`lastMessageAt`, poussée au translator, statistiques). Sa section « Reste ouvert » relevait,
sans le traiter :

> Le chemin de lien ne pousse toujours pas `conversation:unread-updated` : le compteur est
> dérivé de curseurs, donc juste au refetch, mais aucun push live ne l'actualise pour les pairs.

La leçon #1 du cycle 16 impose de relire un « reste ouvert » comme une hypothèse, jamais comme
un inventaire. La bonne clé d'énumération n'est plus « qu'est-ce que ce message doit à sa
conversation » (cycle 16) mais : **qu'est-ce que TOUT message committé doit à ses
DESTINATAIRES ?**

| Obligation destinataire | Chemin WS | Chemin REST/ZMQ | Chemin lien |
|---|---|---|---|
| `message:new` / `link:message:new` (room live) | oui | oui | oui |
| File hors ligne (rejeu à la reconnexion) | oui | oui | oui (cycle 15) |
| `conversation:unread-updated` (badge) | oui | oui | **non** |
| `conversation:updated` (aperçu + tri) | oui | oui | non — omission argumentée (cycle 15) |
| `mention:created` | oui | oui | non — cf. Reste ouvert |
| Accusé « delivered » auto (en ligne mais ailleurs) | oui | oui | non — cf. Reste ouvert |

## Diagnostic

### D1 — le badge ment, et il ment longtemps

`conversation:unread-updated` est le SEUL signal live qui incrémente la pastille de non-lus
d'un destinataire. Sur le chemin de lien il n'est jamais émis. Le handler web
`handleLinkMessageNew` (`apps/web/hooks/queries/use-socket-cache-sync.ts:938`) remonte bien la
conversation en tête de liste et met à jour l'aperçu — mais il ne touche pas au compteur, et
rien d'autre ne le fera : la liste des conversations est en `staleTime: Infinity`.

Résultat observable : la conversation remonte en tête avec le nouvel aperçu, **et sa pastille
reste à sa valeur d'avant**. Le lien de partage étant le seul transport d'envoi d'un
participant anonyme, tout un pan du trafic produit ce mensonge. Un destinataire qui a un
non-lu voit « 1 » pendant que trois messages sont arrivés ; un destinataire à jour ne voit
aucune pastille du tout.

Le compteur lui-même est juste — il est dérivé des curseurs de lecture, donc correct dès le
prochain refetch complet. C'est le **push** qui manque, pas la donnée.

### D2 (racine) — deux copies de l'éventail destinataire, dont une privée, et un troisième
écrivain qui n'en atteint aucune

L'émission du badge existe en **deux implémentations** :

1. `MessageHandler._updateUnreadCounts` — **privée** (`socketio/handlers/MessageHandler.ts:1631`) ;
2. un bloc inline dans `MeeshySocketIOManager._broadcastNewMessage` (`:2113-2135`).

Même forme exactement : charger les participants actifs, exclure l'expéditeur, appeler
`getUnreadCountsForParticipants`, émettre vers `ROOMS.user(userId ?? id)`. Elles ne diffèrent
que par **le prédicat d'exclusion de l'expéditeur** — `_isSender` (les deux identités) contre
`p.id !== senderId` (participant seul) — c'est-à-dire par une valeur, pas par un comportement.

C'est la configuration décrite au cycle 14 (#3) et redocumentée aux cycles 15 et 16 : une
obligation PRODUIT enfermée dans un `private`, donc inatteignable par tout écrivain hors de la
classe. Les deux routes de lien contournent les deux classes — elles ne pouvaient pas, par
construction, honorer le badge. Quatrième cycle consécutif sur la même racine.

## Plan
- [x] T1 — RED : unité partagée `emitUnreadCountsToRecipients` (exclusion double identité,
      room de repli sur l'id de participant, participants préchargés, tolérance aux pannes)
- [x] T2 — RED : `broadcastLinkMessage` émet le badge en 3e audience
- [x] T3 — RED : les deux routes de lien font remonter le badge jusqu'au manager
- [x] T4 — GREEN : `socketio/emitUnreadCountsToRecipients.ts`
- [x] T5 — `MessageHandler._updateUnreadCounts` délègue à l'unité
- [x] T6 — bloc inline de `MeeshySocketIOManager` délègue (participants préchargés conservés)
- [x] T7 — gates : suite gateway complète + `tsc --noEmit`
- [x] T8 — changeset + CHANGELOG + lessons
- [x] T9 — PR, CI vert, merge sur main

## Revue

### L'unité prend l'exclusion la PLUS large, et ce n'est pas un compromis

Les deux copies divergeaient sur le prédicat. `MessageHandler` exclut par les deux identités
(`p.id === senderId || p.userId === senderId`) parce que son `senderId` est un `Participant.id`
sur le transport REST/ZMQ et un `User.id` sur le transport WS — fait déjà écrit dans son
docstring (`MessageHandler.ts:1192-1194`). Le manager n'exclut que par `Participant.id`, ce qui
est correct **chez lui** (`message.senderId is a Participant.id`, `MeeshySocketIOManager.ts:2052`)
mais faux dès qu'un autre appelant passe un `User.id`.

L'unité retient le prédicat large. Ce n'est pas « le plus prudent des deux » : les deux espaces
d'id ne se recoupent jamais (ObjectIds de collections distinctes), donc le prédicat large est
STRICTEMENT équivalent au prédicat étroit sur les appelants où l'étroit était correct, et
correct là où l'étroit ne l'était pas. Élargir ne coûte donc aucun faux positif.

### La room de repli sur l'id de participant est ce qui rend le chemin de lien servable

`ROOMS.user(participant.userId ?? participant.id)` — les deux copies avaient déjà ce repli
(`p.userId || p.id`). Il compte plus ici qu'ailleurs : une conversation ouverte par lien est
peuplée de participants ANONYMES, sans `User.id`. Sans le repli, un anonyme ne recevrait jamais
de badge — or c'est exactement la population de ce transport. Un test le verrouille, parce que
le repli ressemble à une précaution défensive et se supprime au premier « nettoyage ».

### Trois audiences maintenant, et la quatrième reste délibérément absente

`broadcastLinkMessage` documentait « TWO audiences, not the three ». Il y en a trois : room
live, file hors ligne, badge destinataire. La quatrième (`conversation:updated`) reste absente
pour la raison inchangée du cycle 15 — `AuthHandler` rejoint toutes les rooms à la connexion et
le handler web bump l'aperçu depuis `link:message:new`, donc l'émettre coûterait une lecture DB
par message pour une mise à jour déjà appliquée. La différence, et c'est elle qui justifie le
badge : le handler web **n'applique pas** le compteur, lui.

### Coût : une requête participants, pas deux

L'unité accepte `participants` en paramètre. Le manager la lui passe — sa requête superset
(`id + userId + joinedAt`) sert déjà `conversation:updated` et la file hors ligne, et un
troisième consommateur ne doit pas ajouter un aller-retour sur le chemin le plus chaud du
service. `MessageHandler` fait de même avec ses `preloadedParticipants`. Sur le chemin de lien,
en revanche, aucune liste n'est déjà chargée : l'unité fait sa propre requête. Même argument
qu'au cycle 14 (#4) — quand une copie existe « pour la performance », la performance tient à un
ARGUMENT que l'API peut accepter.

### Court-circuit sur zéro destinataire

Si l'expéditeur est le seul participant actif, l'unité sort avant d'appeler
`getUnreadCountsForParticipants`. Ce n'est pas une micro-optimisation gratuite : ce service
exécute jusqu'à deux requêtes (curseurs + messages) et le cas « conversation à un seul
participant actif » est courant sur les liens de partage fraîchement créés.

### Best-effort, jamais bloquant

Comme les deux copies qu'elle remplace, l'unité n'attend rien du chemin de l'ACK et avale ses
erreurs vers `onError`. Un badge non émis ne doit pas transformer un envoi réussi en 500, ni
empêcher la file hors ligne de tourner. Sur le chemin de lien elle est appelée en
fire-and-forget avec un `.catch` explicite — `void promesse` sans `.catch` tue le processus
sous Node 22 (`--unhandled-rejections=throw`), leçon du cycle 15.

### Reste ouvert après ce cycle

Deux obligations destinataire restent absentes du chemin de lien, avec leurs faits vérifiés :

- **`mention:created`** — ce n'est pas l'émission qui manque mais la DONNÉE. Les deux émetteurs
  nominaux lisent `message.validatedMentions` (`MeeshySocketIOManager.ts:2055`,
  `MessageHandler._resolveMentionUserIds`), champ écrit par le SEUL `MessageProcessor`
  (`services/messaging/MessageProcessor.ts:952`) après extraction, résolution des usernames,
  validation des permissions et création des lignes `Mention`. Les routes de lien ne font
  jamais tourner ce processeur : câbler l'émission seule n'émettrait rien, le champ restant
  vide. Le correctif passe par l'extraction des mentions au moment de l'insert.
- **Accusé « delivered » automatique** — `MessageHandler.autoDeliverToOnlineRecipients` est
  publique et prend un `Message` Prisma complet, que les routes de lien ont en main. Le blocage
  est ailleurs : elle n'est atteignable que depuis `MessageHandler`, et `LinkMessageManager` ne
  l'expose pas. Conséquence observable : l'indicateur de l'expéditeur d'un message par lien ne
  passe jamais de « envoyé » à « remis » pour un destinataire connecté mais posé sur une autre
  conversation.
- Aucun client iOS n'écoute `link:message:new` — les conversations par lien restent une
  fonctionnalité web (hérité du cycle 15).
- Les pièces jointes du chemin de lien n'entrent pas dans le pipeline audio (hérité du cycle 16).
- L'arbitrage `delete-for-me` tranché par le cycle 12 attend toujours une validation humaine.
