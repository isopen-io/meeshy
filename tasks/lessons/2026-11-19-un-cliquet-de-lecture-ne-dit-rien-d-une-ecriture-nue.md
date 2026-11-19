# Un cliquet qui garde les LECTURES ne dit rien d'une colonne dont c'est l'ÉCRITURE qui est nue

*2026-11-19, cycle 182, #19800. Famille : les égalités nues de soft-state
(#19690, #19755, #19748) — et la seule des six occurrences du piège qui vivait
dans un `updateMany`.*

## Ce qui s'est passé

`Conversation.lastActivityAt` avait l'air entièrement sous garde. Son lecteur
principal — la borne de curseur de `routes/conversations/utils/list-rank.ts` —
dit l'absence en TROIS branches depuis #8309, avec une suite écrite exprès pour
ça (`conversation-list-rank-absent-activity.test.ts`) et un doc-comment qui
explique la sémantique MongoDB mieux que la plupart.

Le seul site nu du dépôt sur cette colonne était l'**écriture** :

```ts
await prisma.conversation.updateMany({
  where: { id: conversationId, OR: [{ lastActivityAt: null }, { lastActivityAt: { lt: at } }] },
  data: { lastActivityAt: at },
});
```

Aucun chemin de création n'écrivant la colonne, ce `where` n'appariait **aucune
conversation** : la première écriture ne pouvait jamais avoir lieu, la colonne
restait absente pour toujours, et l'axe « activité » du rang de liste (#9026)
n'a jamais existé — quatre gestes du produit inertes pour la population entière.

## La règle

> **Le mot « filtre » oriente vers la lecture, et c'est le vocabulaire de la
> règle qui cache le site, pas l'instrument.** Un `where` d'`updateMany` /
> `deleteMany` / `update` est un filtre comme un autre, et il décide de
> l'existence de la donnée au lieu d'en décider l'affichage — donc son échec est
> plus silencieux : `count: 0` n'est pas une erreur, et une écriture best-effort
> ne le regarde pas.

Avant de conclure qu'une colonne de soft-state est sous garde, énumérer ses
`where` par OPÉRATION, pas par intention :

| opération | symptôme d'une égalité nue |
|---|---|
| `findMany` / `findFirst` | une liste qui manque la moitié de la population — **visible** |
| `updateMany` / `update` | `count: 0`, aucune erreur — **invisible**, et la donnée n'existe jamais |
| `deleteMany` | un balayage inerte — invisible jusqu'à l'audit de rétention |

Le balayage `where-equality-null-scan.ts` ne s'y trompe pas : il relève tout
`where`, y compris celui d'une écriture (`PAYLOAD_KEYS` n'exclut que `data`,
`create`, `update`, `set` — les CHARGES, pas les clauses). C'est la lecture
humaine de son inventaire qui s'y trompe.

## Le corollaire : pour prouver qu'une colonne n'est jamais écrite, compter ses ÉCRIVAINS

L'issue affirmait « mesuré sur les dix-neuf sites de création ». Le compte ne se
retrouve pas (onze `prisma.conversation.create`, aucun `createMany`, aucun
`upsert`), et surtout **il était inutile** :

> Compter les ÉCRIVAINS d'une colonne coûte une commande
> (`grep "data: { laColonne"`) et ne peut pas être incomplet. Énumérer les
> CRÉATIONS coûte un inventaire, et un inventaire l'est presque toujours.
> Devant « aucun chemin n'écrit X », chercher la mesure qui rend le compte des
> chemins inutile — ici : **un seul** `data: { lastActivityAt }` dans tout le
> dépôt, et c'est le site qu'on répare.

C'est la leçon 93 (« un compte est une AFFIRMATION ») prise par le côté utile :
ne pas seulement vérifier le compte hérité, mais trouver l'énoncé qui n'a pas
besoin de compte.

## Le second corollaire : deux fonctions de même nom ne se distinguent pas au `grep`

L'issue nommait cinq alimenteurs de la colonne. Il y en a quatre :
`messagePostSaveEffects.ts:160` est
`EngagementService.recordConversationActivity(userId, axisKey, conversationId)`,
qui écrit `EngagementConversationCredit` — un **homonyme** de
`recordConversationActivity({ prisma, conversationId, at })`. Le fichier
n'importe pas l'unité en cause.

> La liste des appelants d'une unité se dresse par ses **importateurs**, jamais
> par un `grep` de son nom — et c'est précisément un `grep` du nom qu'on fait
> pour dresser la liste. Deux signatures, un nom : le `grep` rend les deux et
> rien ne les sépare à l'œil.

## Et le piège de MÉTHODE qui attend le correctif

Réparer le filtre **allume un chemin que son inertie rendait gratuit**. Le flux
B de `loadRankedConversationPage` ne rendait jamais rien, donc `GET /conversations`
prenait toujours son chemin rapide à une lecture ; la colonne peuplée, le chemin
de fusion s'active (deux lectures de plus). C'est la leçon du cycle 181 (« un
filtre faux peut CACHER le coût de la requête qu'il porte ») appliquée à un
CHEMIN, et dans l'autre sens : là, le correctif livrait un défaut de mémoire ;
ici, il allume le chemin JUSTE, et son coût doit être annoncé plutôt que
découvert.

> **Avant de réparer un filtre inerte, lire ce qui s'exécute quand il rendra
> enfin quelque chose.**
