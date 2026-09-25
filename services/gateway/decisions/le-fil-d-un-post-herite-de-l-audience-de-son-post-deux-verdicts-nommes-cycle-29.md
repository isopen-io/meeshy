## Le fil d'un post herite de l'audience de son post — deux verdicts nommes (cycle 29)

**Contexte** : `postVisibility.ts` portait depuis la decision 2026-07-08 une asymetrie ECRITE
mais inapplicable a un objet unitaire : le filtre de LISTE (`buildPostVisibilityOrFilter`, feed +
post unique) admet amis ∪ contacts DM, tandis que `canUserViewPost` — decrit dans le meme fichier
comme « ce qui garde REAGIR / COMMENTER » — reste amis stricts. Aucune route de commentaire
n'appliquait ni l'une ni l'autre : les six routes de `routes/posts/comments.ts`, le like/unlike
REST du post et les quatre handlers de reaction socket ne consultaient jamais `Post.visibility`. Le post etait pourtant
protege, `post:join` gardait deja la room, et `CommentReactionHandler` portait un
`_canUserViewPost` prive **que rien n'appelait**.

**Decision** : quatre primitives dans `postVisibility.ts`, pas un module de plus.

| primitive | question | audience |
|---|---|---|
| `loadPostAcl` | quelle est la tranche ACL de ce post ? | — (`null` si absent OU supprime) |
| `loadCommentPostAcl` | ... du post PORTANT ce commentaire ? | — (id d'URL jamais cru) |
| `canUserConsumePost` | peut-il LIRE le fil ? | amis ∪ contacts DM (celle du feed) |
| `canUserInteractWithPost` | peut-il ECRIRE / REAGIR ? | amis stricts |

Les deux verdicts ne different que par `canUserViewPost(..., { includeDirectContacts })`. C'est le
point : l'asymetrie devient EXECUTABLE au lieu de rester un commentaire, et un point d'entree
choisit son verdict en le nommant plutot qu'en reglant un booleen.

**Alternatives rejetees** :
- **Un seul verdict (amis stricts) pour tout le fil** : plus simple, mais un contact DM non-ami a
  qui le feed montre deja une story `FRIENDS` recevrait un 404 sur ses commentaires. Ce n'est pas
  une garde, c'est une regression pour un lecteur legitime.
- **Reutiliser `PostService.getPostById`** pour garder la lecture : ramene tout le `postInclude`
  (medias, auteur, compteurs, reactions) la ou trois champs suffisent, sur un chemin de lecture
  chaud.
- **Materialiser la liste de contacts DM** (`getDirectConversationContactIds`) pour trancher un
  seul acces : cout proportionnel au carnet d'adresses. `doUsersShareDirectConversation` est le
  pendant **pairwise**, deux requetes bornees — exactement le rapport que `doUsersShareCommunity`
  entretient avec `getCommunityCoMemberIds`.
- **Faire confiance au `:postId` du chemin** (ou du payload socket) sur les routes adressant leur
  cible par `commentId` : un appelant annoncerait le post public de son choix tout en visant le fil
  d'un post prive. Le post est resolu DEPUIS le commentaire.
- **Ne garder que le chemin socket** : `likePost` / `PostReactionService.addReaction` ne verifient
  eux non plus que l'existence du post. Garder l'un sans l'autre ferait dependre l'ACL du
  TRANSPORT — un client refuse sur `post:reaction-add` reussirait en repassant par
  `POST /posts/:postId/like`.
- **Repondre `403`** : distinguer « interdit » d'« inexistant » fait de la route un oracle
  d'existence de posts prives. `404` partout, et `null` indistinct entre absent, supprime et
  invisible — doctrine deja tenue par `recordMediaDownloads`.

**Consequences** :
- Une requete bornee de plus par appel sur le fil. Cas dominant (post `PUBLIC`) : aucune lecture de
  graphe ensuite. `FRIENDS`/`EXCEPT` : une requete d'amitie, et le contact DM n'est consulte qu'en
  dernier recours. `EXCEPT` court-circuite sur sa liste noire avant toute lecture de graphe.
- **Un utilisateur qui perd l'acces a un post ne peut plus retirer une reaction qu'il y avait
  laissee.** Contrepartie assumee : elle lui est de toute facon invisible, et une ACL qui depend du
  sens du geste est un footgun. Seul l'auteur peut encore faire disparaitre le post.
- Les harnais de test doivent DECLARER leur audience (15 fichiers). C'est voulu : un double qui
  n'expose pas la tranche ACL echoue au lieu de rendre un verdict par defaut.
- `doUsersShareCommunity` prend desormais `CommunityVisibilityPrisma` au lieu de `PrismaClient`
  entier — la garde n'a plus a se faire passer un client complet par assertion.

**Tests** : 51 tests neufs, RED observe a chaque etape (24 rouges avant implementation) —
`__tests__/unit/services/posts/postThreadAccess.test.ts` (22), `.../routes/posts/comments-audience.test.ts`
(17), `.../routes/posts/interactions-audience.test.ts` (8), plus 9 cas d'audience dans les deux
suites de handlers socket. Suite gateway complete verte (608 suites, 15 740 tests), `tsc --noEmit`
propre.
