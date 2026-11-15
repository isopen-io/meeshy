## Leçon 569 — Un lot ne peut énumérer que les témoins qui le NOMMENT, jamais ceux qui le MESURENT

2026-09-11, iOS (#6069). Deuxième rouge fusionné dans `dev` en deux jours, et
celui-ci par l'autre bout que la leçon 565 : un AJOUT, pas un retrait.

#6047 a ajouté 70 lignes à `MeeshyComposerHost+Intake.swift`, qui en pesait
1 195. Le plafond dur est 1 200. Deux règles de `FileSizeBudgetGuardTests` sont
devenues rouges — et la PR ne pouvait pas le savoir, pour une raison plus
profonde que la portée compile-only de la CI iOS :

> **Le témoin ne compte pas des identifiants, il compte des LIGNES.** Il n'a
> aucun lien lexical avec quoi que ce soit du lot — ni avec ce qu'il ajoute,
> ni avec le fichier touché. Un fichier qui franchit un seuil ne mentionne
> nulle part le cliquet qui le garde. Il n'y a rien à chercher.

La 565 disait « chercher un retrait dans ce qui COMPTE, pas seulement dans ce
qui NOMME ». La forme générale est plus dure :

> Un lot peut énumérer les témoins qui le nomment. Il ne peut pas énumérer
> ceux qui le mesurent — parce qu'un seuil, un cumul ou une population n'ont
> de lien avec le code que par une VALEUR, et une valeur ne se grep pas.

Ce qui reste actionnable, à défaut de l'énumération :

- faire tourner la suite entière dès qu'on touche le domaine, plutôt que les
  suites qu'on sait concernées (#6065) — le seul filet qui ne demande pas de
  deviner la forme du témoin ;
- connaître les cliquets NUMÉRIQUES du domaine (taille, population figée,
  clés de catalogue, cumul de dette) et mesurer *avant de pousser* les deux ou
  trois chiffres qu'ils lisent. Ils sont peu nombreux et ne changent pas ;
- se méfier particulièrement des lots qui ajoutent « juste quelques lignes » à
  un fichier déjà gros : le plafond de 1 200 n'a pas d'alarme à 1 190.
