## Un littéral de date sous une FENÊTRE n'est pas une constante, c'est une échéance (cycle 108)

`MessageHandlerEditDelete.test.ts` épinglait le `createdAt` d'un message à
`2026-08-22T10:00:00Z`. `admitMessageEdit` refuse toute édition passé **24 h**
depuis `createdAt`. Les deux cas ont donc été verts pendant exactement vingt-quatre
heures, puis rouges le lendemain à 10:00 UTC — pour toutes les branches, tous les
contributeurs, et **définitivement**. Un dépôt entier bloqué par une fixture.

> **Une fixture de date lue par un code qui la compare à MAINTENANT doit être
> écrite RELATIVEMENT à maintenant.** `new Date(Date.now() - 60_000)`, jamais un
> littéral. Le test ne dit pas « le 22 août » ; il dit « dans la fenêtre ».

Deux choses rendent la famille difficile à voir :

1. **Le symptôme désigne le mauvais coupable.** `emitsTo(...)` rendait `[]`, ce
   qui se lit « le producteur n'émet plus » — un défaut de production, gros et
   effrayant. Le producteur allait bien : la garde refusait en amont. La vraie
   cause était dans le `callback`, que le cas n'assertait pas. *Quand une
   assertion d'émission tombe à vide, lire d'abord le canal de REFUS ; « rien
   n'est parti » et « quelque chose a dit non » ont le même symptôme.*
2. **Le cas VOISIN restait vert**, et c'est lui qui a livré le diagnostic : sa
   fixture n'a pas de `createdAt`, donc rien à périmer. Les cas qui tombaient
   étaient exactement ceux qui en AJOUTAIENT un. *Un échec qui suit les
   surcharges d'une factory désigne le champ, pas le producteur.*

Et le corollaire de méthode, celui qui a évité d'accuser le mauvais lot :
**avant de réparer un rouge apparu après un merge, mesurer la BASE.** Une copie
vierge d'`origin/main` a rendu les deux mêmes échecs, sans une ligne de la
branche. Sans cette mesure, une heure serait partie à chercher la régression
dans un diff qui, hors `apps/android`, n'était fait que de commentaires.
---
