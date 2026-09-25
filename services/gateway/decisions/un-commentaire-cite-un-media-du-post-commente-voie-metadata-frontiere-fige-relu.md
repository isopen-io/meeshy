## Un commentaire CITE un média du post commenté — voie `metadata`, frontière figé / relu (2026-09-15, #6578)

**Contexte.** Directive porteur du 2026-09-14 : *« de répondre dans un thread de
poste qui a des média de créer des commentaire à citant le média si nécessaire !
Ou lors de la réponse ajouter d'autres média… »*. #6164 porte la moitié
CONVERSATION de ce geste (citer une pièce d'un message) ; celui-ci porte la
moitié PUBLICATION.

**Décision — AUCUNE migration Prisma.** `PostComment.metadata Json?` existe déjà
(« parité avec `Message.metadata` / `Post.metadata` ») et porte déjà
`trackingLinks` et `location`. La citation y prend la clé `quotedPostMedia`,
selon la voie C hybride que le porteur a arbitrée le 2026-09-12 pour le jumeau
conversation (#6123) :

| FIGÉ dans `metadata.quotedPostMedia` | RELU à chaque service |
|---|---|
| `postMediaId` — l'ancre du saut | vignette, `fileUrl`, ThumbHash, nom, taille |
| `kind` — la NATURE du média | **DURÉE**, légende, alt, transcription, pistes traduites |

Un média cité supprimé ou détaché de sa publication dit **« une photo »** et
rien de plus : la citation ne se vide pas, et elle ne fuit pas. Le PRÉCÉDENT est
`protectedPreview()` — d'un contenu protégé, il ne divulgue que l'icône de
protection et l'icône de TYPE.

**`kind` est DÉRIVÉ du MIME relu, jamais déclaré par le client.** C'est le seul
fait descriptif qui survit à la disparition du média, donc le seul que le client
ne doit pas pouvoir forger : un client qui annonce `file` sur une vidéo verrait
sinon sa citation dire « un fichier » pour toujours.

**La garde, et sa raison.** Un `postMediaId` dont le `postId` n'est pas le post
COMMENTÉ est REFUSÉ (400, avant toute écriture) : citer le média d'une
publication qu'on ne lit pas est une FUITE, pas une faute de frappe qu'on
tolérerait en retombant sur le premier média. L'égalité suffit parce que
l'audience du fil est tranchée en amont (`resolveInteractionTarget`) — un média
du post commenté est, par construction, déjà visible de qui écrit. Le `postId`
opposé est celui de la CIBLE réelle, donc la racine pour un repost simple.

**FAIL-CLOSED en deux temps**, comme `citedAttachmentBackfill` : le service
REVÉRIFIE l'appartenance sur la ligne relue. Une garde d'écriture ne dit rien
des lignes écrites AVANT elle, ni d'un média que `onDelete: SetNull` a détaché
depuis — le `postId` d'une ligne `PostMedia` n'est pas immuable.

**La décision ouverte du lot, tranchée : le PLURIEL.** La directive dit
« ajouter d'autres média », la relation Prisma est déjà `PostMedia[]`, et
`CommentAttachmentsTray` acceptait déjà un TABLEAU dont ses hôtes remplissaient
plusieurs vignettes — pendant que `attachmentIds` était borné à 1. Le bandeau
montrait donc N pièces pour n'en envoyer qu'une : **un contrôle qui ment.** La
borne passe à `MAX_POST_MEDIA`, RÉUTILISÉE et non réallouée — deux plafonds
seraient deux vérités, et la seconde dériverait au premier ajustement.

Trois conséquences portées dans le même lot :
- un seul média indisponible refuse le lot ENTIER (un commentaire amputé en
  silence est pire que le refus) ;
- le RANG des médias suit l'ordre de la requête (`applyCommentMediaOrder`,
  jumelle de `applyMediaOrder`) — la liste de la requête est le seul porteur de
  l'ordre voulu ;
- la transcription mobile, qui décrit UNE piste, se pose sur le média AUDIO du
  lot et non sur « le premier », qui peut être une photo dès qu'il y en a
  plusieurs.

**Alternative rejetée — une colonne `quotedPostMediaId` sur `PostComment`.**
Elle aurait exigé une migration pour un champ que `metadata` porte déjà, et
n'aurait rien apporté : la garde d'appartenance n'est pas une contrainte
d'intégrité référentielle (elle lie le média au POST, pas au commentaire), et
aucune requête n'a besoin d'indexer « les commentaires qui citent ce média ».

**Alternative rejetée — l'instantané intégral (voie A, comme `postReplyTo`).**
Un instantané ne se relit pas : il survivrait à la suppression du média et à une
légende retirée. `postReplyTo` a le droit de survivre à l'expiration de son post
— c'est sa fonctionnalité ; une vignette de média de post, non.

**Conséquences.** `services/posts/quotedPostMediaSnapshot.ts` tient ENSEMBLE la
forme, la liste des champs révocables et la garde d'écriture — sans ce
voisinage, le premier lecteur qui figerait un champ de plus le ferait sans
qu'aucun témoin tombe. `services/posts/citedPostMediaBackfill.ts` sert la
citation sur les QUATRE surfaces depuis un site unique (liste, réponses,
création, édition), en UNE requête par page et aucune quand personne ne cite ;
l'écho Socket.IO et la réponse REST partagent la MÊME lecture, pour qu'ils ne
puissent pas diverger. Le contrat de fil est déclaré dans
`packages/shared/types/post.ts` (`QuotedPostMediaRef`).
