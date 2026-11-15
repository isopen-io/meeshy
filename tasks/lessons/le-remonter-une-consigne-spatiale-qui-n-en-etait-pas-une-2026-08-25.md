## « Le remonter » — une consigne spatiale qui n'en était pas une (2026-08-25)

**Correction reçue.** L'utilisateur écrit : « Lorsqu'une notification utilisateur
existe est fait il faut le remonter... ». Le contexte immédiat était géométrique
(la phrase précédente demandait de remonter la SyncPill de 3× sa hauteur), et
j'ai lu « le remonter » comme un troisième déplacement vertical — j'ai même
annoncé cette lecture. Elle était fausse : il fallait entendre **faire remonter
l'information JUSQU'À l'utilisateur**. La règle visée n'était pas un décalage de
quelques points, mais « tout ce qui constitue une notification doit se signaler
in-app, sauf la conversation ouverte » — un audit de couverture sur quatre
gardes, sans le moindre pixel à déplacer.

**Ce qui a marché.** Avoir DIT ma lecture à voix haute (« je l'interprète comme :
la SyncPill se décale quand un toast est présent ») plutôt que de l'appliquer en
silence. La correction est arrivée avant la première ligne de code.

**La règle.** Quand une consigne courte hérite du champ lexical de la phrase
d'à côté, ce voisinage est un PIÈGE, pas un indice : un verbe polysémique
(« remonter », « pousser », « descendre », « sortir ») s'y aimante au sens
spatial. Énoncer l'interprétation retenue, en une ligne, avant d'agir — et la
placer là où elle sera lue, pas en fin de message.

**Le corollaire, plus coûteux.** Ma lecture fausse était aussi la plus PETITE :
déplacer une vue de 66 pt au lieu d'auditer quatre gardes de suppression et la
couverture de types d'un éventail entier. Devant deux lectures d'une consigne
ambiguë, se méfier de celle qui tient en un `.padding()` : l'ambiguïté se
résout rarement du côté du moindre effort.
---
