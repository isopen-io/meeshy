## Leçon 365

**Une preuve de CI se rattache à un SHA, jamais à un moment.**

La nuit du 30 au 31 août, après huit heures sans le moindre verdict (#4395
annulait, #4526 et #4528 rougissaient), un run a enfin conclu `success`. J'ai
vérifié `git merge-base --is-ancestor` pour les cinq issues à taguer, posé leurs
labels, écrit leurs commentaires de relais — correctement.

Puis, dans le même mouvement, j'ai tagué **deux issues de plus** dont les
commits étaient nés APRÈS le départ de ce run. Mesuré après coup :

```
git merge-base --is-ancestor 356ba1bdf9 a38ac247bc   ->  faux
git merge-base --is-ancestor c1703729fe a38ac247bc   ->  faux
```

Le run était vert. Il ne contenait pas ce code.

> **« Le run est vert » et « le run contient mon code » sont deux affirmations
> distinctes, et la seconde ne se déduit pas de la fraîcheur de la première.**
> Le verdict s'attache à un sha ; ma confiance s'attachait à une heure.

C'est **l'attribution par proximité**, la même erreur qui m'a fait sous-compter
trois relevés dans la même session (#4488 : 34 annoncés, 37 réels ; #4432 : 18
pour 13 ; #4491 : « un appelant » pour trois). Le fait vérifié pour A est
reporté sur B parce que B est arrivé juste après. Le coût est plus élevé ici :
un label `to-integrate` est une PROMESSE faite à la session d'intégration, qui
n'a aucune raison de rejouer la vérification que le label affirme.

Ce qui rend le défaut difficile à voir de l'intérieur : la vérification AVAIT
été faite, consciencieusement, quelques minutes plus tôt. Ce n'est pas un
contrôle oublié, c'est **un contrôle dont la portée a été étendue en silence**.

Parade mécanique, pas une discipline d'attention : **relancer
`merge-base --is-ancestor` au moment de poser CHAQUE label**, sur le commit de
CETTE issue, jamais sur la mémoire d'un lot. Une seule commande, et elle
distingue exactement ce que l'œil confond.

Réparation : les deux labels retirés dans les minutes qui ont suivi, avec un
commentaire disant sur chaque issue ce qui reste vrai (les gates locaux, le RED
prouvé, la mutation) et ce qui ne l'est pas (« CI verte sur ce code »). Le
label sera reposé sur un run dont ces commits sont réellement ancêtres.

Corollaire de forme, valable pour tout label d'état posé par une machine :
**un label affirme quelque chose que personne ne revérifiera.** Avant d'en
poser un, demander non pas « est-ce vrai ? » mais **« qu'est-ce que ce label
dispense mon lecteur de vérifier ? »**
