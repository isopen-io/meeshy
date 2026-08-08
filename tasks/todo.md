# Cycle 27 — Une édition de post RÉCONCILIE ses mentions, elle ne les rejoue pas

Tête laissée par le cycle 26 :
« **Le domaine social extrait encore avec `extractMentions`.** `routes/posts/core.ts` (création ET
édition de post) et `routes/posts/comments.ts` : un `@John Doe` dans un post ou un commentaire ne
nomme personne. **Tête du prochain cycle à défaut d'accès base.** »

L'inspection de ce chemin a trouvé deux défauts plus graves que celui annoncé, dans le même bloc.
Ils sont traités ici ; la tête annoncée est rendue à la file, avec la raison (voir *Reste ouvert*).

## Ce que la route faisait

`PUT /posts/:postId` réextrayait, résolvait, puis **recréait** les lignes `PostMention` et
renotifiait — son propre commentaire l'admettait : `re-fires all; idempotent via P2002 swallow`.
L'idempotence citée ne couvre que la PERSISTANCE. La notification, elle, part à chaque fois.

**D1 — chaque édition repingeait tous les mentionnés.** Dix corrections de frappe valaient dix
`user_mentioned` à quelqu'un nommé une seule fois. Pire : le bloc ne regardait pas si le CONTENU
avait changé — modifier la seule visibilité d'un post repingeait tout le monde. Le garde-fou de
débit de `NotificationService` (`MAX_MENTIONS_PER_MINUTE` par paire émetteur/destinataire) n'y
pouvait rien : il ne couvre qu'une fenêtre d'une minute, et les éditions s'étalent.

**D2 — les partants n'étaient jamais retirés.** La route créait, jamais ne supprimait. Éditer
« bravo @alice » en « bravo @bob » ajoutait Bob et laissait Alice mentionnée **à vie**. Ces lignes
ne sont pas décoratives : `PostFeedService.getMentionsByPost` et `getReelSeed` s'en servent pour
l'affinité de recommandation des réels — un post recommandé pour une mention qu'il ne porte plus.

C'est mot pour mot le couple de défauts que `replaceMessageMentions` a corrigé côté messages au
cycle 22. Le domaine social n'en avait pas hérité.

## D3 — l'unité, et pourquoi elle est jumelle et non partagée

`services/gateway/src/services/posts/postMentions.ts` : `resolvePostMentions` (création) et
`reconcilePostMentions` (édition), miroir structurel de `messageMentions.ts`.

Elles ne FACTORISENT pas `messageMentions` — les deux domaines ne partagent ni la table
(`PostMention` / `Mention`), ni la validation (un post n'a pas de participants ni de règle
« conversation directe »), ni le champ dénormalisé (`Message.validatedMentions` n'a pas
d'équivalent sur `Post`). Ce qu'elles partagent est la FORME, et c'est délibérément la seule chose
qui est copiée : deux exports, un court-circuit qui ne vit que du côté création, un
`newlyMentionedUserIds` qui isole les entrants, un `reconciled` qui distingue « personne n'est
mentionné » de « on ne sait pas ».

Trois propriétés méritent d'être relues :

1. **La création ne lit jamais `PostMention`.** Un post neuf n'a pas d'ensemble précédent ; lire la
   table serait une requête pour rien sur le chemin d'écriture le plus chaud du domaine social. Le
   court-circuit « pas de `@` » vit dans l'unité, pas chez l'appelant.
2. **L'édition n'a PAS ce court-circuit.** Un contenu qui ne nomme plus personne doit effacer ses
   lignes — c'est exactement D2.
3. **En panne, on s'abstient.** Si l'ensemble précédent est illisible, la réconciliation ne peut
   plus garantir qu'elle ne détruit rien : elle n'écrit rien et rend `reconciled: false`. Préserver
   une mention périmée vaut mieux que détruire une mention vivante — la première nomme quelqu'un de
   trop le temps d'une édition, la seconde ne revient jamais.

La notification reste **détachée** (appelée dans la continuation, jamais attendue) : elle traverse
push, socket et e-mail, et rien de tout cela n'a à retarder la réponse d'une publication.

## Vérification

- **16 tests d'unité neufs** (`__tests__/unit/services/posts/postMentions.test.ts`) écrits AVANT
  l'implémentation, RED vérifié (module introuvable) puis GREEN.
- **2 tests de régression au niveau ROUTE** : « ne renotifie pas un mentionné que le post nommait
  déjà » (D1) et « retire les lignes `PostMention` de ceux que le post ne nomme plus » (D2).
- Deux harnais de route passaient `{} as any` en Prisma ; ils gagnent un délégué `postMention`.
  Sans lui la réconciliation s'abstient — le comportement voulu, mais pas ce que ces cas testent.
- Un cas de `core-extended` s'appuyait sur une incohérence du double : contenu persisté `'Hello'`
  (sans `@`) et extraction mockée rendant `['bob', 'carol']`. Le court-circuit le révèle ; la
  fixture porte désormais un contenu cohérent avec ce qu'elle prétend tester.
- **Suite gateway complète : 603 suites, 15 655 tests, tout vert.** `tsc --noEmit` propre.

Vérifié au passage que `PostService.updatePost` rend le document complet (`tx.post.update` +
`include`) : une édition de visibilité seule voit donc son `content` INCHANGÉ, pas `undefined` —
la réconciliation ne peut pas prendre un champ non renvoyé pour un texte vidé.

## Reste ouvert après ce cycle

- **`@Display Name` reste inextractible dans le domaine social** (la tête annoncée par le cycle 26).
  Rendue à la file en connaissance de cause : les deux clients insèrent un **handle**, jamais un nom
  d'affichage (web `MentionAutocomplete` → `onSelect(suggestion.username, …)`, iOS
  `FeedCommentsSheet` → `"@\(username) "`). Le cas ne se produit qu'en frappe manuelle, alors que
  D1/D2 se produisaient à CHAQUE édition. Le coût n'est pas nul non plus : un post n'a pas de
  participants, l'audience équivalente (auteur + commentateurs + amis, cf.
  `getUserSuggestionsForPost`) demanderait deux requêtes de plus sur un chemin d'écriture chaud.
  **Tête du prochain cycle** si rien de plus grave n'apparaît.
- **Les commentaires n'ont pas de route d'édition** — `comments.ts` n'expose que création,
  like/unlike et suppression. Il n'y a donc rien à réconcilier côté `CommentMention` aujourd'hui ;
  le jour où une édition de commentaire apparaît, elle doit naître avec `reconcilePostMentions`
  pour jumeau, pas avec le bloc que ce cycle vient de retirer.
- **Les deux réparations de base attendent une exécution avec accès base**
  (`repair-mention-user-ids.ts`, `repair-tracking-link-created-by.ts`). À lancer SANS `--apply`
  d'abord. Action humaine — cette routine n'a aucun accès MongoDB.
- **Les `PostMention` périmées déjà écrites restent en base.** Le correctif ne vaut que pour les
  éditions à venir ; les lignes de mentionnés retirés avant ce cycle survivent. Réparable par le
  même patron que les deux scripts ci-dessus, avec accès base.
- **`getMentionsForMessage` / `getRecentMentionsForUser` n'ont aucun consommateur d'écran** —
  l'inbox `/mentions` reste une capacité backend sans écran.
- **`MeeshySocketIOManager.getConversationParticipantsForMention`** est toujours un deuxième
  exemplaire du chargeur de participants (cycle 21, inchangé).
- L'arbitrage `delete-for-me` tranché par le cycle 12 attend toujours une validation humaine.
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
