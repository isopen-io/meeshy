# Architecture transport / services du gateway — une implémentation métier, N transports

Date : 2026-07-29
Statut : spécification d'architecture, prête pour revue — aucun code modifié
Périmètre : `services/gateway/` (Fastify + Socket.IO + Prisma, exécuté sous Bun)

## Pourquoi ce document

En instrumentant le partage de position, nous avons constaté que **la même opération
métier est implémentée plusieurs fois selon le point d'entrée** — REST, Socket.IO,
routes de lien de partage, chemins internes — et que ces implémentations divergent
silencieusement. Le chemin REST d'envoi de message ne hissait ni `postReplyTo` ni
`trackingLinks` ; les routes de lien de partage écrivent en base sans passer par le
service de messagerie ; le feed n'applique pas les enrichissements des routes
unitaires. Personne ne l'avait vu, parce que rien ne le signale.

L'exigence est double, et les deux moitiés ne se contredisent pas :

1. **Une seule implémentation métier** par opération, quel que soit le transport
   (REST, WebSocket, gRPC futur, job interne).
2. **Le transport reste connaissable de bout en bout** : un service doit pouvoir
   savoir qu'il a été appelé par REST, socket ou un job interne, parce que certaines
   décisions en dépendent légitimement (idempotence, exclusion de l'émetteur d'un
   broadcast, limites de débit, traçabilité).

Ce document établit d'abord l'inventaire réel des duplications (§1, chaque
divergence citée fichier:ligne), puis l'architecture cible (§2), le contrat du
contexte d'appel (§3), la frontière transport/métier (§4), un plan de migration
incrémental (§5) et des garde-fous exécutables (§6).

Sauf mention contraire, les chemins sont relatifs à `services/gateway/src/`.

---

## 1. Constat — l'inventaire des duplications

### 1.1 Résumé chiffré

19 opérations ou mécanismes existent en plusieurs exemplaires divergents selon
le point d'entrée. Chaque ligne est détaillée, avec preuves fichier:ligne, dans
la sous-section indiquée.

| # | Opération / mécanisme | Exemplaires | Détail |
|---|---|---|---|
| 1 | Envoi de message | 10 points d'entrée, dont 5 contournent le funnel `MessagingService` ; 3 broadcasts distincts | §1.2 |
| 2 | Édition de message | 4 implémentations Prisma directes, aucune partagée | §1.2 |
| 3 | Suppression de message | 3 implémentations Prisma directes, aucune partagée | §1.2 |
| 4 | Broadcast `message:new` | 2 implémentations (~250 lignes miroir) + variante lien | §1.2 |
| 5 | Réaction message | service unique, mais 3 périphéries divergentes (REST/socket/agent) | §1.3 |
| 6 | Réaction post | 2 chemins d'écriture (JSON `post.reactions` REST-only) | §1.3 |
| 7 | Réaction commentaire | 2 services complets, invariants opposés | §1.3 |
| 8 | Réaction pièce jointe | 1 transport, aucune garde partagée | §1.3 |
| 9 | Flags personnels de lecture (posts) | 2 enrichisseurs, 8 trous mesurés | §1.4 |
| 10 | Hoist `trackingLinks` | 3 copies identiques | §1.4 |
| 11 | Collecte `mentionedUsers` | 4 variantes | §1.4 |
| 12 | Émission `post:updated` / audience story | 3 producteurs, 2 résolutions d'audience | §1.4 |
| 13 | Rejoindre une conversation | 5 écritures Prisma directes, 4 jeux de permissions | §1.5 |
| 14 | Quitter une conversation | 2 sémantiques homonymes + retrait admin divergent | §1.5 |
| 15 | Demande de traduction | 1 service, 3 gardes d'accès divergentes (dont 2 absentes) | §1.6 |
| 16 | Retraduction après édition | 2 API (publique vs privée castée `any`) | §1.6 |
| 17 | Appels (initiate/join) | données partagées, effets temps réel socket-only | §1.7 |
| 18 | Authentification | 2 implémentations (middleware REST vs `AuthHandler` socket) | §1.8 |
| 19 | Garde de blocage DM | 3 états : socket (avec cache), REST (sans cache), liens (absente) | §1.2 |

### 1.2 Envoi / édition / suppression de message

C'est l'opération centrale du produit, et la plus fragmentée.

#### Envoi : un funnel existe, la moitié des chemins l'évite

Le funnel commun est `MessagingService.handleMessage`
(`services/messaging/MessagingService.ts:58`) → `MessageProcessor.saveMessage`
(`services/messaging/MessageProcessor.ts:329`). Il porte : dedup
`clientMessageId` (catch P2002, `MessageProcessor.ts:527-599`), chiffrement
(`:383-391`), tracking links (`:414-416`), snapshot `postReplyTo` (`:406-408`),
position (`:424-429`), mentions (`:656-660`), notifications (`:969-1159`), bump
`lastMessageAt` (`MessagingService.ts:341-346`), file de traduction (`:329-331`),
stats (`:333-335`).

| # | Point d'entrée | Implémentation réelle |
|---|---|---|
| S1 | socket `message:send` (`MeeshySocketIOManager.ts:916` → `MessageHandler.ts:157`) | funnel (`MessageHandler.ts:298`) |
| S2 | socket `message:send-with-attachments` (`:920` → `MessageHandler.ts:358`) | funnel (`:497`) |
| S3 | REST `POST /conversations/:id/messages` (`routes/conversations/messages.ts:1588`) | funnel (`:1793`) |
| S4 | REST lien anonyme `POST /links/:identifier/messages` (`routes/links/messages.ts:32`) | **`prisma.message.create` direct (`:210`)** |
| S5 | REST lien authentifié `…/messages/auth` (`routes/links/messages.ts:304`) | **Prisma direct (`:475`)** |
| S6 | agent ZMQ (`MeeshySocketIOManager.ts:2439`) | funnel puis broadcast B (`:2452`) |
| S7 | `POST /translate` cas « nouveau message » (`routes/translation-non-blocking.ts:379`) | funnel, **aucun broadcast** |
| S8 | message système chiffrement (`routes/conversation-encryption.ts:251`) | Prisma direct |
| S9 | message système d'appel (`services/CallService.ts:2437`, `:2527`) | Prisma direct + broadcast B injecté |
| S10 | `MessageTranslationService._saveMessageToDatabase` (`services/message-translation/MessageTranslationService.ts:321`) | Prisma direct |

**Le chemin lien de partage (S4/S5) contourne tout le pipeline.** Le
contournement est assumé en commentaire (`routes/links/messages.ts:195-209`).
Manquent, par comparaison au funnel : traduction (aucune référence dans le
fichier — dans un produit dont la traduction est la proposition de valeur, les
messages des conversations par lien ne sont **jamais traduits**) ; mentions et
notifications ; contexte de chiffrement (message stocké en clair même dans une
conversation chiffrée) ; `replyToId`/`forwardedFromId`/`effectFlags`/
`isViewOnce`/`expiresAt` (absents du `data` de création, `:211-220`, `:476-485`) ;
pièces jointes (le champ `attachments` du schéma, `routes/links/types.ts:78`,
n'est jamais lu) ; bump `lastMessageAt` ; garde de blocage DM ; dedup P2002.
Toute règle ajoutée demain dans `MessageProcessor` sera absente de ces
conversations.

**Même sur le chemin REST « propre » (S3), la requête est appauvrie.** L'objet
`messageRequest` construit en `routes/conversations/messages.ts:1763-1791` omet
`storyReplyToId` — pourtant accepté par le schéma de la route (`:111`, `:1615`)
et destructuré (`:1673`). Le socket le transmet (`MessageHandler.ts:273`,
`:482`). Conséquence : `MessageProcessor.ts:406-408` ne capture jamais le
snapshot `postReplyTo` depuis REST — répondre à une story via REST perd la
citation. C'est le bug qui a déclenché ce document, et il illustre le mode de
défaillance général : **la parité entre transports repose sur la recopie
manuelle d'une liste de champs, sans aucun contrôle.**

#### Le broadcast `message:new` : deux implémentations miroir de ~250 lignes

- **A** — `MessageHandler.broadcastNewMessage`
  (`socketio/handlers/MessageHandler.ts:860-1144`), utilisée par S1/S2.
- **B** — `MeeshySocketIOManager._broadcastNewMessage`
  (`socketio/MeeshySocketIOManager.ts:1852-2113`), utilisée par S3 (via
  `broadcastMessage`, `:2153-2159`, appelé de
  `routes/conversations/messages.ts:1814`), S6 et S9.

B ré-implémente bloc par bloc A — normalisation d'id, stats, payload, hoist,
émission par langue, mentions, `conversation:updated`, unread, file offline —
et les commentaires du code l'assument (« Miroir de
MessageHandler.broadcastNewMessage », `MeeshySocketIOManager.ts:1946-1947`,
`:2017`, `:2071-2072`). Les divergences mesurées du payload B
(`MeeshySocketIOManager.ts:1888-1939`) par rapport à A :

- **pas de `clientMessageId`** (A : `MessageHandler.ts:1494`, avec split
  expéditeur/pairs `:970-1007`) → la réconciliation optimiste multi-device est
  impossible après un envoi REST ;
- **pas de `postReplyTo`** (A : `:916-929`), **pas de `trackingLinks`**
  (A : `:938-948`) — les deux absences constatées en production ;
- **pas de `mentionedUsers` résolus** (A : `:931-936`), pas de
  `forwardedFrom`/`forwardedFromConversation` enrichis (A : `:890-909`) ;
- **aucun champ E2EE** (A : `:1525-1532`). Or un message E2EE est stocké avec
  `content: ''` (`MessageProcessor.ts:442`) : un message chiffré envoyé par
  REST est diffusé **vide, sans ciphertext** — les destinataires connectés ne
  reçoivent rien d'exploitable ;
- attachments bruts (`:1918`) au lieu de la sérialisation garantissant
  transcription et traductions (A : `:1517`, `:1546-1550`) ;
- **bug d'exclusion de l'expéditeur** : B filtre `p.id !== senderId`
  (`:2049`) où `senderId` est un **User.id** sur le chemin REST
  (`MessagingService.ts:473-480`) alors que `p.id` est un Participant.id — le
  filtre ne matche jamais ; l'expéditeur reçoit un `conversation:unread-updated`
  pour son propre message et peut se voir enfiler son propre message dans la
  file offline (`:2077-2084`). A gère les deux espaces d'id (`_isSender`,
  `MessageHandler.ts:1265-1270`).

S'y ajoutent des effets uniquement côté A : réveil de l'agent ZMQ
(`MessageHandler.ts:319-332` ; le jumeau `MeeshySocketIOManager._notifyAgent`
`:2592-2620` n'est jamais appelé depuis B — un message REST ne réveille jamais
l'agent) et stats de messages (`:334-337`). Et le chemin lien (S4/S5) émet un
événement **différent**, `LINK_MESSAGE_NEW`, room construite à la main,
sans `conversation:updated`, sans unread, sans file offline
(`routes/links/messages.ts:258-274`, `:523-539`).

#### Édition : quatre implémentations, aucune ne passe par un service

| | E1 socket `message:edit` (`MessageHandler.ts:570`) | E2 `PUT /messages/:id` (`routes/messages.ts:201`) | E3 `PUT /conversations/…/:id` (`routes/conversations/messages-advanced.ts:57`) | E4 `PATCH /messages/:id` (`messages-advanced.ts:694`) |
|---|---|---|---|---|
| Permission | auteur (`:601`) | auteur (`:219`) | auteur **ou** modérateur global (`:162-183`) | auteur (`:770`) |
| Fenêtre 24 h | — | — | ✅ (`:146-159`) | — |
| Rate limit | ✅ 20/min (`:591-596`) | — | — | — |
| Garde `deletedAt` concurrente | ✅ (`:634-647`) | ✅ (`:253-264`) | ❌ `update` par id nu (`:222`) — un delete concurrent ressuscite le message | ❌ (`:792`) |
| Mentions ré-extraites + notifiées | — | — | ✅ (`:282-425`) | — |
| `trackingLinks` retraités | — | — | ✅ (`:204-219`) | — |
| Invalidation `translations` | atomique (`:640`) | write séparé (`:284-287`) | write séparé (`:436-439`) | atomique (`:798`) |
| Retraduction | API publique (`:667`) | méthode **privée** via `as any` (`:300`) | idem (`:452`) | idem (`:826`) |
| File offline `edited` | ✅ (`:693-695`) | ❌ | ❌ | ❌ |

Quatre clients qui éditent le même message par quatre portes obtiennent quatre
politiques différentes — jusqu'à la question de savoir si les mentions ajoutées
à l'édition notifient (E3 seulement) ou si l'édition est bornée à 24 h (E3
seulement).

#### Suppression : trois implémentations, trois politiques de permission

| | D1 socket (`MessageHandler.ts:712`) | D2 `DELETE /messages/:id` (`routes/messages.ts:359`) | D3 `DELETE /conversations/…` (`messages-advanced.ts:518`) |
|---|---|---|---|
| Permission | auteur ∨ admin/modo de conversation ∨ rôle global (`:766-779`) | idem + CREATOR (`:406-416`) | auteur ∨ **rôle global seulement** (`:587-609`) — un admin de conversation ne peut pas supprimer par cette route |
| Recalcul `lastMessageAt` | ✅ (`:805-818`) | ✅ (`:453-470`) | ❌ absent — la liste de conversations reste ancrée sur le message supprimé |
| Écriture | 1 write atomique (`:794-797`) | 2 writes (`:435-446`) | 2 writes (`:628-639`) |
| File offline `deleted` | ✅ avec exclusion du suppresseur (`:844-847`) | ❌ | ❌ |
| Rate limit | ✅ (`:733-738`) | ❌ | ❌ |

Enfin, transverse à l'envoi : la **garde de blocage DM** existe en trois états —
socket avec cache 5 min (`MessageHandler.ts:1677-1716`), REST ré-implémentée
inline sans cache (`routes/conversations/messages.ts:1724-1747`), liens : absente.
Et le rate-limiting REST des messages est inexistant :
`registerMessageRateLimiter` (`middleware/rate-limiter.ts:20`) n'est appelé
nulle part ; seul le limiteur global 300 req/min/IP est branché
(`server.ts:604`).

### 1.3 Réactions — quatre familles, deux transports, presque tout diverge

Quatre familles de réactions (message, post, commentaire, pièce jointe), chacune
avec sa propre paire route REST / handler socket, et des degrés de partage très
inégaux.

**Réactions de message — le seul chemin correctement unifié.** REST
(`routes/reactions.ts:163`, `:352`) et socket
(`socketio/handlers/ReactionHandler.ts:113`, `:252`) appellent la même méthode
`ReactionService.addReaction`/`removeReaction` (`services/ReactionService.ts:64`).
Les gardes (message supprimé, message système, appartenance) vivent dans le
service et s'appliquent donc aux deux transports. C'est le modèle à généraliser.
Mais même ici, la périphérie diverge :

- **File de livraison hors-ligne : socket seulement.** Le handler socket enfile
  l'événement pour les pairs déconnectés (`ReactionHandler.ts:188`, `:291` →
  `_enqueueOfflineReactionEvent` `:433-463`) ; la route REST ne le fait jamais
  (aucun enqueue dans `routes/reactions.ts:199-226`). Une réaction posée via REST
  — le chemin de l'outbox iOS — n'atteint jamais un pair hors-ligne.
- **Rate limit : socket seulement.** 30/min côté socket
  (`ReactionHandler.ts:94-102`, barèmes `utils/socket-rate-limiter.ts:168-177`) ;
  aucune limite sur `POST /api/reactions` ni `DELETE` (zéro occurrence de
  `rateLimit` dans `routes/reactions.ts`).
- **Troisième variante pour l'agent IA** : `MeeshySocketIOManager.ts:2553` émet la
  réaction sans normalisation de room, sans enqueue offline, et notifie via un
  chemin différent (`:2563-2570`) de celui des deux autres transports
  (`services/notifications/reactionNotify.ts:22-66`).

**Réactions de post — deux écritures différentes en base.** Le REST passe par
`PostService.likePost` (`routes/posts/interactions.ts:56` →
`services/PostService.ts:816`) qui appelle le service de réaction **puis réécrit
le JSON dénormalisé `post.reactions` et `likeCount`**
(`PostService.ts:845-851`). Le socket appelle directement
`PostReactionService.addReaction` (`socketio/handlers/PostReactionHandler.ts:172`)
qui met à jour `reactionSummary`/`reactionCount`/`likeCount`
(`services/PostReactionService.ts:330-365`) **mais jamais `post.reactions`**. Le
champ n'est donc à jour que si les utilisateurs ont réagi par REST — dette
documentée dans le code lui-même (`services/PostFeedService.ts:989-992`).
S'y ajoutent :

- **Sémantique de suppression divergente** : REST supprime la première réaction
  trouvée du user quel que soit l'emoji (`PostService.ts:866-874`) ; socket
  supprime exactement l'emoji demandé (`PostReactionHandler.ts:278-282`).
- **Événements divergents pour stories et statuts** : REST route par type —
  `story:reacted`, `status:reacted` (`interactions.ts:78-89`) ; la branche socket
  ne connaît que POST/REEL (`PostReactionHandler.ts:105`) et émet
  `post:reaction-added` pour tout le reste (`:121-122`). Une réaction ❤️ posée sur
  une story via socket n'émet jamais `story:reacted`.
- Idempotence `withMutationLog` en REST seulement (`interactions.ts:50-67`) ;
  rate limit sur le POST mais pas sur le DELETE REST (`interactions.ts:133-135`).

**Réactions de commentaire — deux services complets, comportements opposés.**
REST → `PostCommentService.likeComment` (`routes/posts/comments.ts:342` →
`services/PostCommentService.ts:359-429`, Prisma direct) ; socket →
`CommentReactionService.addReaction` (`socketio/handlers/CommentReactionHandler.ts:117`
→ `services/CommentReactionService.ts:85`). `CommentReactionService` n'est jamais
appelé depuis REST. Conséquences mesurables :

- **L'invariant « une réaction max » est interprété à l'opposé** : REST purge
  silencieusement les autres emojis (`PostCommentService.ts:375-377`) ; socket
  lève une erreur (`CommentReactionService.ts:123-125`).
- **Le unlike REST n'est jamais diffusé** : `comments.ts:409-414` retourne sans
  aucun événement, là où le socket émet `comment:reaction-removed`
  (`CommentReactionHandler.ts:261`). Les autres clients gardent un compteur
  périmé, définitivement.
- **Deux familles d'événements et deux types de notification** pour le même
  geste : `comment:liked` + `createCommentLikeNotification` en REST
  (`comments.ts:350-356`, `:377-385`) vs `comment:reaction-added` +
  `createCommentReactionNotification` en socket (`CommentReactionHandler.ts:162`,
  `:364-376`).

**Réactions de pièce jointe — un seul transport, aucune garde partagée.**
Socket uniquement (`socketio/handlers/AttachmentReactionHandler.ts:44-60`), pas de
route REST. Pas de validation Zod (`:67-70`), pas de garde message
supprimé/système (`services/AttachmentReactionService.ts:26-69`, à comparer à
`ReactionService.ts:99-105`), aucune notification.

Enfin, **une garde commune manque partout** : `canUserViewPost` n'est vérifié que
sur `post:join` (`PostReactionHandler.ts:421-425`), jamais sur la réaction
elle-même — et la version commentaire est du code mort
(`CommentReactionHandler.ts:382-391`, définie, jamais appelée). On peut réagir à
un post qu'on n'a pas le droit de voir, par les deux transports.

### 1.4 Posts, commentaires, stories — routes unitaires vs listes

Ici la duplication n'oppose pas REST à socket (la création est exclusivement
REST ; la surface socket entrante se limite aux réactions et aux abonnements
feed, `MeeshySocketIOManager.ts:974-1084`), mais **la lecture unitaire à la
lecture en liste**, et les **émetteurs d'événements entre eux**.

**Deux enrichisseurs de flags personnels, jamais réconciliés.** La lecture
unitaire calcule `isLikedByMe`/`isBookmarkedByMe`/`isRepostedByMe`/
`currentUserReactions` dans `PostService.getPostById`
(`services/PostService.ts:516-539`) ; les listes recalculent ces mêmes flags dans
`PostFeedService`, avec un assemblage réécrit **dans chaque méthode**
(`services/PostFeedService.ts:232-237`, `:376-380`, `:630-634`, `:772`,
`:791-794`, `:838`, `:857-860`, `:911`). Les deux blocs se citent mutuellement en
commentaire comme « miroirs » (`PostService.ts:511-515`, `PostFeedService.ts:611-612`)
— affirmation de parité, pas partage de code. Résultat, une matrice de trous :

| Surface | Manque |
|---|---|
| `getBookmarks` (`PostFeedService.ts:911`) | `isLikedByMe` (seule liste sans `enrichWithLikeStatus`) et `isBookmarkedByMe` — sur l'écran Favoris, où 100 % des items sont des favoris |
| `getStatuses` / `getDiscoverStatuses` (`:435`, `:475`) | tous les flags personnels ; et l'`include` Prisma est réduit à l'auteur (`:427-429`, `:467-469`) — pas de media, pas de commentaires — sans documentation |
| `getReels` (`:630-634`) | `isRepostedByMe` (présent dans le feed, `:236`) |
| `getStories` (`:376-380`) | `isBookmarkedByMe`, `isRepostedByMe` |
| `getUserPosts` viewer anonyme (`:772`) | champ absent, là où l'unitaire renvoie `false` explicite (`PostService.ts:505`) |

Et l'inverse : `isViewedByMe` n'existe **que** dans `getStories`
(`PostFeedService.ts:378`) — la lecture unitaire d'une story ne le calcule
jamais (`PostService.ts:533-539`), et utilise `postInclude` au lieu de
`storyPostInclude` (`PostService.ts:496` vs `PostFeedService.ts:304`) : la même
story a deux formes selon la surface qui la sert.

**Le hoist des champs dérivés : à moitié factorisé.** La position a une source
unique (`services/location/sharedPlace.ts:89-121`, `hoistLocationOnto`/
`hoistLocationDeep`) appelée par les routes unitaires et les 9 surfaces de liste
— c'est le modèle qui marche. `trackingLinks`, lui, existe **en trois copies
locales identiques** : `routes/posts/core.ts:23-30`, `routes/posts/comments.ts:21-28`,
`socketio/handlers/MessageHandler.ts:942-948`. Et la couverture diverge : hissé
sur le payload socket de création (`core.ts:95`) mais pas sur le broadcast
`post:updated` (`core.ts:324`), ni sur aucune liste.

**`post:updated` a trois producteurs inégaux.** La route PUT hisse la position
(`core.ts:324-334`) ; la fin de transcription audio republie le post **sans
hoist** (`services/posts/PostAudioService.ts:316-328`) ; et
`StoryTextObjectTranslationService` émet directement sur `io` en réimplémentant
la résolution d'audience de `SocialEventsHandler`
(`services/posts/StoryTextObjectTranslationService.ts:142`, `:157`, `:215-253`,
miroir assumé en commentaire de
`socketio/handlers/SocialEventsHandler.ts:172-196`) — avec une audience
différente : ses émissions n'atteignent que les rooms feed, jamais la room du
post.

### 1.5 Rejoindre / quitter une conversation — aucun service, cinq écritures

Il n'existe **aucun service de participation** : les cinq chemins qui créent un
`Participant` sont des écritures Prisma directes dans les routes, chacun avec
ses propres défauts de permissions :

| Chemin | Écriture | Permissions accordées |
|---|---|---|
| Création de conversation | `routes/conversations/core.ts:996-1016` | jeu n° 1 (`:974-982`) |
| Ajout par un admin | `routes/conversations/participants.ts:327` | jeu n° 2 (`:336-344`) — **seul chemin accordant `canSendAudios`/`canSendVideos`** |
| Join par lien (compte) | `routes/conversations/sharing.ts:589` | jeu n° 3 (`:596-604`, audio/vidéo refusés) |
| Invitation | `routes/conversations/sharing.ts:810` | jeu n° 4 (`:817-825`) |
| Join anonyme | `routes/anonymous.ts:391` | dérivées du lien (`:400-408`) |

Le même rôle `member` reçoit donc quatre jeux de permissions différents selon la
porte d'entrée. Les effets de bord divergent tout autant :

- **Le join anonyme est totalement silencieux** : `routes/anonymous.ts:391-464`
  écrit le participant et répond — aucun événement socket, aucune notification,
  aucun `joinUserToConversationRoom` (aucune référence à ces symboles dans le
  fichier). Les membres présents découvrent l'anonyme au prochain refetch.
- **Le join par lien (compte) n'émet ni `CONVERSATION_JOINED` ni
  `CONVERSATION_NEW`** (`sharing.ts:504-689`), là où l'ajout par admin émet les
  deux (`participants.ts:357`, `:383`) et notifie (`:399`, `:411`).
- **`conversation:leave` socket et `POST /leave` REST sont homonymes mais pas
  synonymes** : le premier quitte la room sans rien écrire en base
  (`socketio/handlers/ConversationHandler.ts:189`), le second écrit
  `isActive:false`/`leftAt` (`routes/conversations/leave.ts:64`) — sans notifier
  les admins, contrairement au retrait par admin (`participants.ts:556`).
- Contrôles asymétriques au join socket : `bannedAt`/`leftAt`/`isActive` vérifiés
  pour un compte (`ConversationHandler.ts:107-137`), seul `isActive` pour un
  anonyme (`:92-95`).

### 1.6 Traduction — même service, gardes d'accès par transport

Les transports convergent bien sur une instance unique de
`MessageTranslationService` (`server.ts:362`, entrée commune `handleNewMessage`,
`services/message-translation/MessageTranslationService.ts:188`). Mais **les
contrôles d'accès sont restés dans les adaptateurs**, et ils divergent :

- **`POST /translate-blocking` est accessible sans authentification**
  (`routes/translation.ts:275-305`, aucun `preValidation`/`preHandler`), et son
  contrôle d'appartenance est conditionné à `if (userId)`
  (`translation.ts:341-348`) : sans auth, `request.user` est `undefined` et la
  garde est **sautée** — n'importe qui connaissant un `message_id` obtient le
  contenu traduit. Le chemin socket équivalent vérifie systématiquement
  l'appartenance (`MeeshySocketIOManager.ts:1193-1206`). Même classe de trou sur
  `GET /status/:messageId/:language` (`routes/translation-non-blocking.ts:406-435`)
  et sur `routes/voice/translation.ts:44`, `:210`.
- **Le jeu de langues cibles diffère par transport** : REST impose une
  `target_language` unique (`translation.ts:380`,
  `translation-non-blocking.ts:319`) et court-circuite la résolution des langues
  de conversation (`MessageTranslationService.ts:450-452`) ; le chemin socket
  « nouveau message » traduit vers toutes les langues de la conversation
  (`:455`, `_extractConversationLanguages` `:721`).
- **La retraduction après édition emprunte deux API différentes** : le socket
  appelle l'API publique fire-and-forget `retranslateMessageAsync`
  (`socketio/handlers/MessageHandler.ts:667`) ; le REST appelle la **méthode
  privée** via cast `(translationService as any)._processRetranslationAsync` et
  l'attend (`routes/messages.ts:301`) — la requête REST porte la latence ZMQ.
- Rate limit : 10/min côté socket (`MeeshySocketIOManager.ts:939-949`), aucun
  côté REST.

### 1.7 Appels — un service partagé, des effets de bord socket-only

REST et socket partagent la même instance `CallService` (`routes/calls.ts:81`,
`server.ts:821-825` ; méthodes communes `services/CallService.ts:830`, `:1150`,
`:1362`, `:1733`). Le métier « données » est unifié. Mais **tous les effets de
bord temps réel sont restés dans le handler socket** :

- **`POST /calls` ne fait sonner personne** : le handler REST s'arrête à
  `initiateCall` + 201 (`routes/calls.ts:200-208`). Pas de `CALL_EVENTS.INITIATED`
  aux membres, pas de message d'appel dans la conversation
  (`socketio/CallEventsHandler.ts:1788`), pas de timeout de sonnerie
  (`:1869`), **pas de push VoIP** (`:1875-1947`). Un appel initié par REST
  n'existe que pour son initiateur, jusqu'au passage du GC.
- **`POST /calls/:callId/participants` (join REST) n'informe personne**
  (`routes/calls.ts:605`) — pas de `call:participant-joined`, pas de room, pas
  d'`iceServers` — le socket fait tout cela (`CallEventsHandler.ts:2069-2098`).
- `routes/calls.ts` ne contient aucun `io`/`CALL_EVENTS` : la diffusion REST
  repose sur deux ponts ajoutés au service (`CallService.ts:286`, `:314`,
  câblés `server.ts:1339`) qui ne couvrent que end/leave. Initiate et join n'ont
  pas de pont.
- **Le miroir push multi-devices est exclusivement socket**
  (`services/call-push-mirroring.ts:36`, `:63`, importé uniquement par
  `CallEventsHandler.ts:22`) : raccrocher via REST ne fait taire aucun autre
  device.
- Un appel devenu `missed` via REST n'envoie jamais la notification d'appel
  manqué (`finalizeCallSummary` ne déclenche pas `handleMissedCall`, à comparer à
  `CallEventsHandler.ts:3259-3264`).
- Gardes anonymes asymétriques : le socket refuse les anonymes sur initiate/join/end
  (`:1666`, `:1987`, `:3129`) mais pas sur `call:leave` (`:2251-2311`).

### 1.8 L'infrastructure transversale existe déjà — par transport

Le paradoxe du gateway : presque tous les ingrédients de la solution existent,
mais chacun n'est câblé que pour un transport.

| Ingrédient | Existe | Limité à |
|---|---|---|
| Contexte d'identité unifié | `UnifiedAuthContext` (`middleware/auth.ts:46-70`) : type user/anonyme, permissions, langue | REST (middleware Fastify). Le socket ré-implémente l'authentification (`socketio/handlers/AuthHandler.ts:148`, `:235`) |
| Corrélation | `X-Request-ID` (`middleware/request-id.ts:14-27`) | REST |
| Idempotence | `X-Client-Mutation-Id` + `withMutationLog` (`middleware/clientMutationId.ts:53`, `utils/withMutationLog.ts`) ; `clientMessageId` sur les messages | REST (cmid) ; messages (clientMessageId) |
| Étiquette de transport | `MessageRequestMetadata.source: 'websocket' \| 'rest' \| 'api'` (`packages/shared/types/messaging.ts:48`, `:76`) | écrite à 4 endroits (`MessageHandler.ts:291`, `:491`, `routes/conversations/messages.ts:1788`, `MeeshySocketIOManager.ts:2423`), **lue nulle part** (aucun consommateur dans le code) |
| Erreur métier portable | `BaseAppError { statusCode, code }` (`errors/custom-errors.ts:10-23`) + `errorHandler` | le mapper est exclusivement Fastify (`custom-errors.ts:239`) ; les handlers socket renvoient des chaînes libres |
| Émission d'événements depuis une route | `broadcastToUser` (`utils/socket-broadcast.ts:49`) ; `SocialEventsHandler` (émetteur pur) | trois mécanismes concurrents, plus les émissions directes sur `io` (`StoryTextObjectTranslationService.ts:142`) et `_broadcastNewMessage` |

Le diagnostic tient en une phrase : **le gateway a des services, mais la
frontière n'est pas étanche** — les adaptateurs de transport font du métier
(écritures Prisma, notifications, événements), et les capacités transversales
(identité, corrélation, idempotence, limites, erreurs) sont implémentées par
transport au lieu d'être portées par un contexte commun.

---

## 2. Architecture cible

### 2.1 Principe

Deux couches, une règle de dépendance, un objet qui circule.

```
┌────────────────────────────────────────────────────────────────┐
│  TRANSPORTS (adaptateurs)                                      │
│  REST (Fastify)   Socket.IO   gRPC (futur)   Interne (jobs,    │
│                                              agent IA, cron)   │
│  – authentifie, construit le CallContext                       │
│  – valide la FORME du payload (schéma wire)                    │
│  – appelle UNE méthode de service                              │
│  – met en forme la réponse (HTTP / ack / statut gRPC)          │
│  – mappe les erreurs métier vers son vocabulaire               │
└───────────────┬────────────────────────────────────────────────┘
                │ CallContext + commande typée
┌───────────────▼────────────────────────────────────────────────┐
│  SERVICES (métier)                                             │
│  MessagingService, ReactionService, ParticipationService,      │
│  CallService, MessageTranslationService, PostService…          │
│  – seule couche qui écrit en base                              │
│  – seule couche qui décide des règles (permissions, invariants,│
│    compteurs, hoist, notifications)                            │
│  – publie des ÉVÉNEMENTS DE DOMAINE (jamais d'io direct)       │
└───────────────┬────────────────────────────────────────────────┘
                │ événements de domaine
┌───────────────▼────────────────────────────────────────────────┐
│  DISPATCHER D'ÉVÉNEMENTS (une seule implémentation)            │
│  – résout l'audience (rooms, visibilité) UNE fois              │
│  – émet Socket.IO, enfile la file offline, déclenche le push   │
└────────────────────────────────────────────────────────────────┘
```

Règles de dépendance :

- `services/**` n'importe jamais `socket.io`, `fastify`, ni les types de
  handlers. Il dépend du `CallContext` (type partagé) et du port d'événements.
- `routes/**` et `socketio/handlers/**` n'appellent jamais
  `prisma.<modèle>.create/update/delete` : toute mutation passe par un service.
  (Les lectures simples de présentation peuvent rester en route pendant la
  migration ; les mutations, jamais.)
- Le dispatcher d'événements est le seul code qui traduit un événement de
  domaine en événements Socket.IO, entrées de file offline et pushes.

Ce n'est pas une architecture nouvelle pour ce dépôt : c'est la généralisation
de ce qui marche déjà. `ReactionService` (messages) est déjà l'implémentation
unique de deux transports (§1.3) ; `hoistLocationDeep` est déjà la source unique
du hoist position (§1.4) ; `CallService` est déjà partagé pour les données
(§1.7). La cible consiste à rendre ce motif obligatoire et outillé, pas à
introduire un framework.

### 2.2 Ce que fait — et ne fait pas — un adaptateur

Un adaptateur (route Fastify, handler Socket.IO, futur service gRPC, appelant
interne) a exactement quatre responsabilités :

1. **Authentifier** et construire le `CallContext` (§3) — une fois par
   connexion pour le socket, une fois par requête pour REST.
2. **Valider la forme** du payload entrant (JSON-Schema Fastify, Zod socket,
   proto gRPC) — la forme, pas les règles. « `emoji` fait entre 1 et 10
   caractères » est de la forme ; « on ne réagit pas à un message supprimé » est
   une règle, elle vit dans le service.
3. **Appeler une méthode de service** en lui passant le contexte et une commande
   typée.
4. **Formater la sortie** : enveloppe HTTP, ack socket, statut gRPC — y compris
   la traduction des erreurs métier (§2.6).

Tout le reste — permissions, invariants, écritures, compteurs, hoist,
notifications, événements, file offline — est du métier et vit dans le service.

### 2.3 Émettre un événement sans connaître Socket.IO

Le problème mesuré : chaque site d'émission ré-implémente l'audience et les
effets de bord. `_broadcastNewMessage` réimplémente le broadcast du
`MessageHandler` ; `StoryTextObjectTranslationService` réimplémente la
résolution d'audience de `SocialEventsHandler` avec un résultat différent
(§1.4) ; le unlike REST de commentaire n'émet rien (§1.3) ; l'appel REST ne
sonne pas (§1.7). À chaque fois, la cause est la même : **l'émission est une
responsabilité du site d'appel** au lieu d'être une conséquence du fait métier.

Cible : les services publient des **événements de domaine** — des faits, pas des
trames socket :

```ts
// services/events/domain-events.ts (nouveau, sans dépendance socket.io)
export type DomainEvent =
  | { type: 'message.created';  ctx: CallContext; message: MessageSnapshot }
  | { type: 'message.updated';  ctx: CallContext; message: MessageSnapshot }
  | { type: 'reaction.changed'; ctx: CallContext; target: ReactionTarget;
      action: 'added' | 'removed' | 'swapped'; summary: ReactionSummary }
  | { type: 'participant.joined'; ctx: CallContext; conversationId: string;
      participant: ParticipantSnapshot }
  | { type: 'call.initiated'; ctx: CallContext; call: CallSnapshot }
  | { type: 'post.updated'; ctx: CallContext; post: PostSnapshot }
  // …

export interface DomainEventPublisher {
  publish(event: DomainEvent): void; // fire-and-forget, jamais bloquant
}
```

Un **dispatcher unique**, situé dans la couche socketio (il a le droit de
connaître `io`), s'abonne et concentre ce qui est aujourd'hui éparpillé :

- résolution d'audience (rooms conversation/post/feed/user, filtrage par
  visibilité — l'actuel `SocialEventsHandler.getVisibilityFilteredRecipients`
  devient LA seule implémentation) ;
- normalisation des identifiants de room (l'actuel `normalizeConversationId`,
  aujourd'hui appliqué côté socket et oublié côté REST, §1.3) ;
- exclusion de l'émetteur (via `ctx.socketId`, voir §3) ;
- enfilage dans la file de livraison hors-ligne (aujourd'hui socket-only) ;
- déclenchement des pushes (VoIP pour `call.initiated`, miroir
  `call_answered_elsewhere`, notifications) quand le fait l'exige.

Conséquence directe : quand un service publie `reaction.changed`, le broadcast,
la file offline et la notification se produisent **quel que soit le transport
d'origine** — le bug « unlike REST jamais diffusé » devient inexprimable.

Le choix d'implémentation (interface injectée + implémentation socketio, ou
`EventEmitter` typé) est laissé à l'implémenteur ; la contrainte architecturale
est : *une* implémentation, *aucun* `io.emit` hors du dispatcher et des
handlers de transport, et le `CallContext` embarqué dans chaque événement.

### 2.4 Les participants anonymes ne sont pas un transport

La principale source de contournement actuelle (routes de lien de partage,
`routes/links/messages.ts` ; join anonyme, `routes/anonymous.ts`) traite
« anonyme » comme un chemin de code parallèle. C'est une erreur de
catégorie : **anonyme est une identité, pas un transport**. Le middleware
d'authentification sait déjà produire un contexte anonyme complet — permissions
résolues depuis le lien, langue, `participantId`
(`middleware/auth.ts:365-452`) ; `MessageValidator.checkPermissions` sait déjà
vérifier les droits d'un anonyme (`services/messaging/MessageValidator.ts`).

Cible :

- Les routes `links/*` et `anonymous.ts` deviennent des adaptateurs ordinaires :
  elles construisent un `CallContext` avec un acteur `anonymous` et appellent
  les **mêmes** services (`MessagingService.handleMessage`,
  `ParticipationService.join`) que tout le monde.
- Les règles spécifiques aux anonymes (pas de notification de réaction,
  `reactionNotify.ts:32` ; permissions de lien ; refus des appels) restent des
  règles **métier**, exprimées dans les services sur `ctx.actor.kind`, pas des
  routes parallèles.
- Bénéfice immédiat et mesurable : les messages des conversations par lien
  passent par `MessageProcessor` — traduction, mentions, tracking links,
  `postReplyTo`, et toute règle future, sans action supplémentaire.

### 2.5 Une écriture, un service — le cas des cinq joins

`ParticipationService` (nouveau, extrait des cinq écritures de §1.5) devient le
seul code qui crée/désactive un `Participant` :

```ts
class ParticipationService {
  join(ctx: CallContext, cmd: {
    conversationId: string;
    via: 'creation' | 'admin-add' | 'share-link' | 'invitation' | 'anonymous-link';
    role: ParticipantRole;
  }): Promise<ParticipantSnapshot>;
  leave(ctx: CallContext, cmd: { conversationId: string; targetParticipantId?: string }): Promise<void>;
}
```

- Les défauts de permissions deviennent une table unique par (`via`, `role`),
  remplaçant les quatre jeux divergents (§1.5) ; toute divergence redevient une
  décision explicite dans une seule table, pas un accident de copie.
- Le service publie `participant.joined`/`participant.left` ; le dispatcher émet
  `CONVERSATION_JOINED`/`CONVERSATION_NEW`/notifications pour **tous** les
  chemins — le join anonyme cesse d'être silencieux sans qu'on l'ait codé
  spécialement.
- Le `conversation:join` socket (rejoindre la *room*) reste dans le handler :
  c'est une opération de transport (abonnement au flux), pas une opération
  métier. C'est l'exemple canonique de la frontière §4.

### 2.6 Les erreurs : un vocabulaire métier, trois projections

L'existant a déjà la bonne moitié : `BaseAppError` porte `code` (stable,
sémantique) et `statusCode` (HTTP) (`errors/custom-errors.ts:10-23`). Ce qui
manque : les services lèvent parfois des `Error` nues (ex. la limite de
réactions commentaire, `CommentReactionService.ts:124`, vs le `ConflictError`
correct côté post, `PostReactionService.ts:127`), et seuls les adaptateurs REST
savent projeter (`errorHandler`, `custom-errors.ts:239`) — les handlers socket
renvoient des chaînes libres dans l'ack, illisibles par le client
(`PostReactionHandler.ts:221-227`).

Cible :

1. **Règle** : un service ne lève que des `BaseAppError` (ou dérivées). Une
   `Error` nue qui traverse la frontière service→adaptateur est un bug.
2. **Trois mappeurs, un par transport**, tous pilotés par `code` :

| `BaseAppError` | HTTP (existant) | Socket (ack) | gRPC (futur) |
|---|---|---|---|
| `ValidationError` | 400 | `{ ok:false, code:'VALIDATION_ERROR', errors }` | `INVALID_ARGUMENT` |
| `AuthenticationError` | 401 | `{ ok:false, code:'AUTH_FAILED' }` | `UNAUTHENTICATED` |
| `PermissionDeniedError` | 403 | `{ ok:false, code:'PERMISSION_DENIED' }` | `PERMISSION_DENIED` |
| `NotFoundError` | 404 | `{ ok:false, code:'NOT_FOUND' }` | `NOT_FOUND` |
| `ConflictError` | 409 | `{ ok:false, code:'CONFLICT' \| code spécifique }` | `ALREADY_EXISTS` / `FAILED_PRECONDITION` |
| `RateLimitError` | 429 + `retryAfter` | `{ ok:false, code:'RATE_LIMIT_EXCEEDED', retryAfter }` | `RESOURCE_EXHAUSTED` |
| `ServiceUnavailableError` | 503 | `{ ok:false, code:'SERVICE_UNAVAILABLE' }` | `UNAVAILABLE` |

3. L'ack socket adopte une enveloppe unique `{ ok, data? , code?, message?,
   retryAfter? }` — le client socket peut enfin distinguer
   `REACTION_LIMIT_REACHED` d'une erreur interne (§1.3).

---

## 3. Le contrat du contexte d'appel

### 3.1 Le type

Un seul type, construit **une fois** à la frontière, passé en **premier
paramètre** de toute méthode de service, embarqué dans tout événement de
domaine. Il unifie trois objets existants qui se recouvrent sans se connaître :
`UnifiedAuthContext` (identité, `middleware/auth.ts:46`),
`AuthenticationContext` (le sous-ensemble affaibli des messages,
`packages/shared/types/messaging.ts:29`) et `MessageRequestMetadata` (l'étiquette
de transport que personne ne lit, `:75-81`).

```ts
// packages/shared/types/call-context.ts (nouveau)
export type Transport = 'rest' | 'socket' | 'grpc' | 'internal';

export type Actor =
  | { kind: 'user';
      userId: string; role: string; displayName: string;
      language: string }                       // depuis UnifiedAuthContext
  | { kind: 'anonymous';
      participantId: string; shareLinkId: string;
      displayName: string; language: string;
      permissions: ParticipantPermissions }    // depuis createAnonymousUserContext
  | { kind: 'system';
      service: string };                       // jobs, agent IA, cleanup, migrations

export interface CallContext {
  readonly transport: Transport;
  readonly requestId: string;        // X-Request-ID (REST), généré à la réception
                                     // de l'événement (socket), id de job (interne)
  readonly actor: Actor;
  readonly clientMutationId?: string; // idempotence (cmid_… / clientMessageId)
  readonly socketId?: string;         // présent si transport==='socket' :
                                      // exclusion de l'émetteur du broadcast
  readonly clientCapabilities?: readonly string[]; // négocié à l'auth (ex. supports
                                      // des payloads delta, formats media)
  readonly receivedAt: Date;
}
```

Choix assumés :

- **`actor` est une union discriminée, pas des booléens.** L'existant
  (`isAuthenticated`/`isAnonymous`/`hasFullAccess` + trois champs dépréciés,
  `middleware/auth.ts:46-70`) force chaque consommateur à reconstituer le cas.
  L'union rend le troisième cas — service interne — représentable : aujourd'hui
  l'agent IA et les jobs n'ont *aucune* identité et passent par des chemins
  ad hoc (§1.3, `MeeshySocketIOManager.ts:2487-2570`).
- **La langue vit dans l'acteur** (résolue à l'authentification comme
  aujourd'hui, `middleware/auth.ts:322`), parce qu'elle dépend de qui appelle,
  pas de comment.
- **`requestId` est obligatoire.** C'est la réponse à l'exigence « savoir de
  bout en bout l'interface d'appel » : tout log de service inclut
  `{ requestId, transport, actorKind }` ; un événement socket, la traduction ZMQ
  qu'il déclenche et le push qui en résulte portent le même identifiant.

### 3.2 Construction — une fois par frontière, jamais reconstruit

| Frontière | Où | Comment |
|---|---|---|
| REST | le middleware unifié existant (`createUnifiedAuthMiddleware`, `middleware/auth.ts:472`) est étendu pour poser `request.callContext` | `transport:'rest'`, `requestId` = `request.id` (déjà posé par `middleware/request-id.ts`), `clientMutationId` = header déjà décodé (`middleware/clientMutationId.ts`), acteur depuis l'`authContext` |
| Socket.IO | à l'authentification de la connexion (`AuthHandler`), stocké sur `socket.data.callContextBase` ; complété par événement (nouveau `requestId` par événement, `receivedAt`) | **prérequis** : `AuthHandler` cesse de ré-implémenter la vérification JWT/session (`AuthHandler.ts:148`, `:235`) et délègue à `AuthMiddleware.createAuthContext` (`middleware/auth.ts:95`) — même code, deux transports |
| Interne | fabrique `CallContext.internal(serviceName)` | `transport:'internal'`, acteur `system`, `requestId` généré ; utilisé par les jobs (cleanup, agent IA, retraductions) |
| gRPC (futur) | intercepteur | métadonnées gRPC → mêmes champs |

Règle de propagation : le contexte **descend** en paramètre — jamais de
variable globale, jamais de reconstruction en profondeur. Un service qui en
appelle un autre transmet le contexte reçu. Seule exception : un traitement
différé (job, retraduction asynchrone) qui survit à la requête crée un contexte
`internal` **en conservant le `requestId` d'origine** comme corrélation.

### 3.3 Qui a le droit de lire quoi

Le contexte est en lecture seule et tout le monde peut le lire ; mais l'usage
de `transport` est contraint par la frontière (§4) : un service peut s'en
servir pour la traçabilité, l'idempotence et l'exclusion d'émetteur — pas pour
brancher la règle métier. Concrètement, `if (ctx.transport === 'rest')` dans un
service doit passer la revue avec une justification de la colonne « peut
différer » du tableau §4 ; sinon c'est un bug d'architecture.

---

## 4. La frontière : ce qui peut différer par transport, ce qui ne le peut pas

C'est la ligne que tout le monde franchira par accident si elle n'est pas
écrite. La voici, en deux colonnes, chaque ligne adossée à une divergence réelle
de §1.

**PEUT différer selon le transport** (responsabilité de l'adaptateur) :

| Aspect | Justification |
|---|---|
| Mécanisme d'authentification (header Bearer vs handshake vs metadata gRPC) | c'est la définition d'un transport ; mais le *résultat* est le même `Actor` |
| Schéma wire et validation de forme (JSON-Schema vs Zod vs proto) | tant que les bornes sont identiques (mêmes longueurs max, mêmes formats d'id) |
| Enveloppe de réponse (HTTP + ETag vs ack vs statut gRPC) | forme, pas contenu : les champs métier viennent du même snapshot de service |
| Mécanisme d'idempotence (header cmid vs `clientMessageId` in-payload) | converge dans `ctx.clientMutationId` ; la *déduplication* elle-même est métier |
| Abonnement aux flux (`conversation:join` room, `feed:subscribe`) | notion sans équivalent REST ; c'est du transport pur (§2.5) |
| Budgets de rate limit | un client REST outbox et un client socket interactif n'ont pas le même profil — mais les budgets sont déclarés dans une table unique par opération, et **aucun transport n'a le droit d'être illimité** (aujourd'hui : REST réactions/likes sans aucune limite, §1.3) |
| Exclusion de l'émetteur du broadcast | n'a de sens que si l'appelant a un socket ; c'est le rôle de `ctx.socketId` |

**NE PEUT PAS différer** (responsabilité du service, une seule implémentation) :

| Aspect | Divergence réelle qui motive la ligne |
|---|---|
| Contrôles de permission et d'appartenance | garde d'appartenance sautée en REST traduction (§1.6) ; visibilité jamais vérifiée sur les réactions (§1.3) |
| Invariants métier | « une réaction max » : purge silencieuse vs erreur (§1.3) ; sémantique du remove (§1.3) |
| Écritures en base, compteurs, champs dénormalisés | `post.reactions` à jour seulement via REST (§1.3) ; quatre jeux de permissions de `Participant` (§1.5) |
| Famille et contenu des événements émis | `story:reacted` vs `post:reaction-added` (§1.3) ; unlike REST silencieux (§1.3) ; join anonyme silencieux (§1.5) |
| Notifications | deux types de notification pour le même like de commentaire (§1.3) ; appel manqué non notifié via REST (§1.7) |
| File de livraison hors-ligne | enqueue socket-only (§1.3) |
| Enrichissements et hoist des champs dérivés | `trackingLinks` en trois copies (§1.4) ; flags personnels en deux implémentations et huit trous (§1.4) |
| Déclenchement et portée de la traduction | messages de lien jamais traduits ; jeu de langues cibles différent (§1.6) |
| Effets de bord d'un fait métier (sonnerie, push VoIP, miroir multi-device) | appel REST muet (§1.7) |

Règle de revue qui en découle : **si la ligne modifiée décide de « ce qui se
passe », elle va dans un service ; si elle décide de « comment ça se dit », elle
va dans un adaptateur.** En cas de doute, service.

---

## 5. Plan de migration

Contraintes : le dépôt est vivant, plusieurs sessions y travaillent en
parallèle ; une réécriture intégrale est exclue. Le plan est donc **par
opération**, chaque étape étant une PR autonome qui laisse le système
fonctionnel, testable, et strictement meilleur. Ordre choisi selon trois
critères : gravité prouvée de la divergence, existence préalable du service
(coût faible), et valeur de démonstration du motif pour les étapes suivantes.

**Étape 0 — Geler l'existant avant de bouger.** Poser les garde-fous de §6 en
mode *baseline* : les tests de parité documentent les divergences actuelles
(assertions inversées `expect(...).toBe(divergent)` avec référence à ce
document), la garde de source inventorie les écritures Prisma existantes dans
les couches transport et **interdit d'en ajouter**. Aucun comportement ne
change ; toute étape suivante se mesure en lignes retirées de la baseline.

**Étape 1 — Le contexte d'appel (additif).** Créer le type `CallContext` (§3),
le poser sur `request` via le middleware unifié existant et sur `socket.data`
via `AuthHandler`. Faire déléguer l'authentification socket à
`AuthMiddleware.createAuthContext` (suppression de la duplication
`AuthHandler.ts:148`/`:235`). Aucun service n'est encore migré ; les nouveaux
champs sont simplement disponibles et loggés (`requestId`, `transport`).

**Étape 2 — Messages, envoi.** L'opération par laquelle commencer, parce que le
funnel existe déjà (`MessagingService`) et que trois bugs prouvés s'y
concentrent :
1. *S4/S5 → funnel* : les routes de lien construisent un `CallContext` anonyme
   et appellent `MessagingService.handleMessage`. Gain immédiat : traduction,
   mentions, notifications, chiffrement, `lastMessageAt`, dedup pour les
   conversations par lien. La forme de réponse `LINK_MESSAGE_NEW` peut être
   conservée transitoirement côté adaptateur.
2. *Réparer `messageRequest` REST* : transmettre `storyReplyToId` (une ligne,
   `routes/conversations/messages.ts:1763-1791`) — vérifié par le test de
   parité de l'étape 0 qui passe alors au vert.
3. *Un seul broadcast* : extraire `MessageHandler.broadcastNewMessage` vers le
   dispatcher d'événements (§2.3) ; `MessagingService.handleMessage` publie
   `message.created` ; `_broadcastNewMessage` (`MeeshySocketIOManager.ts:1852-2113`)
   est supprimé. Les correctifs E2EE, `clientMessageId`, exclusion d'expéditeur
   et réveil de l'agent suivent mécaniquement, pour tous les transports.

**Étape 3 — Messages, édition et suppression.** Créer
`MessagingService.editMessage` / `deleteMessage` en fusionnant les matrices
§1.2 : l'union des gardes (garde `deletedAt` atomique de E1/E2, permissions à
décider explicitement entre les trois politiques de D1/D2/D3, fenêtre 24 h et
retraitement mentions/liens de E3 comme règles uniques), publication de
`message.updated`/`message.deleted`. Les sept points d'entrée deviennent des
adaptateurs. C'est l'étape qui retire le plus de lignes à la baseline (7
implémentations → 2 méthodes).

**Étape 4 — Réactions.** D'abord les commentaires (divergence la plus visible :
unlike REST jamais diffusé, invariants opposés) : supprimer
`PostCommentService.likeComment`/`unlikeComment` au profit de
`CommentReactionService`, trancher l'invariant (recommandation : remplacement
silencieux, le comportement REST actuel, car c'est celui qu'attend l'UI),
publier `reaction.changed`. Puis les posts : fusionner
`PostService.likePost`/`unlikePost` et `PostReactionService` ; décider du sort
du JSON `post.reactions` (l'écrire dans le service unique, ou le déprécier
officiellement — pas d'entre-deux). Enfin messages/pièces jointes : porter
rate-limit, file offline et gardes dans le service partagé.

**Étape 5 — Lecture des posts.** Un `PostViewerEnrichmentService` unique
(flags personnels + hoist + `mentionedUsers`), appelé par `getPostById` et par
les 9 surfaces de `PostFeedService` — les huit trous de la matrice §1.4 se
ferment d'un coup ; `hoistTrackingLinks` rejoint `sharedPlace.ts` comme
helper partagé.

**Étape 6 — Traduction.** Déplacer la garde d'appartenance dans
`MessageTranslationService` (elle s'applique alors aux trois transports),
authentifier `translate-blocking`/`status`/`voice`, exposer une API publique de
retraduction et supprimer les casts `as any` des routes.

**Étape 7 — Appels.** `CallService.initiateCall`/`joinCall` publient
`call.initiated`/`call.joined` ; le dispatcher (qui vit côté socketio et peut
réutiliser le code de `CallEventsHandler`) sonne, poste le message d'appel,
arme le timeout, envoie le push VoIP — les ponts partiels
(`CallService.ts:286`, `:314`) sont absorbés par le mécanisme général.

**Étape 8 — Participation.** `ParticipationService` (§2.5) absorbe les cinq
écritures et la table de permissions ; le join anonyme et le join par lien
cessent d'être silencieux.

Règles de conduite pendant la migration : une opération par PR ; jamais de
changement de comportement non listé dans la PR (les unifications qui tranchent
une divergence — ex. l'invariant de réaction — sont signalées comme décisions
produit) ; chaque PR retire ses lignes de la baseline de l'étape 0 et fait
passer au vert les tests de parité correspondants.

---

## 6. Garde-fous exécutables

Le problème est réapparu après chaque factorisation ponctuelle (le hoist
position a été consolidé, `trackingLinks` non ; `ReactionService` a été partagé,
sa périphérie non). Les garde-fous doivent donc être **exécutables en CI**, pas
des conventions.

### 6.1 Tests de parité multi-transport

Principe : exercer la même opération par tous ses transports contre la même
base de test, et comparer (a) l'état persisté, (b) les événements émis. Le
harnais capture les émissions avec un `io` factice ; les champs volatils (ids,
dates) sont normalisés.

```ts
// src/__tests__/parity/message-send.parity.test.ts
import { buildParityHarness, normalizeMessage, normalizeEvents } from './harness';

describe('parité des transports — envoi de message', () => {
  const fixture = () => ({
    content: 'réponse à ta story [[https://exemple.fr]]',
    storyReplyToId: STORY_ID,
    mentionedUserIds: [BOB_ID],
  });

  it('persiste la même ligne Message quel que soit le transport', async () => {
    const h = await buildParityHarness();
    const bySocket = await h.sendViaSocket(ALICE, fixture());
    const byRest   = await h.sendViaRest(ALICE, fixture());
    const byLink   = await h.sendViaShareLink(ANON, fixture());

    // normalizeMessage retire id/createdAt/clientMessageId et trie les clés
    expect(normalizeMessage(byRest.dbRow)).toEqual(normalizeMessage(bySocket.dbRow));
    expect(normalizeMessage(byLink.dbRow)).toEqual(normalizeMessage(bySocket.dbRow));
    // Aujourd'hui : ÉCHOUE — REST perd storyReplyToId (§1.2),
    // le lien perd mentions, postReplyTo et trackingLinks (§1.2).
  });

  it('diffuse le même payload message:new aux destinataires', async () => {
    const h = await buildParityHarness();
    const bySocket = await h.sendViaSocket(ALICE, fixture());
    const byRest   = await h.sendViaRest(ALICE, fixture());
    expect(normalizeEvents(byRest.emitted)).toEqual(normalizeEvents(bySocket.emitted));
    // Aujourd'hui : ÉCHOUE — payload B sans postReplyTo/trackingLinks/
    // clientMessageId/champs E2EE (§1.2).
  });

  it('déclenche la traduction pour un participant anonyme par lien', async () => {
    const h = await buildParityHarness();
    const byLink = await h.sendViaShareLink(ANON, { content: 'bonjour tout le monde' });
    expect(h.translationQueue.jobsFor(byLink.dbRow.id)).not.toHaveLength(0);
    // Aujourd'hui : ÉCHOUE — routes/links/messages.ts ne traduit jamais (§1.6).
  });
});
```

Même gabarit pour chaque opération migrée : réaction (ajout REST vs socket →
mêmes `reactionSummary`, même famille d'événements, même notification), unlike
de commentaire (le broadcast doit exister par les deux transports), initiation
d'appel (les membres reçoivent `call:incoming` par les deux transports), join
par lien (les défauts de permissions sont identiques à ceux de l'ajout admin).
En étape 0, ces tests sont posés avec les assertions *inversées* qui
documentent l'écart ; chaque étape de migration retourne ses assertions.

### 6.2 Gardes de source (anti-régression structurelle)

Deux règles, implémentées en tests (grep sur le comportement, commentaires
retirés avant analyse), avec une **baseline explicite qui ne peut que
décroître** :

```ts
// src/__tests__/source-guards/transport-layer-boundaries.test.ts
import { collectSources, stripComments } from './helpers';

const PRISMA_WRITE = /\bprisma\s*\.\s*\w+\s*\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/;

it('les couches transport ne contiennent aucune écriture Prisma hors baseline', () => {
  const offenders = collectSources(['src/routes/**/*.ts', 'src/socketio/handlers/**/*.ts'])
    .filter((f) => PRISMA_WRITE.test(stripComments(f.content)))
    .map((f) => f.path);
  // BASELINE : état au 2026-07-29 (étape 0). Retirer des entrées au fil de la
  // migration ; l'ajout d'une entrée doit être justifié en revue et est
  // considéré comme une régression d'architecture.
  expect(offenders.sort()).toEqual(BASELINE_PRISMA_WRITES_IN_TRANSPORT.sort());
});

it("les services n'importent jamais socket.io ni le manager", () => {
  const offenders = collectSources(['src/services/**/*.ts'])
    .filter((f) => /from\s+['"]socket\.io['"]|MeeshySocketIOManager|getIO\(\)/.test(stripComments(f.content)))
    .map((f) => f.path);
  expect(offenders.sort()).toEqual(BASELINE_SOCKETIO_IN_SERVICES.sort());
});
```

Compléments du même type : interdiction de `io.emit`/`io.to` hors
`socketio/` et du dispatcher ; interdiction de `(x as any)._` (appel de méthode
privée, le symptôme de §1.6) ; interdiction de `throw new Error(` dans
`src/services/**` (les services lèvent des `BaseAppError`, §2.6).

### 6.3 Exhaustivité du dispatcher et des erreurs

```ts
// src/__tests__/unit/events/dispatcher-exhaustive.test.ts
it('chaque type de DomainEvent a un handler dans le dispatcher', () => {
  for (const type of DOMAIN_EVENT_TYPES) {
    expect(dispatcher.handles(type)).toBe(true);
  }
});

// src/__tests__/unit/errors/error-projections.test.ts
it('chaque BaseAppError a ses trois projections', () => {
  for (const ErrClass of ALL_APP_ERROR_CLASSES) {
    const e = new ErrClass();
    expect(e.statusCode).toBeGreaterThanOrEqual(400);       // HTTP
    expect(socketAckFor(e)).toMatchObject({ ok: false, code: e.code });
    expect(grpcStatusFor(e)).toBeDefined();                  // table §2.6
  }
});
```

Le second test échoue dès qu'une erreur nouvelle est ajoutée sans son mapping —
c'est lui qui empêche le retour des chaînes libres dans les acks socket.

### 6.4 Revue ciblée

Deux questions à poser sur tout diff touchant `services/gateway/src` :

1. La ligne décide-t-elle de « ce qui se passe » (→ service) ou de « comment ça
   se dit » (→ adaptateur) ? Un diff qui ajoute une règle dans `routes/**` ou
   `socketio/handlers/**` est refusé sauf justification par le tableau §4.
2. L'opération touchée a-t-elle un autre transport ? Si oui, le test de parité
   correspondant a-t-il été mis à jour dans le même diff ?

Et un signal d'alarme lexical, tiré de l'inventaire : les commentaires
« miroir de », « parité avec », « comme le chemin socket » (§1.2, §1.3, §1.4)
sont l'aveu qu'une duplication vient d'être créée. En revue, un tel commentaire
doit être traité comme une demande de factorisation, pas comme une
documentation acceptable.

---

## Annexe — points d'entrée par opération (référence rapide)

| Opération | REST | Socket.IO | Lien / anonyme | Interne |
|---|---|---|---|---|
| Envoi message | `routes/conversations/messages.ts:1588` → funnel | `MessageHandler.ts:157`, `:358` → funnel | `routes/links/messages.ts:32`, `:304` → **Prisma direct** | agent `MeeshySocketIOManager.ts:2439` ; appels `CallService.ts:2437`, `:2527` ; chiffrement `routes/conversation-encryption.ts:251` ; traduction `MessageTranslationService.ts:321` |
| Édition message | `routes/messages.ts:201` ; `messages-advanced.ts:57`, `:694` — Prisma direct | `MessageHandler.ts:570` — Prisma direct | — | `MeeshySocketIOManager.ts:2177` (broadcast seul) |
| Suppression message | `routes/messages.ts:359` ; `messages-advanced.ts:518` — Prisma direct | `MessageHandler.ts:712` — Prisma direct | — | — |
| Réaction message | `routes/reactions.ts:73`, `:268` → `ReactionService` | `ReactionHandler.ts:65`, `:205` → `ReactionService` | mêmes routes (`allowAnonymous`, `routes/reactions.ts:65-68`) | agent `MeeshySocketIOManager.ts:2487` |
| Réaction post | `routes/posts/interactions.ts:32`, `:133` → `PostService.likePost` | `PostReactionHandler.ts:128`, `:234` → `PostReactionService` | refusé | — |
| Réaction commentaire | `routes/posts/comments.ts:329`, `:396` → `PostCommentService` | `CommentReactionHandler.ts:73`, `:185` → `CommentReactionService` | refusé | — |
| Réaction pièce jointe | — | `AttachmentReactionHandler.ts:44`, `:52` | via socket | — |
| Création post/commentaire/story | `routes/posts/core.ts:57` ; `comments.ts:114` → services | — (broadcasts seulement) | — | `PostAudioService.ts:316` (republication) |
| Join conversation | `core.ts:996` ; `participants.ts:327` ; `sharing.ts:589`, `:810` — Prisma direct | `ConversationHandler.ts:43` (room seulement) | `routes/anonymous.ts:391` — Prisma direct | `MessagingService.ts:560` (auto-création) |
| Leave conversation | `leave.ts:64` ; `participants.ts:513` | `ConversationHandler.ts:174` (room seulement) | `routes/anonymous.ts:684` | — |
| Traduction | `routes/translation.ts:275` ; `translation-non-blocking.ts:267`, `:406` | `MeeshySocketIOManager.ts:932` | jamais déclenchée (§1.6) | retraduction `MessageHandler.ts:667` / routes `:300` |
| Appels | `routes/calls.ts:95`, `:338`, `:488`, `:634` → `CallService` | `CallEventsHandler.ts:1655`, `:1975`, `:2251`, `:3112` → `CallService` | refusé | GC `CallCleanupService` |

---

*Document rédigé à partir d'un inventaire du code au 2026-07-29 (branche `main`).
Chaque référence fichier:ligne a vocation à dériver ; les affirmations ont été
vérifiées à cette date et les plus critiques contre-vérifiées manuellement.*
