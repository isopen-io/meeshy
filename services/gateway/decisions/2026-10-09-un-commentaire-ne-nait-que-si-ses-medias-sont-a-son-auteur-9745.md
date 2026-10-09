## Un commentaire ne naît que si chacun de ses médias est libre et téléversé par son auteur : l'admission précède la création, la réclamation partage sa transaction (2026-10-09, #9745)

**Statut** : Accepté

**Contexte** : `PostCommentService.addComment` vérifiait seulement « le média n'est rattaché à rien », CRÉAIT le commentaire, puis réclamait les médias sous `claimableMediaWhere(authorId)`. Quand la réclamation ne matchait rien — le média appartenait à un autre compte — le commentaire existait déjà, restait publié sans pièce, et la route rendait `201`. Une requête rejouée sous le compte B avec les `attachmentIds` téléversés par A (file hors ligne rebranchée à la bascule de compte, audit du 2026-10-09, #9743) publiait donc le texte de A sous B, et le succès autorisait le client de A à supprimer ses fichiers.

**Décision** :
1. **L'admission précède toute écriture.** `assertCommentMediaClaimable` (`src/services/posts/commentMediaClaim.ts`) lit les médias demandés sous la MÊME clause que la réclamation — libres ET `uploaderId` = l'auteur de la requête. Un seul id qui n'en revient pas refuse le lot entier ; rien n'est créé, aucun compteur ne bouge.
2. **Création et réclamation partagent une transaction** dès que le commentaire porte un média : `claimCommentMedia` LÈVE sur un écart (média pris entre l'admission et la réclamation), ce qui annule la création. Un commentaire sans média reste une écriture simple, sans transaction.
3. **Le refus garde le code existant** : `400 MEDIA_NOT_AVAILABLE`, que la route rendait déjà pour un média déjà lié. Un ancien client le lit comme un refus définitif. « Inconnu », « déjà pris » et « à quelqu'un d'autre » ne se distinguent pas : les séparer ferait de la route un oracle d'existence des médias d'autrui.

**Conséquences** : un média sans propriétaire connu (`uploaderId` nul) refuse désormais le commentaire, là où il produisait un commentaire amputé. Un conflit d'écriture MongoDB dans la transaction sort en `500`, que la file durable rejoue sous le même identifiant de mutation.

**Ce que cette décision ne couvre pas** : `PostService.createPost` et `updatePost` gardent la forme « écrire puis réclamer, journaliser l'écart » — la propriété y est bien opposée à la réclamation, mais une publication dont un média est refusé naît quand même, amputée.
