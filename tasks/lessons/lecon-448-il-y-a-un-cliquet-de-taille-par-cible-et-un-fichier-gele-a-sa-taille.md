## Leçon 448 — Il y a UN cliquet de taille PAR CIBLE, et un fichier gelé à sa taille exacte est un fichier qu'on ne touche pas

**Ce qui s'est passé.** Deux fois dans la même session, un lot vert
localement a rougi la CI quarante minutes plus tard sur un cliquet de
taille que personne n'avait relu avant d'écrire :

1. `FileSizeBudgetGuardTests` (iOS, `apps/ios/Meeshy`) : le cumul des
   fichiers de la dette héritée dépassait déjà son plafond sur `dev`
   (#4841 — 177 lignes) ; tout ajout à un hôte en dette aggravait un rouge
   préexistant, invisible parce que la suite iOS ne tourne sur une PR que
   si le sujet du commit le demande (« run test »).
2. `gateway-test-file-size-budget.test.ts` (#4531, SUITES du gateway) :
   `message-new-producer-parity.test.ts` était gelé à **1 000 lignes
   exactement** dans `DETTE_HERITEE`. Un agent y a ajouté un témoin de
   quinze lignes — le bon témoin, au bon endroit — et la règle 3 (« le
   cumul hors budget ne remonte pas ») a rougi.

> **Avant d'écrire dans un fichier, mesurer ce fichier contre le cliquet de
> SA cible** — il y en a au moins trois dans ce dépôt (prod iOS, prod
> gateway #4426, suites gateway #4531), chacun avec sa liste gelée et sa
> convention de comptage. Un fichier de la liste dont la taille du jour
> ÉGALE le nombre gelé n'a aucune marge : la seule façon d'y ajouter est
> d'en SORTIR une responsabilité d'abord, dans le même commit.

Et quand une fusion de `dev` arrive, **relancer les cliquets localement
sur l'arbre fusionné** : `dev` peut être rouge par décision (#4841 laissait
165 lignes impayées, à dessein), et la fusion importe ce rouge. Ici les
découpes de la branche l'ont payé — mais seulement parce que la mesure a
été REFAITE sur l'arbre fusionné, pas déduite des deux plafonds.

Le motif commun aux deux morsures : la garde vivait dans une suite que
l'agent qui écrivait n'a pas lue, parce qu'elle ne nomme pas le fichier
qu'il modifiait — elle nomme une LISTE où il figure. Chercher « qui me
mesure ? » (grep du nom de fichier dans les tests) avant « où j'ajoute ? ».
