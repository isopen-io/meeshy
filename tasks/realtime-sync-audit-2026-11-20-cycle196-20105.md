## Cycle 196 — la cascade « lu ⇒ remis » se borne à la frontière de la lecture qu'elle suit (#20105)

**Date** : 2026-11-20. **Base** : `dev` à `dd00ea14d`. **Issue** : #20105.
**Milestone** : #107 « Accusés: reçu, vu, écouté ».

### Le défaut, et le mot qu'il contredisait

Dans `markMessagesAsRead`, deux écritures voisines de dix lignes traitaient la
même frontière de façon OPPOSÉE. La lecture se bornait et disait pourquoi ; sa
cascade de livraison partait de `messageId` — le dernier message non supprimé de
la conversation, que la méthode résout elle-même quand l'appelant n'en nomme
aucun, ce que fait la porte REST (`receipts.ts`, `markFor`, `undefined` en
`latestMessageId`).

| | borne d'avant |
|---|---|
| curseur de LECTURE | préfixe contigu PROUVÉ ⇒ M3 |
| gel de LECTURE | `until: caughtUpAt` ⇒ M1…M3 |
| **curseur de LIVRAISON** | **M40**, le bas du fil |
| **gel de LIVRAISON** | **M1…M40** |

Et le commentaire de la cascade appelait DÉJÀ le gel de lecture sa « JUMELLE »,
en ajoutant qu'« une règle qu'il faut retaper à chaque endroit est une règle
qu'un endroit finira par ne pas avoir ». Les deux divergeaient précisément sur
cette règle — le mot était posé, la chose non.

### Le troisième coût n'était dans aucun constat, et c'est le seul qui DÉTRUIT

L'issue énumérait deux coûts : la sur-déclaration ✓✓ chez l'auteur, et son
caractère irréversible sous `EXACT_READ_TRACKING_SINCE`. Les deux tiennent. Le
troisième s'est présenté en lisant `freezeMessageStatus` ligne à ligne plutôt
qu'en lisant sa signature :

```ts
if (field === 'deliveredAt') {
  const received = [...toCreate, ...toUpdate];
  if (received.length > 0) await startEphemeralCountdowns(prisma, { … });
}
```

**Le gel de livraison DÉMARRE les décomptes éphémères de tout ce qu'il grave**
(#7451) et les ANNONCE aux deux rooms (`message:countdown-started`). Afficher
les trois premiers messages d'un fil mettait donc à brûler un éphémère resté
trente-sept messages plus bas, que personne n'avait reçu. Les deux premiers
coûts mentent à l'expéditeur ; celui-là **supprime du contenu**.

> La question du cycle 125 — « qu'est-ce qui part À CÔTÉ de ce que je viens de
> corriger ? » — se pose aussi d'un correctif de BORNE, et la réponse ne se lit
> pas dans la signature de ce qu'on borne. `freezeMessageStatus({ field })` a
> l'air d'un setter de date. Son dernier bloc déclenche une destruction.

### La borne cesse d'être une règle, elle devient une VALEUR

`ReportedReadFrontier` (type SOMME, `services/messaging/readDeliveryCascade.ts`)
porte ce que la moitié LECTURE a résolu, et la cascade le REÇOIT :

| membre | ce qu'il porte | ce que la lecture en a fait |
|---|---|---|
| `exact` | `messageIds` | la liste que son gel a honorée |
| `window` | `until` + `cursorTo` | la borne haute de son gel, et le message de son curseur |

Aucune des trois valeurs n'est recalculée dans la cascade. Un booléen
« borné ou non » n'aurait pas pu dire la différence : les deux modes ne bornent
pas la même chose (une liste d'ids / une position chronologique).

### Trois décisions qui ne se transposent PAS de la lecture

1. **En mode exact, le gel part d'abord et le curseur ensuite** — l'ordre de
   `markMessagesAsReceived` (#18731) et pour sa raison exacte : ce que
   `_computeExactDeliveredCursorTarget` interroge est l'entrée FIGÉE que ce
   gel-ci vient d'écrire. Dans l'autre ordre, le curseur ne pourrait jamais
   franchir un message dont cet appel est le premier à prouver la livraison.
2. **Le curseur de livraison ne SAUTE pas à la frontière de rattrapage**, à la
   différence de celui de lecture. Ce saut-là est une décision produit sur le
   BADGE (« sans élargir d'un seul message l'ensemble déclaré LU ») ; l'étendre
   rouvrirait par le curseur la sur-déclaration qu'on vient de fermer.
3. **L'état impossible ne revient pas pour autant.** `resolveReceivedAt`
   retombe en DERNIER ressort sur `readAt` — « on ne lit pas ce qu'on n'a pas
   reçu » — donc `deliveredCount >= readCount` ne dépend d'AUCUN curseur. C'est
   ce qui autorise la décision 2 ; sans ce repli, elle aurait été fausse.

### Extraite, parce que l'hôte est hors budget

`MessageReadStatusService` pèse 2 749 lignes, deux fois le plafond de 1 200, et
la directive interdit d'y AJOUTER avant d'en avoir extrait. C'est le motif
d'extraction de `freezeMessageStatus` (#7451), repris tel quel — avec une
seconde raison propre à ce lot : la borne devait avoir UN endroit.

### Le ROUGE, prouvé par mutation

| mutation | témoins rouges |
|---|---|
| cascade non bornée (l'état d'avant #20105) | **5** |
| curseur qui fait confiance à la liste RAPPORTÉE au lieu du préfixe PROUVÉ | **1** — le seul témoin du trou ANTÉRIEUR, et c'est le seul scénario où les deux diffèrent |
| mode fenêtre privé de sa borne haute (`until`) | **1** — le seul témoin de ce mode |

Les deux témoins qui restent VERTS sous la première mutation sont les bons :
l'invariant `deliveredCount >= readCount` (la sur-déclaration ne le casse pas —
c'est la panne inverse) et la mesure INVERSE (« marquer toute la conversation
lue », sans rapport, GARDE sa fenêtre, forme héritée préservée).

### Le double est STATEFUL, et il le fallait

Un accusé de lecture exact écrit DEUX fois sur la même ligne dans le même
appel : le gel de lecture la crée (`readAt` posé, `deliveredAt: null`), celui de
livraison la complète par `updateMany`. Un double qui répondrait `[]` à
`findMany` — le patron du témoin frère de #20084 — ferait passer la seconde
écriture par `createMany`, c'est-à-dire par un chemin que la production ne prend
pas ici, et le préfixe contigu prouvé n'aurait AUCUNE entrée à lire. Il honore
en plus la forme `unsetOrNull` (`OR` de deux branches) que le write-once
emploie.

**Et sa strictesse a trouvé une forme de production qu'on n'attendait pas.**
Levant sur toute clé inconnue, il a rendu `messageSource` / `messageType` /
`AND` : la SONDE D'AVIS DE CAPTURE que le compte de non-lus pose sur la même
fenêtre (`uncountedCaptureNoticesIn`, #9630). Elle est admise explicitement, et
`[]` est sa réponse fidèle — la fixture n'en porte aucun. Un double permissif
l'aurait avalée sans rien apprendre.
