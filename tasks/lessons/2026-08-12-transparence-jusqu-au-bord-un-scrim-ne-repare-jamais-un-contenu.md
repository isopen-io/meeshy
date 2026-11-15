## 2026-08-12 — « Transparence jusqu'au bord » : un scrim ne répare jamais un contenu tronqué

Trois passages sur la même capture, le même jour. Le symptôme rapporté a d'abord été lu comme
« du contenu déborde sous la Dynamic Island » → un scrim noir a été posé ; puis « enlever la
barre noire » → le scrim a été retiré ; puis « enlever la couleur unie derrière dynamic island
pour avoir de la transparence jusqu'en bordure d'écran comme sur les autres vues ».

**Ce que la capture disait et que deux passes n'ont pas lu.** La bulle du haut était coupée NET,
en plein milieu, sur une ligne horizontale. Une coupe à mi-bulle n'est pas un contenu qui se
repose contre un inset — c'est un contenu **clippé aux bornes de la vue**. Le `MessageListView`
(`UIViewControllerRepresentable`) était posé DANS la safe area : la liste s'arrêtait sous l'îlot,
et la bande restante ne montrait plus que le dégradé de fond — plat, donc lu comme « couleur
unie ». Peindre cette bande (scrim) ne pouvait que déplacer le problème : la demande était que le
CONTENU y passe, comme il passe sous le verre des écrans à `CollapsibleHeader`.

**La règle.** Devant « il y a une bande de couleur en haut », distinguer d'abord *une couche
peinte en trop* de *du contenu qui manque*. Le discriminant est dans l'image : un bord franc au
milieu d'un élément = clipping ; un élément entier posé sous la limite = inset. Le premier se
répare en étendant la vue, jamais en la recouvrant.

**Le piège technique qui va avec.** Une fois la vue étendue par `.ignoresSafeArea`, l'inset haut
réel n'est plus lisible ni par le `GeometryReader` ni par le contrôleur hébergé (SwiftUI cesse de
le propager). Il doit venir de la fenêtre (`DeviceLayout.safeAreaTop`) et être passé en paramètre
— sinon la pill de jour, ancrée au `safeAreaLayoutGuide`, remonte silencieusement sous l'îlot et
défait le correctif du même jour. Sur une liste inversée (`scaleY: -1`), penser en plus que le
HAUT visuel est `contentInset.bottom`, et couper `contentInsetAdjustmentBehavior` (`.never`) :
l'ajustement automatique d'UIKit pose la safe area du mauvais côté du flux.
