---
'@meeshy/gateway': patch
---

Supprimer un commentaire laissait derrière lui toutes les notifications qu'il avait produites, avec
l'extrait de son texte.

Sixième occurrence du mécanisme déjà vu sur les `TrackingLink` et les `Mention` d'un message
rappelé, sur ses `Notification`, sur celles d'une demande d'amitié supprimée puis sur celles d'un
post retiré — et la première un cran **en dessous** du post. `PostCommentService.deleteComment`
soft-delete le sous-arbre (`PostComment.deletedAt`), décrémente `commentCount` et `replyCount`,
puis rend `{ success: true }`. Il ne touchait rien de ce que le commentaire avait écrit dans
l'inbox des autres.

Rien ne l'en retirait, pour les trois raisons habituelles réunies : le retrait est **doux**, donc
aucune cascade ne se déclenche ; le lien vit dans un blob JSON, donc il n'y a même pas de relation
déclarée qui pourrait le faire ; et la ligne détient une copie **dénormalisée** du contenu retiré
(`content` = l'extrait du commentaire, `metadata.commentPreview`), donc aucun filtre à la lecture ne
peut la rattraper — la notification ne relit jamais le commentaire. Résultat : « X a commenté votre
publication · <le texte qu'il vient d'effacer> » restait affiché, non lu, dans l'inbox de toute
l'audience du fil, avec un `action: view_post` qui ouvre un fil où la cible est filtrée partout
(`getComments` / `getReplies` excluent `deletedAt`).

**Deux différences avec le jumeau côté post décident l'implémentation, et la première n'était pas
attendue.**

Le lien vers un commentaire vit dans **deux** chemins JSON, et aucun des deux ne couvre tous les
types. Les huit producteurs se répartissent en trois familles : `context.commentId` seul
(`comment_reaction`) ; `metadata.commentId` seul (`post_comment`, `comment_like`) ; les deux
(`comment_reply`, `user_mentioned` en commentaire, `story_new_comment`, `story_thread_reply`,
`friend_story_comment`). Une transposition littérale du retrait de post — qui ne connaît que
`context.<clé>` — aurait donc laissé en base les `post_comment`, c'est-à-dire la notification la
**plus fréquente** de toute la famille : une par commentaire, vers l'auteur du contenu. D'où le
`$or` sur les deux chemins. Uniformiser les huit producteurs sur `context` serait le correctif de
fond ; il change un contrat que les clients lisent, et n'aiderait de toute façon pas les lignes
déjà écrites.

La cible est une **liste**, pas un id. `deleteComment` soft-delete le sous-arbre entier — le
commentaire et ses réponses à profondeur arbitraire, parce que `commentCount` compte le fil complet
— et le retrait reçoit exactement la liste d'ids que le soft-delete a écrite. Ne traiter que la
cible aurait laissé derrière lui les notifications des réponses emportées avec elle.

`parentCommentId` est **volontairement** hors du filtre. C'est la seule autre clé de `context` qui
désigne un commentaire, et elle ne désigne jamais le sujet de la ligne : sur un `comment_reply`,
`commentId` est la réponse et `parentCommentId` le commentaire auquel on répond. Le cas où le parent
disparaît est déjà couvert par le sous-arbre — la réponse part, donc la ligne part par son
`commentId`.

**Retrait plutôt que marquage**, comme pour le post et pour la demande d'amitié : la cible est
filtrée partout à la lecture, donc la ligne n'a plus rien à afficher **et** rien où mener. Et seul
l'auteur peut retirer son commentaire (`deleteComment` rejette `FORBIDDEN` sinon), donc il n'existe
pas de retrait de modération dont la notification serait la seule trace. Le geste est celui que les
clients savent déjà recevoir (`notification:deleted`, écouté par le web et par le SDK iOS), doublé
d'un `notification:counts` par destinataire sans lequel la cloche resterait sur un compteur incluant
des lignes que le serveur vient de supprimer.

La forme reprend celle du retrait de post, pour les mêmes raisons : commande brute (Prisma ne filtre
pas les chemins JSON sur MongoDB), suppression par ids **relus** et non par prédicat — l'ensemble
supprimé et l'ensemble annoncé sont alors identiques par construction — annonce **après**
l'écriture durable, et drainage par lots de 200 en série, un fil populaire cumulant `post_comment`,
`comment_reply`, `comment_like` et mentions sur chaque commentaire du sous-arbre.

**Best-effort** comme les quatre effets du retrait de post : `deletedAt` est déjà committé quand le
retrait s'exécute, et une inbox récalcitrante ne doit pas transformer une suppression réussie en
500. La route n'a rien à câbler — l'annonceur se résout par défaut de paramètre sur le service
partagé du processus, le seul branché avec `io`, évalué à chaque appel puisque ce service n'est
enregistré qu'au démarrage du socket.

Couvert (RED→GREEN, rouges observés sur les deux surfaces) par 12 tests sur l'unité de retrait et 4
sur le câblage, dont quatre témoins re-vérifiés par sonde en réintroduisant le défaut : un filtre
sur le seul `context.commentId`, un retrait borné à la cible au lieu du sous-arbre, l'appel retiré
de `deleteComment`, et l'annonce placée avant l'écriture durable. Ne rattrape pas les lignes déjà
orphelines en base : action humaine, sur le patron des scripts de réparation existants.
