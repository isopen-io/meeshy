## Leçon 324 — `pull --rebase` DÉTRUIT le commit de fusion qu'on vient d'écrire, et pousse l'état partiel

**Contexte.** Le 2026-08-29T22:40Z, après avoir fusionné `main` dans `dev` (19 commits,
un conflit résolu, 986 suites vertes en preuve), le push est rejeté : `dev` a bougé de
deux commits. Réflexe de la session, appliqué une dizaine de fois dans l'heure sans
incident : `git pull --rebase origin dev`. Le rebase **aplatit la fusion** — au lieu de
rejouer MON commit de fusion, il rejoue ses dix-neuf parents un par un, s'arrête au
deuxième sur un conflit, et le `push` de la même ligne de commande part quand même :
`dev` se retrouve avec **1 des 19 commits** de `main`, dans un rebase interrompu.

**Pourquoi le réflexe était juste jusque-là, et faux ici.** `--rebase` est le bon choix
pour rattraper une branche partagée quand on porte des commits LINÉAIRES : il évite un
commit de fusion inutile et garde l'histoire lisible. Il cesse d'être le bon choix à la
seconde où l'on porte soi-même une FUSION, parce qu'un rebase ne sait pas rejouer une
fusion — il la remplace par la suite de ses parents. Le geste n'a pas changé ; ce que
la branche portait a changé.

> **La question à poser avant un `pull --rebase` n'est pas « ma branche est-elle en
> retard ? » mais « qu'est-ce que ma branche PORTE ? ».** Un commit de fusion ne se
> rebase pas : il se rattrape par `git merge`.

**Ce qui a limité les dégâts, et qui n'est pas de la chance.** Le lot livré (`4971c37e`)
était **déjà poussé** avant que la fusion commence. Seul le travail non poussé — la
fusion elle-même — a été défait. C'est l'argument le plus concret pour la discipline
« un lot vert, un push » : ce qui est poussé et vert ne peut plus être perdu par une
manœuvre locale ratée.

**La réparation, dans l'ordre.** `git rebase --abort` (l'état d'avant revient intact,
commit de fusion compris) ; VÉRIFIER que rien du travail livré n'a disparu, en testant
l'ascendance des SHA du lot plutôt qu'en le supposant ; `git merge origin/dev` — une
FUSION, pas un rebase — pour combiner sa propre fusion avec ce que les autres ont
poussé ; re-vérifier que la branche fusionnée est complète (`git rev-list --count
HEAD..origin/main` doit rendre 0) ; regate ; pousser.

**La forme générale, déjà écrite la veille au § 323 :** une décision PAR APPEL qui n'est
pas re-prise à chaque appel retombe sur son défaut. Ici le défaut était `--rebase`,
correct dix fois de suite, destructeur la onzième — et rien dans la commande ne
distingue les deux cas.
