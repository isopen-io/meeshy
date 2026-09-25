## Leçon 618 — Une loi qui ne SAIT pas ce qu'elle cadre ne doit pas décider du rognage (2026-09-16)

**Le fait.** Directive porteur : en plein écran, une scène de post ou de story ne
doit plus laisser de bandes — « pas une troisième couche, juste agrandir le canvas
à sa taille totale du viewport ». J'ai voulu faire rendre cela par le solveur de
cadrage partagé, `MediaStageFraming`, en lui ajoutant un `Subject` : le cadre
saurait s'il ajuste ou s'il couvre. Les témoins passaient. **Au simulateur, un
média de post en plein cadre se posait EN HAUT À GAUCHE, à ses cotes CARDÉES
(369 × 366), au lieu d'être centré.** Mesuré des deux côtés du diff : sans le
sujet câblé, il est centré. J'ai sorti la moitié galerie de `dev` le jour même.

**Ce qui l'explique.** Le solveur reçoit un viewport, un ratio et des couloirs. Il
ne sait PAS ce qu'il cadre — et la règle à écrire dépend justement de cela :

| ce que la page porte | ce que les bords valent | donc |
|---|---|---|
| une pièce jointe | **le contenu de l'expéditeur** | jamais rognée ; son hors-champ habillé est une finition |
| une scène | **une surface de composition** | rognable ; la laisser en boîte aux lettres peint une surface que personne n'a composée |

Deux natures, deux règles, une seule fonction pour les servir : le paramètre que
j'ajoutais ne DONNAIT pas au solveur la connaissance qui lui manquait, il lui
demandait de trancher une question dont la réponse vit chez l'appelant.

> **Avant d'ajouter un paramètre à une loi partagée, demander si la loi pourrait
> répondre SEULE à la question qu'il pose.** Si la réponse dépend de ce que
> l'appelant est — et pas de ce qu'il passe —, le paramètre déplace la décision
> sans déplacer le savoir, et la loi se met à décider pour des appelants qu'elle
> ne connaît pas.

**Le remède, et sa forme.** Le solveur garde son contrat `media <= frame` intact
et gagne une fonction EN PLUS, `coverScale(frame:media:)` — pure, sans opinion,
qui dit seulement « de combien faut-il agrandir pour couvrir ». **Qui l'appelle
décide.** La page scène de la galerie l'appelle, la page image jamais ; le
lecteur de story l'appelle pour son état `.immersive`, jamais pour le `.free` du
composer — où couvrir rognerait la scène que l'auteur est en train de dessiner.

**Le signe qui l'annonçait, et que je n'ai pas lu.** J'avais écrit moi-même sur
l'issue, en constatant la régression : « le rognage appartient au canvas, qui
sait ce qu'il compose ». La phrase juste était là, et j'ai quand même cherché la
correction dans le solveur au tour suivant. **Une conclusion notée n'est pas une
conclusion appliquée** — relire ses propres commentaires d'issue avant de
reprendre un lot, au même titre qu'on relit les doc-comments (leçon 616).

Sites : `MediaStageFraming.coverScale`, `StoryCanvasFraming.resolve(.immersive)`,
`GalleryScenePage.canvasCoverScale`. Issue #6806.
