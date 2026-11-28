## Un « Verdict CI » rouge peut n'être l'échec de personne — un run ANNULÉ rend la même couleur (cycle 227-228, #20414/#20410)

`ci.yml` porte `concurrency: ci-${{ github.ref }}` avec `cancel-in-progress` sur
toute ref autre que `dev` et `main`, et son job « Verdict CI » AGRÈGE ses
dépendances. Trois conséquences qui se paient en cycles :

1. **Pousser sur une branche dont un `workflow_dispatch` tourne l'ANNULE** — et
   la preuve recommence sa file d'attente depuis zéro. Sur une org dont les
   runners sont saturés, cela coûte l'heure que le run avait déjà attendue.
2. **Un run annulé rend un verdict ROUGE** : l'agrégateur voit des dépendances
   `cancelled` et conclut `failure`. Le relevé par job dit l'inverse — zéro
   `failure`, N `cancelled`. **La question à poser à un verdict rouge n'est donc
   pas « quel témoin est tombé ? » mais « ce run a-t-il FINI ? »**, et elle se
   répond sur la conclusion du RUN, pas sur la couleur du check.
3. **Un `workflow_dispatch` est épinglé au SHA du moment où il est créé.** Un
   second lot poussé après coup n'est pas dans sa preuve. Dispatcher avant la fin
   des pushes, c'est prouver un arbre que la PR ne propose plus.

> **Corollaire d'ordonnancement, quand la CI des PR est gelée** (`vars.PR_CI_GEL`,
> le `workflow_dispatch` étant le seul chemin de preuve) : on finit d'écrire,
> PUIS on dispatche. L'ordre inverse est gratuit en apparence et coûte deux files
> d'attente.

Même famille que « un gate rend DEUX verdicts, et ils peuvent se contredire » :
ici les deux verdicts sont la COULEUR du check et la CONCLUSION du run, et c'est
la seconde qui dit la vérité.
