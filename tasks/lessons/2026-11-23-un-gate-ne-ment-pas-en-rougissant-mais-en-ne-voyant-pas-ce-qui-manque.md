## Un gate ne ment pas en rougissant, mais en ne voyant pas ce qui manque

**2026-11-23, cycle 223 (#20430).** Un lot de sécurité a écrit 23 témoins et un
cliquet d'inventaire, les a vus verts, et a failli les livrer… **absents du
commit**.

`.gitignore` portait `post-*`, **non ancré** — donc matchant par **BASENAME à
toute profondeur**. Les trois fichiers neufs du lot
(`post-contenu-separe-20430.test.ts`, `post-room-separation-sweep.ts`, son
`.test.ts`) n'apparaissaient **pas dans `git status`**. Ils tournaient en local,
ils passaient, et ils n'allaient nulle part.

Sans un `git status --untracked-files=all` avant le commit, la PR aurait porté le
correctif **sans un seul témoin et sans son cliquet, avec une CI VERTE**. Parce
que :

> **Des témoins absents ne rougissent pas.**

Le piège avait **déjà frappé** le 2026-08-19 sur
`packages/shared/types/post-reference.ts`, et la note laissée alors — « ne pas
resserrer le motif à l'aveugle, son intention n'étant pas documentée » — était
prudente et juste, mais elle a laissé le motif armé. La mesure qu'elle réclamait
tenait en trois commandes : aucun `post-*` à la racine (l'intention supposée n'a
aucun sujet), les seuls fichiers ignorés étaient les trois témoins neufs, et des
dizaines de sources suivies portent déjà un basename `post-…` — vivantes parce
que déjà dans l'index, mais tout fichier NEUF à côté d'elles était masqué.

### La forme générale

Un gate se trompe rarement en accusant à tort. Il se trompe en **ne voyant pas
ce qui n'est pas là** :

| forme | pourquoi elle est muette |
|---|---|
| un fichier de témoins non suivi | la suite locale le voit, la CI ne l'a jamais |
| une suite non enregistrée au harnais | rien ne distingue « 0 échec » de « 0 exécution » |
| un témoin qui n'exerce pas son cas | il porte le nom du cas, pas son exercice |
| un artefact de build périmé | le rouge accuse le code de quelqu'un d'autre |

Les quatre se ressemblent : **la mesure rendue est VRAIE, et la question posée
n'est pas celle qu'on croit.** Aucune ne se signale, parce qu'un outil ne peut
pas rougir sur ce qu'il n'a pas reçu.

> La défense n'est pas un gate de plus : c'est de regarder ce que le commit
> **CONTIENT**, et non ce que la suite **REND**. `git show --stat` avant de
> pousser répond à la seule question que les suites ne posent jamais — « ce que
> je viens de prouver part-il avec le correctif ? ».

Famille : « un témoin qui ne peut pas tomber n'est pas un témoin »
(`services/gateway/CLAUDE.md` § Tests), poussée un cran en amont — ici le témoin
pouvait tomber, il n'était simplement pas là. Et parente de l'artefact périmé de
#20315 : dans les deux cas, c'est l'ARBRE qu'il faut confronter avant le code.
