## Leçon 336 — une extraction qui perd une capacité de son site d'origine n'est pas une extraction, c'est une réécriture

**Le fait.** Le composer unifié avait besoin de la surface de dessin de l'atelier. La règle du dépôt est
écrite : « un contrôle venu d'un panneau privé s'emprunte par EXTRACTION — son corps sort dans une vue
partagée publique, et l'ancien panneau consomme la vue extraite lui aussi » (#4035). J'ai sorti le corps :
trois vues, sept lectures de ViewModel, un `ZStack` de soixante-quatre lignes.

**Ce que la première extraction perdait.** La couche de capture de l'atelier reçoit un rappel de plus que
les autres — `onViewportPinch` —, qui permet de zoomer d'inspection PENDANT le dessin. Il ne participe à
rien de ce que la vue extraite « est » : ni à la capture du trait, ni à son rendu, ni à la gomme. Il ne
figurait donc dans aucune des sept lectures que j'avais recensées pour composer la nouvelle vue, et la
vue extraite compilait, et l'atelier compilait, et rien n'aurait rougi.

> **Le test d'une extraction n'est pas « le nouveau site marche-t-il ? » mais « l'ANCIEN site a-t-il
> encore tout ce qu'il avait ? »** — et il se répond en comparant les ENTRÉES du bloc extrait, une à une,
> pas en relisant ce qu'il produit. Un rappel qu'aucune des deux surfaces ne partage est justement celui
> qu'on oublie : il n'appartient pas au dénominateur commun, donc il disparaît quand on cherche le
> dénominateur commun.

Le remède est petit — la vue extraite REÇOIT le rappel en optionnel et le relaie sans le décider — mais il
fallait le voir. Ce qui l'a fait voir : relire le bloc supprimé ligne à ligne AVANT de l'écraser, et non
la vue neuve après l'avoir écrite. Le diff d'une extraction se lit dans le sens de la SUPPRESSION.

**Corollaire de placement, tiré du même lot.** La bande de réglages du pinceau pouvait vivre côté app,
dans la bande de la scène. Elle vit côté SDK, avec la surface, pour une raison mesurable : ses six
entrées sont des `@Published` INTERNES. Les publier pour qu'une vue de l'app les lise, c'est **six accès
ouverts pour un seul écran**, et chaque `public` posé sur un réglage est une promesse de stabilité que ce
réglage n'a pas. Loger la vue là où vit son état n'a rien coûté à la pureté du SDK — cette bande ne décide
de rien, elle rend des réglages et les repose.

> **Quand une vue et son état ne sont pas du même côté d'une frontière de module, déplacer la VUE coûte
> presque toujours moins que publier l'ÉTAT.** Une vue publiée expose une forme ; six réglages publiés
> exposent six libertés d'évolution.

Le compilateur a d'ailleurs tranché la partie qui restait : le MODE (`isDrawingActive`,
`enterDrawingEditingMode`, `exitDrawingEditingMode`) devait, lui, franchir la frontière — c'est l'hôte
qui décide QUAND on dessine. Trois accès, pas neuf. La ligne de partage n'est pas « SDK ou app » mais
**« qui décide » contre « qui rend »**.

Voir la leçon 335 (un commentaire qui explique une absence est le seul que rien ne fait rougir) : cinq
fois dans la même session, seul un niveau d'accès retenait un geste. Ici, pour la première fois, en poser
un de plus aurait été le mauvais correctif.
