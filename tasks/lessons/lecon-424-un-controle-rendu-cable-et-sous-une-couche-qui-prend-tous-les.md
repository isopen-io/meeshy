## Leçon 424 — Un contrôle rendu, câblé, et sous une couche qui prend TOUS les touchers : la sixième nature d'un contrôle qui ment

**Le fait (2026-09-02).** L'invite « voir plus » de la légende d'une story était
rendue, correctement positionnée, câblée à son `onToggle`, et son témoin passait.
Trois taps sur sa cible ont fait **naviguer le lecteur d'une story à l'autre**.
Aucun n'a déplié.

La cause n'est ni dans le bouton ni dans son câblage : `StoryGestureOverlayView`
(« Layer 6 ») est montée ligne 1841 du même `ZStack` là où la légende l'est ligne
1745 — donc AU-DESSUS. C'est un `Color.clear` + `contentShape(Rectangle())` sur
tout le cadre, avec un `DragGesture(minimumDistance: 0)` qui reconnaît dès le
touch-down.

> **Un contrôle correctement rendu, correctement câblé, sous une couche qui prend
> tous les touchers, est INERTE — et rien ne rougit : la couche de gestes fait
> exactement son travail.**

C'est une **sixième** nature, distincte des cinq déjà répertoriées (inerte, non
alimenté, contrat mort, repli menteur, mauvaise granularité) : ici **tout est
juste sauf l'ORDRE**. Aucune inspection du composant ne peut la voir — il faut
regarder ses VOISINS dans la pile.

**Le corollaire de dimension, mesuré dans la foulée.** La cible faisait
**54 × 16 pt**, la moitié du minimum HIG. Et l'effet d'un raté n'est pas neutre :

> **Un contrôle sous-dimensionné DANS une couche qui en recouvre une autre ne
> rate pas son action : il en déclenche une DIFFÉRENTE.** C'est pire qu'un no-op,
> et aucun test de cible tactile ne le voit — il mesure la taille, pas ce qu'il y
> a dessous.

**Le geste.** Devant un contrôle qui « ne répond pas » : avant de relire son
câblage, chercher ce qui est monté APRÈS lui dans le même conteneur. Et si le
tap déclenche autre chose au lieu de ne rien faire, c'est la signature — un
no-op accuserait le câblage, un effet étranger accuse la pile.

Le relèvement (`zIndex`) n'est sûr que si la couche relevée ne prend le doigt que
là où elle agit. `MediaCaptionOverlay` le documente : sa forme repliée ne pose
aucun `contentShape` sur son fond.
