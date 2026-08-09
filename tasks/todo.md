# Cycle 29 — Le fil d'un post n'héritait d'aucune de ses règles d'audience

Tête laissée par le cycle 28 :
« **`@Display Name` reste inextractible dans le domaine social.** […] **Tête du prochain cycle si
rien de plus grave n'apparaît** — deux cycles de suite, quelque chose de plus grave est apparu. »

Trois cycles de suite. Le défaut annoncé retourne à la file, avec sa raison inchangée.

## Ce qui était ouvert

Les six routes de `routes/posts/comments.ts` et les quatre handlers de réaction socket ne
consultaient **jamais** `Post.visibility`. Un utilisateur authentifié connaissant un `postId`
pouvait, sur un post `PRIVATE` / `ONLY` / `FRIENDS` / `COMMUNITY` :

| surface | ce qu'elle donnait |
|---|---|
| `GET /posts/:postId/comments` | tout le fil — contenu, médias, auteurs |
| `GET .../comments/:commentId/replies` | idem, et sans même regarder le post |
| `POST /posts/:postId/comments` | **écrire** dedans, puis notifier l'auteur |
| `POST`/`DELETE .../like` | réaction persistée sur un commentaire du fil |
| `comment:reaction-add` / `-remove` | idem par socket |
| `post:reaction-add` / `-remove` | réaction sur le post lui-même |

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

## Contrepartie assumée

**Un utilisateur qui perd l'accès à un post ne peut plus retirer une réaction qu'il y avait
laissée.** Elle lui est de toute façon invisible, et une ACL qui dépend du sens du geste est un
footgun ; le retrait suit donc la pose. À rouvrir si un cas d'usage réel apparaît.

## Vérification

- **43 tests neufs**, écrits AVANT l'implémentation, **19 rouges observés** :
  - `__tests__/unit/services/posts/postThreadAccess.test.ts` — 22 cas (les six modes, l'auteur
    toujours admis sur son `PRIVATE`, le contact DM admis en lecture ET refusé en écriture, le post
    résolu depuis le commentaire, la visibilité inconnue qui restreint, la panne qui refuse, les
    court-circuits sans requête).
  - `__tests__/unit/routes/posts/comments-audience.test.ts` — 17 cas sur les cinq routes, dont
    « le `:postId` du chemin ne vaut rien » et « lire est ouvert là où écrire est refusé ».
  - 9 cas d'audience ajoutés aux deux suites de handlers socket, dont « le `postId` du payload
    n'est pas cru ».
- **11 harnais ont dû déclarer leur audience.** C'est voulu, et c'est le même choix qu'au cycle 28 :
  un double qui n'expose pas la tranche ACL échoue au lieu de rendre un verdict par défaut.
- Le wrapper mort `_canUserViewPost` est retiré.
- **Suite gateway complète : 607 suites, 15 731 tests, tout vert** (avant : 605 / 15 682).
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
- **`likePost` / `PostReactionService.addReaction` ne vérifient que l'existence du post** — le
  chemin REST `POST /posts/:postId/like` reste sans garde d'audience, là où son jumeau socket vient
  d'en recevoir une. Non traité ici pour ne pas mêler deux surfaces dans un même lot ; à faire.
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
