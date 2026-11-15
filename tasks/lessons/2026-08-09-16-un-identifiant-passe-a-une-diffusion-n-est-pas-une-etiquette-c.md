## 2026-08-09 (16) — Un identifiant passé à une diffusion n'est pas une étiquette : c'est une requête sur un graphe

Le cycle 15 a montré qu'élargir QUI peut faire un geste périme les endroits qui identifiaient
l'acteur par l'objet muté. Ce cycle a trouvé le **miroir** du même défaut, en cherchant précisément
l'original : `DELETE /posts/:postId` passait le **contexte d'authentification** là où une **propriété
de l'objet** est attendue. Une seule cause pour les deux sens : acteur et cible ont longtemps
coïncidé, et rien dans les signatures ne disait laquelle des deux on demandait.

1. **Un paramètre qui sert à DÉPLIER une audience n'est pas décoratif.** `broadcastPostDeleted(postId,
   authorId)` ressemble à un payload — deux chaînes qu'on recopie. `authorId` sert en réalité à
   `getFriendIds(...)` : il **choisit les destinataires**. S'y tromper ne produit pas un champ faux
   dans un message reçu, ça produit un message **reçu par les mauvaises personnes et par personne
   d'autre**. Corollaire : **quand un paramètre alimente une requête (graphe social, audience,
   filtrage), le dire dans la docstring du destinataire** — l'appelant ne peut pas le deviner de la
   signature, et l'erreur est silencieuse des deux côtés.
2. **Le témoin qui doit passer au vert fait partie du test.** Sur les trois cas de modération, un
   quatrième test — l'auteur qui supprime lui-même — était **vert dès le départ**, exprès. Sans lui,
   les trois autres passeraient au vert en écrivant n'importe quel identifiant constant : c'est ce
   témoin qui prouve que la suite mesure « l'auteur » et non « une chaîne ». **Un test de
   discrimination a besoin des deux côtés de la discrimination**, même quand un seul est rouge.
3. **Une fixture infidèle asseyait le défaut.** Un test existant mockait `deletePost` en rendant un
   document soft-deleté **sans `authorId`** — ce que Prisma ne fait jamais — et affirmait ensuite que
   la diffusion recevait l'id de l'acteur. Il ne verrouillait pas un comportement voulu : il
   verrouillait **ce que sa propre fixture rendait possible**. Corollaire : **une fixture qui omet un
   champ que la source rend toujours n'est pas une simplification, c'est une hypothèse cachée** — et
   c'est elle qui décidera du jour où on croira devoir « casser un test qui passait ».
4. **Un raccourci qui saute un service en saute plusieurs choses à la fois, et on les découvre une
   par une.** `DELETE /admin/posts/:postId` écrit `deletedAt` sans passer par
   `PostService.deletePost`. Un cycle précédent y avait trouvé les usages de sons jamais libérés — et
   avait **laissé un commentaire nommant le raccourci**. Ce cycle y a trouvé la diffusion absente ;
   restent la désactivation des liens de partage et la ligne d'audit. **Quand on répare une omission
   causée par un contournement de service, inventorier TOUT ce que le service fait au même moment**,
   plutôt que la seule omission qui a été signalée : les autres sont déjà là, et chacune attendra son
   propre incident.
