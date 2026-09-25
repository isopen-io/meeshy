## Leçon 177 — Une entrée choisie par l'appelant ne fixe pas que l'ADRESSE : elle peut fixer l'AUDIENCE (2026-08-15, routine temps réel, cycle 28)

Suite directe de la leçon 175. `DELETE /posts/:postId/comments/:commentId`
supprimait par `commentId` — la propriété du commentaire est vérifiée, la garde
est juste — puis relisait un post par le `:postId` du CHEMIN et s'en servait
pour trois choses : l'adresse du broadcast, le `commentCount` annoncé, et
`authorId` / `visibility` / `visibilityUserIds`, c'est-à-dire **la liste de
diffusion elle-même**.

**Ce que la leçon 175 ne disait pas encore.** Elle traitait l'adresse comme un
nom de room : au pire, l'événement part au mauvais endroit. Ici la même valeur
sert à CALCULER l'audience — l'appelant ne choisissait pas seulement où son
annonce partait, mais **à qui**, en nommant un post dont il aimait l'ACL.
Quand un id client alimente une lecture d'ACL, il ne faut pas se demander « la
room est-elle la bonne ? » mais « **quelles décisions cette valeur prend-elle
en aval ?** » — et les recenser toutes.

**Quand la vérité n'est pas en scope, on élargit la SOURCE — on ne fait pas
confiance à l'appelant.** `PostCommentService.deleteComment` tenait déjà
`comment.postId` (il s'en sert pour décrémenter `commentCount`) et le jetait.
Le rendre coûte zéro requête. Le réflexe inverse — « la vérité n'est pas là,
prenons le paramètre » — est exactement ce qui produit ce défaut ; le réflexe
juste est de remonter d'un cran vers l'endroit qui la tient déjà.

**Chaque chemin qui produit la MÊME annonce doit dériver la vérité, ou se
taire.** Le rejeu idempotent (`onDuplicate`) ne rejoue pas le service : sans
relecture propre, il n'avait plus d'adresse serveur du tout. Le soft-delete
garde la ligne — `deletedAt` la marque, il ne l'efface pas — donc `postId` reste
lisible là où le sous-arbre, masqué par `NOT_DELETED`, ne l'est plus. Quand
même ce repli est impossible, **ne rien annoncer** bat annoncer à une audience
choisie par l'appelant : les deux laissent la ligne à l'écran, la seconde y
ajoute la pollution d'un fil étranger. Un `undefined` qui adresse une diffusion
n'est jamais un repli acceptable.

**Le voisin correct est le meilleur oracle.** Dans le même fichier, `PATCH`
(`comment.postId`), `POST` (`resolveInteractionTarget` → `targetPostId`),
`GET .../replies` et `POST .../translate` (`loadCommentPostAcl`) dérivent tous
du serveur — `GET .../replies` porte même la règle en commentaire. Un seul des
six chemins divergeait. Quand une famille de routes partage un préfixe d'URL,
lire d'abord celles qui sont justes donne la forme attendue et rend l'outlier
visible en une lecture.
