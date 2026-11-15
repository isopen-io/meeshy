## Leçon 481 — Un TÉMOIN qui ne compile pas ne dit rien, et il ne dit même pas qu'il est cassé

**Le fait (2026-09-03).** Un renommage d'énuméré (`CanvasItemKind.location` →
`.place`) laisse six consommateurs derrière lui. L'un d'eux est un fichier de
GARDES : `ComposerSceneBackgroundTapPolicyTests.swift:58`.

Conséquence, et c'est elle qui compte : **le bundle de tests entier ne se
construit plus.** On lit alors « build rouge » là où il faut lire **« aucune
garde n'a pu s'exprimer »**.

> Les autres membres de notre catalogue produisent un VERT trompeur. Celui-ci
> produit un ROUGE qui **masque l'absence de mesure** — et c'est pire, parce
> qu'un rouge attire le regard vers sa cause apparente (la compilation) et
> l'éloigne de ce qu'on a perdu (tout le reste).

**Le cas particulier qui le rend vicieux** : ici, la garde cassée est
*précisément* celle qui aurait dû attraper le renommage incomplet. Le défaut
détruit son propre détecteur. Aucune quantité de relecture du journal ne
révélera qu'une garde MANQUE à l'appel : elle n'apparaît ni en succès, ni en
échec, ni en « skipped ».

**Parade** — la même que la 475, poussée d'un cran : après un build de tests
ROUGE, ne pas se contenter de corriger l'erreur affichée. Compter ensuite ce qui
a TOURNÉ :

```bash
grep -cE "Test Case '-\[" "$LOG"      # 0 ⇒ aucune garde n'a parlé
```

Un `RC != 0` sur un build de tests est une **absence de verdict**, pas un
verdict. Le seul état où le dépôt sait quelque chose est : bundle construit ET
cas comptés.

### Le catalogue complet, à sept entrées

| ce qu'on lit | ce que ça vaut | discriminant |
|---|---|---|
| verrou `build.db` | RC=65, **zéro test** | `database is locked` dans le journal de CETTE tentative |
| bundle périmé rejoué | vert du PASSÉ | le build qui précède a échoué |
| WIP voisin non committé | rouge d'un autre | `git show HEAD:<f>` compile, l'arbre non |
| compteur de retry accumulé | mauvais NOMBRE | le refus est daté d'une tentative antérieure |
| cache de modules Clang (CI) | rouge d'environnement | `has been modified since the module file` ; aucun fichier du dépôt cité |
| suite absente du bundle | **vert par omission** | `-only-testing` ignoré en silence ; compter les cas nommés |
| **témoin qui ne compile pas** | **rouge qui MASQUE l'absence de mesure** | après correction, compter `Test Case '-\[` |

Fil rouge des sept : **ce qui ne s'exécute pas ne se signale pas.** La seule
défense est de compter ce qu'on a nommé, jamais de lire l'agrégat.
