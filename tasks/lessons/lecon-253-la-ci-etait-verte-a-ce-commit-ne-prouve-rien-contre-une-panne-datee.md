## Leçon 253 — « la CI était verte à ce commit » ne prouve rien contre une panne DATÉE

Même cycle, et c'est une leçon sur la façon dont deux sessions parallèles se
sont trompées en sens inverse sur le MÊME symptôme.

Une session sœur (PR #3385) a rencontré les deux mêmes témoins rouges de
`MessageHandlerEditDelete` en local. Elle a conclu — et écrit dans sa PR :

> Ce n'est pas une régression de `main` : ils échouent à l'identique au commit
> `f69cbd26`, dont le job « Test gateway » est vert. La recette locale ne
> reproduit donc pas la CI aussi complètement qu'elle l'affirme.

Le raisonnement est bon et la conclusion fausse, parce que la prémisse tacite
est fausse : **« la CI de ce commit est verte » se lit comme une propriété du
COMMIT, alors que c'est une propriété du commit ET de l'INSTANT où le job a
tourné.** Pour une panne pilotée par l'horloge, les deux se séparent. La CI de
`f69cbd26` avait tourné AVANT l'expiration des 24 h ; la session, elle, mesurait
après. Même arbre, même commande, deux verdicts — et aucun défaut de recette.

Quelques heures plus tard la CI de `main` (`HEAD` e87b7b0d) a viré au rouge sur
exactement ces deux témoins, ce que le log du job nomme explicitement.

> **Un vert de CI est horodaté.** Devant un rouge local qu'un vert distant
> contredit, la question n'est pas seulement « quel arbre ? » mais « QUAND ? ».
> Si l'écart entre les deux mesures franchit une frontière temporelle du code
> testé (une fenêtre, un TTL, une expiration, un changement de jour), le vert
> distant est PÉRIMÉ, pas contradictoire.

Le prix concret de l'inversion : la session sœur a rangé un `main` en train de
casser dans ses « Future Considerations », comme un défaut d'outillage local.
Un défaut attribué à l'outil de mesure cesse d'être cherché dans le produit.

> **L'hypothèse « mon outil de mesure est en cause » est la plus coûteuse des
> hypothèses confortables** : elle explique n'importe quel écart, elle n'accuse
> personne, et elle clôt l'enquête. Elle mérite donc la charge de preuve la plus
> lourde, pas la plus légère — ici, un `git log` de l'horaire du job aurait suffi
> à la renverser.

### Le corollaire de méthode

Les deux sessions ont vu le même symptôme. Celle qui a cherché POURQUOI la
fenêtre refusait (`admitMessageEdit`, `MESSAGE_EDIT_WINDOW_MS`, l'horaire du run)
a trouvé une bombe à retardement ; celle qui a cherché ce qui DIFFÉRAIT entre
local et CI a trouvé une explication plausible et s'est arrêtée.

> Quand deux environnements divergent, l'explication « les environnements
> diffèrent » est toujours disponible et presque toujours insuffisante. Elle ne
> devient une conclusion qu'une fois nommée la variable EXACTE — et ici la
> variable n'était dans aucun environnement : elle était dans l'horloge.
