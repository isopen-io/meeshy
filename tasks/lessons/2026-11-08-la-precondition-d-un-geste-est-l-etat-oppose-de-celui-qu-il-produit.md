## La pré-condition d'un geste est l'état OPPOSÉ de celui qu'il produit

*2026-11-08 — #17031, cycle 148*

### Ce qui s'est passé

`PUT …/messages/:id/pin` et son jumeau `DELETE` écrivaient sans regarder l'état
d'épingle. Un rejeu — ré-épingler un message déjà épinglé, dépingler un message
qui ne l'est pas — n'avait donc rien à écrire et annonçait pourtant une
activité : `lastActivityAt` avancé (jamais réversible) et un
`conversation:updated` porteur d'un `listRankAt` neuf **à chaque
participant**. La conversation remontait en tête de liste de tout le monde,
autant de fois qu'on rejoue, et `pinnedBy` changeait de main.

Le correctif est de deux lignes par porte. **Ce qui vaut d'être retenu est ce
que les témoins existants ont fait en le recevant.**

### Trois fixtures portaient `pinnedAt: null` pour les DEUX méthodes

Et elles étaient toutes trois écrites par des lots sérieux, sur des propriétés
réelles — le droit d'écrire (#11219), l'activité de liste (#9026), la charge
diffusée. Leur `it.each(['PUT', 'DELETE'])` passait la même ligne aux deux
méthodes, parce que le champ ne servait à rien dans la production d'alors.

Avec le correctif, leur `DELETE` décrit un **REJEU**, c'est-à-dire exactement
l'état dans lequel la route ne fait plus rien. Un témoin d'EFFET posé là ne
peut plus tomber : c'est l'absence d'effet qui le satisferait.

> **Un geste a une pré-condition, et c'est l'état OPPOSÉ de celui qu'il
> produit.** Une fixture qui donne au `DELETE` l'état d'après plutôt que l'état
> d'avant ne décrit pas un cas plus simple — elle décrit un cas où le geste
> n'a pas lieu. Et ça ne se voit pas tant qu'aucune branche de la production ne
> lit la colonne : le double est alors « incomplet sans conséquence », ce qui
> est l'énoncé même du piège (« un double partiel ne se signale qu'au moment où
> le module grandit »).

La réparation est de COMPLÉTER les fixtures, jamais d'affaiblir le correctif —
et la forme qui le dit le mieux est un helper nommé :

```ts
/** L'état depuis lequel le geste TRANSITE — l'opposé de celui qu'il produit. */
const precondition = (method: 'PUT' | 'DELETE'): Date | null =>
  method === 'DELETE' ? new Date('2026-11-01T08:30:00.000Z') : null;
```

### Corollaire : le témoin du correctif porte le REJEU, pas le nominal

Au rang nominal — un pin sur un message non épinglé, un unpin sur un message
épinglé — la forme juste et le défaut rendent le **MÊME** verdict. Un témoin
posé là ne peut pas tomber. C'est la leçon 261 (« un témoin de RANG s'écrit sur
un rang AUTRE que le premier ») transposée à l'IDEMPOTENCE : le second appel
est le seul endroit où les deux formes se séparent.

Les deux cas nominaux restent gardés, verts des deux côtés **par
construction** : leur rôle n'est pas de voir le défaut, c'est d'interdire que le
correctif se paie en supprimant le geste.

### À faire la prochaine fois

Devant tout correctif d'idempotence :

1. écrire le témoin sur le REJEU, et dire dans le fichier pourquoi le nominal
   ne pourrait pas tomber ;
2. chercher les fixtures existantes qui passent le MÊME état aux deux sens d'un
   geste — un `it.each(['PUT', 'DELETE'])` avec un seul littéral est le
   motif — et nommer leur pré-condition ;
3. ne pas lire leur rouge comme une régression : c'est la question « ton
   `DELETE` partait-il d'un message épinglé ? », et elle n'avait jamais été
   posée.
