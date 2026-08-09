# Cycle 38 — Un retrait de contenu doit s'annoncer, et s'annoncer au bon monde.

Tête prise exactement où le cycle 37 la posait : « quoi d'autre identifie l'acteur d'une mutation par
une propriété de l'objet muté plutôt que par le contexte d'authentification ? ». La réponse est
arrivée en **miroir** — le défaut trouvé est l'exact inverse de celui cherché : ici c'est le
**contexte d'authentification qui était passé là où une propriété de l'objet est attendue**. Même
famille, même cause (acteur et cible ont longtemps coïncidé), sens opposé.

## Lot A — la suppression modérée s'annonçait au graphe social du MODÉRATEUR

`DELETE /posts/:postId` autorise « l'auteur, OU un modérateur et plus » (`PostService.deletePost`,
`canModerate`). Les trois diffusions de retrait reçoivent ensuite un `authorId` dont
`SocialEventsHandler` se sert pour **déplier un graphe social** (`getFriendIds` /
`getVisibilityFilteredRecipients`) et pour ajouter la feed room de cette personne aux destinataires.

La route y passait `authContext.registeredUser.id`.

| qui | ce qu'il devrait recevoir | ce qu'il recevait |
|---|---|---|
| l'auteur du post retiré | `post:deleted` | **rien** |
| ses amis, qui ont le post au fil | `post:deleted` | **rien** |
| les amis du modérateur | rien | `post:deleted` d'un post qu'ils n'ont pas |

Rien ne rejoue ces événements et aucun client ne refetch spontanément : le post restait **affiché
dans le fil de tous ses lecteurs, auteur compris**, jusqu'à un rafraîchissement manuel. Le retrait
était committé en base et invisible partout où il comptait. Seuls les spectateurs du détail étaient
épargnés, par `ROOMS.post(postId)` — qui, lui, ne dépend d'aucune identité.

**Le chemin voisin portait déjà la bonne lecture.** `DELETE /posts/:postId/comments/:commentId`
(`comments.ts`) relit `post.authorId` en base avant de diffuser, pour cette raison exacte. Troisième
cycle consécutif où le correctif existait à quelques fichiers de distance sans qu'aucun test ne le
relie à son jumeau (leçon 90).

## Lot B — la console d'administration ne s'annonçait à personne

`DELETE /admin/posts/:postId` écrit `deletedAt` **sans passer par `PostService.deletePost`**. La
route porte déjà un commentaire sur ce que ce raccourci a coûté une fois : les usages de sons,
jamais libérés, corrigés par un cycle précédent. Le même raccourci laissait tomber toute la
diffusion — `post:deleted` / `story:deleted` / `status:deleted` ne partaient **jamais** depuis
l'admin. Un post retiré par la modération restait vivant à l'écran de chacun.

La route ne sélectionnait d'ailleurs pas de quoi le faire : son `select` s'arrêtait à
`{ id, deletedAt, authorId }`, sans `type` (qui choisit l'événement) ni `visibility` /
`visibilityUserIds` (qui refiltrent l'audience d'un STATUS).

## Le seam — `broadcastPostRemoval`

Trois familles de contenu vivent dans la même table `Post` et voyagent sur trois événements
distincts, parce que les clients s'y abonnent séparément. **Choisir le bon est une règle, pas un
détail d'appel** — et elle n'a aucune raison d'exister en deux exemplaires quand les deux routes
retirent le même objet. `services/gateway/src/socketio/broadcastPostRemoval.ts` la porte une fois,
avec ses deux invariants écrits noir sur blanc (l'audience se déplie depuis l'AUTEUR ; la visibilité
accompagne le STATUS), et reste best-effort : le retrait est committé quand il s'exécute.

## Vérification

- **8 tests neufs, écrits AVANT l'implémentation, 6 rouges observés** :
  - Lot A — 3 rouges (`Received: …032` là où `…031` était attendu, sur POST / STORY / STATUS) et
    **1 vert délibéré** : l'auteur qui supprime lui-même. Sans ce témoin, les trois autres passeraient
    au vert avec n'importe quel identifiant : c'est lui qui prouve que le test mesure « l'auteur » et
    pas « une chaîne ».
  - Lot B — 3 rouges à `Number of calls: 0` (aucune diffusion n'existait) et 1 vert : une instance
    sans `socialEvents` décoré (serveur Socket.IO non monté) supprime sans broncher.
- **Un test existant asseyait l'ancien comportement** (`core-extended.test.ts`) — sa fixture rendait
  un document soft-deleté **sans `authorId`**, ce que Prisma ne fait jamais. Fixture rendue fidèle,
  assertion conservée.
- **Suite gateway complète : 619 suites, 15 921 tests, tout vert.** `tsc --noEmit` propre.
  Couverture lignes **95,66 %** (inchangée), branches 89,03 %. `broadcastPostRemoval.ts` : 100 %
  lignes / 100 % branches. `routes/admin/posts.ts` : 99,11 %. `routes/posts/core.ts` : 95,18 %.
- Aucun changement de format sur le fil : le payload portait déjà `authorId`, il porte désormais le
  bon. Vérifié qu'aucun client ne le lit — iOS (`SocialSocketManager` → `payload.postId`), web
  (`data.postId` / `data.storyId`), Android (aucun modèle ne décode le champ).

## Reste ouvert après ce cycle

- **Tête sérieuse du prochain cycle — `DELETE /admin/posts/:postId` devrait déléguer à
  `PostService.deletePost`.** Ce cycle a fermé la 2ᵉ omission de ce raccourci ; il en reste **deux,
  vérifiées** : (1) les `TrackingLink` du post ne sont **pas désactivés** — les liens de partage d'un
  post retiré par la modération **continuent de résoudre** (`isLinkActive` ne regarde que
  `isActive`/`expiresAt`, jamais le `deletedAt` de la cible) ; (2) **aucune ligne `AdminAuditLog`**
  n'est écrite, là où `deletePost` en écrit une pour toute suppression non-auteur — la route se
  contente d'un `fastify.log.info`. Le blocage à lever d'abord : `deletePost` ne distingue pas
  « introuvable » de « déjà supprimé » (filtre `NOT_DELETED` → `null` dans les deux cas) alors que la
  route rend 404 vs 400, et construire `PostService` dans ce fichier fait construire `MediaService`
  au montage. Piste : garder le `findUnique` de pré-contrôle pour la sémantique HTTP, déléguer le
  retrait.
- **`PUT /posts/:postId` passe l'acteur là où l'auteur est attendu** (3 diffusions +
  `reconcilePostMentions`). **Ce n'est pas un défaut aujourd'hui** : `updatePost` lève `FORBIDDEN`
  pour tout non-auteur, décision produit explicite (« un modérateur ne peut PAS modifier un poste »).
  C'est une **coïncidence, pas une garantie** — exactement la configuration qui a produit le lot A et
  le lot A du cycle 37. À rendre inconditionnel le jour où cette règle bouge, pas avant : aucun test
  ne peut distinguer les deux tant que le service les fait coïncider.
- Le reste du backlog du cycle 37 est inchangé : appartenance active de l'auteur, file d'attente de
  fan-out (D1 du cycle 32, 7ᵉ report), borne de concurrence de `member_joined`,
  `getVisibilityFilteredRecipients` / `filterPostConsumers` qui ne se citent pas, `@Display Name`
  social, `createStoryCommentNotificationsBatch`, les deux scripts de réparation de base.
- **`eslint` ne peut toujours pas tourner sur le gateway** (pas d'`eslint.config.js` depuis ESLint
  v9). Condition préexistante ; la CI ne gate que sur `test:coverage`.

# Cycle 37 — Les cycles précédents ont unifié QUI peut éditer. Le reste du système croyait encore que l'éditeur est l'auteur.

Tête prise dans le « reste ouvert » du cycle 36, mais pas à l'endroit qu'il désignait : son candidat
— l'inventaire « quel client emploie quelle route » — **existe déjà**. Il a été écrit en tête de
`services/messaging/messageEditAdmission.ts` (section « QUI APPELLE QUOI », les quatre entrées avec
leur client et le fichier exact) par le cycle qui a écrit la leçon 88. Vérifier avant d'exécuter,
deuxième cycle consécutif où c'est le premier geste utile.

Reste alors la vraie question que les cycles 33 à 36 ont ouverte sans la refermer : **ils ont changé
qui peut éditer un message. Qu'est-ce qui, ailleurs, tenait encore l'ancienne réponse pour acquise ?**

## Lot A — la file de rejeu hors ligne excluait l'AUTEUR au lieu de l'ÉDITEUR

`enqueueForOfflineParticipants` exclut l'acteur : on ne rejoue pas à quelqu'un l'événement qu'il
vient de produire. Le handler socket `message:edit` — transport PRIMAIRE — désignait cet acteur par
`message.senderId`, le `Participant.id` de l'**auteur**.

Les deux coïncidaient tant qu'on ne pouvait éditer que ses propres messages. `admitMessageEdit`
(cycles 33/34) rend explicitement `asModerator: true` pour un éditeur non-auteur : depuis, la
personne exclue n'est plus l'acteur, c'est **la cible**.

| qui | ce qu'il devrait recevoir | ce qu'il recevait |
|---|---|---|
| l'auteur, hors ligne, dont on modère le message | l'édition, au rejeu | **rien, jamais** |
| le modérateur qui édite | rien | rien (exclu par sa présence, par accident) |

Le second n'était couvert que par le hasard : `connectedUsers.has(queueKey)` écarte tout participant
connecté, et un éditeur qui parle par socket l'est. L'exclusion par identité ne servait plus qu'à
écarter la seule personne qu'il fallait servir.

Ce que ça donne pour un lecteur : rien ne rejoue l'événement et aucun client ne refetch
spontanément. La copie locale de l'auteur garde donc le texte d'**avant** modération — c'est-à-dire
exactement le contenu que la modération retirait — pendant que toute la conversation lit le texte
corrigé. Divergence permanente entre deux clients d'une même conversation, invisible des deux côtés :
le modérateur voit son geste appliqué, l'auteur n'a aucune raison de douter de ce qu'il lit.

**Le jumeau portait déjà le correctif.** `handleMessageDelete`, quinze lignes plus bas dans le même
fichier, écrit noir sur blanc : « Skip the DELETER, not the author. A moderator/admin may delete
another user's message (`message.senderId` is the author's participant id, not the actor's) ». Le
raisonnement était disponible, formulé, à portée de regard — et il n'avait **aucun test**, donc rien
ne l'a jamais rapproché de son frère.

## Lot B — la cause : un paramètre nommé d'après une valeur, pas d'après un rôle

Le helper privé était positionnel, et son deuxième paramètre s'appelait `senderParticipantId`. Ce nom
ne décrit pas ce que la fonction en fait (exclure l'acteur) mais ce que l'appelant avait sous la
main (l'auteur du message). Un appelant qui cherche quoi passer trouve `message.senderId` et le
passe : le nom du paramètre **valide** le geste au lieu de le questionner.

Il devient un paramètre-objet nommé d'après le RÔLE — `actorParticipantId` / `actorUserId`, comme
l'unité partagée qu'il enveloppe et qui documente déjà les deux monnaies. Le chemin de suppression y
gagne `actorUserId` en plus de son `Participant.id` : l'admin GLOBAL qui n'est pas participant n'a
pas de ligne à charger (`participants[0]?.id` vaut `undefined`, donc n'exclut personne) mais a
toujours un `User.id`.

## Lot C — la docstring qui affirmait la règle d'avant

L'en-tête de `handleMessageEdit` annonçait encore « Permissions: only the message author can edit
their own message ». Depuis les cycles 33/34, c'est faux. C'est cette phrase qui rendait
`message.senderId` cohérent au relecteur : si seul l'auteur édite, alors l'auteur EST l'acteur, et le
code se lit juste. Corrigée pour renvoyer à `admitMessageEdit`.

## Vérification

- **3 tests neufs, écrits AVANT l'implémentation, 1 rouge observé** (les deux autres sont des
  verrous sur du comportement déjà correct) :
  - « queues the edit for the OFFLINE AUTHOR when a moderator edits their message » — **rouge :
    `Number of calls: 0`**, la file ne recevait rien du tout.
  - « never queues the edit back to the EDITOR, by identity rather than by presence » — l'acteur est
    retiré de `connectedUsers` exprès : sans cela le test ne distingue pas l'exclusion par identité
    de l'exclusion par présence, et passerait au vert quel que soit le correctif.
  - le jumeau côté suppression, qui verrouille enfin le correctif que ce chemin portait sans test.
- `makeHandler` accepte désormais un `deliveryQueue` — sans lui `enqueueForOfflineParticipants`
  retourne immédiatement, et **aucun** des trois tests ne pourrait rien mesurer.
- **Suite gateway complète : 616 suites, 15 896 tests, tout vert** (cycle 36 : 616 / 15 893 — les 3
  tests neufs, exactement). `tsc --noEmit` propre. Couverture lignes **95,66 %**, branches
  **89,05 %** — inchangée. `MessageHandler.ts` : 98,21 % lignes, 96,42 % branches.

## Reste ouvert après ce cycle

- **Le candidat du cycle 36 est clos** : l'inventaire des quatre transports vit en tête de
  `messageEditAdmission.ts`. Ne pas le réécrire ailleurs.
- **Piste ouverte par ce cycle** : les cycles 33/34 ont élargi QUI peut éditer. Le lot A est le
  premier endroit trouvé qui tenait encore l'ancienne réponse. La question à reposer telle quelle au
  prochain cycle : **quoi d'autre, dans le gateway, identifie l'acteur d'une mutation par une
  propriété de l'objet muté plutôt que par le contexte d'authentification ?** Chercher les
  `message.senderId`, `post.authorId`, `conversation.createdBy` passés là où un `userId` de requête
  est attendu.
- **`appartenance active de l'auteur`** — la question produit du cycle 34 attend toujours une
  décision : un auteur qui a quitté une conversation peut encore éditer ses messages par les quatre
  entrées.
- **La file d'attente de fan-out** (D1 du cycle 32) — sixième report, même raison : elle demande de
  savoir ce que la troncature mesure en production, et cette routine n'a aucun accès aux logs.
- **Le fan-out `member_joined` n'a toujours aucune borne** de concurrence (cycle 33b) — à arbitrer
  avec la file, pas séparément.
- **`getVisibilityFilteredRecipients` et `filterPostConsumers`** ne se citent toujours pas (cycle 32).
- **`invalidateCacheForMessage` n'a plus d'appelant hors de la classe** (cycle 35) — gardé public
  délibérément. À ne pas re-câbler depuis une route.
- **`@Display Name` inextractible dans le domaine social** — onzième report.
- **`createStoryCommentNotificationsBatch` garde son `visibility?` optionnel** à défaut `PUBLIC`
  (cycle 26).
- **Les deux scripts de réparation de base** (`repair-mention-user-ids.ts`,
  `repair-tracking-link-created-by.ts`) attendent une exécution avec accès MongoDB — action humaine.

# Cycle 36 — Les cycles précédents ont unifié ce qu'une édition EXIGE, PRODUIT et PÉRIME. Pas ce qu'elle PUBLIE.

Tête prise à l'endroit que le cycle 35 désignait. La consigne qu'il laissait s'est avérée
**fausse**, et la vérifier avant de l'exécuter est le résultat le plus important de ce cycle.

## Lot 0 — la consigne du cycle 35 aurait cassé la file offline d'Android

Le cycle 35 concluait : « `PATCH /messages/:messageId` n'a toujours aucun appelant de production…
**Tête sérieuse du prochain cycle** : la retirer, elle et son service client. »

Il n'avait cherché l'appelant que côté **web**. Côté Android :

```
apps/android/sdk-core/.../outbox/OutboxFlushWorker.kt:161
    when (apiCall { messageApi.edit(row.targetId, body) }) {
apps/android/core/network/.../api/MessageApi.kt:34
    @PATCH("messages/{id}")
```

**C'est le chemin par lequel Android rejoue les éditions faites hors ligne.** La retirer aurait
transformé chaque flush d'édition offline en 404 — silencieusement, puisqu'un rejeu de file n'a pas
d'écran pour se plaindre. Le transport n'est pas mort : il est le seul que ce client emploie.

Ce que le cycle 35 avait vu est vrai pour une moitié seulement : **le client WEB** de cette route
était mort. C'est lui, et lui seul, qui est retiré (lot C).

La leçon tient en une ligne, écrite dans `lessons.md` : **« aucun appelant » ne se conclut pas d'une
recherche sur un seul client.** Ce dépôt en porte quatre — web, iOS, Android, SDK Swift — et
`grep` sur `.ts` n'en voit qu'un.

## Lot A — deux transports sur quatre publiaient la traduction du texte d'AVANT

Le cycle 35 a fermé cette fuite côté **cache mémoire** (`invalidateCacheForMessage`, désormais en
tête de la retraduction). Elle restait grande ouverte sur le chemin le plus visible : la **réponse
HTTP** et la charge **`message:edited`** diffusée à toute la conversation.

Sur les deux routes REST d'édition, l'écriture du contenu ne vidait pas `translations`. Un **second**
`update`, placé dans le bloc de retraduction, s'en chargeait — mais **après** la lecture qui compose
la charge utile :

| transport | `translations: null` dans l'écriture du contenu | charge utile composée avant l'invalidation |
|---|---|---|
| socket `message:edit` (PRIMAIRE) | oui | non — payload construit en mémoire |
| `PATCH /messages/:messageId` (Android) | oui | non |
| `PUT /messages/:messageId` (iOS) | **non** | **oui** |
| `PUT /conversations/:id/messages/:messageId` (web) | **non** | **oui** |

Les deux transports fautifs sont exactement ceux des deux clients à écran. La ligne relue portait le
texte d'APRÈS et les traductions d'AVANT, et c'est cette paire qui partait vers tous les clients.

Ce que ça donne pour un lecteur : le **Prisme Linguistique** fait que la plupart ne voient QUE la
traduction. Un francophone dans une conversation anglaise recevait `message:edited` avec le nouveau
texte anglais **et** l'ancienne traduction française — et son client affichait l'ancienne, présentée
comme la traduction de la nouvelle. Jusqu'à ce que la retraduction asynchrone pousse la suivante :
une fenêtre courte en secondes, permanente en pratique, et parfaitement invisible pour l'éditeur,
qui lui voit l'original.

L'invalidation **appartient à l'écriture du contenu** : un nouveau texte périme ses traductions à
l'instant où il est écrit, pas trois `await` plus tard. Elle rejoint donc le `data` de l'écriture —
déjà gardée par `deletedAt: null` — et le second `update` disparaît. C'est la même forme de
correctif que le lot A du cycle 35 : la règle va là où le geste se produit, pas chez ses appelants.

Les commentaires des deux routes **affirmaient l'inverse de ce que le code faisait** (« la
retraduction qui précède a déjà invalidé `translations`, donc le payload reflète cet état : `[]` »).
Un commentaire qui décrit un ordre que le code n'a pas est ce qui a permis au défaut de survivre à
trois cycles de revue de ces mêmes routes. Corrigés tous les deux.

## Lot B — la retraduction passe par l'entrée publique du service

`retranslateMessageAsync` est l'entrée publique, et le handler socket l'emploie correctement. Les
deux routes REST atteignaient `_processRetranslationAsync` — la méthode privée qu'elle expose —
derrière un `as any`. Deux vocabulaires pour un même geste, dont un qui perce l'encapsulation et
coûte une assertion de type que `fastify.translationService` (typé `MessageTranslationService`) rend
inutile. Reste ouvert du cycle 35, fermé ici : deux `as any` en moins.

## Lot C — le client web mort de la route PATCH

`apps/web/services/messages.service.ts` retiré, avec son test. Le dépôt portait **deux** objets
exportés sous le nom `messagesService` : celui de `services/conversations/messages.service.ts`
(vivant — `markAsRead`, `getReadStatuses`, `getMessageStatusDetails`, importé par trois hooks) et
celui-ci, réexporté par le barrel `@/services` mais importé par son seul fichier de test. Un
développeur écrivant `import { messagesService } from '@/services'` obtenait silencieusement le
mort. Les types `Message`, `CreateMessageDto`, `UpdateMessageDto` qu'il exportait n'avaient eux non
plus aucun consommateur.

C'est la moitié correcte de la consigne du cycle 35 — celle qui ne touche aucun client vivant.

## Vérification

- **9 tests neufs, écrits AVANT l'implémentation, 9 rouges observés** :
  - `message-edit-stale-translation.test.ts` (neuf) — 6 cas sur `PUT /messages/:messageId` : la
    réponse HTTP sans traduction périmée, la charge `message:edited` sans traduction périmée,
    l'invalidation dans l'écriture du contenu sous la garde `deletedAt`, l'absence de fenêtre à
    l'instant de la relecture, l'absence de seconde écriture, et l'appel à `retranslateMessageAsync`.
  - `conversation-messages-advanced.test.ts` — 3 cas sur `PUT /conversations/:id/messages/:messageId`.
  - Les deux harnais emploient un **fake Prisma STATEFUL** (les écritures mutent la ligne, les
    lectures la rendent) : le défaut est un problème d'**ordre** entre écritures et lecture, qu'un
    mock à valeur fixe ne peut pas exprimer — il rendrait la même valeur avant et après le
    correctif, donc passerait au vert sans rien prouver. `transformTranslationsToArray` est laissé
    **non mocké** dans le fichier neuf, pour la même raison : un mock rendant `[]` masque exactement
    ce qu'on mesure.
- **Suite gateway complète : 616 suites, 15 893 tests, tout vert** (cycle 35 : 615 / 15 884).
  `tsc --noEmit` propre. Couverture lignes **95,66 %**, branches **89,05 %** — inchangée.

## Reste ouvert après ce cycle

- **`invalidateCacheForMessage` n'a plus d'appelant hors de la classe** (cycle 35) — gardé public
  délibérément. À ne pas re-câbler depuis une route.
- **`appartenance active de l'auteur`** — la question produit du cycle 34 attend toujours une
  décision : un auteur qui a quitté une conversation peut encore éditer ses messages par les quatre
  entrées.
- **La file d'attente de fan-out** (D1 du cycle 32) — cinquième report, même raison : elle demande
  de savoir ce que la troncature mesure en production, et cette routine n'a aucun accès aux logs.
- **Le fan-out `member_joined` n'a toujours aucune borne** de concurrence (cycle 33b) — à arbitrer
  avec la file, pas séparément.
- **`getVisibilityFilteredRecipients` et `filterPostConsumers`** ne se citent toujours pas (cycle 32).
- **`@Display Name` inextractible dans le domaine social** — dixième report.
- **`createStoryCommentNotificationsBatch` garde son `visibility?` optionnel** à défaut `PUBLIC`
  (cycle 26).
- **Les deux scripts de réparation de base** (`repair-mention-user-ids.ts`,
  `repair-tracking-link-created-by.ts`) attendent une exécution avec accès MongoDB — action humaine.
- **Piste ouverte par le lot 0** : les quatre transports d'édition existent parce que quatre clients
  ont chacun choisi le leur. Aucun inventaire ne dit quel client emploie quelle route. Un tel
  inventaire — même un simple tableau en tête de `messages-advanced.ts` — aurait évité l'erreur du
  cycle 35, et évitera la prochaine. Candidat pour le cycle 37.

# Cycle 36b — Addendum d'une session parallèle : ce que l'édition ÉCRIT, et le module qu'on ne peut pas prouver

Deux sessions ont livré leur cycle 36 en parallèle. **Les deux ont trouvé indépendamment le même
fait Android** (lot 0 ci-dessous / leçon 88) : `PATCH /messages/:messageId` porte la lane
`EDIT_MESSAGE` de la file offline d'Android et ne doit pas être retirée. La convergence vaut
confirmation ; le récit du lot 0 de la session ci-dessus est gardé, celui de cette session est retiré
au profit du sien.

Les deux têtes n'ont **aucune intersection de défaut** : l'une porte sur ce que l'édition **PUBLIE**
(traductions périmées dans la réponse HTTP et la charge `message:edited`), l'autre sur ce qu'elle a
le droit d'**ÉCRIRE**. Le seul recouvrement est le nettoyage `_processRetranslationAsync` →
`retranslateMessageAsync`, que les deux sessions ont fait au même endroit et à l'identique — fusionné
en gardant les commentaires de la session ci-dessus. (Leçon d'intégration du cycle 23 : comparer
défaut par défaut, jamais « qui est arrivé en premier ».)

## Lot A — le quatrième transport laissait une édition VIDER un message

`admitEditedContent` (`services/messaging/messageEditContent.ts`), jumeau de `admitMessageEdit` :
celui-ci dit QUI peut éditer, le neuf dit ce que l'édition a le droit d'**écrire**. La règle est
courte — un message ne peut pas devenir vide, à moins qu'une pièce jointe ne le porte à elle seule
(retrait de légende) — et elle vivait recopiée à trois endroits sur quatre transports. Le quatrième,
celui d'Android, ne la portait pas du tout :

| entrée                                     | garde de vacuité | vide + pièce jointe |
|--------------------------------------------|------------------|---------------------|
| socket `message:edit` (PRIMAIRE)           | oui              | admis               |
| `PUT /conversations/:id/messages/:mid`     | oui              | admis               |
| `PUT /messages/:messageId` (iOS)           | oui              | admis               |
| **`PATCH /messages/:messageId` (ANDROID)** | **aucune**       | **refusé**          |

Sa seule protection était le `minLength: 1` de son schéma JSON, **et il se trompait dans les deux
sens à la fois** :

- **trois espaces le satisfont.** Le `.trim()` de la ligne suivante les réduisait à la chaîne vide,
  et la ligne partait en base avec `content: ""`. C'est un `update`, pas un patch partiel : le texte
  d'origine était déjà écrasé, et un `message:edited` **vide** s'en allait vers tous les clients de
  la conversation. La sortie RED du test le montre littéralement —
  `data: {"content": "", "isEdited": true, "translations": null}`.
- **il refusait en même temps la chaîne vide LÉGITIME**, celle qui retire la légende d'un message à
  pièce jointe, que les trois autres transports acceptent : un utilisateur Android ne pouvait pas
  effacer une légende.

Une garde qui compte les caractères **bruts** ne décide jamais de ce qu'elle croit décider : c'est le
contenu **après `trim`** qui part en base, et c'est donc lui, et lui seul, que la règle doit regarder.

L'unité rend le contenu à écrire **en même temps que** le verdict. C'est délibéré, et c'est ce qui
empêche la divergence de repousser : le `.trim()` recopié chez chaque appelant est exactement
l'endroit où le transport iOS avait déjà jeté un `TypeError` sur un `content` absent (traduit en 500
par le catch). Un appelant qui obtient son texte de l'unité ne peut plus diverger d'elle. Les trois
`.trim()` d'appelant et les deux formulations différentes du même refus disparaissent avec.

Le schéma JSON du PATCH ne garde que le plafond (`maxLength: 10000`, parité avec
`EditMessageBodySchema`) : un schéma de corps ne peut pas connaître les pièces jointes. La route les
lit désormais (`attachments: { select: { id: true } }`) — sans elles, la garde ne peut pas trancher.

## Vérification

- **21 tests neufs**, écrits AVANT l'implémentation, **RED observé sur les deux niveaux** : les tests
  d'unité échouent à la résolution du module quand l'implémentation est retirée ; les tests de route
  montrent l'écriture fautive (`prisma.message.update` appelé avec `content: ""`).
- `messageEditContent.test.ts` — 12 cas : refus du vide / des espaces seuls / des blancs non-espace
  (tabulation, saut de ligne) / d'un `content` absent ou `null` sans pièce jointe ; admission des
  mêmes AVEC pièces jointes ; bords retirés, blancs intérieurs préservés.
- `conversation-messages-advanced.test.ts` — 5 cas sur le PATCH, dont celui qui compte : les espaces
  seuls refusés **et le message épargné** (`update` jamais appelé).

## Reste ouvert propre à cette session

- **ANDROID — la file d'attente hors ligne retente ce que le serveur n'acceptera JAMAIS, et bloque
  la file pendant qu'elle le fait.** Défaut le plus grave trouvé ce cycle ; **non corrigé, faute de
  pouvoir le prouver** (leçon 88c). **Tête du prochain cycle qui disposera d'un toolchain Android.**
  - `SendResult` documente le contrat, `ARCHITECTURE.md §5` l'exige (« transient-vs-permanent
    classification, 404-as-success »), `ApiError` porte `httpStatus` — et **quatorze des quinze
    senders l'ignorent**, écrasant tout échec en `TransientFailure`. Seul `SEND_FRIEND_REQUEST`
    classe correctement, via `FriendRequestSend.classify` : le patron existe déjà, appliqué à une
    lane sur quinze.
  - `OutboxDrainer` est en **FIFO strict** et une `TransientFailure` **arrête la lane**. Un 403
    définitif (fenêtre de 24 h dépassée, auteur retiré de la conversation) bloque donc tous les
    messages suivants de cette conversation pendant `MAX_ATTEMPTS = 5` tentatives, backoff
    exponentiel WorkManager depuis 10 s — de l'ordre de **cinq minutes** de blocage de tête de file
    pour une erreur qui ne guérira pas.
  - À l'épuisement, `onExhausted` n'a **aucun cas** pour `EDIT_MESSAGE` / `DELETE_MESSAGE`
    (`else -> Unit`), alors que `editOptimistic` a déjà peint l'édition dans le cache local :
    l'appareil montre le texte édité **pour toujours**, le serveur n'a jamais rien appliqué, personne
    d'autre ne le voit. Divergence locale silencieuse et définitive.
  - Correctif esquissé : un classificateur pur partagé (`OutboxDelivery.classify`) sur le patron de
    `FriendRequestSend` — permanents `{400, 403, 404, 422}`, 404 → `Success` pour les suppressions
    idempotentes, tout le reste transitoire (garder 401/409/429 transitoires est délibéré : un blip
    d'authentification ou un rate-limit ne doit pas jeter la file) — appliqué aux quatorze sites,
    plus un `onExhausted` qui re-hydrate la conversation pour EDIT/DELETE.
- **Aucun toolchain Android n'est disponible depuis cette routine, et aucune CI ne couvre Android.**
  `dl.google.com` est refusé par la politique réseau de l'environnement (403 sur CONNECT) : ni le SDK
  Android ni le dépôt Maven Google ne sont atteignables, `:sdk-core:test` ne peut pas tourner. Et
  `.github/workflows/` ne contient **aucun** job Gradle. **Deux actions humaines distinctes :**
  (a) ajouter un job CI Android — sans quoi ce module restera hors de portée de cette routine
  indéfiniment, et c'est la condition qui débloque tout le reste ouvert Android ci-dessus ;
  (b) corriger le défaut depuis une machine outillée.
- **L'inventaire « quel client emploie quelle route »**, que la session ci-dessus propose pour le
  cycle 37, est appuyé par cette session : les deux ont dû le reconstruire à la main, chacune de son
  côté, pour la même route.
- **`Test Python (translator)` se fige au teardown et heurte le plafond de 30 min — flake
  préexistant, observé sur ce cycle.** La suite atteint **99 % des tests, tous PASSED, en 8 min 40**
  — soit exactement le temps du même job sur main (#9012 : 8 min 30) — puis reste bloquée 21 minutes
  de plus sans produire une ligne. Ce n'est donc pas un échec d'assertion ni une lenteur : c'est un
  **gel après la fin effective de la session**. La dernière ligne du journal avant le silence est
  `RuntimeWarning: coroutine 'AsyncMockMixin._execute_mock_call' was never awaited` — une coroutine
  d'`AsyncMock` jamais attendue, qui survit à la session et empêche pytest de rendre la main ; le
  runner finit par tuer `uv` et `pytest` en processus orphelins. Piste : chercher les `AsyncMock`
  dont le retour n'est pas `await`é (ou les `MagicMock` employés là où un `AsyncMock` est attendu) et
  ajouter une fermeture explicite de boucle au teardown. **Sans accès à un rerun de job** (l'API
  refuse `rerun_failed_jobs` et `cancel_workflow_run` à cette intégration), la seule relance possible
  depuis cette routine est un commit vide — coûteux et bruyant. Deux actions humaines : corriger le
  mock fautif, et ouvrir les droits de rerun à l'intégration.

---

# Cycle 35 — Les cycles précédents ont unifié ce qu'une édition EXIGE et ce qu'elle PRODUIT. Pas ce qu'elle PÉRIME.

Tête prise dans le « reste ouvert » du cycle 34, à l'endroit qu'il désignait — la divergence
restante « sur ce que l'édition ÉCRIT » entre les quatre transports. En allant la mesurer, elle
s'est avérée être la moins grave des trois choses qui se tenaient là.

Les quatre entrées d'édition sont, depuis les cycles 33/34 : le handler socket `message:edit`
(transport PRIMAIRE), `PUT /conversations/:id/messages/:messageId` (la vue d'édition web, qui porte
un sélecteur de langue), `PUT /messages/:messageId` (le client iOS) et `PATCH /messages/:messageId`
(sans appelant de production — voir le reste ouvert).

## Lot A — la traduction du texte d'AVANT survivait à l'édition, sur trois transports sur quatre

`translationCache` est un LRU de 1000 entrées **sans TTL**, servi **avant** la base par
`getTranslation` (ligne 3022) et par `_processTranslationsAsync` (ligne 510). Une édition invalide
`Message.translations` en base ; l'entrée mémoire, elle, survivait. Un lecteur recevait donc la
traduction du texte d'avant pour le texte d'après — jusqu'à l'éviction LRU, c'est-à-dire au bout de
mille autres messages traduits, donc potentiellement jamais sur une instance calme.

La purge existait — `invalidateCacheForMessage`, ajoutée par un cycle antérieur — et elle était
câblée à **un seul** des quatre transports :

| transport | `translations: null` en base | purge du cache mémoire |
|---|---|---|
| socket `message:edit` (PRIMAIRE) | oui | **non** |
| `PUT /messages/:messageId` (iOS) | oui | **non** |
| `PATCH /messages/:messageId` | oui | **non** |
| `PUT /conversations/:id/messages/:messageId` | oui | oui |

La cause tient dans la docstring de la méthode : « **must be called before** triggering a
re-translation ». Une obligation adressée aux appelants est une obligation que le quatrième
appelant oubliera — c'est le même patron que les cycles 33b et 34 ont fermé sur le mute et sur
l'admission, à ceci près qu'ici la consigne était écrite noir sur blanc et que trois appelants sur
quatre ne l'ont jamais lue.

La purge appartient à la **retraduction**, pas à ses appelants : « retraduire » signifie exactement
que l'ancien résultat ne vaut plus. Elle est donc en tête de `_processRetranslationAsync`, **avant
tout `await` et avant tout court-circuit** — un contenu vidé ou un message introuvable ne relance
aucune traduction mais périme l'ancienne exactement pareil, et rien ne repasserait l'effacer. La
purge explicite de la route est retirée dans le même mouvement : la garder ferait repartir la règle
à deux exemplaires.

Le test qui compte n'est pas « la purge a été appelée » mais celui écrit côté **LECTURE** :
après une retraduction, `getTranslation` ne rend plus le texte d'avant.

## Lot B — omettre la langue réétiquetait le message en français

`originalLanguage` est **optionnel** dans `EditMessageBodySchema`. La route le déstructurait avec un
défaut `= 'fr'` et le re-persistait **inconditionnellement**. Une édition qui ne revendiquait aucune
langue écrivait donc `originalLanguage: 'fr'` sur un message anglais — **et** relançait la
retraduction en annonçant « fr » comme langue source, ce qui produit du charabia dans toutes les
langues cibles de la conversation.

Le champ n'est pas décoratif sur cette route : c'est la seule des quatre servie par une vue qui
porte un sélecteur de langue (`EditMessageView`, `selectedLanguage`). Le défaut n'est donc pas
« écrire la colonne », c'est **écrire une valeur que personne n'a revendiquée**. Omettre veut dire
« je n'affirme rien sur la langue », pas « c'est du français ». La colonne n'est plus touchée quand
le corps est muet ; la retraduction repart de la valeur stockée. Le comportement quand le corps la
déclare — canonicalisation `fr-FR` → `fr`, codes irréductibles verbatim — est inchangé, et ses deux
tests préexistants le verrouillent toujours.

## Lot C — la dernière écriture d'édition sans garde de concurrence

`prisma.message.update({ where: { id } })` réussit quel que soit `deletedAt`. Une suppression
concurrente entre la lecture (qui, elle, filtre `deletedAt: null`) et l'écriture faisait
**ressusciter** la ligne avec un contenu neuf, et `message:edited` partait vers des clients qui
l'avaient déjà retirée. Les trois autres transports portaient déjà la garde ; celle-ci était la
dernière sans. Elle prend la même, et le `P2025` que Prisma lève alors devient un **404** — pas un
500, qui ferait retenter un client qui n'a rien à retenter — exactement comme sur le sibling
`PATCH /messages/:messageId`, dont la traduction d'erreur est reprise telle quelle.

## Nettoyage

`logger.info('===== ENTERED TRY BLOCK FOR MENTIONS =====')` tournait à chaque édition, au niveau
INFO, sur le bloc de **retraduction** — pas sur celui des mentions. Retiré.

## Vérification

- **9 tests neufs**, écrits AVANT l'implémentation, **9 rouges observés** :
  - `MessageTranslationService.branches.test.ts` — 5 cas : la purge déclenchée par
    `retranslateMessageAsync` lui-même, l'isolement aux autres messages, la purge malgré le
    court-circuit sur contenu vide, la purge malgré un message introuvable (le `catch` de l'unité
    avale — la purge doit donc précéder la lecture), et la conséquence exprimée côté LECTURE.
  - `conversation-messages-advanced.test.ts` — 4 cas : la colonne laissée intacte quand le corps
    l'omet, la retraduction repartant de la langue stockée, la garde `deletedAt: null` sur
    l'écriture, le 404 plutôt que le 500 quand elle mord.
- **Suite gateway complète : 615 suites, 15 884 tests, tout vert.** `tsc --noEmit` propre.
  Couverture globale lignes **95,66 %**, branches 89,05 %.

## Reste ouvert après ce cycle

- **`invalidateCacheForMessage` n'a plus d'appelant hors de la classe.** Gardé public
  délibérément : c'est une capacité légitime du service, et sa docstring dit désormais l'inverse de
  ce qu'elle disait — la retraduction l'appelle elle-même, ce n'est pas une consigne aux appelants.
  À ne pas re-câbler depuis une route.
- ~~**`PATCH /messages/:messageId` n'a toujours aucun appelant de production** … **Tête sérieuse du
  prochain cycle** : la retirer, elle et son service client.~~ **❌ CONSIGNE ERRONÉE — NE PAS
  EXÉCUTER. Corrigée au cycle 36 (voir plus bas).** Le cycle 35 n'avait cherché l'appelant que
  côté **web**. `apps/android/sdk-core/.../outbox/OutboxFlushWorker.kt:161` appelle
  `messageApi.edit(...)` → `@PATCH("messages/{id}")`
  (`apps/android/core/network/.../api/MessageApi.kt:34`) : **cette route est le chemin par lequel
  Android rejoue les éditions faites hors ligne.** La retirer aurait cassé silencieusement la file
  d'attente offline d'Android — l'édition serait partie en 404 au flush, sans écran pour le dire.
  Seul le **client web** de cette route était mort, et c'est lui qui a été retiré au cycle 36.
- ~~**`_processRetranslationAsync` est appelé via `(translationService as any)` par les deux routes
  REST**~~ — **fait au cycle 36.** Les deux routes emploient désormais `retranslateMessageAsync`.
- **`appartenance active de l'auteur`** — la question produit du cycle 34 attend toujours une
  décision : un auteur qui a quitté une conversation peut encore éditer ses messages par les quatre
  entrées.
- **La file d'attente de fan-out** (D1 du cycle 32) — quatrième report, même raison : elle demande
  de savoir ce que la troncature mesure en production, et cette routine n'a aucun accès aux logs.
- **Le fan-out `member_joined` n'a toujours aucune borne** de concurrence (cycle 33b) — à arbitrer
  avec la file, pas séparément.
- **`getVisibilityFilteredRecipients` et `filterPostConsumers`** ne se citent toujours pas (cycle 32).
- **`@Display Name` inextractible dans le domaine social** — neuvième report.
- **`createStoryCommentNotificationsBatch` garde son `visibility?` optionnel** à défaut `PUBLIC`
  (cycle 26). Même classe de défaut que le lot B de ce cycle — un défaut de valeur là où l'absence
  aurait dû ne rien affirmer — et il reste ouvert.
- **Les deux scripts de réparation de base** (`repair-mention-user-ids.ts`,
  `repair-tracking-link-created-by.ts`) attendent une exécution avec accès MongoDB — action humaine.
  S'y ajoute désormais un troisième candidat : les `Message.originalLanguage` déjà réétiquetés en
  `'fr'` par le lot B avant ce correctif restent faux en base. Non réparable automatiquement — rien
  ne distingue un « fr » écrit par le défaut d'un « fr » légitime.
- **`eslint` inopérant sur le gateway** (pas de `eslint.config.js` en flat config) — inchangé depuis
  le cycle 29, aucune passe de lint n'a donc pu tourner sur ce cycle non plus.

---

# Cycle 34b — La sourdine échouait FERMÉ, et un éventail tombé emportait ses deux frères

Numéroté **34b** : une session parallèle a livré son cycle 34 pendant celui-ci (« ce qu'une édition
EXIGE », ci-dessous). Les deux têtes n'ont AUCUNE intersection — l'une unifie les quatre tests
d'admission à l'édition d'un message, l'autre porte sur le repli des préférences de notification et
l'isolement des trois éventails — et aucun fichier n'est touché par les deux. Rien à arbitrer défaut
par défaut cette fois (leçon d'intégration du cycle 23, reprise aux 25b, 32b, 33b et 34) : les deux
tiennent ensemble, fusionnés à la main et revalidés sur la suite complète. Là où les deux « reste
ouvert » citent le même point (file de fan-out, `getVisibilityFilteredRecipients`, `@Display Name`,
eslint), c'est le même report, pas deux.

Tête annoncée par le « Reste ouvert » du cycle 33b, prise sans arbitrage : `filterMutedRecipients`
échouait fermé alors que tout son voisinage échoue ouvert et le dit. En remontant ses appelants pour
mesurer la portée, le défaut s'est avéré n'être que la moitié visible d'un second, plus grave, à
l'étage au-dessus — celui-là jamais nommé par aucun cycle.

## Lot A — une préférence de confort illisible faisait taire une obligation de livraison

`filterMutedRecipients` lit `UserConversationPreferences.isMuted` pour décider qui, dans une
audience, ne veut pas être dérangé. Il n'avait **aucun `try`**. Une lecture en échec — un incident
Mongo transitoire suffit — remontait telle quelle jusqu'au `.catch` de l'appelant, qui journalisait
et laissait tomber la notification.

Le voisinage immédiat a déjà tranché la même question, trois fois, dans l'autre sens, et l'écrit
noir sur blanc :

| unité | comportement en cas d'échec de lecture | commentaire dans le code |
|---|---|---|
| `loadNotificationPrefs` | notification créée | « fail open » |
| `_loadReadReceiptOptOuts` | tout le monde reste visible | « repli ouvert » |
| `PrivacyPreferencesService.fetchFromDatabase` | idem | cité par le précédent |
| **`filterMutedRecipients`** | **notification perdue** | **—** |

L'arbitrage n'est pas symétrique. Le mute est une préférence de **confort** ; la notification est une
obligation de **livraison**. Quand on ne sait plus laquelle des deux s'applique, un ping de trop se
pardonne — un message jamais annoncé, non. Et il ne se joue pas à l'unité : depuis le cycle 33b cette
porte garde **cinq familles** (`message_reaction`, `message_reply`, `member_joined`,
`member_removed`, `member_left`) plus l'éventail d'arrivée entier. Un hoquet de lecture les taisait
donc toutes, d'un coup, pour tout le monde — et le cycle 33b, en faisant passer trois familles de
plus par cette porte, avait élargi le rayon du défaut sans le voir.

Repli ouvert, log d'erreur, tous les candidats rendus.

## Lot B — trois éventails indépendants dans un seul `try`

En vérifiant la portée du lot A, une seconde chose est apparue chez l'appelant le plus chaud.

`notifyMessageRecipients` sert **trois** éventails, dans cet ordre : réponse, mentions, messages
réguliers. Ils sont indépendants **par construction** — leurs audiences se déduisent des ENTRÉES de
la fonction (`validatedMentionUserIds`, l'auteur du message cité), jamais du résultat de l'éventail
précédent. Ils partageaient pourtant un unique `try { … } catch`.

Conséquence : une panne dans le PREMIER annulait purement et simplement les deux suivants, qui
n'étaient jamais atteints. Un hoquet Mongo sur la notification de réponse d'**une** personne faisait
taire le message pour **toute** la conversation — mentions comprises, c'est-à-dire la seule famille
qui perce toutes les autres suppressions. L'ordre d'exécution décidait qui survivait, et il plaçait
la famille la plus importante derrière la moins importante.

Le lot A ferme la porte d'entrée que ce cycle avait identifiée ; il ne ferme pas celle-là. Tout ce
qui lit la base dans ces trois éventails — `createReplyNotification`, le lot de mentions,
`createMessageNotification` — peut encore lever pour une autre raison que le mute.

Trois changements, tous dans la même unité :

1. **`runLot(name, onError, whenLost, run)`** — chaque éventail est isolé, rend une valeur de repli
   quand il tombe, et l'erreur remontée **nomme** l'éventail en gardant l'originale en `cause`.
   Avant, trois pannes distinctes arrivaient au même `onError` sous le même libellé.
2. **`Promise.allSettled`** dans l'éventail régulier, au lieu de `Promise.all` : le destinataire dont
   la lecture de contexte hoquette n'emporte plus le compte rendu de ses voisins, dont les
   notifications sont déjà parties. Un seul signalement pour tout l'éventail, pas un par
   destinataire — sur un groupe large, une panne commune produirait autant de lignes de log que de
   membres.
3. **`listeningRegularRecipients`** — la lecture inline de `userConversationPreferences`
   (« mentions seulement » OU sourdine) qui filtre l'éventail régulier passe au **repli ouvert**,
   comme le lot A. Elle portait exactement le même défaut que `filterMutedRecipients`, sur la même
   colonne `isMuted`, à trente lignes de distance.

## Le compte rendu devait suivre, sinon l'isolement serait invisible

`onFanOut` annonçait `mentions: validatedMentionUserIds.length` et `regular: regularRecipients.length`
— l'**audience visée**, pas le résultat. Avec l'isolement, un éventail entièrement tombé aurait
continué d'annoncer son audience comme si elle avait été servie : le correctif se serait caché
lui-même dans les logs.

Les trois valeurs disent désormais ce qui est réellement **parti** — le total rendu par le lot de
mentions, les créations non nulles pour le reste. C'est le principe posé par
`createMemberJoinedNotificationsBatch` au cycle 33b (« le compte rendu est celui des notifications
réellement créées, pas la taille de l'audience visée »), appliqué là où il manquait. Le port
`MessageNotificationTarget` déclare du coup le retour du lot de mentions (`Promise<number>` au lieu
de `Promise<unknown>`) : il est lu, donc il se déclare.

## Vérification

- **17 tests neufs**, écrits AVANT l'implémentation, **14 rouges observés** :
  - `mutedRecipients.test.ts` — 9 rouges. Le repli ouvert du helper (tous les candidats rendus,
    l'échec journalisé, la promesse qui ne rejette jamais) **et** les cinq familles + l'éventail
    d'arrivée vérifiés au niveau du SERVICE, pas seulement du helper : c'est là que le rayon se
    mesure.
  - `messageNotificationFanOut.test.ts` — 5 rouges. L'éventail réponse tombé qui n'annule ni les
    mentions ni les réguliers, l'éventail mentions tombé qui n'annule pas les réguliers, le
    destinataire régulier en échec qui n'emporte pas les autres, le compte rendu ramené à zéro quand
    tout tombe, et l'erreur qui NOMME l'éventail. Plus deux tests qui verrouillent ce qui devait le
    rester : la réponse ne se déclare partie que si elle l'est, et les préférences illisibles
    laissent tout le monde notifié.
- Le test existant « rend compte de l'éventail à son appelant » assertait `{mentions: 1, regular: 1}`
  avec des doubles rendant `0` et `null` : il mesurait l'intention. Ses doubles ont été rendus
  réalistes plutôt que l'assertion affaiblie.
- **Suite gateway complète : 614 suites, 15 846 tests, tout vert** (avant : 613 / 15 820).
  `tsc --noEmit` propre. Couverture globale lignes **95,66 %**, `mutedRecipients.ts` et
  `messageNotificationFanOut.ts` à **100 %** tous les deux.

## Reste ouvert après ce cycle

- **`runLot('regular', …)` a un `catch` presque inatteignable** : `listeningRegularRecipients` se
  replie seule et `allSettled` ne rejette pas. Il tient l'invariant « aucun éventail ne lève »
  structurellement plutôt que par audit ligne à ligne, et garde les trois éventails symétriques —
  gardé délibérément, à ne pas retirer au motif qu'il ne se déclenche pas.
- **Le repli ouvert de `listeningRegularRecipients` couvre aussi `mentionsOnly`**, qui n'est pas la
  sourdine. Même arbitrage, assumé : sur un incident de lecture, un utilisateur « mentions
  seulement » reçoit une notification de message régulier plutôt que rien.
- **La file d'attente de fan-out** (D1 du cycle 32) reste ouverte, inchangée, et pour la même raison
  qu'aux cycles 32 et 33b : elle demande de savoir ce que la troncature mesure en production, et
  cette routine n'a aucun accès aux logs.
- **Le fan-out `member_joined` n'a toujours aucune borne** de concurrence (cycle 33b) — à arbitrer
  avec la file, pas séparément.
- **`member_removed` reste une boucle d'appels unitaires**, délibérément (cycle 33b) : audience
  bornée par le rôle.
- **`getVisibilityFilteredRecipients` et `filterPostConsumers`** ne se citent toujours pas (cycle 32).
- **`@Display Name` inextractible dans le domaine social** — huitième report.
- **`createStoryCommentNotificationsBatch` garde son `visibility?` optionnel** à défaut `PUBLIC`
  (cycle 26).
- **Les deux scripts de réparation de base** attendent une exécution avec accès MongoDB — action
  humaine.
- **`eslint` inopérant sur le gateway** (pas de `eslint.config.js` en flat config) — inchangé depuis
  le cycle 29, aucune passe de lint n'a donc pu tourner sur ce cycle non plus.


---

# Cycle 34 — Les cycles précédents ont unifié ce qu'une édition PRODUIT. Pas ce qu'elle EXIGE.

Tête désignée par le cycle 33, prise telle quelle : « une seule unité d'admission à l'édition,
nommée, plutôt que quatre tests d'admission qui ont déjà prouvé qu'ils dérivent ».

## Le décompte, deuxième passage

Le cycle 33 avait dressé la table de ce qu'une édition PRODUIT (liens, mentions) et l'avait rendue
uniforme. Voici celle de ce qu'elle EXIGE, telle qu'elle était encore ce matin :

| entrée | fenêtre 24h | modérateur admis | appartenance | `deletedAt` gardé | qui l'appelle |
|---|---|---|---|---|---|
| socket `message:edit` | oui | **non** | implicite | oui | web (composer) |
| `PUT /conversations/:id/messages/:messageId` | oui | oui | oui | oui | **web** (`message.service.ts`) |
| `PUT /messages/:messageId` | **non** | **non** | **non** | oui | **iOS** |
| `PATCH /messages/:messageId` | **non** | **non** | oui | **NON** | personne |

Correction au décompte du cycle 33, qui attribuait le `PATCH` au web : `messagesService.updateMessage`
existe, mais **aucun écran ne l'appelle** — seuls ses propres tests. Le web édite par le socket
(composer) et par le `PUT` conversation-scopé. Trois entrées vivantes, quatre règles.

## Ce que l'utilisateur voyait

**La fenêtre de 24h se traversait en changeant de verbe HTTP.** Le socket et le `PUT` conversation
la refusent ; les deux entrées `/messages/:messageId` ne la connaissaient pas. Un iPhone éditait
donc un message de trois ans que le même geste depuis le web refusait de toucher — et ce n'est pas
une divergence de confort, c'est le contournement complet d'une règle que le produit énonce.

**Le modérateur que l'UI web autorise se voyait refuser par le composer.** `BubbleMessage.canEdit`
rend vrai pour `isOwnMessage || hasModeratorPrivileges(userRole)`. Le geste réussit par le `PUT`
conversation-scopé et échoue par le socket, qui filtrait `sender: { userId }` dans sa lecture.

**Un message SUPPRIMÉ se réécrivait par le `PATCH`.** Ni garde à la lecture, ni garde à l'écriture.
Un `update` par id réussit quel que soit `deletedAt` : la ligne ressuscitait avec un contenu neuf,
`message:edited` partait vers des clients qui l'avaient déjà retirée, l'API répondait succès.

## Lot A — `admitMessageEdit`, l'unique énoncé

`services/messaging/messageEditAdmission.ts`. L'auteur édite 24h ; un rôle **GLOBAL** privilégié lui
rouvre la porte au-delà ; un tiers n'édite que membre ACTIF + rôle privilégié, sans fenêtre — un
modérateur corrige précisément ce qui traîne.

Coût : **aucun aller-retour ajouté**. La branche modérateur lit appartenance ET rôle en une seule
requête — la forme (`include: { user: { select: { role } } }`) que la route conversation-scopée
employait déjà. La branche auteur-hors-fenêtre en lit une. Le chemin nominal n'en déclenche aucune.
Toute lecture échoue **fermée**.

## Lot B — les quatre entrées, chacune dans son vocabulaire

Une politique, quatre traductions. Les deux routes `/messages/:messageId` gardent leur **404** sur
les refus non temporels au lieu d'adopter le 403 de leur sœur : passer à 403 en ferait un oracle
d'existence pour qui sonde des ObjectIds. Une seule politique n'oblige pas à un seul code HTTP.

La lecture Prisma du socket et du `PUT` iOS n'**encode** plus la règle. Elles filtraient
`sender: { userId }` : la ligne d'un message qu'on n'a pas écrit n'atteignait jamais la décision.
Un test par transport verrouille désormais que le `where` ne porte plus la politique — c'est la
forme la plus durable du correctif, puisque c'est ce `where` qui rendait l'unification impossible.

## Lot C — le `PATCH` et son message ressuscité

`deletedAt: null` à la lecture, garde de concurrence optimiste à l'écriture (`where: { id,
deletedAt: null }`), `P2025` traduit en **404 et non en 500** : une suppression concurrente n'est
pas une panne, et la rendre en 500 ferait retenter un client qui n'a rien à retenter.

## Ce que ce cycle a délibérément REFUSÉ de faire

**Exiger l'appartenance active de l'AUTEUR.** Le `PATCH` le faisait ; les trois transports vivants
tiennent l'authorship pour suffisant. Rendre la règle commune plus stricte que les trois chemins
réels aurait été une restriction neuve déguisée en unification — et livrée sans qu'on la nomme.
« Un auteur qui a quitté la conversation peut-il encore éditer ? » est une bonne question produit ;
elle se tranche pour les quatre à la fois, pas en passant sur celle que personne n'appelle.

**Retirer l'édition modérateur.** Premier réflexe, et il était faux : l'intégrité voudrait que nul
ne réécrive sous le nom d'autrui. Mais `BubbleMessage.canEdit` propose le geste, donc la capacité
est vivante et voulue. Un agent qui aurait « unifié » en supprimant la branche modérateur aurait
retiré une fonctionnalité en croyant fermer un trou. Le code client est la source de vérité sur ce
que le produit promet — le lire AVANT de trancher est ce qui a changé la conclusion.

## Vérification

- **26 tests neufs, 10 rouges observés** avant implémentation.
  - `messageEditAdmission.test.ts` (18 cas, **100 % lignes**) — les deux branches, la borne
    **inclusive** à 24h pile, le `createdAt` illisible qui n'a jamais bloqué personne et ne bloque
    toujours pas, le modérateur non-membre refusé, le message d'auteur anonyme que seul un
    modérateur modère, les trois pannes qui refusent.
  - 4 cas sur le `PUT` iOS, 5 sur le `PATCH`, 2 sur le socket — dont, sur les deux transports dont
    la lecture encodait la règle, un verrou sur le `where`.
- **Suite gateway complète : 614 suites, 15 840 tests, tout vert** (avant : 613 / 15 799).
  `tsc --noEmit` propre. Couverture lignes **95,64 %**.

## Reste ouvert après ce cycle

- **`appartenance active de l'auteur` — la question posée ci-dessus attend une décision produit.**
  Aujourd'hui : un auteur qui a quitté une conversation peut encore éditer ses messages par les
  quatre entrées. Défendable (ce sont ses mots) comme l'inverse (il n'a plus de session là-bas).
  **Candidat sérieux pour le prochain cycle** — le correctif est mécanique une fois la règle
  choisie, puisqu'il n'y a plus qu'un endroit où l'écrire.
- **`PATCH /messages/:messageId` n'a aucun appelant de production.** `messagesService.updateMessage`
  n'est invoqué que par ses propres tests. Une entrée d'écriture sans écran est une surface
  d'attaque qui ne rend rien. **Tête sérieuse du prochain cycle** : la retirer, elle et son service
  client, plutôt que de continuer à la maintenir à parité — ce cycle vient de payer ce prix.
- **`PUT /conversations/:id/messages/:messageId` re-persiste `originalLanguage` depuis le corps de
  la requête** là où les trois autres réutilisent la valeur stockée. Divergence restante sur ce que
  l'édition ÉCRIT, du même genre que celles que ce cycle vient de fermer sur ce qu'elle EXIGE.
- **La file d'attente de fan-out** (héritée du cycle 32, D1) — troisième report.
- **`getVisibilityFilteredRecipients` et `filterPostConsumers`** ne se citent toujours pas.
- **`@Display Name` reste inextractible dans le domaine social** — huitième report.
- **`eslint` inopérant sur le gateway** (pas de `eslint.config.js` en flat config) — inchangé depuis
  le cycle 29.
- **Les deux réparations de base attendent une exécution avec accès base**
  (`repair-mention-user-ids.ts`, `repair-tracking-link-created-by.ts`). Action humaine.

---

# Note d'intégration — cycle 34 par-dessus le cycle 33b

Une session parallèle a livré le cycle **33b** (ci-dessous) pendant celui-ci. Aucune intersection :
33b porte sur le mute des allées et venues et le fan-out d'appartenance, le cycle 34 sur l'admission
à l'édition d'un message. Rien à arbitrer défaut par défaut (leçon d'intégration du cycle 23, reprise
aux 25b, 32b et 33b) — les deux tiennent ensemble, fusionnés à la main et revalidés sur la suite
complète. Le « reste ouvert » du cycle 34 ci-dessus vaut par-dessus celui de 33b ; là où les deux
citent le même point (file de fan-out, `getVisibilityFilteredRecipients`, `@Display Name`, eslint),
c'est le même report, pas deux.

# Cycle 33b — Le mute ne faisait pas taire les allées et venues, et chaque membre repayait la même requête

Numéroté **33b** : une session parallèle a livré son cycle 33 pendant celui-ci (« le transport
primaire d'iOS », ci-dessous). Les deux têtes n'ont AUCUNE intersection — l'une porte sur les
obligations d'une édition de message selon son transport, l'autre sur le mute et le fan-out
d'appartenance — donc rien à arbitrer défaut par défaut cette fois (leçon d'intégration du cycle 23,
reprise aux 25b et 32b) : les deux tiennent ensemble, et le code des deux a été fusionné à la main
puis revalidé sur la suite complète.

Tête prise après relecture du reste ouvert du cycle 32 : la file d'attente de fan-out (D1) attend
de savoir **ce que** la troncature mesure en production, or cette routine n'a aucun accès aux logs.
Construire la file maintenant serait choisir entre file, pagination et borne relevée à l'aveugle —
exactement ce que le cycle 32 a refusé de faire. Le fan-out d'appartenance, lui, ne demandait aucune
donnée de production pour être jugé : il porte deux défauts lisibles dans le code.

## Lot A — « en sourdine » ne couvrait pas les allées et venues

`UserConversationPreferences.isMuted` était respecté par trois familles de notifications —
`new_message`, `message_reply`, `message_reaction` — et par elles seules. Trois autres, toutes
attachées à une conversation, passaient outre : **`member_joined`, `member_removed`,
`member_left`**. Une conversation mise en sourdine continuait donc de sonner à chaque va-et-vient,
et **d'autant plus fort qu'elle est active** — donc précisément dans le cas qui a motivé le mute.
Le toggle global `memberJoinedEnabled` existait, mais il coupe le type PARTOUT : il ne permet pas de
faire taire un groupe bavard tout en gardant les arrivées ailleurs.

La ligne de partage retenue n'est pas « message ou pas » mais **ambiant ou adressé** :

| respecte le mute (AMBIANT) | perce le mute (ADRESSÉ) |
|---|---|
| `new_message`, `message_reply`, `message_reaction` | `user_mentioned` |
| `member_joined`, `member_removed`, `member_left` | `added_to_conversation`, `removed_from_conversation` |
| | `member_promoted` / `member_demoted` / `member_role_changed` |

Mettre une conversation en sourdine dit « ne me raconte pas ce qui s'y passe », pas « ne me dis pas
que j'en suis sorti ». Un événement dont le destinataire est le SUJET reste adressé et passe outre,
comme la mention par convention WhatsApp. Le tableau vit dans `mutedRecipients.ts`, à côté du filtre
qu'il gouverne — et **la frontière est verrouillée par trois tests** sur les types qui percent, pas
seulement par ceux sur les types qui se taisent : sans eux, la règle dériverait au premier
« appliquons-la partout ».

La règle avait déjà deux exemplaires (réaction, réponse) et devait en gagner trois. Elle passe par
une porte unique, `isConversationMutedFor(userId, conversationId, type)` : un même verdict, un même
log, une même **place dans l'ordre d'exécution** — avant toute lecture de contexte et avant tout
compteur mutant. Ce dernier point n'est pas cosmétique : le test « muted-conversation reactions do
not consume the pair throttle budget » (cycle GW3) l'exigeait déjà pour les réactions, et il valait
d'être rendu structurel plutôt que redécouvert par site.

## Lot B — une arrivée est UN événement, pas N

`createMemberJoinedNotification` fait trois lectures : profil du nouveau membre, conversation,
effectif. **Aucune ne dépend du destinataire.** Les deux appelants l'appelaient en boucle, une fois
par membre déjà présent : un ajout dans un groupe de 200 personnes payait donc ~600 requêtes pour
trois résultats distincts, et le surcoût croissait avec la taille du groupe — là où il fait mal.
Avec le lot A, la question du mute s'y ajoutait, une requête par destinataire de plus.

`createMemberJoinedNotificationsBatch(recipientUserIds, common)` lit le contexte **une fois**
(`MemberJoinedSnapshot`), demande le mute **une fois** pour toute l'audience, puis diffuse. Le compte
rendu est celui des notifications **réellement créées**, pas la taille de l'audience visée : une
préférence de type ou un DND côté destinataire en écarte sans que ce soit une erreur.

Le second appelant (`routes/conversations/sharing.ts`, jointure par lien) aggravait le tableau d'une
autre manière : sa boucle `await`ait **chaque administrateur à la suite**, dans la requête HTTP. La
réponse « vous avez rejoint » attendait que le dernier d'entre eux soit notifié. Un seul appel
maintenant, et la confirmation au nouvel arrivant reste unitaire — un destinataire, une notification.

## Vérification

- **20 tests neufs**, dont **6 rouges observés** avant implémentation (3 suppressions par le mute,
  la non-lecture du contexte pour un destinataire en sourdine, et les 2 sites de fan-out passés au
  batch). Les 14 autres verrouillent ce qui était déjà juste et devait le rester : les trois types
  qui **percent** le mute, l'équivalence payload batch/unitaire, l'audience vide qui ne touche pas la
  base, le doublon de destinataire, le nouveau membre introuvable, le décompte réel.
- **Suite gateway complète : 613 suites, 15 820 tests, tout vert.** `tsc --noEmit` propre.
  Couverture lignes **95,67 %** (inchangée), `mutedRecipients.ts` à 100 %.
- Une suite préexistante (`NotificationService-new-methods.test.ts`) est tombée sur le lot A : son
  double Prisma n'avait ni `userConversationPreferences` ni `participant`. Elle avait **raison de
  tomber** — le service lit désormais ces modèles — et le double a été complété, pas contourné.

## Reste ouvert après ce cycle

- **`member_removed` reste une boucle d'appels unitaires, délibérément.** Son audience est bornée par
  le rôle — `creator` / `admin` / `moderator` — donc quelques personnes, là où `member_joined` fanne
  vers TOUS les membres déjà présents. Le lot A y ajoute une requête de mute par destinataire ; c'est
  le prix assumé sur une audience de cet ordre, et la raison pour laquelle un seul des deux frères a
  été batché. À revoir si un jour une conversation peut compter des dizaines de modérateurs.

- **`filterMutedRecipients` échoue FERMÉ.** Si la lecture des préférences lève, la notification est
  perdue (le rejet remonte au `.catch` de l'appelant). Le voisinage fait l'inverse et le dit :
  `shouldCreateNotification` « fail open : en cas d'erreur de lecture des prefs, on crée la
  notification », `_loadReadReceiptOptOuts` « repli ouvert ». Un incident Mongo transitoire avale
  donc aujourd'hui toutes les notifications de réaction/réponse/appartenance au lieu d'en laisser
  passer quelques-unes de trop. **Tête du prochain cycle** — comportement préexistant, hors de la
  tête de celui-ci, mais désormais partagé par cinq familles au lieu de deux.
- **Le fan-out `member_joined` n'a aucune borne** — ni de lignes, ni de concurrence. Le `Promise.all`
  du batch reprend le parallélisme non borné que la boucle avait déjà (et que
  `createMentionNotificationsBatch` a aussi) : sur un groupe de plusieurs milliers de membres, une
  seule arrivée déclenche autant d'écritures simultanées. À arbitrer avec la file d'attente de
  fan-out (D1 du cycle 32), pas séparément.
- **La file d'attente de fan-out** (D1 du cycle 32) reste ouverte, inchangée, et pour la même
  raison : elle demande de regarder ce que la troncature mesure en production.
- **`createMemberLeftNotification` et `createTranslationReadyNotification` n'ont aucun appelant de
  production.** Le premier a reçu le mute (il est le frère exact de l'arrivée et de l'exclusion) ;
  le second a été laissé tel quel — « ta traduction est prête » se lit comme la fin d'une action
  demandée, donc adressée. À trancher le jour où l'un des deux trouve un appelant.
- **`getVisibilityFilteredRecipients` et `filterPostConsumers`** ne se citent toujours pas (cycle 32).
- **`@Display Name` inextractible dans le domaine social** — septième report.
- **`eslint` inopérant sur le gateway** (pas de `eslint.config.js` en flat config) — inchangé depuis
  le cycle 29, aucune passe de lint n'a donc pu tourner sur ce cycle non plus.

---

# Cycle 33 — Les cycles précédents ont câblé « le transport primaire d'iOS ». Aucun n'avait câblé celui d'iOS.

Le « Reste ouvert » du cycle 32 proposait la file d'attente de fan-out, sous réserve que « rien de
plus grave n'apparaisse ». Quelque chose de plus grave est apparu, à l'étage d'en dessous : les
obligations d'une édition de message dépendent encore du transport employé — et les deux transports
que les clients emploient RÉELLEMENT sont ceux qui n'en portent aucune.

## Le décompte

L'édition d'un message a **quatre** points d'entrée. Ce qu'ils faisaient avant ce cycle :

| entrée | fichier | liens traçables | mentions | qui l'appelle |
|---|---|---|---|---|
| socket `message:edit` | `MessageHandler` | oui | oui | web (composer) |
| `PUT /conversations/:id/messages/:messageId` | `messages-advanced.ts` | oui | oui | **personne** |
| `PUT /messages/:messageId` | `routes/messages.ts` | **non** | **non** | **iOS** (`MessageService.editMessage`) |
| `PATCH /messages/:messageId` | `messages-advanced.ts` | **non** | **non** | **web** (`messages.service.ts`) |

Les deux unités partagées existaient déjà, écrites par les cycles précédents, et elles étaient
justes. Elles avaient simplement été branchées sur la mauvaise route. Deux commentaires — dans
`emitMentionCreated.ts` et dans `messages-advanced.ts` — désignaient « le transport PRIMAIRE du
client iOS, qui édite via `PUT /messages/:id` » **au-dessus du câblage de
`PUT /conversations/:id/messages/:messageId`**. Le chemin nommé et le chemin câblé n'étaient pas
le même. Le commentaire, lui, se lisait comme une preuve que le trou était fermé.

## Ce que l'utilisateur voyait

Éditer « salut @alice » en « salut @bob » **depuis un iPhone** : Alice reste mentionnée (ligne
`Mention`, `validatedMentions`, inbox `/mentions`, surlignage), Bob n'est nommé nulle part, ne reçoit
ni notification ni `mention:created`. Le même geste depuis le composer web (socket) fait tout
correctement. Idem pour `[[url]]` : envoyé, le texte produit un lien traçable ; **édité** depuis iOS
ou depuis `messages.service.ts`, les crochets restent en dur dans le message, définitivement.

## Lot A — `PUT /messages/:messageId`, le transport d'iOS

`processExplicitLinks` AVANT l'écriture, `reconcileEditedMentions` + `emitMentionCreated` après, et
le contenu traité devient le SEUL en circulation : base, mentions, retraduction, payload diffusé.

Une différence assumée avec le sibling PUT : la réconciliation précède le `findUniqueOrThrow` de
relecture. Elle écrit `validatedMentions` en base, donc la relecture rend l'état réconcilié sans
recopiage conditionnel — et quand elle n'a RIEN pu établir, la ligne porte toujours la valeur
précédente, qui est la bonne. Le garde-fou `if (reconciled)` du sibling existe parce qu'il tient un
objet rendu par l'écriture ; ici il n'y a rien à garder.

La réconciliation est bien APRÈS le `updateMany` gardé : un `DELETE` concurrent rend `count === 0`,
la route répond 404 et ne réconcilie rien sur un message que le client a déjà retiré.

## Lot B — `PATCH /messages/:messageId`, le transport du web

Même traitement, avec le garde-fou `if (reconciled)` du sibling puisqu'il tient lui aussi l'objet
rendu par `update`.

## Lot C — le `content.trim()` qui plantait sur le seul cas que la garde autorise

`content` est OPTIONNEL dans `UpdateMessageBodySchema`, et l'omettre est précisément la façon de
retirer la légende d'un message à pièce jointe — un cas que la garde d'entrée autorise
explicitement (`(!content || …) && !messageHasAttachments`). L'écriture faisait ensuite
`content.trim()` : TypeError, traduit en 500 par le catch. Le seul cas explicitement permis était le
seul que l'écriture ne savait pas traiter. `content?.trim() ?? ''`.

## Lot D — les commentaires qui nommaient la mauvaise route

Corrigés aux deux endroits, et `broadcastMessageMutation.ts` — dont l'affirmation était JUSTE, elle,
puisque cette unité-là est bien câblée sur `routes/messages.ts` — reçoit le chemin complet, l'ambiguïté
entre les deux `PUT` étant exactement ce qui a permis la confusion. La leçon du 2026-08-07 (3) — « une garantie énoncée dans un commentaire
n'est pas une garantie du système » — se double ici d'un corollaire : un commentaire qui nomme le
chemin qu'il ne câble PAS ne se contente pas de ne rien garantir, il **détourne activement** le
prochain audit. Les cycles suivants ont relu ces lignes et conclu que le cas iOS était traité.

## Vérification

- **10 tests neufs**, **8 rouges observés** avant correctif :
  - `message-edit-mention-parity.test.ts` (6, dont 5 rouges) — réconciliation, `mention:created` aux
    seuls entrants, traitement des liens avant écriture, contenu traité en circulation unique,
    légende retirée sans 500 ; plus le cas qui doit RESTER muet (course de suppression : `count === 0`
    → 404 et aucune réconciliation).
  - `conversation-messages-advanced.test.ts` (4, dont 3 rouges) — mêmes obligations sur le PATCH, plus
    le `validatedMentions` qui ne doit PAS être écrasé quand la réconciliation n'établit rien.
- **Suite gateway complète : 613 suites, 15 799 tests, tout vert.** `tsc --noEmit` propre.

## Reste ouvert après ce cycle

- **Quatre points d'entrée pour une édition, dont un que personne n'appelle**
  (`PUT /conversations/:id/messages/:messageId`). Les quatre partagent désormais les mêmes unités,
  mais chacun réimplémente ses propres gardes de permission — et elles DIVERGENT : le PATCH n'a pas
  la fenêtre de 24h ni le bypass modérateur, le `PUT /messages/:messageId` filtre par
  `sender: { userId }` (donc aucun bypass du tout). **Tête du prochain cycle** : une seule unité
  d'admission à l'édition, nommée, plutôt que quatre tests d'admission qui ont déjà prouvé qu'ils
  dérivent. C'est le motif exact des cycles 30-31, un étage plus bas.
- **La file d'attente de fan-out** (héritée du cycle 32, D1). La troncature est mesurable depuis le
  cycle 32 ; il faut regarder ce qu'elle mesure avant de choisir.
- **`getVisibilityFilteredRecipients` et `filterPostConsumers`** ne se citent toujours pas.
- **`@Display Name` reste inextractible dans le domaine social** — septième report.
- **`eslint` inopérant sur le gateway** (pas de `eslint.config.js` en flat config) — inchangé depuis
  le cycle 29.

---

# Cycle 32b — Addendum d'une session parallèle

Deux sessions ont livré le cycle 32 en parallèle, sur la même tête (« la troncature est muette »).
Le cycle 32 ci-dessous est **le plus large** — il porte en plus les lots B et C sur les défauts
permissifs — et sa forme sur la troncature est la meilleure sur deux points, gardés tels quels :
le type nommé (`FanoutBucket` / `StoryNotificationRecipients`), et le log placé **dans**
`getStoryNotificationRecipients` plutôt que chez un appelant, ce qui le rend vrai pour tous.
Cette session s'aligne dessus et n'apporte que ce qui manquait. (Leçon d'intégration du cycle 23,
reprise au 25b : comparer défaut par défaut, jamais « qui est arrivé en premier ».)

## Ce que l'addendum ajoute — 1. la borne payait ses exclus sur son propre budget

Défaut que le cycle 32 n'a pas touché, et qui est **antérieur** à la question de la troncature :
deux des trois requêtes écartaient des gens **après** le `take`, pas dedans.

| requête | écarté par la requête | écarté après coup |
|---|---|---|
| `postComment` | `commenterId` | **`authorId`** |
| `postReaction` | `commenterId` | **`authorId`** |
| `friendRequest` | — | `authorId` (structurel, voir plus bas) |

Une ligne écartée après coup a quand même consommé sa place sous la borne. Et l'auteur n'est pas un
engagé quelconque de son propre fil : **c'est le plus prolifique**, parce que répondre à chacun de
ses commentateurs est le comportement normal d'un auteur. Sur un post où l'auteur a répondu à tout
le monde, ses propres réponses évinçaient donc, une pour une, des destinataires réels — en silence,
et d'autant plus fort que le post marchait bien. La borne annonçait 500 destinataires et en servait
moins, sans que rien ne le dise.

**Correctif.** `authorId: { notIn: [commenterId, authorId] }` dans le `where`. La borne compte
désormais des destinataires, plus des lignes dont une partie était jetée d'avance.

**Les `filter` en aval RESTENT, et ce n'est pas une garde en double.** Le `notIn` protège le
**budget** ; les `filter` tiennent la **postcondition** de la méthode publique — « ni l'auteur ni le
commentateur ne sortent d'ici », vrai quelle que soit la clause `where` du jour. C'est ce qui
distingue ce cas du `COMMUNITY` décoratif retiré au cycle 31 : là c'était une branche de décision
inatteignable, ici c'est ce dont une méthode répond. Les deux tests qui l'encodaient sont tombés
quand je les avais retirés — ils avaient raison, ils sont restés.

Sur `friendRequest` l'auteur ne peut PAS sortir par la requête : il ancre **chaque** ligne
d'amitié. Sa présence y est structurelle, pas budgétaire — rien à corriger.

## Ce que l'addendum ajoute — 2. la ligne témoin, parce que `>=` crie au loup à la borne

Le cycle 32 déduit la troncature de « la requête a rendu **autant** de lignes que la borne »
(`length >= FANOUT_ROW_CAP`). C'est un signal juste dans l'esprit, faux au point exact où son propre
commentaire promet de trancher : un seau de **très exactement** 500 engagés est COMPLET, et il est
déclaré tronqué. Sur le seau des amis, la conséquence n'est pas théorique — un auteur à exactement
500 amis émet un `warn` de troncature à **chacune** de ses publications, pour toujours.

**Correctif : `take: FANOUT_ROW_CAP + 1`.** La ligne excédentaire est un **témoin**, jamais un
destinataire — lue, comptée, puis jetée par un `slice`. La borne de diffusion ne bouge pas d'un
destinataire ; seul le verdict devient exact, et le test passe de `>=` à `>`.

**Portée du témoin, dite honnêtement.** Sur `friendRequest` (pas de `distinct`) il est **exact** :
une 501e ligne existe si et seulement si la base en avait plus de 500. Sur les deux requêtes
`distinct`, il reste un signal **suffisant** — jamais déclenché à tort, mais capable de se taire sur
une troncature que la déduplication a repliée en deçà de la borne. Ce n'est pas gênant là où ça
compte : le seau où la troncature est de loin la plus probable est celui des amitiés — un auteur à
plus de 500 amis est banal, un post à plus de 500 commentateurs distincts ne l'est pas — et c'est
précisément celui où le compte est exact.

## Vérification de l'addendum

- **15 tests neufs**, dont **13 rouges observés** avant implémentation (le 15e — « sous la borne, on
  se tait » — était vert d'emblée : il n'y avait alors aucun `warn` du tout, ce qui est exactement le
  cas à verrouiller contre un futur `warn` trop bavard).
- **Les 4 tests du cycle 32 qui nourrissaient exactement `FANOUT_ROW_CAP` lignes** passent à
  `FANOUT_ROW_CAP + 1` : sous la sémantique du témoin, 500 lignes veut dire « complet ». Le cas
  « exactement 500 → aucune troncature » devient un test à part entière — c'est le point que `>=`
  manquait.
- Le témoin est éprouvé sur ses **trois** régimes : 500 pile → pas de troncature ; 501 → troncature
  signalée ; et dans les deux cas la 501e n'est jamais notifiée.

## Reste ouvert après l'addendum

- **La file d'attente de fan-out** reste la tête du prochain cycle, telle que le cycle 32 la pose
  (D1) — inchangé, et mieux instrumenté : le verdict de troncature ne remonte plus de faux positifs,
  donc ce que les logs mesureront sera lisible tel quel.
- Tout le reste ouvert du cycle 32 ci-dessous est inchangé.

---

# Cycle 32 — Une troncature muette, et les défauts permissifs que le cycle précédent n'avait pas atteints

Deux têtes prises ensemble, parce qu'elles se sont révélées être la même question posée à deux
étages. Celle laissée par le cycle 31 (livré en parallèle par une autre session, mergé en premier,
et repris tel quel ici — sa forme était la bonne) : « **`getStoryNotificationRecipients` plafonne à
500 lignes par seau** sans le dire au destinataire ni au log. Sur un post viral, un fan-out
silencieusement tronqué ressemble à un fan-out complet. **Tête du prochain cycle.** »

Et ce que ce cycle 31 n'avait pas atteint : il a rendu `visibility` requis sur un lot, mais le
défaut permissif vivait aussi chez l'appelant, dans trois autres lots, et sur huit méthodes de
diffusion temps réel.

## Lot A — la borne était légitime, son silence ne l'était pas

Quatre lectures bornées à 500 alimentent les fan-out de notification. Une liste rendue à la borne
exacte est **indiscernable** d'une liste complète : le seau paraît entier, et le 501e destinataire
n'apprend jamais rien. Le cas le plus net n'est même pas le post viral mais
`createFriendContentNotificationsBatch` : tri `updatedAt desc`, borne fixe, donc chez un auteur qui
dépasse durablement la borne ce sont **toujours les mêmes** — les contacts les plus anciens — qui
n'apprennent aucune de ses publications. Un silence structurel, pas un incident.

Correctif dans la ligne du corollaire du cycle 27 (« une valeur vide *établie* et une valeur vide
*qu'on n'a pas pu établir* doivent être DISTINGUABLES dans le type de retour ») : la borne devient
`FANOUT_ROW_CAP`, partagée par les quatre `take` — une constante ne peut pas dériver du test qui la
surveille — la saturation entre dans le type de retour (`truncatedBuckets: FanoutBucket[]`) et dans
le log (`postId`, `authorId`, seaux, borne).

## Lot B — le défaut permissif ne vit pas que dans la signature

`SocialEventsHandler` portait `visibility: string = 'PUBLIC'` et `visibilityUserIds: string[] = []`
sur **huit** méthodes de diffusion et sur l'énumérateur `getVisibilityFilteredRecipients` lui-même.
Un appelant qui les omettait diffusait un post `PRIVATE` à tous les amis de l'auteur, ou un `EXCEPT`
sans sa liste noire.

Aucun appelant de production ne les omettait — et c'est exactement l'argument : le retrait ne coûte
rien, la conservation coûte le premier oubli. Les deux paramètres deviennent requis ; le build a
lui-même désigné les deux harnais qui s'appuyaient sur le défaut.
`createFriendContentNotificationsBatch` reçoit le même traitement que ses trois lots voisins.

## Lot C — et il se réinstalle chez l'appelant

Le cycle 31 a rendu `visibility` requis sur `createStoryCommentNotificationsBatch` ; son unique
appelant passait `post.visibility ?? 'PUBLIC'`. Le défaut avait simplement changé d'étage, hors de
vue du build. Même motif dans `routes/posts/interactions.ts`, deux fois, avec un cast en prime :
`(post as { visibility?: string }).visibility ?? 'PUBLIC'` — alors que `postAcl`, la tranche ACL
autoritative, est chargée **trois lignes plus haut** pour la garde d'interaction. Le cast disait que
la forme rendue par `likePost` n'était pas sûre de porter le champ ; la réponse n'était pas de
deviner une valeur, mais de lire celle qu'on avait déjà.

## D1 — pourquoi le lot A ne va pas jusqu'à la file d'attente

Le commentaire du code propose depuis longtemps « a background queue for fan-out ». Ce cycle ne la
construit pas : une file change le modèle de livraison (ordre, reprise, idempotence) et mérite son
propre cycle. Rendre la troncature **observable** est ce qui manquait pour pouvoir décider — on ne
sait aujourd'hui ni à quelle fréquence la borne est atteinte, ni sur quels seaux.

## D2 — ce qui n'a PAS été refait après la session parallèle

Le cycle 31 a été livré deux fois, en parallèle. La branche arrivée première portait la meilleure
forme sur trois points (le contrat `Set | null` de la lecture DM, qui distingue la panne de
l'absence ; le refus du seul résidu plutôt que de tout le lot ; les 14 fixtures qui verrouillent
l'accord des deux formes cas par cas), et son choix assumé de relire les co-membres plutôt que de
recopier une règle d'admission localement est défendable. Elle est gardée telle quelle : ce cycle ne
réécrit rien de ce qu'elle a livré, il prend la suite là où elle s'arrête.

## Vérification

- **6 tests neufs** (`__tests__/unit/services/NotificationService.fanouttruncation.test.ts`),
  **5 rouges observés** : la saturation de chacun des trois seaux, le log qui nomme le post et le
  seau, la borne du graphe ami côté publication — et les deux cas sous la borne qui ne doivent RIEN
  consigner (sans eux, un log inconditionnel passerait les autres).
- **Suite gateway complète : 612 suites, 15 789 tests, tout vert.** `tsc --noEmit` propre.
  Couverture lignes **95,67 %** (95,66 % avant).
- Le lot B et le lot C ne changent aucun comportement observable : ils déplacent au build ce qui
  n'était protégé que par la discipline des appelants. Aucun test neuf ne peut en témoigner — la
  suite existante sert de filet, et les deux harnais que le compilateur a fait tomber sont la preuve
  que la garde mord.

## Reste ouvert après ce cycle

- **La file d'attente de fan-out** (cf. D1). La troncature est désormais mesurable ; le prochain pas
  est de regarder ce qu'elle mesure avant de choisir entre file, pagination et borne relevée.
  **Tête du prochain cycle si rien de plus grave n'apparaît.**
- **`getVisibilityFilteredRecipients` et `filterPostConsumers` traitent une visibilité inconnue de la
  même façon (retomber sur les amis), mais par deux chemins qui ne se citent pas.** L'un est un
  énumérateur, l'autre un test d'admission — les fusionner serait la faute du cycle 28 ; les faire
  se référencer mutuellement suffirait.
- **`@Display Name` reste inextractible dans le domaine social** — sixième report.
- **`eslint` inopérant sur le gateway** (pas de `eslint.config.js` en flat config) — inchangé depuis
  le cycle 29, aucune passe de lint n'a donc pu tourner sur ce cycle non plus.

---

# Cycle 31 — Deux tests d'admission pour une seule question, et le seau qui n'en avait aucun

Tête laissée par le cycle 30 : « **Deux tests d'admission coexistent** : `filterPostAudience`
(amis stricts) et `canUserConsumePost` (amis ∪ contacts DM). Un contact DM non-ami reçoit donc une
notification de réponse mais pas de mention. **Candidat sérieux pour le prochain cycle.** »

Pris tel quel. Le défaut annoncé était réel — et en le corrigeant, l'outil qu'il a fallu construire
a rendu visible un second trou, plus grave, dans le même fichier.

## Lot A — les deux tests d'admission avaient divergé

Une seule question, « celui-là a-t-il le droit de LIRE ce post ? », posée sous trois formes :

| forme | qui | audience AVANT |
|---|---|---|
| clause `where` | `buildPostVisibilityOrFilter` (feed, post unique) | amis ∪ contacts DM |
| destinataire unique | `canUserConsumePost` (fil, notifications unitaires) | amis ∪ contacts DM |
| lot de candidats | `filterPostAudience` (mentions) | **amis stricts** |

Trois formes imposées par la manière dont la question se pose — pas par l'audience. La troisième
avait dérivé, et la conséquence est observable par l'utilisateur : un contact DM non-ami voit le
post dans son feed, peut en ouvrir le fil, reçoit une notification quand on répond à son
commentaire — et **rien** quand on le nomme dans ce même post. Sous-livraison silencieuse.

**Correctif.** `filterPostAudience` → **`filterPostConsumers`**. Le renommage n'est pas cosmétique :
la doctrine posée au cycle 29 (D1) veut qu'un point d'entrée choisisse son audience en la
**nommant**, et l'ancien nom ne disait pas laquelle des deux il appliquait — c'est précisément ce
qui a permis la dérive. La branche `FRIENDS`/`EXCEPT` consulte désormais le lien DM.

**Le coût est nul sur le cas dominant.** `filterDirectContactIdsAmong` — pendant BORNÉ de
`getDirectConversationContactIds`, comme `loadFriendIdsAmong` l'est du graphe ami — n'est interrogé
que pour le **résidu** : les candidats dont l'amitié n'a rien dit. Un lot entièrement composé d'amis
ne coûte pas une requête de plus qu'avant. Les candidats déjà écartés par la liste noire `EXCEPT`
sortent des bornes avant toute lecture, comme dans `canUserViewPost`.

**Une panne partielle ne détruit pas ce qui est établi.** Le graphe ami qui échoue ne laisse rien —
on refuse tout. Le graphe DM qui échoue ne laisse indéterminé que le résidu — on garde les amis et
on refuse le reste. Distinguer les deux, c'est le corollaire du cycle 27 appliqué à un filtre.

**L'anti-dérive est un test de conformité, pas une implémentation partagée.** Fusionner les deux
formes serait faux : `filterPostConsumers` matérialise les co-membres (`getCommunityCoMemberIds`)
là où `canUserConsumePost` tranche en pairwise (`doUsersShareCommunity`) — c'est la raison d'être
des deux. 14 fixtures traversent donc les deux fonctions depuis le **même** double de graphe et
doivent rendre le même verdict.

## Lot B — le seau « engagés antérieurs » n'avait aucun test d'admission

Trouvé en branchant le lot A. `createStoryCommentNotificationsBatch` sert trois seaux :

| seau | nature | garde AVANT |
|---|---|---|
| auteur | possède le post | exempt, correct |
| `friendIds` | **sortie d'énumérateur** — amis actuels dépliés du graphe | table locale, correct |
| `previousCommenterIds` | **ensemble arbitraire** — commentateurs antérieurs ∪ réacteurs | table locale, **faux** |

La table locale `canSeePost` ne lisait aucun graphe : `default: return true` couvrait `FRIENDS`, et
`EXCEPT` se contentait de la liste noire. Pour les amis c'est juste — ils sont amis par
construction. Pour les engagés antérieurs c'est un trou : ils étaient admis **quand ils ont engagé
le post**, et une dés-amitié ou une édition de visibilité les en sort sans toucher à leur
commentaire. Un post `PUBLIC` passé en `FRIENDS` emporte d'un coup tous ceux qui n'ont jamais été
amis — et chacun reçoit `story_thread_reply` avec l'extrait du nouveau commentaire.

C'est le trou que le cycle 30 avait fermé pour la notification UNITAIRE de la même population
(`comment_reply` → `canNotifyAboutPost`). Le seau de fan-out l'avait gardé.

`engagedAudience` passe par `filterPostConsumers`. `canSeePost` devient `canSeeAsFriend` — il ne
filtre plus que les amis — et son cas `COMMUNITY`, devenu inatteignable, est retiré plutôt que
laissé en garde décorative (repéré par la ligne non couverte 1906, pas par relecture).

## Lot C — `visibility` requis (dette des cycles 28, 29, 30)

`visibility?` à défaut `PUBLIC` sur `createStoryCommentNotificationsBatch`, annoncé trois fois comme
« mécanique, sans risque ». Devenu `visibility: string | null | undefined` requis. Une visibilité
nulle se lit désormais comme `FRIENDS`, jamais comme publique.

Nuance apprise en le faisant : contrairement à ce qu'annonçait le cycle 28, la requiredness ne
protège **que la production** ici — `services/gateway/tsconfig.json` exclut `**/__tests__/**`, donc
aucun harnais n'échoue au build. Le seul appelant de production (`routes/posts/comments.ts`) est
bien couvert ; les 3 harnais ont été rattrapés par leurs assertions, pas par `tsc`.

## Vérification

- **19 tests neufs** : 14 fixtures de conformité + 8 cas de fan-out + 5 cas de borne/panne côté lot,
  et 3 cas de service pour la mention d'un contact DM. **10 rouges observés** avant implémentation
  (7 lot A, 3 lot B), vérifiés en neutralisant la branche DM puis en la rétablissant.
- **3 harnais** complètent leur double Prisma (`participant`) : sans lui, l'exception avalée faisait
  passer leurs refus pour des refus d'ACL — ils prouvaient moins qu'ils n'en avaient l'air.
- **Suite gateway complète : 611 suites, 15 783 tests, tout vert.** `tsc --noEmit` propre.
  Couverture lignes **95,66 %** ; `postAudience.ts` et `directContactVisibility.ts` à 100 % lignes.

## Reste ouvert après ce cycle

- **`canUserInteractWithPost` reste amis stricts** et c'est volontaire (décision 2026-07-08) : ce
  cycle n'a réaligné que le côté CONSOMMATION, où les trois formes répondent maintenant à
  l'identique. L'asymétrie voir ⊇ interagir est intacte — ne pas la « réaligner » sans re-décider.
- **`getStoryNotificationRecipients` plafonne à 500 lignes par seau** sans le dire au destinataire ni
  au log. Sur un post viral, un fan-out silencieusement tronqué ressemble à un fan-out complet.
  **Tête du prochain cycle** si rien de plus grave n'apparaît.
- **`@Display Name` reste inextractible dans le domaine social** — cinquième report.
- **`eslint` inopérant sur le gateway** (pas de `eslint.config.js` en flat config) — inchangé depuis
  le cycle 29, et donc aucune passe de lint n'a pu tourner sur ce cycle non plus.

---

# Cycle 30 — Les notifications du fil suivaient l'auteur du commentaire, pas l'audience du post

Suite directe du cycle 29, sur la tête qu'il avait lui-même désignée : « `createCommentReplyNotification`
et `createCommentLikeNotification` ne filtrent pas leur destinataire unique. **Prochain lot naturel.** »

## Ce qui était ouvert

Trois notifications à destinataire UNIQUE visent l'auteur d'un commentaire :
`createCommentReplyNotification`, `createCommentLikeNotification` et
`createCommentReactionNotification` (chemin socket).

Leur destinataire A pu commenter — donc il était admis **à ce moment-là**. Rien ne garantit qu'il
le soit encore : une dés-amitié, ou une édition de visibilité via `PUT /posts/:postId`, le sort de
l'audience **sans toucher à son commentaire**. Les deux événements sont ordinaires.

Ce qui partait alors sur son écran verrouillé n'est pas un ping :

| notification | ce qu'elle portait |
|---|---|
| `comment_reply` | `replyPreview` — un extrait du contenu d'un **TIERS** — plus `parentCommentPreview` et la **vignette du post** (`resolvePostMedia` → `firstAttachmentUrl`, `postThumbnailUrl`) |
| `comment_like` | cette même vignette de post restreint |
| `comment_reaction` | un lien de tap vers un post qui le refuserait |

Le cycle 29 avait fermé la lecture et l'écriture du fil ; il restait ce qui en découle.

## D1 — la garde résout le post elle-même

Le cycle 28 avait tranché l'inverse pour les lots de mention : `visibility` **requis** en paramètre,
pour que TypeScript refuse l'appel incomplet à la compilation. Ici le choix est l'autre, et pour une
raison mesurable : ces trois méthodes sont invoquées en **fire-and-forget APRÈS la réponse**
HTTP/socket (toutes leurs invocations sont suivies d'un `.catch()` détaché). La requête
supplémentaire ne coûte donc rien d'observable, là où le cycle 28 gardait un chemin d'écriture chaud.

Et une garde sans paramètre ne peut pas être **désarmée par omission** — pas même par un appelant
futur qui ignorerait la règle. C'est la même propriété que D2 du cycle 28 visait, obtenue sans
élargir l'API de trois méthodes.

`canNotifyAboutPost(postId, recipientId)` : `loadPostAcl` puis `canUserConsumePost`. Audience de
**consommation** (amis ∪ contacts DM) — être informé d'un contenu qu'on a le droit de lire dans le
fil est la même question que le lire. **En panne ou post introuvable, on REFUSE** : une notification
manquée se rattrape en ouvrant le post, un extrait poussé ne se rappelle pas.

## D2 — `NOT_DELETED` sort de `postIncludes`

Brancher la garde a fait tomber **16 suites** de `NotificationService` d'un coup. Le diagnostic est
plus intéressant que le symptôme : `postVisibility` importait `NOT_DELETED` depuis `postIncludes`,
qui construit ses `Prisma.validator` **au chargement du module**. Les harnais de notification
doublent le client Prisma et n'ont aucune raison de connaître les formes d'`include` des posts —
ils cassaient sur un import qu'ils n'avaient pas demandé.

Corriger les 16 harnais aurait masqué le vrai défaut : un module d'ACL feuille ne doit pas dépendre
d'un module de formes. `NOT_DELETED` vit désormais dans `services/posts/softDelete.ts`, re-exporté
par `postIncludes` pour ses appelants historiques. **16 rouges → 6**, et les 6 restants sont la
vraie déclaration d'audience.

## Vérification

- **11 tests neufs** (`__tests__/unit/services/NotificationService.threadaudience.test.ts`),
  **6 rouges observés** : le destinataire dés-ami, le post devenu `PRIVATE`, la liste `ONLY`, le
  post introuvable qui refuse, l'auteur toujours admis sur son propre `PRIVATE`, le `PUBLIC` qui
  n'interroge pas le graphe — et deux verrous qui vérifient que la **vignette n'est même pas lue**
  quand le destinataire est hors audience.
- **7 harnais** complètent leur double : audience du post, et `PostVisibility` (le module d'ACL
  compare `post.visibility` à l'enum Prisma — un double qui ne l'expose pas fait valoir `undefined`
  à toute comparaison, donc refuser).
- **Suite gateway complète : 609 suites, 15 751 tests, tout vert.** `tsc --noEmit` propre.
  Couverture lignes **95,66 %**.

## Reste ouvert après ce cycle

- **Deux tests d'admission coexistent** : `filterPostAudience` (lots de mention, amis stricts) et
  `canUserConsumePost` (fil + notifications unitaires, amis ∪ contacts DM). Un contact DM non-ami
  reçoit donc une notification de réponse mais pas de mention. L'écart est **conservateur** (sous-
  livraison, jamais fuite) et les deux formes diffèrent — lot de candidats arbitraires contre
  destinataire unique déjà engagé. Les unifier demande de re-décider si `filterPostAudience` doit
  admettre les contacts DM. **Candidat sérieux pour le prochain cycle.**
- **`createStoryCommentNotificationsBatch` garde son `visibility?` optionnel à défaut `PUBLIC`** —
  annoncé par les cycles 28 et 29, toujours ouvert. Mécanique, sans risque.
- **`@Display Name` reste inextractible dans le domaine social** — quatrième report.
- Les autres points du cycle 29 (réparations base à lancer à la main, suppression de branche
  distante impossible depuis cette routine, `eslint` inopérant sur le gateway) sont inchangés.

---

# Cycle 29 — Le fil d'un post n'héritait d'aucune de ses règles d'audience

Tête laissée par le cycle 28 :
« **`@Display Name` reste inextractible dans le domaine social.** […] **Tête du prochain cycle si
rien de plus grave n'apparaît** — deux cycles de suite, quelque chose de plus grave est apparu. »

Trois cycles de suite. Le défaut annoncé retourne à la file, avec sa raison inchangée.

## Ce qui était ouvert

Les six routes de `routes/posts/comments.ts`, le like/unlike REST du post et les quatre handlers de
réaction socket ne consultaient **jamais** `Post.visibility`. Un utilisateur authentifié connaissant
un `postId` pouvait, sur un post `PRIVATE` / `ONLY` / `FRIENDS` / `COMMUNITY` :

| surface | ce qu'elle donnait |
|---|---|
| `GET /posts/:postId/comments` | tout le fil — contenu, médias, auteurs |
| `GET .../comments/:commentId/replies` | idem, et sans même regarder le post |
| `POST /posts/:postId/comments` | **écrire** dedans, puis notifier l'auteur |
| `POST`/`DELETE .../like` | réaction persistée sur un commentaire du fil |
| `comment:reaction-add` / `-remove` | idem par socket |
| `post:reaction-add` / `-remove` | réaction sur le post lui-même |
| `POST`/`DELETE /posts/:postId/like` | réaction REST sur le post lui-même |

Différence de nature avec le cycle 28 : cette fuite est **tirée par l'appelant**, pas poussée. Elle
ne demande aucun préalable — ni mention, ni relation, ni notification — seulement un identifiant.

## Pourquoi c'était visible dans le dépôt

Le post, lui, était protégé : `PostService.getPostById` et `recordMediaDownloads` appliquent
`buildVisibilityFilter`, et `post:join` refusait déjà l'abonnement à la room d'un post restreint
via `canUserViewPost`. Le fil était la seule île sans ACL.

Et la preuve était dans le fichier même : `CommentReactionHandler` **importait** `canUserViewPost`
et portait un wrapper privé `_canUserViewPost` — que rien n'appelait. L'intention avait été écrite,
le branchement n'avait jamais eu lieu.

## D1 — une asymétrie documentée n'est pas une asymétrie appliquée

`postVisibility.ts` porte depuis la décision 2026-07-08 : le filtre de LISTE admet amis ∪ contacts
DM, tandis que `canUserViewPost` — « ce qui garde RÉAGIR / COMMENTER » — reste amis stricts. Cette
règle n'existait qu'en prose : rien ne permettait de l'appliquer à UN objet.

Quatre primitives la rendent exécutable, dans le fichier qui la documente plutôt que dans un module
de plus :

| primitive | question | audience |
|---|---|---|
| `loadPostAcl` | tranche ACL de ce post | — (`null` si absent OU supprimé) |
| `loadCommentPostAcl` | ... du post PORTANT ce commentaire | — (id d'URL jamais cru) |
| `canUserConsumePost` | peut-il LIRE le fil ? | amis ∪ contacts DM |
| `canUserInteractWithPost` | peut-il ÉCRIRE / RÉAGIR ? | amis stricts |

Les deux verdicts ne diffèrent que par `canUserViewPost(..., { includeDirectContacts })`. Un point
d'entrée choisit son audience en la **nommant**, pas en réglant un booléen.

Choisir la consommation pour la lecture n'est pas un élargissement, c'est l'absence d'une
régression : un contact DM non-ami à qui le feed montre déjà une story `FRIENDS` doit pouvoir en
lire les commentaires. Le verdict d'interaction en aurait fait un 404 — une garde qui casse un
lecteur légitime n'est pas une garde.

## D2 — l'identifiant du chemin ne vaut rien

Trois surfaces adressent leur cible par `commentId` tout en recevant un `postId` (segment d'URL ou
champ de payload) : les réponses, les likes de commentaire, les réactions socket. Le post y est
désormais résolu **DEPUIS le commentaire**. Sans cela, un appelant annonçait le post public de son
choix tout en visant le fil d'un post privé — le `postId` reçu n'est plus qu'une adresse de room et
un segment de chemin.

## Les deux transports répondent pareil

`likePost` et `PostReactionService.addReaction` ne vérifient, eux aussi, que l'existence et le
non-effacement du post. Gardier le seul chemin socket aurait fait dépendre l'ACL du **transport** :
un client refusé sur `post:reaction-add` réussissait en repassant par `POST /posts/:postId/like`.
Les deux reçoivent donc la même garde et le même refus indistinct.

## D3 — refuser sans confirmer

`404` partout, jamais `403`, et `null` indistinct entre post absent, supprimé et invisible. Même
doctrine que `recordMediaDownloads` : distinguer ferait de la route un oracle d'existence de posts
privés. Côté socket, l'ACK rend « Post/Comment not found » pour la même raison.

## Coût

- Cas dominant (post `PUBLIC`) : une requête bornée, **aucune** lecture de graphe ensuite.
- `FRIENDS`/`EXCEPT` : une requête d'amitié ; le contact DM n'est consulté qu'en dernier recours.
- `EXCEPT` court-circuite sur sa liste noire **avant** toute lecture de graphe (nouveau).
- `doUsersShareDirectConversation` est le pendant **pairwise** de `getDirectConversationContactIds`,
  exactement comme `doUsersShareCommunity` l'est de `getCommunityCoMemberIds` : deux requêtes
  bornées au lieu de matérialiser le carnet d'adresses. Définition du contact DM reprise mot pour
  mot du feed. **En panne, il refuse.**

## Contreparties assumées

**1. Un contact DM non-ami perd le droit d'ÉCRIRE dans le fil d'un post `FRIENDS`/`EXCEPT` qu'il
peut pourtant VOIR** (il garde la lecture). C'est le seul cas où une action qui réussissait pour un
utilisateur *voyant* le post échoue désormais — il mérite d'être appelé par son nom plutôt que
caché derrière « on ferme un trou ». Ce n'est pas un effet de bord : c'est exactement la décision
produit du 2026-07-08 citée dans `postVisibility.ts` (« un DM-contact peut ouvrir une story FRIENDS
et compter comme viewer, mais pas y réagir »), restée sans point d'application jusqu'ici. Si
l'équipe produit veut au contraire ouvrir l'interaction aux contacts DM, la correction tient en une
ligne (`canUserInteractWithPost` passant `includeDirectContacts: true`) — et doit se faire en
RE-DÉCIDANT l'ACL, jamais en retirant la garde. **Point de validation humaine.**

**2. Un utilisateur qui perd l'accès à un post ne peut plus retirer une réaction qu'il y avait
laissée.** Elle lui est de toute façon invisible, et une ACL qui dépend du sens du geste est un
footgun ; le retrait suit donc la pose. À rouvrir si un cas d'usage réel apparaît.

## Vérification

- **51 tests neufs**, écrits AVANT l'implémentation, **24 rouges observés** :
  - `__tests__/unit/services/posts/postThreadAccess.test.ts` — 22 cas (les six modes, l'auteur
    toujours admis sur son `PRIVATE`, le contact DM admis en lecture ET refusé en écriture, le post
    résolu depuis le commentaire, la visibilité inconnue qui restreint, la panne qui refuse, les
    court-circuits sans requête).
  - `__tests__/unit/routes/posts/comments-audience.test.ts` — 17 cas sur les cinq routes, dont
    « le `:postId` du chemin ne vaut rien » et « lire est ouvert là où écrire est refusé ».
  - `__tests__/unit/routes/posts/interactions-audience.test.ts` — 8 cas sur le like/unlike REST,
    dont « un contact DM non-ami est refusé, comme sur le chemin socket ».
  - 9 cas d'audience ajoutés aux deux suites de handlers socket, dont « le `postId` du payload
    n'est pas cru ».
- **15 harnais ont dû déclarer leur audience.** C'est voulu, et c'est le même choix qu'au cycle 28 :
  un double qui n'expose pas la tranche ACL échoue au lieu de rendre un verdict par défaut.
- Le wrapper mort `_canUserViewPost` est retiré.
- **Suite gateway complète : 608 suites, 15 740 tests, tout vert** (avant : 605 / 15 682).
  `tsc --noEmit` propre. Couverture lignes **95,66 %**, en légère hausse.

## Reste ouvert après ce cycle

- **`@Display Name` reste inextractible dans le domaine social** — rendu à la file une TROISIÈME
  fois, même raison mesurée : les deux clients insèrent un **handle**, jamais un nom d'affichage
  (web `MentionAutocomplete` → `onSelect(suggestion.username)`, iOS `FeedCommentsSheet` →
  `"@\(username) "`). Le cas ne se produit qu'en frappe manuelle. **Tête du prochain cycle si rien
  de plus grave n'apparaît.**
- **`createStoryCommentNotificationsBatch` garde son `visibility?` optionnel à défaut `PUBLIC`** —
  candidat sérieux annoncé par le cycle 28, non traité : ce cycle a trouvé plus grave dans le même
  chemin. Un seul appelant, qui passe bien le paramètre ; le rendre requis est mécanique.
  **Candidat sérieux pour le prochain cycle**, deux fois annoncé.
- **`createCommentReplyNotification` et `createCommentLikeNotification` ne filtrent pas leur
  destinataire unique** — l'auteur du commentaire parent reçoit un extrait de la réponse **et la
  vignette du post** (`resolvePostMedia`) sans test d'audience. Le cas exige une restriction
  postérieure à son commentaire (dés-amitié, édition de visibilité), donc plus étroit que ce cycle,
  mais c'est le même défaut : `filterPostAudience` s'y applique tel quel. **Prochain lot naturel.**
- **Les deux réparations de base attendent une exécution avec accès base**
  (`repair-mention-user-ids.ts`, `repair-tracking-link-created-by.ts`). À lancer SANS `--apply`
  d'abord. Action humaine — cette routine n'a aucun accès MongoDB.
- **Les `PostMention` périmées déjà écrites restent en base** (cycle 27, inchangé).
- **Aucune lecture déjà servie n'est rattrapable.** Le correctif ne vaut que pour l'avenir ; les
  fils restreints déjà lus l'ont été.
- **`getMentionsForMessage` / `getRecentMentionsForUser` n'ont aucun consommateur d'écran**
  (cycle 27, inchangé).
- **`MeeshySocketIOManager.getConversationParticipantsForMention`** reste un deuxième exemplaire du
  chargeur de participants (cycle 21, inchangé).
- L'arbitrage `delete-for-me` tranché par le cycle 12 attend toujours une validation humaine.
- **`eslint` ne peut pas tourner sur le gateway** : aucun `eslint.config.js` depuis la migration
  ESLint v9. Condition préexistante ; la CI ne gate que sur `test:coverage`.
- **La suppression de branche distante échoue depuis cette routine** — à supprimer depuis
  l'interface GitHub.

---

# Cycle 28 — Nommer quelqu'un ne lui donne pas le droit de VOIR

Tête laissée par le cycle 27 :
« **`@Display Name` reste inextractible dans le domaine social.** […] **Tête du prochain cycle
si rien de plus grave n'apparaît.** »

Quelque chose de plus grave est apparu, dans le bloc voisin du même chemin. Le défaut annoncé est
rendu à la file, avec la raison (voir *Reste ouvert*).

## Ce que les deux lots de mention faisaient

`createPostMentionNotificationsBatch` et `createCommentMentionNotificationsBatch` poussaient une
notification `user_mentioned` à **tout** utilisateur nommé dans le texte, sans jamais regarder qui
avait le droit de voir le post. La charge utile n'est pas un simple ping : elle porte
`postPreview` / `commentPreview` — un extrait de 100 caractères du contenu — et
`action: 'view_post'`.

Nommer `@carol` dans un post `PRIVATE`, `ONLY [bob]`, `FRIENDS` (Carol n'étant pas amie) ou
`COMMUNITY` (Carol n'étant pas membre) lui envoyait donc **un extrait du contenu sur son écran
verrouillé**, plus un lien de tap vers un post qui la refuserait. Le même trou existait pour un
commentaire : l'extrait du fil d'un post restreint partait vers un mentionné hors audience.

C'est une fuite de contenu, pas de métadonnée, et elle est **irréversible** — une notification
poussée est arrivée.

## Pourquoi c'était visible dans le dépôt

Ces deux lots étaient les **seules** surfaces d'éventail du domaine social à ne pas filtrer.
Toutes leurs voisines le font déjà, chacune sous un commentaire qui l'explique :

| surface | filtre |
|---|---|
| `createStoryCommentNotificationsBatch` | `canSeePost` (ONLY/EXCEPT/PRIVATE/COMMUNITY) |
| `createFriendContentNotificationsBatch` | branches ONLY/EXCEPT/COMMUNITY |
| `SocialEventsHandler.getVisibilityFilteredRecipients` | tous les broadcasts temps réel |
| `StoryTextObjectTranslationService.resolveBroadcastRecipients` | garde `PRIVATE` explicite |
| **les deux lots de mention** | **aucun** |

## D1 — l'admission n'est pas l'énumération

Toutes les gardes existantes sont des **énumérateurs** : auteur → liste de destinataires, obtenue
en dépliant son graphe. Une mention pose la question **inverse** — l'ensemble des nommés est
ARBITRAIRE (n'importe quel `@handle` du texte) et il faut trancher, un par un, « celui-là a-t-il le
droit ? ».

Réutiliser un énumérateur ici aurait été faux, et de façon coûteuse : pour `PUBLIC` ils rendent
`friendIds`. C'est un choix de **ciblage** (on ne pousse une publication qu'aux contacts), pas une
règle d'admission — un post public se **lit** par n'importe qui. Un inconnu légitimement nommé dans
un post public aurait perdu sa notification, soit le cas le plus courant de tous.

D'où `services/gateway/src/services/posts/postAudience.ts` → `filterPostAudience`, le test
d'admission, distinct et nommé comme tel :

| `visibility` | admis | coût |
|---|---|---|
| `PUBLIC` | tout le monde | **aucune requête** |
| `FRIENDS` | les amis de l'auteur | 1 requête bornée |
| `EXCEPT` | les amis, moins `visibilityUserIds` | 1 requête bornée |
| `ONLY` | exactement `visibilityUserIds` | aucune |
| `COMMUNITY` | les co-membres (cache Redis existant) | mutualisée |
| `PRIVATE` | personne | aucune |
| inconnue | comme `FRIENDS` — **jamais** comme publique | 1 requête bornée |

Trois décisions dans cette table :

1. **L'auteur est toujours admis**, y compris sur un `PRIVATE` : il possède le post, et aucun
   graphe ne l'affirme (on n'est pas ami avec soi-même).
2. **Une visibilité inconnue retombe sur `FRIENDS`**, pas sur `PUBLIC` : un mode ajouté demain au
   schéma sans passer par cette table restreint par défaut au lieu d'ouvrir en grand.
3. **En panne, on REFUSE.** L'échec d'une notification légitime est réparable (la ligne
   `PostMention` est persistée, la mention reste visible en ouvrant le post) ; la fuite ne l'est
   pas. `getCommunityCoMemberIds` rendait déjà `[]` sur exception — même politique.

La requête d'amitié est **bornée aux candidats** (`in: [...candidates]` des deux côtés) et non au
graphe entier : un auteur à 5 000 contacts nommant une personne coûte l'intersection, pas 5 000
lignes. Et le cas dominant — post public — ne coûte **rien**.

## D2 — une garde qu'on peut désarmer par omission n'est pas une garde

`createStoryCommentNotificationsBatch` prend `visibility?` avec défaut `PUBLIC` : oublier le
paramètre rouvre le trou en silence. Les deux lots de mention reçoivent au contraire
`visibility` **requis** (et `postAuthorId` requis côté commentaire, l'audience étant celle du POST
et non celle du commentateur). TypeScript refuse alors l'appel incomplet à la compilation.

C'est la raison de ne PAS avoir choisi l'autre option — recharger le post depuis `postId` dans le
lot : le paramètre requis donne la même garantie, sans requête supplémentaire sur un chemin
d'écriture chaud, et l'échoue au build plutôt qu'à l'exécution. La contrepartie assumée : **9
harnais** ont dû déclarer leur audience. Ils l'ont fait en `PUBLIC` avec la raison écrite — ils
portent sur le contenu, la langue, la priorité, le débit et l'auto-mention, pas sur le droit de
voir.

## Ce qui n'est PAS filtré, et pourquoi

Les lignes `PostMention` / `CommentMention` continuent d'être écrites pour **tous** les nommés.
Elles consignent un FAIT sur le texte (« ce post nomme Carol »), vrai quelle que soit l'audience ;
seule la **livraison** est conditionnée. Trois raisons :

1. Élargir plus tard la visibilité d'un post ne doit pas laisser un mentionné sans ligne.
2. Le consommateur d'affinité (`PostFeedService.getMentionsByPost` → `getReelSeed`) ne classe que
   des `candidateIds` **déjà filtrés par le feed** — vérifié : aucune seconde fuite par ce chemin.
3. Une ligne manquante ne se reconstruit pas (personne ne relit le texte après coup), là où une
   notification manquée est rattrapée par l'ouverture du post.

Les listes de déduplication des routes (`mentionedUserIds` → `excludeUserIds`) restent
**volontairement** l'ensemble complet des nommés. Un mentionné hors audience exclu des buckets de
priorité inférieure ne perd rien : ces buckets appliquent leur propre filtre de visibilité et
l'auraient écarté aussi.

## Vérification

- **25 tests neufs**, écrits AVANT l'implémentation, RED observé à chaque étape :
  - `__tests__/unit/services/posts/postAudience.test.ts` — 15 cas, unité à **100 % lignes et
    branches** (les six modes, l'amitié dans les deux sens, la borne aux candidats, l'auteur
    toujours admis, la panne qui refuse, la visibilité inconnue qui restreint, les court-circuits
    sans requête).
  - `__tests__/unit/services/NotificationService.mentionaudience.test.ts` — 10 cas sur les deux
    lots, dont « l'audience est celle du POST, pas celle du commentateur » et « aucune notification
    quand le graphe est illisible ».
- **4 régressions au niveau ROUTE** : l'audience du post persisté atteint le lot (création),
  l'audience **APRÈS** édition est celle qui s'applique (restreindre et nommer dans la même requête),
  l'audience du post atteint le lot de commentaire, et un post commenté introuvable ne notifie
  personne.
- **Suite gateway complète : 605 suites, 15 682 tests, tout vert** (avant : 603 / 15 655).
  `tsc --noEmit` propre. Couverture globale lignes **95,65 %**, en hausse.

## Reste ouvert après ce cycle

- **`@Display Name` reste inextractible dans le domaine social** — tête annoncée par le cycle 27,
  rendue à la file une seconde fois, et pour la même raison mesurée : les deux clients insèrent un
  **handle**, jamais un nom d'affichage (web `MentionAutocomplete` → `onSelect(suggestion.username)`,
  iOS `FeedCommentsSheet` → `"@\(username) "`). Le cas ne se produit qu'en frappe manuelle. Coût non
  nul : un post n'a pas de participants, l'audience équivalente (auteur + commentateurs + amis, cf.
  `getUserSuggestionsForPost`) demanderait deux requêtes de plus sur un chemin d'écriture chaud.
  **Tête du prochain cycle si rien de plus grave n'apparaît** — deux cycles de suite, quelque chose
  de plus grave est apparu.
- **`createStoryCommentNotificationsBatch` garde son `visibility?` optionnel à défaut `PUBLIC`** —
  le footgun que D2 vient de fermer sur les mentions reste ouvert là. Il n'a aujourd'hui qu'un seul
  appelant, qui passe bien le paramètre ; le rendre requis est mécanique et sans risque.
  **Candidat sérieux pour le prochain cycle.**
- **Les commentaires n'ont pas de route d'édition** — `comments.ts` n'expose que création,
  like/unlike et suppression. Il n'y a donc rien à réconcilier côté `CommentMention` aujourd'hui ;
  le jour où une édition de commentaire apparaît, elle doit naître avec `reconcilePostMentions`
  pour jumeau.
- **Les deux réparations de base attendent une exécution avec accès base**
  (`repair-mention-user-ids.ts`, `repair-tracking-link-created-by.ts`). À lancer SANS `--apply`
  d'abord. Action humaine — cette routine n'a aucun accès MongoDB.
- **Les `PostMention` périmées déjà écrites restent en base.** Les lignes de mentionnés retirés
  avant le cycle 27 survivent. Réparable par le même patron que les deux scripts ci-dessus.
- **Aucune notification déjà poussée n'est rattrapable.** Le correctif de ce cycle ne vaut que pour
  les mentions à venir ; les extraits partis vers des mentionnés hors audience sont arrivés.
- **`getMentionsForMessage` / `getRecentMentionsForUser` n'ont aucun consommateur d'écran** —
  l'inbox `/mentions` reste une capacité backend sans écran (cycle 27, inchangé).
- **`MeeshySocketIOManager.getConversationParticipantsForMention`** est toujours un deuxième
  exemplaire du chargeur de participants (cycle 21, inchangé).
- L'arbitrage `delete-for-me` tranché par le cycle 12 attend toujours une validation humaine.
- **`eslint` ne peut pas tourner sur le gateway** : aucun `eslint.config.js` depuis la migration
  ESLint v9 (`bun run lint` échoue immédiatement). Condition préexistante, non couverte par la CI
  — qui ne gate que sur `test:coverage`.
- **La suppression de branche distante échoue depuis cette routine** (`git push --delete` répond
  « Everything up-to-date » sans agir). Les branches mergées s'accumulent côté remote — à supprimer
  depuis l'interface GitHub.

---

# Cycle 25b — Addendum d'une session parallèle

Deux sessions ont livré le cycle 25 en parallèle. Le refactor des liens de la PR #2650 est
**strictement meilleur** : en réunissant les deux copies, il a trouvé que `createdBy` recevait un
`Participant.id` là où la route `/tracking-links` attend un `User.id` pour AUTORISER l'accès. La
seconde session s'aligne dessus et n'apporte que ce qui manquait — appliqué par-dessus, jamais à la
place. (Leçon d'intégration du cycle 23 : comparer défaut par défaut, jamais « qui est arrivé en
premier ».)

Le cadrage du `@Display Name` social revient au cycle 26 ci-dessus, mieux étayé : les deux clients
insèrent un **handle**, jamais un nom d'affichage. La note de cette session sur le sujet est donc
retirée au profit de la sienne.

## Champ mort retiré — `MentionCreatedEventData.mentionedParticipantId`

Porté par le backlog depuis le cycle 24, vérifié et retiré. Les **trois** émetteurs de
`mention:created` — envoi WS (`MessageHandler`), envoi REST/ZMQ (`MeeshySocketIOManager`), édition
(`emitMentionCreated`) — l'omettent : il n'a jamais circulé sur le fil. Le SDK iOS le décodait dans
`MentionCreatedEvent`, et rien ne lisait la propriété.

Le test de décodage SDK garde la clé dans le JSON **et lui en ajoute une inconnue** : ce qui compte
désormais n'est plus la valeur du champ mais le fait qu'une clé inconnue ne casse pas le décodage —
donc qu'aucun client ne souffre d'une gateway qui l'enverrait encore.

À ne pas confondre avec la colonne physique `Mention.mentionedParticipantId` (Prisma/Mongo), bien
vivante et utilisée par les scripts de migration.

## Écarté après enquête — `getLatestMessageSummary` n'est pas un défaut

Le backlog le portait depuis le cycle 19 : « résume le DERNIER message de la conversation, pas
celui qu'on vient d'acquitter ». **Ce n'en est pas un, et le "corriger" serait une régression.**

iOS applique le `summary` via `bufferBatchDelivery(conversationId:event:)` — un lot au niveau
**conversation**, jamais par message (`ConversationSocketHandler.swift:801`). Le contrat client est
donc « état de livraison de la conversation, ancré sur son dernier message », ce que la méthode
calcule exactement.

Si le serveur résumait le message ACQUITTÉ, lire un vieux message #5 produirait un résumé « lu »
que le client appliquerait **en lot à tous les messages**, y compris #7 non lu. Passer au
par-message demanderait de plumber des reçus par message des deux côtés client : chantier de
contrat, pas correctif. Retiré du backlog comme défaut.
