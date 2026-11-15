## Leçon 468 — Quatre rouges qui ne sont pas des tests rouges, et leurs quatre discriminants

Catalogue construit à trois sessions en une soirée, chacune ayant perdu du temps
sur au moins un des quatre. Ils se ressemblent tous à l'arrivée — `** TEST
FAILED **`, `RC=65` — et aucun ne dit ce qu'il est.

| le rouge | ce qui le distingue |
|---|---|
| **verrou `build.db`** — deux `xcodebuild` au même endroit | la ligne `database is locked` dans le journal de CETTE tentative. Zéro test exécuté |
| **bundle périmé rejoué** — `test-without-building` après un build échoué | le build qui PRÉCÈDE a échoué ; les chiffres sont plausibles et datent du passé |
| **WIP voisin non committé** | `git status --porcelain <f>` rend ` M`, et `git show HEAD:<f>` compile là où l'arbre ne compile pas |
| **compteur de retry accumulé** | le refus est daté d'une tentative ANTÉRIEURE |

Les trois premiers trompent sur la CAUSE. Le quatrième, formulé par la session
voisine après s'être trompée elle-même, trompe sur le NOMBRE — donc sur la seule
question qui décide de la suite : *est-ce que ça se reproduit ?* Sa boucle
cherchait `database is locked` dans un journal ACCUMULÉ (`>>`), si bien qu'un
seul refus classait « refusées » les dix tentatives, **y compris celle qui avait
réellement compilé et trouvé un défaut**.

> **Un instrument qui accumule son propre passé mesure son passé.** La parade
> coûte une ligne : un fichier par tentative, concaténé APRÈS le verdict.

Je suis tombé dans la même trappe dans l'autre sens, et elle vaut d'être dite :
ma boucle attendait `TEST_RC=` dans un journal qu'une nouvelle tentative allait
TRONQUER. Entre le lancement et la troncature, la condition lisait le verdict de
la tentative PRÉCÉDENTE et sortait aussitôt — j'ai conclu « run exécuté » sur un
run qui commençait. **Une condition d'attente doit porter sur une valeur que la
chose attendue est seule à pouvoir écrire.**
