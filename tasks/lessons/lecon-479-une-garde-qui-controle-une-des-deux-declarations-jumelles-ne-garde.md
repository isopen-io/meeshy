## Leçon 479 — Une garde qui contrôle UNE des deux déclarations jumelles ne garde pas la paire

`MeeshySceneObject` déclare ses familles DEUX fois : l'union qui porte la charge
(`case place(StoryLocationObject)`) et son ombre sans charge (`Kind.place`, pour
les sites qui trient et comptent). Le renommage de #4960 n'en a touché qu'une.

Tout compilait. La suite SDK passait à 4 226 témoins. Et **mes quatre témoins de
garde, écrits dans le même lot pour empêcher exactement cette divergence,
étaient verts** — pour une raison structurelle : ils lisent des `rawValue`, et un
cas d'union n'en a pas.

> J'ai fermé l'issue *sur la foi de ma propre garde*. C'est la forme la plus
> coûteuse de fausse sécurité : une garde neuve inspire plus de confiance qu'une
> ancienne, alors qu'elle a exactement le même angle mort — celui de son
> instrument.

**Ce qui l'a révélé n'est ni une relecture ni un témoin** : le compilateur, trois
heures plus tard, dans un travail sans rapport (écrire un accesseur générique
pour une autre issue). Le défaut est sorti par accident.

La parade, quand un concept est déclaré deux fois dans deux formes que le
langage traite différemment :

| forme | ce qu'un test voit à l'exécution |
|---|---|
| `enum Kind: String, CaseIterable` | tout — `allCases`, `rawValue` |
| `enum Union { case x(Payload) }` | **rien** — ni énumération, ni nom |

Donc : **la seconde se garde par la SOURCE**, faute de mieux. `pour chaque
famille du Kind, un cas d'union du même nom doit exister ; et aucun ancien nom ne
doit subsister.`

Le motif se généralise à toute paire « type riche + son étiquette » — un
`enum` et son `rawValue`, un modèle et son DTO, une colonne et sa constante.
**Avant d'écrire une garde, demander de quelle forme elle est aveugle**, et
garder l'autre autrement.

Corollaire de méthode, retrouvé une fois de plus : le renommage lui-même s'est
fait en renommant la déclaration et en laissant le COMPILATEUR énumérer les
sites — trois au premier lot, sept au second, tous justes, là où un `grep`
en montrait cent quatorze dont la plupart appartenaient à d'autres énumérés.
**Un renommage de `case` ne se mesure pas au mot, il se mesure au type.**
