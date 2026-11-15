## Une garde CITÉE par le chemin qui ne l'a pas — la variante la plus discrète de « posée sur un chemin »

*2026-11-08 — #17079, cycle 149*

### Ce qui s'est passé

Les deux transports de suppression de message écrivaient
`prisma.message.update({ where: { id: messageId }, … })`. La route d'ÉDITION, à
quelques fichiers de là, porte `where: { id, deletedAt: null }` **à quatre
sites** — la garde optimiste qui ferme la course.

Et le commentaire de la route de suppression la CITE :

> « Elle ferme aussi une course avec l'édition : la garde optimiste de
> l'édition (`where: { id, deletedAt: null }`) voyait `deletedAt` encore nul
> dans la fenêtre… »

Le site qui n'avait pas la garde **nommait la garde**, correctement, pour
expliquer ce qu'elle protégeait chez le voisin. Deux suppressions concurrentes
franchissaient donc toutes deux la lecture d'amont, écrivaient toutes deux, et
appelaient toutes deux un décompte NON idempotent — les compteurs dérivaient
vers le bas de la valeur d'un message, définitivement.

### Pourquoi c'est pire qu'un oubli

La règle connue du dépôt — « une garde posée sur un chemin se lit comme posée
sur le SUJET » — décrit un site qui ignore la garde. Ici le site la
**connaît** : il l'a écrite dans sa prose, au présent, comme un fait du
système.

> **Citer une garde donne la sensation de l'avoir.** Un lecteur qui tombe sur
> ce commentaire apprend que la garde existe et qu'elle est pertinente ici —
> exactement les deux choses qu'il lui faudrait pour la chercher, et qui lui
> ôtent l'envie de vérifier qu'elle y est.

C'est la parente de « une leçon CITÉE en en-tête n'empêche pas le défaut
qu'elle décrit » (cycle 147), déplacée du doc-comment d'un lot vers un
commentaire de production — là où elle survit indéfiniment.

### La forme du correctif

Pas « ajouter le `where` aux deux sites » : un **site unique** qui porte
l'écriture ET l'interprétation de son échec
(`services/messaging/softDeleteMessage.ts`, verdict `'deleted' |
'already-deleted'`). Parce que la question « que fait le perdant d'une
course ? » a une bonne réponse et deux mauvaises, et qu'elle ne doit être
répondue qu'une fois :

- laisser remonter `P2025` ⇒ 500, pour un appel dont le résultat est acquis ;
- traiter TOUTE erreur comme une course perdue ⇒ un retrait réellement échoué
  disparaît sous « quelqu'un d'autre l'a fait ».

**Et l'audit ne nommait qu'un des deux transports.** Le second est celui que le
dépôt appelle « primaire ». Corriger le site nommé aurait laissé le plus
fréquenté ouvert.

### À faire la prochaine fois

1. devant un commentaire de production qui NOMME une garde d'un autre chemin,
   `grep` la garde dans le fichier courant avant de lire la suite ;
2. quand une garde manque à deux transports, en faire un site unique qui porte
   aussi l'INTERPRÉTATION de son échec — c'est là que vivent les deux mauvaises
   réponses ;
3. compter les transports AVANT de corriger celui que l'issue nomme.
