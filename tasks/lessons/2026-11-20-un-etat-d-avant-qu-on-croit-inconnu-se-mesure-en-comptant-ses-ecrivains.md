## Un état d'AVANT qu'on croit inconnu se mesure en comptant ses ÉCRIVAINS (cycle 193, #19971)

`AttachmentService.associateAttachmentsToMessage` n'écrit pas que `messageId` :
elle pose aussi `isViewOnce`, `isBlurred`, `rank`, et compose `effectFlags` **par
OU** — son doc-comment l'énonce, « il n'AJOUTE que de la protection ».
`discardMessageAfterLinkFailure`, la libération d'un échec de liaison, ne remettait
que `messageId: null` : une pièce libérée ressortait **marquée par un message qui
n'existe plus**, et la recomposer SANS vue unique depuis la même pièce téléversée
livrait une photo à vue unique sous une bulle ordinaire.

L'issue posait la question comme indécidable, et c'est ce qui l'avait laissée
ouverte :

> « L'état d'AVANT la liaison n'est connu de personne : la lecture qui le portait
> (`carriedFlags`) fait partie de l'opération qui vient d'échouer. »

**Mesuré : il est connu, et il est VIDE.** La question se répond en comptant les
ÉCRIVAINS de ces colonnes, pas en cherchant qui a lu l'état :

| site de création d'un `MessageAttachment` | pose la protection ? |
|---|---|
| `UploadProcessor.ts:437` | non |
| `UploadProcessor.ts:614` | non |
| `routes/uploads/tus-handler.ts:723` | non |
| `messaging/copyAttachments.ts:138` (copie transférée) | non |

L'association est donc le **seul** écrivain de production de ces trois colonnes
(aucun autre `messageAttachment.update*` ne les touche), et `schema.prisma` les
déclare non nullables : `isViewOnce Boolean @default(false)`,
`isBlurred Boolean @default(false)`, `effectFlags Int @default(0)`. L'état
d'avant liaison est le **défaut du schéma**, et la libération peut le rendre sans
jamais affaiblir quoi que ce soit.

> **Devant un « cet état n'est connu de personne », ne pas chercher qui l'a LU :
> compter qui l'ÉCRIT.** S'il n'y a qu'un écrivain, l'état d'avant est le défaut
> de la colonne — une propriété du schéma, pas une information perdue avec
> l'opération qui a échoué. Et un seul écrivain, c'est aussi ce qui autorise à
> écrire la décision à UN endroit (critère de fin de l'issue : « là où
> l'association compose ses flags », pas seulement dans le module d'abandon).

Trois corollaires du lot :

- **La forme de la réparation vit dans le TYPE.** `AttachmentFailurePrisma`
  déclarait `data: { messageId: null }` : une libération qui n'aurait rendu que
  deux colonnes sur trois aurait compilé. Les trois y sont désormais REQUISES —
  c'est la seule garde qu'un double ne peut pas simuler, puisqu'un mock accepte
  ce qu'on lui donne. Rouge prouvé : retirer une colonne de la libération rend
  `TS2353`.
- **Ce qu'on ne rend PAS mérite sa phrase autant que ce qu'on rend.** `rank` est
  réécrit inconditionnellement par la prochaine association pour tous les ids de
  son lot : il ne peut pas contredire le message qui reprend la pièce. Le dire
  évite qu'un lot suivant l'ajoute « par symétrie » à une liste dont chaque
  membre a une raison. Un témoin le garde.
- **Un fail-closed n'est pas une raison de laisser.** Le sens de l'erreur était
  « plus protégé que demandé », ce qui a permis de traiter la chose à part — et
  non de la garder : la protection de la PIÈCE contredisait celle du MESSAGE,
  exactement ce que #7498 avait fermé dans l'autre sens.

### Et un paragraphe de doc qui disait l'inverse, relu dans le même lot

Le module d'abandon portait un § « Ce que la libération ne rend PAS, et c'est
assumé » qui ÉNONÇAIT la prémisse fausse. Il est réécrit avec la mesure, parce
qu'un commentaire qui déclare une chose indécidable est plus coûteux qu'un
commentaire absent : il décourage la mesure qui la déciderait.
