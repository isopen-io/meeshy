## Leçon 358 — « Qui AFFICHE ce que je résous ? » a une jumelle qu'on oublie : « qui l'ALIMENTE, et à quel MOMENT ? »

**Le fait.** `StoryLetterboxFill` habille d'un flou les bandes qu'un média AJUSTÉ laisse
dans une scène 9:16. Règle juste, seize témoins verts, câblage vérifié — et **bande NUE au
simulateur**, sur le cas exact de la directive. La source acceptée était le ThumbHash du
média ; or `StoryThumbHashEnricher` ne s'exécute qu'à la **PUBLICATION**. Un média que
l'auteur vient de choisir dans sa photothèque n'a donc aucun hachage.

La feature était inerte pendant **toute la composition** — c'est-à-dire pendant tout le
temps où elle sert à quelque chose.

> Le cycle 122 a appris à demander « qui AFFICHE ce que je viens de résoudre ? ». Sa
> jumelle est en AMONT : **« qui l'ALIMENTE, et à quel moment du cycle de vie ? »** Une
> source qui n'existe qu'après un jalon (publication, upload, synchro serveur) est absente
> de tout ce qui précède ce jalon, et un test unitaire ne le voit jamais : il fournit la
> donnée lui-même.

**La forme du correctif.** Deux sources ordonnées plutôt qu'une — le BITMAP déjà stampé
quand il existe (en mémoire, exact, et dont le hachage n'est qu'une approximation), le
hachage sinon (démarrage à froid du lecteur, où il est le seul matériau et coûte une
milliseconde). Et la bande se repeint **au STAMP du bitmap**, pas seulement au `configure` :
le chargement est asynchrone, donc à la première passe il n'y a rien à peindre.

**Et le témoin qui manquait n'est pas un témoin de RÈGLE.** `StoryLetterboxFillTests`
serait resté vert alors que personne ne peignait rien. `StoryLetterboxFillLayerTests` monte
un `CALayer` nu et pose la seule question qui tranche : **« y a-t-il, à la fin, un layer
avec des pixels dedans ? »** — bande présente dès que la matière arrive, layer le plus BAS,
cadre du canvas, aucun layer en mode rempli, aucun doublon quand le canvas se reconstruit.
C'est le pendant de la leçon 355 (une vue construite puis jetée) : deux surfaces sans
rapport, la même nuit, le même angle mort — **on éprouve ce qui alimente et ce qui décide,
jamais ce qui est POSÉ**.

**Note d'outillage, pour la prochaine fois.** La vérification par capture a échoué sur un
détail matériel qu'il vaut la peine d'écrire : le seul geste qui bascule `videoFitMode` est
un **double-tap sur le fond**, et `idb ui tap` met ~1,1 s par appel — bien au-delà de la
fenêtre du double-tap. Deux invocations consécutives ne le synthétisent pas de façon fiable
(elles ouvrent l'éditeur de l'objet, ou zooment le viewport). Quand un état n'est atteignable
que par un geste qu'aucun outil ne produit, **le test de LAYER est la preuve, pas un repli** :
il est déterministe là où la capture est un coup de dés.
