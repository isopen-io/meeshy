## Leçon 461 — « ça compile chez moi » ne veut pas dire ce que je lui ai fait dire : le fichier n'avait pas été RECOMPILÉ

Devant un `error: the compiler is unable to type-check this expression in
reasonable time` rouge sur le runner et vert chez une session voisine, j'ai
diffusé à deux sessions :

> C'est la seule classe d'erreur où « ça compile chez moi » est littéralement
> vrai et sans valeur, puisque le verdict dépend d'un DÉLAI, donc de la machine.

Bien tournée, reprise telle quelle par les deux — et **fausse**. Mesuré ensuite
sur un `derivedData` PROPRE : `BUILD_RC=65`, la même erreur, sur ma machine. Ça
reproduit en local.

Ce que le vert voisin signifiait est plus simple : **un build incrémental ne
re-vérifie pas les types d'un fichier inchangé.** Son gate n'a pas vu l'erreur
parce qu'il n'a pas recompilé le fichier.

La règle utile n'est donc pas une exception réservée à cette classe, c'est une
banalité qui vaut pour TOUTES : *un vert local ne prouve rien sur un fichier qui
n'a pas été recompilé* — et elle se corrige par un `derivedData` neuf, pas par un
renoncement.

**Ce que la mesure a donné en prime, et qui vaut le détour** — compiler avec un
budget nomme le coupable au lieu de le laisser deviner :

```
OTHER_SWIFT_FLAGS='$(inherited) -Xfrontend -warn-long-expression-type-checking=300'
```
```
StickerTemplates+Travel.swift:214:32: warning: expression took 12759ms to
type-check (limit: 300ms)
```

Douze secondes et sept cent cinquante-neuf millisecondes pour UNE expression —
une Bézier dont chaque coordonnée mêlait `CGFloat` et le littéral `2` sur trois
produits de quatre facteurs. Après hissage et typage des trois poids : plus rien
au-dessus de 300 ms.

Deux pièges d'outillage rencontrés en le faisant :

1. **`OTHER_SWIFT_FLAGS=…` sans `$(inherited)` REMPLACE les drapeaux du target.**
   Le build a rendu 150 erreurs d'isolation d'acteur — le modèle de concurrence
   avait changé sous mes pieds, et j'ai failli lire cette mesure comme un
   résultat.
2. **Vérifier que le drapeau se DÉCLENCHE avant de se fier à son silence.** J'ai
   remis l'original et confirmé le warning à 12 759 ms : sans ça, « aucune
   expression au-dessus du budget » aurait pu vouloir dire « le drapeau ne fait
   rien ».

> Je m'étais dit trois fois dans la journée qu'une valeur DÉDUITE n'est pas une
> valeur LUE. Je l'ai refait quand même, sur une phrase que je trouvais bien
> tournée — et c'est peut-être cela le vrai signal : **une formule qui sonne
> juste demande la même mesure qu'une formule qui sonne fausse.** Elle est
> seulement plus difficile à soupçonner.
