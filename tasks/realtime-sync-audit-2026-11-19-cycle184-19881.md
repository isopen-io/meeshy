# Cycle 184 — la borne du curseur jetait l'identité qu'elle avait en main

*2026-11-19, à la suite du cycle 183 (#19836, PR #19882).
Branche `claude/exciting-planck-0vkcxe`. Instruit **#19881**, ouvert PAR le
cycle 183 en écrivant sa marche par curseur.*

---

## Comment il a été trouvé, et c'est le seul point de méthode qui compte

Le cycle 183 gardait la FENÊTRE des deux flux. En écrivant sa marche page par
page à `limit: 1`, une question s'est posée d'elle-même : **et deux lignes de
rang IDENTIQUE ?** Elle n'était dans aucune issue, dans aucun suivi, dans aucun
audit.

> **Un témoin qui marche page par page POSE la question de la frontière.** Ce
> n'est pas une intuition qu'on a eue : c'est la forme du témoin qui l'a rendue
> inévitable. Un témoin qui demande une page unique ne la pose jamais, et c'est
> pourquoi neuf témoins de rang ont coexisté avec ce défaut.

## Le défaut, mesuré

`resolveListCursor` réduit le curseur à un **rang nu** et `rankBound` en fait une
borne **STRICTE**. Mesuré avec le vrai `loadRankedConversationPage` et un moteur
qui évalue le `where` à la MongoDB, `limit: 1` :

```
ex-aequo-1 (lastMessageAt 11-20) · ex-aequo-2 (lastMessageAt 11-20) · c-plus-vieux (11-10)

PAGE 1 = [ ex-aequo-1 ]
PAGE 2 = [ c-plus-vieux ]        ← borne = 11-20, `lt` STRICTE
→ ex-aequo-2 n'apparaît sur AUCUNE page
```

Elle ne revient pas : la page suivante borne sur un rang inférieur au sien. La
conversation disparaît de la liste jusqu'à la réconciliation complète du client —
24 h sur iOS comme sur le web.

**Atteignable** : `Conversation.lastMessageAt` est `DateTime @default(now())` et
`messagePostSaveEffects` y écrit `new Date()`. Deux conversations créées ou
touchées dans la même milliseconde suffisent. Et depuis #19800 une seconde porte
s'ouvre : **l'égalité n'a plus besoin d'être entre deux `lastMessageAt`** — le
rang d'une ligne REMONTÉE par son activité peut valoir exactement le
`lastMessageAt` d'une autre (une réaction sur A à l'instant où un message arrive
dans B). Le témoin garde les deux formes.

## Ce qui rend le lot peu coûteux : l'identité était déjà là

`beforeCursor` **EST** un `Conversation.id`. `resolveListCursor` le lit,
l'autorise dans le scope du lecteur (`participants: { some: { userId,
isActive } }`), puis n'en garde que le rang — **jeté une ligne avant d'être
utile**. Aucun format de curseur ne change, donc rien à instruire côté
rétrocompatibilité (#9223).

## La jumelle vivait dans la MÊME fonction, sous l'autre branche du premier `if`

`loadRankedConversationPage` ouvre sur :

```ts
if (request.deltaOrder && curseur.genre === 'absent') {
  return readRows({ where, orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }], … });
}
```

Le chemin delta départage ses égalités sur `id` **et son doc-comment l'explique**
(« `id` départage les égalités »). Le chemin de rang, onze lignes plus bas, ne l'a
jamais reçu.

> Les formes connues de « cette entité a-t-elle une jumelle ? » cherchent dans une
> autre table, un autre site, un autre moment, un autre médium. Celle-ci est
> **intra-fonction**, donc invisible à tout outil qui raisonne par site — et la
> branche qui a la discipline est la PREMIÈRE qu'on lit.

## Les TROIS sites qui doivent s'accorder

Un départage posé à un seul endroit est pire que pas de départage : la borne
s'accorderait avec un ordre que la lecture ne rend pas.

| site | ce qu'il devient |
|---|---|
| `rankBound` | borne LEXICOGRAPHIQUE `(rang, id) < (R, C)`, en clauses par flux |
| les deux `orderBy` | `[{ lastMessageAt: 'desc' }, { id: 'desc' }]` et `[{ lastActivityAt: 'desc' }, { id: 'desc' }]` |
| `mergeByRank` | comparateur `(rang desc, id desc)` EXPLICITE |

L'ordre sur l'id est le même des deux côtés parce que **MongoDB compare un
ObjectId octet par octet**, ce qui est exactement l'ordre lexicographique de son
hexadécimal : `{ id: { lt: C } }` et `orderBy: { id: 'desc' }` s'accordent.

`mergeByRank` s'appuyait avant sur la STABILITÉ du tri, c'est-à-dire sur l'ordre
des deux lectures qui l'alimentent — un ordre que rien ne garantissait, les deux
`orderBy` n'ayant pas de clé de départage. Deux lignes de rang égal pouvaient
donc sortir dans un ordre et être bornées dans l'autre.

## Le ROUGE, et les deux mutations qui NE TOMBAIENT PAS

| mutation | résultat |
|---|---|
| `rankBound` retombe sur la borne STRICTE | **3 échecs** / 16 |
| `byMessageOrder` sans `{ id: 'desc' }` | **2 échecs** / 16 |
| `byActivityOrder` sans `{ id: 'desc' }` | **1 échec** / 16 |
| `mergeByRank` sans départage | **2 échecs** / 16 |

**Les deux dernières ne tombaient pas au premier jet.** Le témoin écrit pour le
défaut gardait la borne et l'ordre du flux A, et laissait l'ordre du flux B et la
fusion **non gardés** — deux changements de production qu'aucune mesure ne
défendait. Deux témoins ont été ajoutés pour cela.

> **Prouver le ROUGE site par site, et non « le lot tombe-t-il ? »**, est ce qui
> a rendu ce trou visible. Un lot dont le témoin tombe est un lot dont UNE partie
> est gardée ; la question est « laquelle ? », et elle se répond en mutant chaque
> site séparément.

Ces deux témoins démontrent une **DÉPENDANCE**, et c'est la seule preuve possible
ici : l'ordre que MongoDB rend entre deux lignes de clé égale n'est pas spécifié,
donc un témoin ne peut pas montrer « le mauvais ordre ». Il montre que, sans clé
de départage, **le résultat dépend d'un ordre que la requête ne détermine pas** —
l'ordre des lignes de la fixture tenant le rôle de cet arbitraire, et choisi
différent de l'attendu pour que la dépendance se voie. C'est écrit au-dessus
d'eux.

## Les quatre mutations du cycle 183 tombent toujours

`byActivity` sans sa clause sur `lastMessageAt` (2/5), flux B `take: limit` (1/5),
flux B avec `skip: offset` (3/5), `byMessageKeys` `take: limit` (2/5). La fenêtre
reste gardée par la borne composite.

## Un `undefined` aurait ouvert la borne en grand

`boundOf` rend `curseur.id ?? null`, et ce n'est pas une politesse : **Prisma
IGNORE un champ `undefined`**, donc `{ id: { lt: undefined } }` apparierait TOUT
et la branche de départage admettrait la page précédente EN ENTIER. Un id absent
retombe sur la borne stricte — le comportement d'avant, qui perd le départage et
jamais la borne. Le cas se présente pour de bon :
`conversation-list-rank-absent-activity` borne sur un INSTANT choisi, pas sur une
ligne existante.

## Les cinq doubles de rang n'en font plus qu'UN

Les quatre suites de rang portaient chacune son double, et ils DIVERGEAIENT sur ce
qu'ils honorent. Celui de `populated-activity` fixait `skip` à zéro pour le flux B
— la production n'en passe pas — ce qui rendait **indétectable** la mutation
« ajouter `skip: offset` au flux B ». Et `skip` n'étant pas déclaré dans
`RankedPagePrisma`, le compilateur ne la voyait pas davantage.

> **Un double de test ment par ce qu'il RÉPOND, par ce qu'il ACCEPTE, et par ce
> qu'il IGNORE.** La troisième forme est la plus discrète : le témoin qu'il sert
> PASSE, et la régression qui ajoute le levier ignoré passe avec lui.

Site unique : `__tests__/helpers/list-rank-engine.ts`, qui honore `where`,
`orderBy` (liste ordonnée de clés, dates **et chaînes**), `skip` et `take`. Les
cinq suites l'utilisent. `matchesMongoWhere` a gagné l'ordre sur les CHAÎNES dans
le même mouvement : son `lt`/`gt` ne comparait que des dates et rendait `false` en
silence sur une chaîne — une réponse fausse, pas une levée.

### Une strictesse de moteur a dû être retirée, et c'est une mesure

Le moteur JETAIT d'abord sur une clé d'`orderBy` qu'aucune ligne ne porte, pour
qu'un tri sans effet ne rende pas un témoin vert. **Mesuré faux** : le flux B trie
sur `lastActivityAt` même quand pas une ligne ne la porte — l'état de TOUTE
conversation avant #19800, et ce que `absent-activity` exerce exprès. La garde
transformait un cas de production en échec de harnais ; elle est retirée, et la
raison est écrite au-dessus.

## Trois assertions de FORME mises à jour sans rien perdre

Le lot change la forme de la requête, donc les gardes qui l'épinglent tombent —
c'est leur travail. Chacune a été relue pour ce qu'elle PINGLAIT :

- `conversation-core` § borne : l'ancienne gardait `{ lastMessageAt: { lt } }`
  dans l'`AND`. La nouvelle garde les DEUX moitiés — le plafond `lte`, **et** la
  branche stricte qui porte encore `{ lt }`. Le départage, lui, est gardé par
  l'EFFET dans le témoin de marche.
- `conversation-core` § ordre (×3) : la clé de TÊTE reste la récence — ce que ces
  gardes ont toujours dit — et `id` ne fait que départager.
- `conversation-list-cursor-scope` (×3) : la borne porte désormais son identité.

> La question en convertissant une garde de forme reste celle du cycle 182 :
> **« que l'ancienne forme gardait-elle que la nouvelle ne garde plus ? »**

## Ce que l'instruction a vérifié sans rien trouver

- **« Activité sans message » n'est PAS atteignable**, donc n'est pas un défaut.
  Les clauses `lte`/`lt` sur `lastMessageAt` n'apparieraient pas un document sans
  la clé, et l'équivalence du doc-comment (« rang < R ⇔ lastMessageAt < R ET … »)
  suppose la colonne présente. Elle l'est : le schéma la déclare
  `DateTime @default(now())`, non nullable, donc Prisma l'écrit à chaque création.
  Vérifié AVANT de l'écrire comme un constat — c'eût été un faux positif publié,
  et l'ancienne borne faisait déjà la même hypothèse.
- **Le curseur `queue` n'a rien à départager** : il désigne la fin du tri, donc
  porte `id: null` et garde la borne stricte.

## Les suivis

| constat | issue |
|---|---|
| la destination de la copie vocale du talkie diverge entre serveur et clients | #19834 (question produit) |
| sept surfaces trient encore sur `lastMessageAt` | #19835 (une décision par surface) |
| index absent et p95 du chemin de fusion non mesuré | #19837 (avant promotion en production) |
| le rang ne redescend pas au retrait d'une réaction | #19833 (`décision-produit`) |
