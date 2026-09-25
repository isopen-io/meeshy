## 2026-08-08 : Les mentions d'un post editee sont RECONCILIEES, pas rejouees

**Contexte** : `PUT /posts/:postId` reextrayait les `@handle` du contenu edite, resolvait les
usernames, puis **recreait** les lignes `PostMention` et renotifiait — son commentaire l'admettait
(`re-fires all; idempotent via P2002 swallow`). L'idempotence citee ne couvre que la persistance :
`createPostMentions` avale les P2002, mais `createPostMentionNotificationsBatch` n'a aucune memoire
de qui a deja ete prevenu. Deux consequences.

D'une part, **chaque edition repingeait tous les mentionnes**. Le bloc ne comparait pas le contenu
a son etat precedent : dix corrections de frappe valaient dix `user_mentioned` a quelqu'un nomme
une seule fois, et modifier la seule VISIBILITE d'un post repingeait tout le monde. Le garde-fou de
debit (`MAX_MENTIONS_PER_MINUTE` par paire emetteur/destinataire) ne couvre qu'une fenetre d'une
minute et ne rattrape donc rien.

D'autre part, **les partants n'etaient jamais retires**. La route creait, jamais ne supprimait :
editer « bravo @alice » en « bravo @bob » ajoutait Bob et laissait Alice mentionnee a vie. Ces
lignes alimentent l'affinite de recommandation des reels (`PostFeedService.getMentionsByPost`,
`getReelSeed`) — un post recommande pour une mention qu'il ne porte plus.

Meme couple de defauts que celui corrige cote messages par `replaceMessageMentions` (2026, cycle
22) ; le domaine social n'en avait pas herite.

**Decision** : nouvelle unite `services/posts/postMentions.ts`, miroir structurel de
`services/messaging/messageMentions.ts`, avec deux points d'entree publics que les routes
appellent a la place du bloc inline :
- `resolvePostMentions` (creation) : court-circuit sans cout quand le contenu ne porte aucun `@`,
  **aucune lecture de `PostMention`** (un post neuf n'a pas d'ensemble precedent), tous les
  mentionnes sont des entrants par construction.
- `reconcilePostMentions` (edition) : **pas** de court-circuit — un contenu qui ne nomme plus
  personne doit effacer ses lignes ; supprime les seuls partants, cree les seuls entrants, et ne
  notifie que `newlyMentionedUserIds`.

Les deux sont best-effort et ne levent jamais (`onError` laisse l'appelant journaliser dans le
contexte de sa requete). En panne — service absent, ensemble precedent illisible, resolution en
echec — la reconciliation **s'abstient de tout ecrire** et rend `reconciled: false` : preserver une
mention perimee vaut mieux que detruire une mention vivante. La notification est **detachee**
(appelee dans la continuation, jamais attendue) : elle traverse push, socket et e-mail, et rien de
cela n'a a retarder la reponse d'une publication.

**Alternatives rejetees** :
- **Factoriser avec `messageMentions`** : les deux domaines ne partagent ni la table (`PostMention`
  vs `Mention`), ni la validation (un post n'a ni participants ni regle « conversation directe »),
  ni le champ denormalise (`Message.validatedMentions` n'a pas d'equivalent sur `Post`). Seule la
  FORME est commune ; une abstraction sur si peu de substance aurait coute plus qu'elle ne rend.
- **Dedupliquer cote `NotificationService`** (ne pas creer un `user_mentioned` deja emis pour la
  paire post/destinataire) : deplace la connaissance de « qui etait deja mentionne » hors de
  l'endroit qui la detient, et ne repare pas D2 — les lignes des partants resteraient.
- **Purger puis recreer toutes les lignes** : plus simple, mais detruit l'ensemble precedent, donc
  rend « qui est entrant » insoluble — c'est precisement ce qui forcait a renotifier tout le monde.

**Consequences** :
- Le chemin d'edition attend desormais la reconciliation (jusqu'a trois aller-retours : lecture du
  precedent, `deleteMany` si partants, creation des entrants) avant de repondre. Les editions de
  post sont rares devant les creations, et l'ordre est requis par la correction.
- La creation attend la persistance des lignes, la ou elle etait en fire-and-forget. Un seul
  aller-retour de plus, et `createPostMentions` ne rejette pas (`Promise.allSettled` interne).
- Les `PostMention` perimees **deja ecrites** subsistent : le correctif ne vaut que pour les
  editions a venir. Reparable par script avec acces base, sur le patron de
  `repair-mention-user-ids.ts`.
- Les commentaires n'ont pas de route d'edition : rien a reconcilier cote `CommentMention`
  aujourd'hui. Le jour ou elle apparait, elle doit naitre avec `reconcilePostMentions` pour jumeau.

**Tests** : 16 tests d'unite (`__tests__/unit/services/posts/postMentions.test.ts`, ecrits en RED
avant l'implementation) + 2 tests de regression au niveau route (`posts-core-notifications.test.ts`)
qui verrouillent exactement les deux defauts : aucun renvoi de notification a un mentionne deja
nomme, et `deleteMany` sur les seuls partants. Suite gateway complete verte (603 suites,
15 655 tests).
