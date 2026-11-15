## TROIS causes pour ce symptôme, et trois remèdes — mesuré quelques heures plus tard

Le symptôme « le corps de la PR décrit ce qu'elle ne livre plus » a trois causes
distinctes, et les confondre fait appliquer le mauvais remède :

| cause | ce qui s'est passé | remède |
|---|---|---|
| **effacée** par accident | la résolution a pris un côté verbatim, le témoin de l'autre est parti | **reprendre le témoin** |
| rendue **caduque** par décision | l'auteur a convergé vers l'autre jumelle ; le témoin de la sienne n'a plus de sujet | **réécrire le corps** (dette de rédaction, pas défaut) |
| **orpheline** | le témoin est RESTÉ et assère une feature qui n'est plus livrée | **retirer le témoin avec son sujet** |

Le troisième cas s'est mesuré sur cette même PR, et il est le plus net : la
résolution a gardé **le rail de `dev` ET le témoin du rail de la branche.** Les
deux gates ont rougi, et ce sont les deux faces d'un seul geste :

```
Gate « flux de la Lentille » (check-lens.mjs, version de dev)   1 invariant rompu
  · le premier Tab depuis la dernière tuile ne rejoint plus « Progression »
    (le bouton neuf « Créer un lien de partage » s'est inséré dans l'ordre)

Gate « actions de rangée » (check-list-actions.mjs, de la branche)  3 en défaut
  · anneaux: 3, accentues: 0, moods: 0
    — les trois assertions qui gardent le rail de stories ABANDONNÉ
```

> **Le gate de `dev` rougit parce que la branche a CHANGÉ ce qu'il garde ; le gate
> de la branche rougit parce qu'elle a RETIRÉ ce qu'il garde.** Une résolution qui
> mélange les deux moitiés sans arbitrer produit exactement cette paire — et la
> paire est le diagnostic : elle dit qu'on a gardé un sujet d'un côté et son témoin
> de l'autre.

Et **un témoin ne survit pas à son sujet** : abandonner une jumelle (D-11) oblige
à retirer les assertions qui la gardaient, sans quoi le gate mesure une absence
qu'il prend pour un défaut.

Note d'outillage : ces deux verdicts n'apparaissent ENSEMBLE que depuis #6137
(`if: ${{ !cancelled() }}` sur les onze gates). Avant, le job s'arrêtait au premier
et il aurait fallu deux tours pour voir la paire — donc pour voir le diagnostic,
qui n'existe que dans la paire.

Formulée par la session `v2-meeshy-c7`, sur des mesures de la session tenant
`dev` ; numéro alloué par cette dernière (1 707 refs balayées). Attribution par la
BRANCHE, jamais par `%an` — nous committons toutes sous le même auteur.
