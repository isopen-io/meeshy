# Cycle 25 — Deux copies d'un algorithme, et l'espace d'ids où elles divergeaient

Tête laissée par le cycle 24 :
« **`MessageProcessor.processLinksInContent` est un deuxième exemplaire complet de
`TrackingLinkService.processExplicitLinksInContent`** — mêmes quatre étapes, mêmes regex, même
réutilisation de token, ~90 lignes chacun. Le chemin d'ENVOI passe par le premier, les deux chemins
d'édition par le second. Deux copies d'un même algorithme ne peuvent pas rester d'accord : le
correctif `$`-sequence (replacer fonction) n'a d'ailleurs été appliqué aux deux qu'après coup. »

Vérifié, et c'est bien le cas. En les réunissant, on découvre qu'elles n'étaient pas seulement
redondantes : **elles ne remplissaient pas `TrackingLink.createdBy` depuis le même espace d'ids.**

## D1 — le lien créé à l'envoi n'appartenait à personne de réel

`TrackingLink.createdBy` est un **`User.id`** — le schéma le dit (« Utilisateur qui a créé le lien
(null si anonyme) ») et `routes/tracking-links/tracking.ts` le lit comme tel :

| Ligne | Usage |
|---|---|
| `:535` | **autorisation** — `trackingLink.createdBy !== userId` ⇒ 403 |
| `:601-608` | « mes liens » : compte, liste, statistiques |
| `:703` | édition d'un lien, `where: { token, createdBy: userId }` |

Le chemin d'ENVOI y écrivait `data.senderId`, qui est un **`Participant.id`** (`Message.senderId`
référence `Participant`). Conséquences pour un lien créé en tapant `[[url]]` dans un message :

1. il n'apparaît **jamais** dans la liste de liens de son auteur, ni dans ses statistiques ;
2. son auteur se voit **refuser** l'accès à son propre lien (`createdBy` non nul et ≠ son `User.id`) ;
3. l'unicité applicative `(targetId, createdBy)` ne regroupe rien par partageur.

Les **cinq autres** écrivains de ce champ passent bien un `User.id` — les deux routes de lien de
partage (`routes/links/messages.ts`, `undefined` pour l'anonyme), `PostService`,
`PostCommentService`, et les deux chemins d'édition depuis le cycle 24. Un seul écrivain sur six
était en désaccord, et c'était le chemin le plus emprunté.

Même forme que le cycle 22 (`Mention` keyée sur un `Participant.id` là où la permission raisonne en
`User.id`) : deux espaces d'ids disjoints, une comparaison qui ne matche jamais, et un silence
complet — rien ne lève, la ligne s'écrit, elle ne désigne simplement personne.

## Le remède : résoudre une fois, et seulement si ça sert

```ts
const linkAuthorUserId = this.containsLinks(data.content)
  ? await this.resolveLinkAuthorUserId(data.senderId)
  : undefined;
```

- **Une seule résolution** pour les deux chemins de tracking du message (syntaxe explicite ET URLs
  brutes de `metadata.trackingLinks`, qui portaient le même mauvais id).
- **Payée seulement si le texte porte une URL.** `containsLinks` couvre les deux syntaxes
  explicites autant que les URLs brutes — `[[https://…]]` contient une URL. Un message sans lien ne
  produit aucun `TrackingLink`, donc aucun propriétaire à désigner : zéro requête.
- **`undefined` pour l'anonyme comme pour une lecture en échec.** Un lien sans propriétaire vaut
  mieux qu'un lien attribué à un id qui ne désigne aucun utilisateur — et c'est exactement ce que
  le schéma prévoit. Même forme et même raison que `resolveSenderUserId` côté mentions.

## D2 — l'algorithme, une fois

`MessageProcessor.processLinksInContent` perd ses ~90 lignes et devient une délégation à
`processExplicitLinks`, l'unité que le cycle 24 avait créée pour les deux chemins d'édition. Elle
est généralisée (plus rien d'« Edited » dans son nom ni dans ses paramètres) et exporte
`hasTrackableLinkSyntax` pour que l'appelant puisse éviter ce que l'unité, elle, ne peut pas savoir
inutile : la requête de résolution d'auteur.

Le chemin d'envoi gagne au passage le **court-circuit** : un message sans `[[` ni `<` ne traverse
plus l'aller-retour de protection markdown qu'il payait à chaque envoi.

## Côté test — la couverture déménage, elle ne disparaît pas

Les 13 tests d'algorithme de `MessageProcessor.test.ts` décrivaient le second exemplaire — et ne
décrivaient l'exemplaire survivant nulle part. Quatre d'entre eux couvraient des comportements
**absents** de la suite de `TrackingLinkService` : réutilisation d'un lien EXISTANT, token partagé
entre les syntaxes `[[…]]` et `<…>`, repli sur l'URL brute quand le minting échoue pour `<url>`,
texte sans syntaxe traçable. Ils vivent maintenant avec l'unique implémentation. Les quatre cas
`$` étaient déjà couverts par `TrackingLinkService.dollarSequences.test.ts`.

`MessageProcessor` garde ce qui lui appartient vraiment : la **délégation** (arguments transmis,
résultat rendu, court-circuit, contrat jamais-lève) et la propriété du lien.

## Vérification

```
services/gateway : 602 suites / 15637 tests — tous verts
tsc --noEmit     : propre
```

Nouveaux tests : 5 sur la propriété du lien à l'envoi (`User.id` derrière le participant, URLs
brutes au même nom, anonyme sans propriétaire, aucune résolution sans URL, résolution en panne qui
n'empêche pas l'envoi), 3 sur la délégation, 4 déménagés vers `TrackingLinkService.test.ts`.

## Reste ouvert après ce cycle

- **Les `TrackingLink` déjà écrits portent des `Participant.id` dans `createdBy`.** Le correctif ne
  vaut que pour les liens à venir ; les anciens restent invisibles pour leur auteur. Un script de
  réparation (jointure `Participant.id → userId`) est à écrire, sur le modèle de
  `repair-mention-user-ids.ts` — qui lui-même **n'a jamais été exécuté**, faute d'accès base depuis
  cette routine. **Tête du prochain cycle.**
- **Le domaine social extrait encore avec `extractMentions`.** `routes/posts/core.ts` (création ET
  édition de post) et `routes/posts/comments.ts` : un `@John Doe` dans un post ou un commentaire ne
  nomme personne. Cadrage affiné dans l'addendum ci-dessous — chantier de contrat multi-surface.
- **`getMentionsForMessage` et `getRecentMentionsForUser` n'ont aucun consommateur d'écran** —
  l'inbox `/mentions` reste une capacité backend sans écran.
- **`MeeshySocketIOManager.getConversationParticipantsForMention` est toujours un deuxième
  exemplaire du chargeur de participants** (cycle 21, inchangé).
- L'arbitrage `delete-for-me` tranché par le cycle 12 attend toujours une validation humaine.
- **La suppression de la branche distante échoue depuis cette routine** : `git push --delete`
  répond « Everything up-to-date » sans agir (réessayé 4 fois). Les branches mergées des cycles
  s'accumulent côté remote.

---

# Cycle 25b — Addendum d'une session parallèle

Deux sessions ont livré le cycle 25 en parallèle. Le refactor des liens ci-dessus (PR #2650) est
**strictement meilleur** : il a trouvé, en réunissant les deux copies, que `createdBy` recevait un
`Participant.id` là où la route `/tracking-links` attend un `User.id` pour AUTORISER l'accès. La
seconde session s'aligne dessus et n'apporte que ce qui manquait — appliqué par-dessus, pas à la
place. (Leçon d'intégration du cycle 23 : comparer défaut par défaut, jamais « qui est arrivé en
premier ».)

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

## Nuance sur le domaine social

`extractMentions` utilise bien la SSOT (`NAME_BOUNDARY_LEFT` + `MENTION_HANDLE_CHARS`) : la garde
e-mail (`john@example.com` ne nomme pas `example`) et le tiret sont couverts. Le seul manque réel
est le **display name à espaces** (`@John Doe`), qui exige un jeu de candidats — or un post n'a pas
de liste de participants et `CreatePostSchema` ne porte aucun champ de mentions. Le combler
demande que le composeur (web ET iOS) envoie les `userId` choisis à l'autocomplete :
**chantier de contrat multi-surface, pas un correctif gateway.**
