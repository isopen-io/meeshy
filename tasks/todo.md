# Cycle 15 — Un message envoyé par lien de partage n'atteint jamais un participant hors ligne

## Constat

`POST /links/:identifier/messages` (anonyme) et `POST /links/:identifier/messages/auth`
(authentifié) créent un `Message` puis l'annoncent par **une seule** ligne :

```ts
socketIOManager.getIO()?.to(`conversation:${conversationId}`).emit(SERVER_EVENTS.LINK_MESSAGE_NEW, ...)
```

La room `conversation:<id>` ne contient que les sockets **connectés**. Aucun des deux
chemins n'enfile quoi que ce soit dans `RedisDeliveryQueue`. Un participant hors ligne au
moment de l'envoi ne reçoit donc rien à la reconnexion : `_drainPendingMessages` n'a rien à
rejouer, et le client web ne refetch pas (`staleTime: Infinity`, cf. le commentaire du
handler `handleLinkMessageNew`). Le message n'apparaît qu'au prochain refetch complet et
non lié de la conversation.

C'est la **classe d'événement la plus grave** à laquelle le trou pouvait rester ouvert :
pas un compteur de réactions périmé, un **message entier**. Et c'est le chemin d'envoi
PRIMAIRE des participants anonymes — la fonctionnalité de lien de partage est le cœur du
produit (`anonymous-chat.service.ts:142` poste sur cette route).

## Diagnostic

### D1 — la leçon du cycle 14 nommait exactement ce cas et n'avait pas été jouée jusqu'au bout
Leçon 2026-08-08 (2) #1 : « après avoir créé un diffuseur unique, énumérer immédiatement les
AUTRES types d'événements qui traversent les mêmes audiences ». L'énumération d'alors s'est
arrêtée aux voisins cités (réactions, épinglages, accusés) — tous vérifiés et couverts :
`pinned`/`unpinned` sont bien enfilés par les deux routes de pin. Mais `link:message:new`
n'était dans aucune des listes, parce qu'il ne ressemble pas à une mutation : c'est une
**création**, donc on le range mentalement avec `message:new`… qui, lui, est couvert par
deux chemins (socket et REST nominal). Le lien est le troisième transport de création, et
le seul sans file.

### D2 — le contournement est documenté, l'omission ne l'est pas
Le fichier dit lui-même « ce chemin CONTOURNE `MessagingService.handleMessage` » et liste
ce qu'il refait à la main (validation, stockage). La file de livraison hors ligne ne figure
ni dans la liste de ce qui est refait, ni dans celle de ce qui est délibérément omis. Un
commentaire qui énumère les conséquences d'un contournement doit être exhaustif ou ne pas
exister — sinon il fait passer une omission pour un choix.

### D3 — cinq implémentations jumelles de la même obligation, aucune partageable
`MessageHandler._enqueueOfflineEventForParticipants` (privé), `MessageHandler.broadcastNewMessage`
(bloc inline), `MeeshySocketIOManager.enqueueOfflineMessageMutation`, `reactionOfflineQueue`,
`AttachmentReactionHandler._enqueueOfflineAttachmentReactionEvent` (privé). Toutes font le
même geste : lister les participants actifs, exclure l'acteur, sauter les connectés, enfiler.
Elles ne diffèrent que par **l'identité d'exclusion** (participantId ou userId) et par le
`dedupKey`. Ajouter une sixième copie pour le lien reproduirait la structure qui a rendu les
quatre trous précédents invisibles.

### D4 — la seule audience manquante est bien la troisième
Contrairement aux éditions REST (cycle 13), l'aperçu de conversation n'a pas besoin d'un
canal séparé ici : `AuthHandler` rejoint TOUTES les rooms de conversation à la connexion,
et le handler web `handleLinkMessageNew` remonte lui-même la conversation dans la liste à
partir du même événement. Deux audiences, pas trois — divergence assumée et documentée.

## Plan
- [x] T1 — RED : test via l'API publique (inject HTTP sur les deux routes de lien)
- [x] T2 — GREEN : `offlineParticipantQueue` — l'implémentation unique de la troisième audience
- [x] T3 — les cinq sites existants délèguent (aucun changement de comportement)
- [x] T4 — `broadcastLinkMessage` : point unique nommant les deux audiences du lien
- [x] T5 — `'link-message'` dans `QueuedMessagePayload['eventType']` + `_drainedEventName`
- [x] T6 — gates : suite gateway complète + `tsc --noEmit`
- [x] T7 — changeset + CHANGELOG + lessons
- [ ] T8 — PR, CI vert, merge sur main

## Revue

Le correctif n'est pas « ajouter l'enqueue aux deux routes de lien » : recopié deux fois de
plus, il aurait porté à sept le nombre de copies d'une obligation dont quatre étaient déjà
`private` — donc inatteignables par tout autre écrivain, ce qui est exactement pourquoi les
trous des cycles 13 et 14 avaient pu naître. Il consiste à faire de « atteindre les
participants hors ligne » **une** implémentation, paramétrée par les deux seules choses qui
différaient réellement entre les cinq copies : l'identité d'exclusion de l'acteur
(participantId côté socket, userId côté routes REST sous `requiredAuth` — les deux
honorées) et le `dedupKey`.

**La copie inline de `broadcastNewMessage` avait une vraie raison d'exister**, et c'est le
point où ce refactor pouvait discrètement régresser : elle réutilise une liste de
participants déjà chargée, sur le chemin le plus chaud du service. L'extraire naïvement
aurait ajouté une requête Prisma par message envoyé. Le paramètre `participants` préserve
la perf sans conserver la copie ; un test dédié verrouille qu'aucune requête n'est émise
quand la liste est fournie.

**Deux audiences, pas trois** — seule divergence assumée avec `broadcastMessageMutation`.
`AuthHandler` rejoint toutes les rooms de conversation à la connexion, donc un participant
sur l'écran de liste est TOUJOURS dans la room ; et le handler web `handleLinkMessageNew`
remonte lui-même la conversation en tête de liste depuis ce même événement. Un
`conversation:updated` séparé coûterait une lecture DB par message de lien pour une mise à
jour que les clients ont déjà appliquée. Écrit dans le docstring pour qu'un lecteur ne
prenne pas l'absence pour l'oubli auquel elle ressemble.

**Le rejeu porte `link:message:new`, pas `message:new`.** Un message de lien est une
création, mais les deux événements n'ont pas la même forme de charge utile (`{ message }`
contre l'objet message nu) : rejouer l'un sous le nom de l'autre aurait livré au client une
enveloppe là où il attend un message. Un `eventType` de file nomme le couple (événement,
forme), pas la sémantique.

Vérification par mutation : les 3 assertions d'enqueue observées ROUGES (« Number of calls:
0 ») sur les deux routes avant le correctif ; puis, après, deux mutations ciblées — retrait
du routage `'link-message'` du drain, et neutralisation de l'exclusion par userId — chacune
faisant retomber exactement le test qui la couvre.

### Reste ouvert (hors périmètre, constaté en chemin)
- Le chemin de lien ne pousse pas `conversation:unread-updated` : le compteur est **dérivé**
  de curseurs côté service, donc juste au refetch, mais aucun push live ne l'actualise pour
  les pairs. Écart réel, sans divergence persistante.
- Aucun client iOS n'écoute `link:message:new` (aucune occurrence Swift) : les conversations
  par lien restent une fonctionnalité web.
- Le chemin de lien ne déclenche aucune traduction (`prisma.message.create` direct, hors
  `MessagingService`) — un message anonyme n'entre donc pas dans le Prisme Linguistique.
