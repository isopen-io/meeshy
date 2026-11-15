## Leçon 364 — `-only-testing:` cible une CLASSE, jamais un fichier : seize classes, treize témoins exécutés

**Le fait.** Toute une nuit de vérifications ciblées sur
`ComposerRailDoorTests.swift` avec `-only-testing:MeeshyTests/ComposerRailDoorTests`.
Le fichier porte **seize classes et cent témoins** ; ce filtre en exécute **treize** — 13 %.
Deux gardes vivant dans la douzième classe étaient **rouges sur `dev` depuis un commit de
la veille**, et aucun run ciblé ne pouvait les voir. Seul le gate COMPLET les a trouvées
(`meeshy.sh test`, phase 2, 3 échecs sur 5682).

> **Le nom du fichier et le nom de la classe se ressemblent, et c'est tout ce qu'ils
> partagent.** Un fichier de tests dont la première classe porte son nom donne l'illusion
> qu'on l'a couvert en la nommant. Rien ne signale les quinze autres : le run est vert, les
> comptes sont plausibles, et la classe demandée a bien tourné.

**La parade, en une ligne avant tout run ciblé** — on ne filtre pas sur ce qu'on croit
avoir, on énumère ce qui existe :

```sh
grep "^final class" <fichier>.swift | sed 's/final class //;s/:.*//'
```

…puis un `-only-testing:` par classe. **En zsh, ne pas oublier `${=VAR}` ou un tableau** :
`for c in $CLASSES` n'itère qu'UNE fois sur la chaîne entière (zsh ne découpe pas les
paramètres non cités), et le run rend alors « Executed 0 tests » — un vert par vacuité, le
troisième faux vert de la même nuit.

**Ce qui l'a rendu coûteux ici, et qui se reproduira.** Les deux gardes nommaient un
FICHIER (`ComposerSceneSurface.swift`) pour une règle qui a ensuite déménagé dans le canvas
du SDK. C'est la famille déjà connue — une garde qui nomme un fichier ne suit pas le code
qui bouge — mais **le déménagement était JUSTE** : la surface de dessin était posée sur le
cadre de mise en page quand le canvas centre sa carte, donc un trait tiré hors de la carte
était perdu à la publication. Les gardes avaient raison de rougir, et la bonne réponse
était de les REPOINTER, chacune sur sa moitié : la surface PASSE le calque, le canvas le
VERROUILLE.

**Corollaire de gate.** Un run ciblé sert à ITÉRER, jamais à conclure. Le gate complet
reste le seul verdict — et il n'a pas besoin d'être fréquent, il a besoin d'être passé
AVANT de déclarer une nuit finie.
