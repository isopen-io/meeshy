# Cycle 185 — la règle du rang avait deux exemplaires, tous deux justes

*2026-11-20, à la suite des cycles 183 (#19836) et 184 (#19881), tous deux
fusionnés dans `dev`. Instruit **#19904**, ouvert par l'audit adversarial de
#19835 — c'est-à-dire par une AUTRE session que celle qui a écrit les deux
lecteurs.*

---

## Pourquoi celui-là, et pourquoi maintenant

L'issue le dit elle-même : « **À instruire APRÈS #19881** […] si #19881 est livré
d'abord, ce lot se réduit à la consommation du site unique ». #19881 est fusionné
(`b66be57f7b`), donc la moitié « départage » est faite et il ne reste que la
convergence.

C'est le lot le plus court des trois, et c'est normal : **les deux précédents ont
payé la compréhension.**

## Ce que le dépôt portait

Deux lecteurs de `max(lastMessageAt, lastActivityAt)` (#9026), et le partage est
ASSUMÉ — `list-rank.ts` paie la fenêtre, le curseur et la borne pour la LISTE
paginée ; `highestRanked.ts` sert le top-K d'un ensemble que le `where` de
l'appelant borne déjà. Aucune des quatre surfaces de #19835 n'a besoin d'une
pagination, et la liste ne peut pas s'en passer.

Ce qui n'était pas assumé, c'est que la RÈGLE vive en deux exemplaires :

| | `list-rank.ts` (avant) | `highestRanked.ts` |
|---|---|---|
| les deux `orderBy` | littéraux locaux | `rankStreams()` |
| `{ lastActivityAt: { not: null } }` | littéral local | porté par le flux |
| le comparateur | `rankMillis` + `compareIdDesc` locaux | `outranks()` |

**Les trois disaient la même chose** — ce qui est exactement ce qui rend une
jumelle dangereuse : elle est juste le jour où on l'écrit, et rien ne rougit le
jour où l'une des deux évolue.

> Le cycle 184 avait écrit, dans son commentaire de clôture, que les deux
> machineries « convergent plutôt qu'elles ne divergent ». C'était vrai du
> CONTENU et faux de la STRUCTURE : elles disaient la même chose par deux
> affirmations indépendantes. **Deux sites qui s'accordent ne sont pas un site
> unique ; ils sont une coïncidence qu'il faut maintenir.**

## Le lot

`list-rank.ts` importe désormais `rankStreamByMessage()`, `rankStreamByActivity()`
et `outranks()`. `rankMillis` et `compareIdDesc` y sont SUPPRIMÉS — c'est le
point : non pas « les deux sites sont d'accord », mais « il n'y a plus qu'un
site ».

### Les flux sont NOMMÉS, pas rangés

`rankStreams()` rendait un tableau, et `highestRanked` le PARCOURT
indifféremment. `list-rank`, lui, DISTINGUE ses deux flux (le A lit des lignes
complètes avec `skip`, le B des clés seules). Le consommer par INDICE aurait fait
de l'ordre du tableau un contrat que rien n'énonce :

> **Un contrat porté par la POSITION dans un tableau ne rougit nulle part.** Le
> jour où l'on inverserait les deux lignes de `rankStreams()`, la liste lirait le
> mauvais flux et pas une compilation ne tomberait. D'où deux accesseurs
> NOMMÉS — `rankStreamByMessage()` / `rankStreamByActivity()` — dont
> `rankStreams()` dérive. La garde n'est pas un témoin : c'est le nom.

### La garde de type du site unique n'a pas été affaiblie

`outranks` prend un `RankedConversationRow` dont les trois colonnes sont
REQUISES, et son doc-comment dit pourquoi : « un `select` qui oublie
`lastActivityAt` rend un rang faux sans que rien ne rougisse ». `ListRankRow` les
déclare optionnelles, donc l'assignation ne compile pas.

La tentation est de relâcher le type partagé. **C'est le contraire qu'il faut
faire** : on NORMALISE au bord (`classable()`, clé absente ⇒ `null` — ce que
Prisma fait déjà), et la garde reste entière pour tous les autres appelants.
L'optionalité de `ListRankRow` est de HARNAIS, pas de production : les témoins y
construisent des DOCUMENTS Mongo, où une clé jamais écrite est absente et non
nulle.

## Le témoin garde la CONVERGENCE, pas chaque lecteur

`conversation-rank-readers-converge.test.ts`, trois témoins :

1. ce que la liste ENVOIE à Prisma est, champ pour champ, ce que le site unique
   déclare — donc toute évolution du site unique l'atteint ;
2. l'autre lecteur départage bien, lui aussi, sur un jeu ex aequo ;
3. **un balayage de SOURCE** : `list-rank.ts` ne redéclare aucun ordre de rang.

Le troisième existe parce que les deux premiers ne suffisent pas : un lot qui
réécrirait le MÊME littéral les passerait tous les deux sans tomber. Un témoin de
COMPORTEMENT ne peut pas distinguer « importé » de « recopié à l'identique » —
seul un balayage de source le peut.

### ROUGE, et la mutation qui NE TOMBAIT PAS

| mutation | résultat |
|---|---|
| `rankStreamByMessage()` perd `{ id: 'desc' }` | **2 échecs** / 8 — la modification du site unique atteint les DEUX lecteurs |
| `rankStreamByActivity()` perd son `where` | **1 échec** / 8 *(0 au premier jet)* |
| `list-rank.ts` redéclare son ordre | **1 échec** / 8 |

**La deuxième ne tombait pas, et c'était une faute à moi.** L'assertion était :

```ts
expect(JSON.stringify(filtres)).toContain(JSON.stringify(stream.where).slice(1, -1));
```

Sous la mutation qu'elle prétendait garder — `where` ramené à `{}` — la tranche
rend la chaîne VIDE, et `toContain('')` est toujours vrai.

> **Une assertion qui DÉRIVE son attendu de la chose qu'elle teste peut devenir
> vacue sous la mutation même qu'elle vise.** Ici la dérivation (`JSON.stringify`
> puis `slice`) s'effondre proprement en `''` au lieu d'échouer. Le témoin est le
> SECOND site : il épingle la clause en toutes lettres, et c'est à lui de rougir
> si le premier change d'avis.

Je ne l'ai pas découverte en relisant, mais en exécutant la mutation — et c'est
le seul protocole qui la trouve.

## Ce que l'instruction a vérifié sans rien conclure

**Le `where` du flux d'activité est-il une garde de CORRECTION ou d'EFFICACITÉ ?**
Le doc-comment du site unique affirme que sans lui le flux « dépense sa fenêtre
entière sur des lignes toutes à égalité sur `null` ». Sous MongoDB, un `sort`
décroissant place pourtant les dates AVANT les nuls et les clés absentes, donc le
top-K ne devrait pas changer. Je n'ai pas pu trancher ici — il faudrait une
mesure contre un vrai `mongo:8`, et le sujet de l'index de cette route est déjà
#19837. **Le témoin épingle donc la clause sans prétendre dire laquelle des deux
raisons la justifie** : elle est présente, elle est voulue, et un lot qui la
retire devra le dire.

## Les suivis

Aucun ouvert par ce lot. Ceux des cycles précédents qui restent :

| constat | issue |
|---|---|
| index absent et p95 du chemin de fusion non mesuré | #19837 — **feu vert du porteur requis** pour la production (#9223) |
| le rang ne redescend pas au retrait d'une réaction | #19833 (`décision-produit`) |
| la fenêtre de 20 du groupe exact d'un appel n'est soutenue par aucune mesure | #19906 |
