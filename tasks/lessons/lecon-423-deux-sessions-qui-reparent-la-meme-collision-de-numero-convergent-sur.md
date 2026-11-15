## Leçon 423 — Deux sessions qui réparent la MÊME collision de numéro convergent sur le MÊME numéro, et la recréent

Trois commits, dans cet ordre, tous justes pris un à un :

1. `5cbe461fe1` — une session voisine pose les leçons **419** et **420** ;
2. `55969bfc01` — elle voit la collision sur 419 et renumérote **sa** leçon en
   **421**, « le garde du gateway repasse au vert » ;
3. `c31ef7b425` — je vois la même collision sur 419, je renumérote **la mienne**
   en **421**, garde verte chez moi.

Résultat : `« 421 » : lignes 23518, 23571`. **La réparation a déplacé la
collision sans la résoudre**, parce que les deux sessions ont appliqué la même
règle — « prendre le prochain numéro libre » — sur deux vues du fichier qui ne
se voyaient pas l'une l'autre.

> Une règle d'allocation DÉTERMINISTE appliquée en parallèle par deux acteurs qui
> ne se voient pas produit deux fois la même valeur. Ce n'est pas une erreur de
> l'un des deux : c'est la règle qui est fausse dès qu'elle est concurrente.
> « Le prochain libre » n'alloue rien — il DEVINE, et deux devins bien informés
> devinent pareil.

Et le détail qui rend le piège invisible : **chacune des deux sessions avait fait
tourner la garde, et l'avait vue verte.** Elle l'était : sur l'arbre local, au
moment de la mesure, il n'y avait plus qu'un seul 421. La garde ne ment pas, elle
répond à la question qu'on lui pose — « ce fichier-ci a-t-il une collision ? » —
et pas à celle qui compte : « ce fichier-ci, FUSIONNÉ AVEC CE QUE LES AUTRES ONT
POUSSÉ, en a-t-il une ? »

**La règle opératoire** : un numéro de leçon vit dans un espace de noms PARTAGÉ
avec des sessions qu'on ne voit pas. On ne le choisit donc pas sur son propre
arbre. Juste avant de pousser — après un `git fetch` frais et la fusion — on
relit les numéros de `origin/dev` et on relance la garde sur l'état FUSIONNÉ.
C'est la seule mesure qui porte sur l'objet réel.

Cette leçon vaut au-delà des numéros de leçon : **tout identifiant qu'un humain
ou un agent attribue à la main sans allocateur central** — un numéro de
migration, une clé d'inventaire gelé, un port de test, un `data-task` de planche
— se paie de la même façon. Le remède est toujours le même : mesurer sur l'état
FUSIONNÉ, au dernier moment, plutôt que sur le sien au moment de l'écriture.
