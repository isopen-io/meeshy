# Cycle 54 — le canal que le serveur diffusait pour un client qui n'écoutait pas

## 1. D'où vient la piste

Pas du §9 du cycle 53. Ses quatre pistes portaient toutes sur la ligne de liste,
et trois d'entre elles se sont révélées, à l'instruction, moins urgentes que ce
qu'elles annonçaient : les deux handlers « aveugles l'un à l'autre » (piste n°1)
convergent en réalité dans les deux ordres d'arrivée, et la garde monotone du
web (piste n°2) n'a rien à protéger tant qu'aucun recul non autoritatif
n'existe. La piste retenue vient d'ailleurs : un **diff de couverture
d'événements** entre les deux clients.

La méthode est mécanique et vaut d'être écrite, parce qu'un premier passage l'a
ratée. `SERVER_EVENTS` compte plus de cent quatre-vingts entrées ; les chercher
dans les clients **par leur littéral** rend un tableau faux pour le web, qui
s'abonne par la CONSTANTE (`SERVER_EVENTS.MESSAGE_HIDDEN_FOR_ME`), et juste pour
iOS, dont le SDK s'abonne par la chaîne (`socket.on("message:pinned")`). Les
deux formes doivent être cherchées séparément, sous peine de conclure à une
lacune côté web là où il n'y en a pas — et de manquer celle d'en face.

Le tableau, une fois refait proprement, tient en deux lignes :

| Événement | web | iOS |
|---|---|---|
| `message:hidden-for-me` | abonné | **aucun abonné** |
| `message:restored-for-me` | abonné | **aucun abonné** |

## 2. Le contrat que le serveur tient déjà

`services/gateway/src/services/personalMessageVisibilitySync.ts` est l'écrivain
unique de `UserMessageDeletion`, et son en-tête énonce quatre devoirs par
écriture. Le troisième est ce cycle :

> 3. broadcast to `user:{id}` so the other devices converge;

Son commentaire d'ouverture décrit aussi, mot pour mot, l'état dans lequel iOS
se trouvait :

> nothing was broadcast, so the hiding only ever reached the device that issued
> the request […] Every OTHER device of the same user kept showing the message
> indefinitely.

Le module a été écrit pour fermer ça. Il l'a fermé pour le web. Personne n'a
vérifié que le second client écoutait.

La raison pour laquelle le canal doit exister est celle que `delta-tombstones.ts`
écrit déjà pour la liste, et elle mérite d'être répétée ici parce qu'elle est le
cœur du défaut : **un filtre de LECTURE ne rétrécit que ce qu'une NOUVELLE
requête renvoie ; il n'a aucune prise sur une ligne que le client détient
déjà.** `personalHistoryFilter` est donc nécessaire et pas suffisant — un client
qui ne relit jamais n'apprend jamais.

## 3. Ce que ça donnait à l'écran

Prisme du lecteur, un iPhone et un onglet web ouverts sur la même conversation.
Le lecteur masque un message depuis le web (« supprimer pour moi ») :

| | web | iOS |
|---|---|---|
| bulle dans le fil | retirée | **toujours affichée** ✘ |
| ligne de liste | remplaçant | remplaçant ✔ |

La ligne de liste, elle, était juste — parce que `refreshPersonalConversationPreview`
émet un `conversation:updated` jumeau que `ConversationStore.merging` honore
depuis le cycle 50. **L'aperçu et le fil se contredisaient donc franchement** :
la liste annonçait un dernier message que le fil, ouvert, montrait surmonté d'un
autre.

Rien ne corrigeait ensuite pendant la session. Seul un rechargement à froid — la
liste `deleted` de `GET /sync`, où les tombstones de masquage sont fusionnées —
refermait l'écart.

## 4. Pourquoi ce n'est pas `markDeleted`

Le réflexe est de router `hidden-for-me` vers le chemin de suppression existant,
comme le web le fait (« on réutilise les mêmes écouteurs plutôt que d'écrire un
second retrait — deux implémentations du même geste auraient dérivé »). Le
raisonnement est juste ; sa transposition ne l'est pas, **parce que les deux
clients n'écrivent pas la même chose sur une suppression**.

- Le web FILTRE le message hors du cache (`.filter((m) => m.id !== messageId)`).
  Un masquage y a exactement la même forme, d'où la réutilisation.
- iOS pose une **pierre tombale** : `markDeleted` écrit `deletedAt` et vide le
  contenu, et la bulle rend « ce message a été supprimé ».

La tombstone est juste pour une suppression POUR TOUS : le message a disparu
pour tout le monde, et le fil doit en garder la trace. Elle est fausse pour un
masquage personnel — le message reste **vivant** pour les autres participants,
c'est ce lecteur-là qui l'a retiré de sa vue. Et elle serait DURABLE : le
serveur ne renverra plus jamais ce message à ce lecteur, donc aucune relecture
ne viendrait effacer la pierre. On aurait remplacé une bulle fantôme par une
tombstone à vie.

D'où `purgeMessages`, le pendant DUR de `markDeleted` : la ligne part.

## 5. Le correctif

### 5.1 SDK — le canal

`MessageHiddenForMeEvent` + `PersonalMessageVisibilityRef`, un publisher
`messageHiddenForMe` au protocole `MessageSocketProviding`, et le `socket.on`
correspondant.

Une **liste**, pas un id : la route de masquage en lot en accepte cent, et un
événement par message ferait payer cent réconciliations à un seul geste. La
route unitaire émet une liste d'un élément — les clients n'ont qu'une forme à
traiter. `hiddenAt` est optionnel côté client : il n'arbitre rien (le masquage
est un fait par-lecteur, sans concurrence à départager), et son absence ne doit
pas faire échouer le décodage et perdre le retrait.

### 5.2 SDK — `MessagePersistenceActor.purgeMessages(ids:)`

Trois propriétés, chacune tenue par un témoin :

1. **La ligne part, elle ne devient pas une tombstone** (§4).
2. **Résolution par `localId` OU `serverId`**, exactement comme `markDeleted` :
   l'événement nomme l'id SERVEUR, et la ligne locale d'un message qu'on a
   soi-même envoyé peut encore porter son id optimiste.
3. **Les tables filles partent avec**, comme `deleteAll` — et depuis les lignes
   RETROUVÉES, jamais depuis les ids reçus : `message_translations`,
   `message_transcriptions` et `message_audio_translations` sont clées sur le
   `localId` réel, que l'id reçu peut ne pas être.

Un rafraîchissement PAR conversation touchée, jamais un global : les
observateurs de `MessageStore` filtrent par `conversationId`, et un lot peut
traverser plusieurs fils.

### 5.3 App — `ConversationSocketHandler`

L'abonnement borne le lot au fil qu'il tient, comme tous ses voisins. Les
références qui nomment une autre conversation sont laissées à leur propre
handler — et à défaut, au prochain chargement REST, déjà filtré côté serveur.

Le retrait des favoris accompagne la purge, pour la raison exacte qui le fait
accompagner la suppression pour tous : l'instantané figé de `StarredMessagesStore`
survivrait au message.

## 6. Ce qui est idempotent, et pourquoi il fallait le vérifier

La room est celle de l'**utilisateur**, pas du socket : l'appareil qui a émis la
requête reçoit l'événement lui aussi. Et un lot peut nommer des messages
qu'aucune ligne locale ne porte (hors de la page chargée). `purgeMessages` sur
des ids inconnus, comme sur une liste vide, ne doit donc rien faire et surtout
ne rien poster — d'où le témoin dédié.

## 7. Écarté délibérément

**`message:restored-for-me`.** Le canal inverse reste sans abonné iOS, et c'est
un choix, pas un oubli. Une APPARITION ne peut pas s'écrire comme une tombstone
inversée : l'appareil qui a purgé la ligne n'en détient plus le contenu, et
l'événement ne porte que l'ADRESSE. Il faut aller rechercher — le web invalide
ses requêtes, iOS n'a pas d'équivalent à portée de ce handler. Surtout : iOS
n'expose aujourd'hui **aucun geste de masquage par message** (seulement au
niveau conversation), donc le seul chemin qui produise un restore est le web,
où le lecteur regarde. Le message revient de toute façon au prochain
chargement du fil. Piste n°1 du §9.

**Un consommateur GLOBAL.** `ConversationSocketHandler` n'existe que si une
conversation est ouverte : un masquage reçu sur l'écran de liste ne purge donc
rien localement. C'est sans conséquence visible (le prochain chargement du fil
passe par REST, filtré côté serveur), mais ça laisse des lignes périmées en
base entre-temps, que le rendu cache-first peut montrer une fraction de seconde.
Piste n°2.

**`local_attachments`.** La table est clée sur `messageLocalId` et porte des
`localPath` vers de vrais fichiers. Ni `deleteAll` ni `purgeMessages` ne la
balaient : supprimer la ligne sans le fichier rendrait celui-ci irrécupérable.
Fuite PRÉEXISTANTE, non introduite ici, et qui demande un cycle à elle. Piste
n°3.

## 8. Pistes pour le cycle 55 — repérées, NON livrées

1. **`message:restored-for-me` côté iOS** (§7). Demande un chemin de relecture
   ciblé depuis le handler — le vrai sujet, et il déborde ce cycle.
2. **Un consommateur global du canal de visibilité personnelle** (§7), qui
   purgerait quel que soit l'écran affiché.
3. **`local_attachments` orpheline** après `deleteAll` / `purgeMessages` (§7) :
   lignes et fichiers, et l'ordre entre les deux.
4. **Le diff de couverture d'événements n'a été fait qu'une fois, à la main.**
   Les deux formes d'abonnement (constante côté web, littéral côté iOS) rendent
   l'exercice fragile et le premier passage a produit un tableau faux. Une garde
   source qui l'automatise vaudrait mieux qu'un audit répété — c'est ce qui
   aurait trouvé ce défaut au cycle 40 plutôt qu'au 54.
5. Reprises du cycle 53, ré-instruites et RÉTROGRADÉES : la double cécité des
   handlers de suppression web converge dans les deux ordres d'arrivée ; la
   garde monotone du web n'a rien à protéger aujourd'hui. À reprendre le jour
   où un recul non autoritatif apparaît, pas avant.

## 9. Gates

- **Guards CI locales** : `check-law-literals.sh` et `check-swift-viewbuilder.sh`
  vertes (2547 fichiers Swift balayés).
- **Compilation et tests Swift** : délégués à la CI (`iOS` sur `macos-15`,
  `SDK Tests`) — aucun toolchain Swift sur l'hôte de cette routine, et les deux
  workflows se déclenchent sur `apps/ios/**` et `packages/MeeshySDK/**`.
- **Aucun fichier TypeScript touché** : les suites web/gateway/shared ne sont pas
  concernées par ce diff.
- 10 témoins neufs : 3 de décodage, 5 sur la purge, 2 sur le handler.
