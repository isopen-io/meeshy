## Leçon 571 — `-only-testing:` cible une CLASSE, pas un FICHIER

2026-09-11, iOS (#6073). Pour valider #6047, j'avais lancé
`-only-testing:MeeshyTests/ComposerRailDoorTests`, convaincu de couvrir « le
fichier des portes du rail ». Le rapport était VERT.

`ComposerRailDoorTests.swift` contient **dix-sept classes**. Deux d'entre elles
— `ComposerMediaSourceWiringGuardTests` et `ComposerSoundSourceWiringGuardTests`
— portaient les témoins que le lot cassait. Elles n'ont jamais été exécutées.

> **Un fichier de tests n'est pas une unité d'exécution.** `-only-testing:`
> prend un identifiant de CLASSE (ou de méthode) ; le nom du fichier n'apparaît
> nulle part dans la commande. Nommer la classe qui porte le même nom que le
> fichier n'exécute que celle-là, et le rapport dit « passed » — pour la
> fraction qu'il a mesurée.

Le signe qui aurait dû alerter est le même qu'à la leçon 567, et je ne l'ai pas
vu deux fois dans la même session : **dix-neuf millisecondes** pour ce que je
croyais être quatre-vingt-onze tests. Le temps est un chiffre de rapport comme
un autre, et un chiffre absurde est plus souvent l'outil de lecture que la
mesure.

Parade : dériver la liste des classes du FICHIER avant de composer la commande —
`grep '^final class' <fichier>` — plutôt que de supposer qu'un fichier porte une
classe. Un fichier de témoins de dépôt en porte souvent dix ou vingt, parce que
les gardes de source se rangent par SUJET, pas par type testé.
