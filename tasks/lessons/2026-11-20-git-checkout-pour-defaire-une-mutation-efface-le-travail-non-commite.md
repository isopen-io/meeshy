## `git checkout --` pour défaire une mutation de PREUVE efface le travail non commité (cycle 193)

Deux fois dans la même session, pour prouver qu'un témoin tombe, j'ai muté un
fichier de production puis l'ai « restauré » par
`git checkout -- <fichier>`. La première fois le fichier était commité et tout
allait bien. La seconde, il portait **le correctif du lot, non commité** : le
`checkout` l'a rendu à `HEAD`, et trois éditions ont disparu — le paragraphe de
doc réécrit, la forme du type, et l'appel corrigé. Le test suivant est repassé
rouge sans raison apparente.

> **`git checkout -- <fichier>` ne défait pas une mutation : il rend le fichier à
> `HEAD`.** Sur un fichier qui porte du travail non commité, c'est une
> suppression. La preuve d'un ROUGE se défait par l'inverse de la mutation, ou
> par une COPIE prise avant (`cp fichier /tmp/…`, restaurée par `cp`), jamais par
> git.

Le protocole qui tient, et qui a servi au reste de la session :

1. `cp <fichier> <scratchpad>/<fichier>.keep` **avant** de muter ;
2. muter, lancer les témoins, noter les rouges ;
3. `cp <scratchpad>/<fichier>.keep <fichier>` pour restaurer.

Et le signe qui l'attrape tout de suite : après restauration, le témoin qu'on
venait de voir rougir **reste rouge**. Un rouge qui survit à la restauration
n'est pas le rouge qu'on a provoqué — c'est du travail perdu.
