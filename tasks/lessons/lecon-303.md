## Leçon 303

**Une garde de source ne SUIT pas le code qu'elle protège. Déplacer une vue
entre deux fichiers casse toutes ses gardes — et un gate CIBLÉ ne le dit pas.**

`#4070` a sorti la barre haute du composer de `ComposerDocumentSurface` pour en
faire un composant partagé, `ComposerTopBar`. Le déplacement était juste, les
deux surfaces le consomment, et son gate a rendu **296/296**. Deux gardes du
répertoire voisin lisaient pourtant encore
`ComposerDocumentSurface.swift` pour y trouver `slideRail` — le rail des slides,
parti avec la barre. Les deux ont rougi **sur main**, découvertes au cycle
suivant par un run RÉPERTOIRE ENTIER :

| garde | ce qu'elle cherchait | où c'était passé |
|---|---|---|
| `MeeshyComposerHostPostSlidesGuardTests.test_theRailLivesInTheTopBar_andOnlyThere` | `slideRail` × 2 | `ComposerTopBar.swift` |
| `ComposerMediaStripTests.test_laSurface_peintLeMedia_enVignettesRetirables` | `private var slideRail` | idem |

Ce n'est pas la leçon 296 (« une suite ciblée ne couvre pas le garde du code
qu'elle change ») répétée : c'est sa forme la plus coûteuse, parce que le
symptôme MENT sur sa cause. La garde rougit en disant « `slideRail` est
introuvable », ce qui se lit comme *le rail a disparu*. Le rail va très bien ;
c'est l'ADRESSE qui a changé. Une session qui lirait ce rouge sans le remonter
au refactor précédent chercherait un défaut produit là où il n'y en a pas.

> **Une garde de source contient une ADRESSE, et une adresse est une donnée
> périmable.** Tout lot qui DÉPLACE du code — extraction de composant, split de
> fichier, renommage de dossier — doit, dans le même commit, chercher les
> gardes qui nomment le fichier d'origine (`grep -rl '<Fichier>.swift' Tests/`)
> et les re-pointer. Le compilateur ne le fait pas : ces chemins sont des
> chaînes.

**Et le déplacement RENFORCE souvent la garde, si on la réécrit au lieu de la
réparer.** L'ancienne version comptait `slideRail` deux fois DANS un fichier
pour dire « un seul exemplaire » — la seule forme possible quand la barre vivait
chez son unique hôte. Le rail vivant désormais dans un composant partagé,
« un seul exemplaire » se prouve mieux : par son ABSENCE chez les deux surfaces
qui consomment la barre. La garde re-pointée dit donc quelque chose que la
version d'avant ne pouvait pas exprimer.

**Corollaire de méthode, appris à mes dépens deux cycles de suite** : après un
lot qui déplace du code, le gate n'est pas « les suites du lot » mais **toutes
les suites qui NOMMENT un des fichiers touchés**. La commande est celle-ci, et
elle prend dix secondes :

```
grep -rln "<FichierDéplacé>.swift" apps/ios/MeeshyTests --include='*.swift'
```
