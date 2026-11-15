## Une branche de longue durée et une PR ne sont pas le même objet — la PR fusionne sur l'état qu'elle a à cet instant

**Ce qui s'est passé.** Trois lots livrés d'affilée sur une branche, poussés au
fur et à mesure, avec le corps de la PR réécrit à chaque fois pour décrire les
trois. La PR a fusionné **pendant** le troisième lot, sur l'état qu'elle avait à
cet instant : **un lot sur trois est entré dans `dev`**. Les deux autres se sont
retrouvés sans PR, sur une branche dont la PR était close.

**La confusion.** Je tenais la PR comme une VUE de la branche — elle s'actualise
à chaque push, donc elle dira ce que la branche dit. C'est vrai de son
CONTENU et faux de son MOMENT : la fusion échantillonne la branche à un instant
que je ne choisis pas. Sur un dépôt qui fusionne automatiquement vers `dev` dès
le vert, « à tout moment » est le cas NOMINAL, pas le cas rare.

**La règle.** Un lot fini se pousse et se clôt dans une PR qui lui correspond.
Empiler un second lot sur une PR ouverte parie que personne ne la fusionnera
avant qu'on ait fini — un pari qu'on perd d'autant plus souvent que la CI est
verte, c'est-à-dire exactement quand le travail est bon.

**Le corollaire sur le corps de la PR.** Réécrire le corps à chaque lot fabrique
un document qui ne correspond à AUCUN état fusionné. Une fois la PR fusionnée,
son corps est un fait DATÉ : on ne le réécrit pas, on ajoute un commentaire qui
dit ce qui est réellement entré. Le registre se corrige en ajoutant, jamais en
effaçant — un lecteur futur qui verrait un corps « propre » décrivant trois lots
chercherait deux correctifs qui ne sont pas là.

**Ce qu'il faut vérifier après coup, et que j'ai failli ne pas faire.** La
notification de fusion donne le `head_sha` fusionné. Le comparer à la tête de la
branche prend une commande (`git merge-base --is-ancestor <commit> origin/dev`,
lot par lot) et dit lesquels sont réellement entrés. Sans elle, j'aurais annoncé
trois correctifs livrés dont deux n'existaient nulle part.
