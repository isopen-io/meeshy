## Leçon 328 — Le nom du CHECK porte ce qui a tourné ; le nom du WORKFLOW ne porte que ce qui aurait pu tourner

**Contexte (2026-08-30, #4342).** La suite app était rouge en local sur 13
assertions — six paginations arrêtées à la première page, une `deinit` isolée,
deux clés non traduites au-dessus du cliquet. Aucune ne venait de mon diff. J'ai
donc cherché quand elles étaient nées, et je suis tombé sur une contradiction :
`gh run list` montrait « iOS · success » sur `dev`, et **aucun fichier
d'`apps/ios` n'avait changé depuis ce run**. Le même arbre ne peut pas être
vert là-bas et rouge ici.

J'ai perdu un temps réel à chercher une dérive d'environnement — arbre sale,
catalogue local modifié, `Build/` balayé par le scanner, décodeur différent.
Toutes ces hypothèses étaient fausses, et j'ai même écrit un port Python du
scanner pour les départager.

**Ce que c'était.** Le workflow `ios.yml` est **compile-seule sur `dev` et sur
les PR, par conception** : la suite ne s'exécute que sur une poussée `main`, ou
avec « smoke test » / « run test » / « to test » dans le SUJET du commit. Le
workflow le documente sur vingt lignes, et il fait mieux que le documenter — il
**nomme le job d'après ce qu'il a fait** :

```yaml
name: ${{ needs.scope.outputs.run_tests == 'true'
          && 'Build app + tests unitaires'
          || 'Build app (app + cibles de test)' }}
```

avec, en commentaire, exactement l'avertissement que je n'ai pas lu : « sans
cette distinction, "iOS Tests : vert" se lit comme "les tests passent" alors que
la plupart des runs n'en exécutent aucun ».

**La règle.** Ce que j'ai interrogé est la CONCLUSION du workflow. Elle ne dit
que « le job s'est terminé sans erreur » — jamais *quel* job. Le nom du CHECK,
lui, est calculé à partir de la portée résolue : c'est le seul canal qui porte
le FAIT.

> Avant de conclure « c'était vert là-bas », demander **quel job** a été vert, et
> lire son nom. Un `conclusion: success` sur un workflow à portée variable est un
> canal de STATUT, pas un canal de FAIT.

C'est la leçon 285 (`gh run list --branch` mélange les workflows) portée un cran
plus loin : là, deux workflows homonymes ; ici, **un seul workflow avec deux
modes**, ce qui est plus dur à voir parce que rien dans la liste ne les
distingue. Le dépôt en compte quatre dont le nom commence par « iOS » —
`iOS`, `iOS (beta) → Xcode Cloud` (un simple job de déclenchement),
`iOS optimisation probe (-O)`, `iOS App Store publishability` — de quoi se
tromper deux fois.

**Le corollaire opérationnel, et il n'est pas confortable.** Les 13 rouges
n'étaient pas invisibles par accident : ils l'étaient parce que personne n'avait
poussé le mot-clé depuis leur naissance. Une fenêtre de mesure qui ne s'ouvre
qu'à la fusion vers `main` laisse une branche de travail accumuler des rouges
pendant des semaines — le compromis est assumé (le pool macOS est cher), mais
**celui qui livre sur `dev` doit porter le mot-clé quand son lot touche le
Swift**, sinon il livre sans mesure.

**Le témoin.** Aucun test ne peut attraper ça. Ce qui l'attrape est une
question, à poser avant de se fier à un vert distant : *ce vert a-t-il exécuté
ce que je crois qu'il a exécuté ?* — et elle se répond en lisant le nom du job,
ou une ligne « Executed N tests » dans son log.
