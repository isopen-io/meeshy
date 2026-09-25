## Leçon 298 — Un `cd` qui échoue ne se contente pas de viser le mauvais dépôt : il fait RÉPONDRE git à une autre question, et la réponse est plausible (2026-08-27, « ma branche a disparu »)

**Le fait.** Fin de session : le worktree `v2_meeshy-scroll-thermal-profiling`
avait été supprimé par un nettoyage disque, après que tout y ait été committé.
La commande de relevé était enchaînée ainsi :

```bash
cd /Users/smpceo/Documents/v2_meeshy-scroll-thermal-profiling && B=perf/ios-scroll-thermal-2026-08-27
echo "branch tip: $(git rev-parse --short $B)"
git rev-list --left-right --count main-local...$B
```

Le `cd` échoue, donc le `&&` court-circuite l'**affectation** — `B` reste vide —
et la suite s'exécute dans le dépôt PRINCIPAL. Trois sorties en ont résulté :

| commande réellement exécutée | sortie | lecture spontanée |
|---|---|---|
| `git rev-parse --short` | `fatal: Needed a single revision` (stderr, hors ordre) | « la ref n'existe plus » |
| `git merge-base --short main` | erreur ⇒ `?` | « plus de base commune » |
| `git rev-list --left-right --count main-local...` | **`0	0`** | « rien de part et d'autre » |

Les trois ensemble composent un tableau cohérent : *la branche a disparu, le
travail est perdu*. Il était faux de bout en bout — `git branch --list` et
`git cat-file -t` l'ont réfuté en une commande, la ref et les deux commits
étaient intacts.

**La règle.** La leçon connue
(`feedback_failed_cd_runs_destructive_git_in_the_default_worktree.md`) dit qu'un
`cd` raté exécute la suite dans l'arbre principal, et en tire le risque des
commandes DESTRUCTRICES. Le corollaire manquait : les commandes **de lecture**
sont dangereuses aussi, pour une raison opposée — elles n'abîment rien, elles
**mentent**. Une variable vide dans une expression de révision ne fait pas
échouer git : git a des DÉFAUTS. `A...` s'étend en `A...HEAD`, et comme
`HEAD` valait ici `main-local`, la question posée est devenue « `main-local`
diffère-t-il de lui-même ? ». `0	0` est la bonne réponse — à une question que
personne n'avait posée.

D'où trois tenues, dans cet ordre de rendement :

1. `cd <chemin> || exit 1` en instruction PROPRE, jamais `cd <chemin> && VAR=…`
   suivi de `;`. Le `&&` protège la commande qui suit ; il ne protège pas les
   commandes séparées par `;`, et il conditionne l'affectation dont elles
   dépendent — le pire des deux.
2. Une expression de révision construite depuis une variable se garde :
   `[ -n "$B" ] || exit 1`. Le vide est le seul argument que git accepte
   silencieusement en lui substituant autre chose.
3. Devant tout verdict « le travail a disparu », interroger le MAGASIN D'OBJETS
   avant de conclure : `git cat-file -t <sha>` et `git branch --list '<motif>'`.
   Un commit ne disparaît pas parce qu'un répertoire disparaît — le worktree est
   une vue, le dépôt est ailleurs.

**Ce qui aurait dû alerter plus tôt.** La preuve contraire était déjà à l'écran :
le `git worktree list` lancé deux commandes plus haut **ne mentionnait pas** ce
worktree. Elle n'avait pas été lue comme une information, mais comme du décor,
parce qu'à ce moment-là la question était « où en est le merge ? », pas « le
worktree existe-t-il ? ». Une sortie ne se lit que contre la question qu'on se
pose — c'est pourquoi la question suivante doit se poser AVANT de relire la
sortie précédente, jamais l'inverse.

**Corollaire de fond, celui qui vaut au-delà de git.** Un outil qui a des
comportements par DÉFAUT transforme une entrée cassée en question valide. Le mode
d'échec n'est pas l'erreur — c'est la **réponse bien formée à côté**. Même forme
que la leçon 296 (une suite ciblée est verte parce qu'elle n'a pas exécuté la
garde) et que le § « Canal de STATUT ment sur le FAIT » de la mémoire : le signal
est présent, lisible, et porte sur autre chose que ce qu'on croit mesurer.
