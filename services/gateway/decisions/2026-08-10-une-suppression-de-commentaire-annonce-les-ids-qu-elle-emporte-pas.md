## 2026-08-10 : Une suppression de commentaire annonce les ids qu'elle emporte, pas sa seule cible

**Statut** : Accepté
**Contexte** : `PostCommentService.deleteComment` soft-delete le sous-arbre entier (cible + descendants, arbitrairement profond) et décompte `commentCount` d'autant — le retrait des notifications porte déjà sur cette même liste. Mais la valeur de retour ne disait que `{ success: true }` : la liste mourait dans la méthode. Son seul appelant, la route `DELETE /posts/:postId/comments/:commentId`, n'avait donc rien d'autre à mettre dans `broadcastCommentDeleted` que le `commentId` reçu en paramètre. Les réponses du commentaire supprimé restaient affichées chez tout client qui les avait dépliées — **et aucun refetch ne les enlevait** : `getComments` filtre `parentId: null`, le parent supprimé n'est plus rendu, donc `getReplies` n'est plus jamais appelé pour elles. Seul un rechargement complet nettoyait le fil. Le compteur, lui, était juste (`commentCount` voyage en ABSOLU) : l'écran affichait donc un total en désaccord visible avec ses propres lignes.

**Décision** :
- `deleteComment` rend `deletedCommentIds` — **exactement** la liste passée au soft-delete, calculée une seule fois et réutilisée par le décompte, le retrait des notifications et l'annonce. Pas de seconde dérivation : après le soft-delete, reconstruire le sous-arbre demanderait de relire des lignes que `NOT_DELETED` masque désormais.
- `CommentDeletedEventData.deletedCommentIds` est **optionnel** (`readonly string[] | undefined`). Additif par construction : iOS et Android gardent le comportement d'avant sans changer une ligne, et pourront l'adopter à leur rythme.
- Un lecteur du champ **doit** se replier sur `[commentId]` quand il est absent. C'est le cas du rejeu idempotent (`onDuplicate` de `withMutationLog`), qui ne rend qu'un `{ id }`.

**Alternatives rejetées** :
- **Reconstruire le sous-arbre dans la route** : impossible après coup sans requête dédiée ignorant `deletedAt`, et ce serait une seconde dérivation de la même règle — la classe de bug que `posts/ephemeralPosts.ts` a déjà coûté un cycle à refermer.
- **Émettre un `comment:deleted` par id retiré** : N broadcasts là où un suffit, chacun portant un `commentCount` identique et absolu, donc N−1 patchs redondants sur chaque client.
- **Se replier sur une liste vide plutôt que `[commentId]`** : ferait survivre la cible elle-même à l'écran sur le chemin de rejeu — une régression franche par rapport à l'existant.
- **Rendre le champ obligatoire** : forcerait iOS et Android à bouger dans le même cycle pour un gain nul chez eux tant qu'ils ne le lisent pas.

**Conséquences** :
- Le payload grossit du nombre de descendants — borné par la profondeur réelle d'un fil, et seulement sur l'événement de suppression.
- Le web purge tous ses caches de commentaires du post en une passe (liste principale ET sous-caches de réponses, que le préfixe de clé `posts.comments(postId)` couvre déjà).
- **iOS et Android ne montraient pas ce défaut** — vérifié en lisant leur code, pas supposé. Chacun compense localement : iOS `PostDetailViewModel` fait `repliesMap[id] = nil` + `expandedThreads.remove(id)` sur chaque `comment:deleted`, Android `PostCommentsViewModel.onCommentDeleted` appelle `CommentRepliesState.removedThread(commentId)`. Deux re-dérivations indépendantes, dans deux langages, d'une liste que le serveur connaissait et taisait. Le web était le seul client sans cette compensation — d'où un défaut visible là seulement. `deletedCommentIds` rend ces traversées locales inutiles : elles pourront céder la place à un retrait autoritatif, ce qui est le vrai gain de fond de cette décision.

**Tests** : +3 `PostCommentService.test.ts` (la liste rendue = la liste soft-deletée, cible seule sur une feuille, sous-arbre profond), +2 `routes/posts/comments.test.ts` (le broadcast porte la liste ; repli sur la cible au rejeu), +2 web `use-post-socket-cache-sync.test.tsx` (le sous-arbre annoncé quitte les caches de réponses ; repli sans liste). Trois sondes de fidélité, chacune isolant exactement ses témoins.
