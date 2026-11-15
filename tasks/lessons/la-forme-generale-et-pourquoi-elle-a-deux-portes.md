## La forme générale, et pourquoi elle a deux portes

C'est la même panne que celle du `SYMROOT` dépareillé de la veille, dont ce lot
montre qu'elle n'était qu'un cas particulier :

| variante | ce qui casse le lien build → test |
|---|---|
| `SYMROOT` surchargé au build seul | les deux commandes visent deux arbres de produits |
| build ÉCHOUÉ, test enchaîné par `;` | le build ne produit rien, l'ancien bundle survit |

> **La commande ne dit pas quel binaire elle exécute ; elle dit où le
> chercher.** Tant qu'un `.xctestrun` existe à cet endroit, il tourne — daté
> d'hier, produit par le pair, ou construit à partir d'un code depuis modifié.

**Le témoin est le NOMBRE de tests exécutés, suite par suite** — jamais le code
de sortie, jamais la couleur, jamais l'absence d'échec. Ici : `Executed 10` pour
une suite qui en portait 11 depuis l'ajustement. Le contrôle tient en une ligne :
`grep -c 'func test_' <suite>.swift` comparé au `Executed N` du journal.

Les trois ceintures, dans l'ordre de coût croissant : `&&` entre les deux
commandes ; verdict lu sur `** TEST BUILD SUCCEEDED **` dans le JOURNAL et non
sur `$?` ; comptage des tests par suite. La dernière est la seule qui attrape
aussi le cas où le build réussit mais produit ailleurs.
