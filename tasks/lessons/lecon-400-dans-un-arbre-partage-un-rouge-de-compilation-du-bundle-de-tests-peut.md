## Leçon 400 — Dans un arbre partagé, un rouge de COMPILATION du bundle de tests peut être le WIP du voisin

**Contexte.** `xcodebuild test` rend `EXIT=65` avec sept
« missing argument for parameter 'declaredType' » dans des fichiers de tests que
je n'avais pas touchés. Réflexe correct : `git status` AVANT d'attribuer. Un
voisin, à qui le porteur venait d'assigner la bascule story, avait ajouté un
paramètre REQUIS à `PublishIntent.document` et n'avait pas encore mis à jour les
appels de test.

**La leçon.** Le rouge d'un gate mesure l'ARBRE, jamais un commit — c'est déjà
écrit pour les gates de comportement, et ça vaut aussi, plus brutalement, pour la
COMPILATION : une signature changée par un voisin rend le bundle entier
inconstructible, donc **toutes** mes suites rouges d'un coup, sans qu'aucune
ligne de mon diff soit en cause.

Corollaire de coordination : le débloquer soi-même est légitime quand la valeur
manquante est prescrite par le voisin lui-même (ici son doc-comment disait
« `nil` laisse la déduction faire son travail »), à condition de le lui DIRE et
de nommer ce qu'on n'a pas décidé pour lui — si l'un de ces témoins doit
désormais éprouver `.story`, c'est à lui de le poser.
