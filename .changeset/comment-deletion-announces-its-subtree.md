---
'@meeshy/gateway': patch
'@meeshy/shared': patch
'@meeshy/web': patch
---

Supprimer un commentaire annonce enfin le fil qu'il emporte — ses réponses restaient à l'écran, et rien ne les en enlevait jamais.

`PostCommentService.deleteComment` soft-delete le SOUS-ARBRE ENTIER depuis le cycle qui a corrigé
l'invariant de `commentCount` : la cible et tous ses descendants, sur la même liste d'ids, et le
retrait des notifications porte déjà sur cette même liste. Mais cette liste mourait dans la méthode —
la valeur de retour ne disait que `{ success: true }`.

Son seul appelant, la route `DELETE /posts/:postId/comments/:commentId`, n'avait donc rien d'autre à
annoncer que la cible : `broadcastCommentDeleted` partait avec le seul `commentId`. Chez tout client
qui avait déplié les réponses du commentaire supprimé, ces réponses restaient affichées — des lignes
que le serveur venait de retirer.

**Et aucun rechargement ne les enlevait.** `getComments` filtre `parentId: null` : le parent
supprimé n'est plus rendu, donc `getReplies` n'est plus jamais appelé pour ses réponses. Le fil ne
se nettoyait qu'au rechargement complet de la page. Le compteur, lui, était juste depuis le début —
il voyage en ABSOLU (`commentCount`), donc l'écran affichait « 3 commentaires » au-dessus de quatre
lignes visibles.

**Le correctif tient en une liste qui remonte.** `deleteComment` rend désormais
`deletedCommentIds` — exactement la liste qu'il a soft-deletée, jamais une seconde dérivation (après
le soft-delete, la reconstruire demanderait de relire des lignes que `NOT_DELETED` masque
désormais). La route la place dans le payload, et le web en purge tous ses caches de commentaires
d'un coup, réponses comprises.

Le web était le SEUL client à montrer ce défaut. iOS (`repliesMap[id] = nil` +
`expandedThreads.remove(id)`) et Android (`CommentRepliesState.removedThread`) compensaient déjà,
chacun par sa propre traversée locale — deux re-dérivations indépendantes d'une liste que le serveur
connaissait et taisait. `deletedCommentIds` les rend caduques : c'est le gain de fond, au-delà du
défaut visible sur le web.

`CommentDeletedEventData.deletedCommentIds` est **optionnel** pour rester additif : iOS et Android
gardent le comportement d'avant sans changer une ligne. Un client qui le lit se replie sur
`[commentId]` quand il est absent — c'est le cas du rejeu idempotent (`onDuplicate`), qui ne rend
qu'un `{ id }` parce que la suppression a déjà eu lieu et que son sous-arbre n'est plus
reconstructible par une lecture vivante. Le repli reproduit exactement le comportement d'avant ce
correctif ; une liste vide, elle, ferait survivre la cible elle-même à l'écran.
