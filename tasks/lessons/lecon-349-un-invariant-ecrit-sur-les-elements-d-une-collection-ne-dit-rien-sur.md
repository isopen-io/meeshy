## Leçon 349 — un invariant écrit sur les ÉLÉMENTS d'une collection ne dit rien sur la collection

**Le fait.** L'inventaire des portails du composer (#4120) posait une règle juste et la gardait : « tout
état de présentation doit avoir son lecteur AU-DESSUS de l'aiguillage ». Elle a tenu — chaque porte
ajoutée pendant des mois a reçu son `.sheet` au bon endroit, y compris les trois d'une seule journée.

Le meuble en portait **huit**. SwiftUI n'en supporte qu'une par vue : deux booléens vrais dans la même
transaction, et le process est **TERMINÉ** (`Currently, only presenting a single sheet is supported`).
Trois terminaisons mesurées au simulateur, sur trois interactions différentes.

> **Une règle de PLACEMENT ne dit rien du NOMBRE.** La garde vérifiait que chaque élément satisfait sa
> condition ; la propriété qui manquait portait sur le CARDINAL de l'ensemble. Aucune quantité
> d'éléments corrects ne fait une collection correcte quand la contrainte est « au plus un ».

C'est la forme duale de la leçon 261 (« une énumération de sites porte deux affirmations, dont une
presque jamais vérifiée ») : là, la liste prétendait être complète ; ici, chaque entrée est juste et
c'est leur NOMBRE qui est faux. Les deux se ressemblent parce que dans les deux cas la garde regarde
les éléments quand la vérité est dans l'ensemble.

**Le remède structurel bat le remède disciplinaire.** On peut ajouter une garde de comptage — je l'ai
faite — mais ce qui ferme réellement le défaut est le TYPE : un `enum Portal?` au lieu de huit `Bool`.
Une variable ne porte qu'une valeur, donc deux portails ouverts ne sont plus *rares*, ils sont
**irreprésentables**, et ouvrir le second ferme le premier au lieu de produire l'état invalide. Rien à
retenir, rien à vérifier en revue.

> Quand une contrainte de cardinalité est violable, chercher d'abord le type qui la rend impossible.
> Une garde qui compte est un filet ; un type qui interdit est un sol.

**Et la garde de comptage doit apprendre sa PORTÉE.** Écrite sur l'unité de fichiers du meuble, la
mienne trouvait deux feuilles et rougissait sur un correctif juste : la seconde appartient au bouton
d'audience du socle, une SOUS-VUE — et deux feuilles sur deux vues distinctes ne se disputent rien.
Une garde de nombre compte dans la portée exacte de la règle qu'elle applique (ici : le corps d'UNE
vue), jamais dans le fichier qui la contient. Voir la leçon 344, dont ceci est la version « nombre ».

Dernier détail qui compte : elle exige `== 1`, pas `<= 1`. Une garde de cardinalité qui tolère zéro
laisse passer le retrait accidentel du montage — c'est-à-dire l'autre moitié du défaut qu'elle existe
pour empêcher.
