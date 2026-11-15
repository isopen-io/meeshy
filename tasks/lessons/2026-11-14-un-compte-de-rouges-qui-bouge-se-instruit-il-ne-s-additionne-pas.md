## Un compte de rouges qui BOUGE d'un run à l'autre s'instruit, il ne s'additionne pas (cycle 161)

*2026-11-14, cycle 161 — mesuré sur la suite web d'`apps/web` en vérifiant trois
lots avant fusion.*

### Le fait

Deux exécutions de la MÊME suite, sur le MÊME arbre, à vingt minutes
d'intervalle : **2 rouges, puis 4**. La tentation est de prendre le plus grand
nombre, de le déclarer « bruit de machine » et de fusionner. Ouverts un par un,
les quatre avaient **trois causes différentes, et aucune n'était le diff** :

| rouge | cause RÉELLE | comment elle s'est montrée |
|---|---|---|
| un cliquet de comptage à l'échelle de l'arbre | **la branche était en retard sur `dev`**, qui avait abaissé le plafond | `git diff origin/dev` sur le fichier du cliquet montrait DEUX plafonds |
| deux témoins de composants | **ordre / charge** — ils passent en isolation | relancés seuls : 106/106 |
| un méta-témoin qui relance un sous-processus | **la version de l'outil** : bun 1.4.4 ici contre `BUN_VERSION: '1.3.14'` en CI | vert en CI, rouge ici, y compris avec l'option passée à la main |

### Ce que le compte variable disait, et qu'un total n'aurait pas dit

La variation n'était pas du bruit : c'était l'**information**. Deux des quatre
dépendent de l'ordre et de la charge, donc leur présence change d'un run à
l'autre ; les deux autres sont déterministes. Un total — « 4 rouges, sans
rapport » — écrase précisément la distinction qui permet de les trier.

> **Un compte qui bouge sépare les rouges DÉTERMINISTES des rouges
> CIRCONSTANCIELS, gratuitement.** C'est un diagnostic offert par la répétition,
> et l'additionner le jette.

### La méthode, et son coût réel

Chacun se tranche par **une mesure de quelques secondes**, pas par un
raisonnement :

1. **relancer seul** — sépare l'ordre de la substance ;
2. **`git diff origin/<base>` sur le fichier qui rougit** — sépare « mon diff »
   de « ma branche est en retard » ; un cliquet dont la VALEUR gelée diffère de
   la base n'accuse pas le code, il accuse la synchronisation ;
3. **comparer le verdict de CI sur la base** — sépare le dépôt de
   l'environnement ;
4. **comparer la VERSION de l'outil à celle que la CI épingle** — le dernier
   recours, et celui auquel on ne pense jamais.

La quatrième étape est celle qui a payé : elle a rendu une issue (#18466 — la
garde des `act()` abandonnés ne se pose plus sous bun 1.4.x, donc monter
`BUN_VERSION` ramènerait une cascade de 3 523 témoins). **Aucune des deux
exécutions ne la nommait** ; seule la comparaison avec `BUN_VERSION` l'a dite.

### Le piège symétrique, et il est le plus coûteux

Un rouge d'environnement se lit comme un **harnais instable**, et un harnais
réputé instable cesse d'être lu. Le méta-témoin de la garde `act()` fait
exactement son travail — il tombe dès que la garde ne se pose plus — et c'est
cette justesse qui le rend vulnérable : le jour du bump, il rougira, et quelqu'un
de pressé le classera « flake ».

> **Attribuer un rouge à la machine est une AFFIRMATION**, au même titre qu'un
> tri (cycle 86 bis), un compte (cycle 93), une contrainte de schéma (cycle 94)
> ou un consommateur nommé (cycle 161). Elle se vérifie — et ce qui la vérifie
> n'est jamais « ça a l'air hors sujet », c'est une mesure qui NOMME la cause.
