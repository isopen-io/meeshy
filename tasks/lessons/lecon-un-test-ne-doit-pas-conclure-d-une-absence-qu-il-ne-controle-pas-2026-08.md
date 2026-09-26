## Leçon — un test ne doit pas conclure d'une absence qu'il ne contrôle pas (2026-08-19)

Élargir le programme bêta au drapeau `lentille_list` a fait rougir QUATRE suites
qui n'avaient rien à voir avec le changement. Leur point commun : elles tenaient
leur précondition « drapeau OFF » d'un raisonnement sur une absence. Le
commentaire d'origine le disait noir sur blanc — « le drapeau retombe sur son
défaut OFF tant qu'aucune suite du bundle n'écrit la clé
`meeshy.flag.lentille_list` » — et cette vérification était juste au moment où
elle a été écrite.

Deux choses la rendaient fragile :

1. **Le domaine lu n'était pas celui des tests.** `LentilleFeatureFlag
   .isLentilleListEnabled` interroge `UserDefaults.standard` ; pour un bundle
   de tests HÔTÉ, c'est le domaine de l'APPLICATION. Si l'app a réellement
   activé la bêta sur ce simulateur, la clé y est — écrite par un humain, pas
   par une suite. L'inventaire « quelle suite écrit cette clé » ne pouvait pas
   voir ce cas.
2. **L'ensemble des entrées du drapeau a grandi.** La précondition portait sur
   UNE clé ; la cascade en lit désormais DEUX. Un raisonnement d'exhaustivité
   se périme dès que la chose énumérée gagne un membre — et rien ne prévient.

Le correctif n'est pas de rétablir l'inventaire, c'est de ne plus en dépendre :
`setUp` POSE la clé propre du drapeau à `false`. L'étage 2 de la cascade prime
sur l'étage 3, donc OFF est vrai quoi que porte le domaine hôte, et sans rapport
avec l'ordre d'exécution des suites. `tearDown` RETIRE la clé au lieu d'écrire
`true` — on rend le domaine à son état antérieur plutôt que d'y laisser une
opinion. Extrait en helper partagé (`LentilleListFlagPin`) plutôt que copié dans
quatre `setUp`, avec le raisonnement au-dessus pour que la prochaine suite de
groupement sache qu'elle doit l'appeler.

À retenir : quand un test dépend d'un état global, il l'ÉPINGLE. « Personne ne
l'écrit » est une hypothèse sur le monde, pas une précondition de test.
