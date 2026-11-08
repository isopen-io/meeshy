## Un filtre de suite qui nomme une classe INEXISTANTE rend un vert qui n'a rien exécuté (cycle 143 bis)

`workflow_dispatch` de `ios.yml` avec `only_testing: ConversationViewModelSendTests`. Cette classe **n'existe pas** — je l'ai composée depuis le nom du fichier que je venais de modifier (`ConversationViewModel+Send.swift`), ce qui est la façon la plus naturelle de se tromper : le nom est plausible, il suit la convention du dépôt, et rien dans l'invocation ne le valide.

Résultat : la tranche 1 a rendu **`success`** en n'exécutant aucun de mes témoins, et je l'ai citée comme preuve que « les tests de l'app passent ». C'était faux. Le seul fait que ce run établit est que l'app **COMPILE**.

**Le cliquet du dépôt m'a attrapé, et il le dit dans son propre commentaire** : « il rougit aussi sur une tranche qui n'a exécuté AUCUN test : une sélection vide est une faute de répartition, pas un succès » (`Verdict iOS (tests)`, `scripts/ci/test-shards-verdict.sh`). J'avais lu ce rouge comme un artefact de mon filtre ; c'était le gate qui faisait exactement son travail.

> **Un vert de tranche ne dit pas « ça passe », il dit « rien n'a échoué ».** Les deux coïncident seulement si quelque chose a tourné. Avant de citer une tranche verte comme preuve, demander **combien de témoins elle a exécutés** — et quand on la restreint par un filtre, vérifier que la classe nommée EXISTE (`grep -rn "class <Nom>"`), parce qu'un filtre qui n'apparie rien ne lève aucune erreur.

**Corollaire sur le verdict lui-même** : sous un `only_testing` étroit, le verdict ne peut PAS être vert, par construction — les autres tranches n'ont rien à exécuter. Une preuve de verdict exige donc un run COMPLET ; un run filtré ne prouve que la compilation et les témoins nommés. Les deux sont utiles, mais ils ne prouvent pas la même chose, et il faut dire lequel on a.

**La récidive est le point le plus cher.** J'avais écrit, dans ce même cycle et une heure plus tôt, une fiche sur une passe de suite lancée pendant que j'éditais l'arbre — « une mesure longue sur un arbre qu'on continue d'éditer ne mesure rien ». Puis j'ai cité un vert qui ne mesurait rien. **Écrire la leçon ne l'applique pas** : la forme change (l'arbre qui bouge, la sélection vide), la faute est la même — accepter un résultat sans vérifier ce qu'il a couvert.
