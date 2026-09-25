## Leçon 543 — Un porteur dont l'existence dépend d'un SEUL de ses champs perd tous les autres en silence

**Contexte** (#5406, retour porteur 2026-09-06). Le double-tap sur le fond du
composer choisit son cadrage (`videoFitMode` : centré-letterbox ou plein cadre).
Après publication, l'image remplissait toujours le canvas.

**Ce que le champ traverse.** Le pan et l'échelle du fond voyagent sur
`mediaObjects[bg]` ; `videoFitMode` est le seul qui ne soit pas une coordonnée
géométrique et vit sur `effects.backgroundTransform` — lequel ne voyage QUE dans
la charge de l'objet `bg` du document v3.

**Le défaut.** Cet objet n'était émis que `if let background = nonEmpty(effects.background)`,
c'est-à-dire si une COULEUR de fond était déclarée. **La condition de perte et la
condition d'utilité du geste sont la même** : un cadrage ne vaut que sur un fond
MÉDIA, là où une couleur n'a aucune raison d'exister.

> Rien ne rougit, et il n'y a rien à trouver : l'objet n'est pas amputé, **il
> n'est pas là**. Un champ absent d'une charge ne laisse aucune trace, à la
> différence d'un champ vidé par un sérialiseur.

**Les deux questions à poser à tout porteur de fil** :
1. *Son existence est-elle conditionnée à l'un de ses champs ?* Si oui, tous les
   autres partent avec ce champ.
2. *Le champ qui décide est-il celui qui compte ?* Ici il ne l'était pas — et sa
   présence était même ANTI-corrélée à celle du champ utile.

**Le témoin ne pouvait pas tomber.** `testStoryEffectsWithBackgroundTransformRoundtrip`
posait `background: "FF0000"`. C'est la leçon 261 sous un autre angle : un témoin
de rang s'écrit sur un rang AUTRE que le premier, et ici le « rang 1 » est le cas
où la couleur existe.

**Et la règle était écrite deux fois** — `CanvasV3.migratedScene` (Swift) et
`convertV1ToV3` (gateway) — **avec le même trou aux deux exemplaires**. Corriger
une jumelle sans l'autre n'aurait rien réglé pour les clients qui passent par le
convertisseur serveur.
