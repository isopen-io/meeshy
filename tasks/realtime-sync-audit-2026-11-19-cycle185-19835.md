# Cycle 185 — quatre surfaces promettaient « la plus récemment active » et triaient sur le dernier message

*2026-11-19, à la suite du cycle 183 (#19836, fusionné dans `dev`). Branche
`claude/exciting-planck-wo4zwx`. Instruit **#19835** et **tranche #19834**.*

---

## Pourquoi celui-là

Le suivi du cycle 183 laissait cinq issues. #19881 (les ex aequo de la borne du
curseur) était **déjà pris** par une autre session — PR #19891, branche
`claude/exciting-planck-0vkcxe`, poussée avant ce cycle : la règle d'asymétrie
tranche sans négociation (celui qui n'a rien écrit cède, #5243). #19837 (index et
p95) demande staging et production, hors de portée d'un conteneur. #19833 est au
porteur.

Restaient #19835 et #19834, et l'instruction a montré qu'elles n'étaient **pas
deux lots** : #19834 est l'une des surfaces de #19835, vue par son client.

## Le constat, et ce qui le rend atteignable

#9026 (directive porteur du 2026-10-01) a fait du rang de la liste
`max(lastMessageAt, lastActivityAt)` : toute activité — une réaction, un appel,
une épingle — remonte la conversation pour tout le monde. **Seule la LISTE
l'applique.** Quatre autres surfaces promettaient la même chose *dans leur propre
doc-comment* et triaient sur `lastMessageAt` :

| surface | ce que son commentaire promet |
|---|---|
| `routes/conversations/core-lifecycle.ts` | « rouvrir la plus RÉCEMMENT ACTIVE, pas une arbitraire — **sinon l'utilisateur retombe sur une DM morte** » |
| `socketio/call-invite-lifecycle.ts` | l'appel manqué mène à la directe « la plus récemment active » |
| `services/calls/callGroupConversation.ts` | « les groupes candidats, **du plus récemment actif** au plus ancien » |
| `services/talkie/talkieFallback.ts` | « la conversation la **PLUS RÉCENTE** que l'émetteur partage » (#17141, précision du porteur) |

La divergence était **INERTE** jusqu'à #19800 : `lastActivityAt` n'étant écrite
par aucun chemin, les deux critères rendaient toujours la même ligne. Les quatre
témoins de ce lot **ne pouvaient pas tomber avant lui** — mesuré : sur fixtures
sans activité, les quatre passent au vert sur l'ancien code comme sur le neuf.

Le premier site dit lui-même la conséquence : *l'utilisateur retombe sur une DM
morte*. C'est exactement ce que produit un tri sur `lastMessageAt` quand le
doublon vivant est celui où l'on réagit et s'appelle sans plus y écrire.

## #19834 n'était pas une question produit — les clients avaient déjà répondu

L'issue proposait trois issues (garder `lastMessageAt` en le disant, reprendre la
machinerie de rang, aligner les clients) et concluait « c'est une question
produit ». L'instruction la tranche **sur des faits**, sans rien inventer :

- les DEUX clients qui replient cette décision la lisaient déjà comme le rang —
  `listRankAt ?? lastMessageAt ?? updatedAt` sur le web,
  `listRankAt ?: lastMessage.createdAt ?: updatedAt` sur Android ;
- #9026 **définit** « récent » comme le rang, par directive porteur ;
- le doc-comment du serveur dit « la plus RÉCENTE ».

Trois sites, deux déjà au rang, une directive qui le définit : le serveur était
le seul à dire autre chose. Aligner les clients sur `lastMessageAt` aurait exigé
de contredire #9026 dans deux dépôts. **C'est le serveur qui bouge.**

## La forme du correctif : deux flux bornés, et une preuve au grain K

Un `max` de deux colonnes ne s'écrit pas en `orderBy` Prisma — c'est tout l'objet
des deux flux de `routes/conversations/utils/list-rank.ts`, et la raison écrite
dans #19834 pour hésiter. Mais ces quatre surfaces n'ont ni fenêtre, ni curseur,
ni borne à tenir : elles veulent LA plus récemment active (ou les K premières)
d'un ensemble que leur `where` borne déjà.

`services/conversations/highestRanked.ts` porte la preuve au grain K :

```
top-K par RANG  ⊆  top-K(lastMessageAt)  ∪  top-K(lastActivityAt)
```

Soit W la gagnante par (rang desc, `id` desc), et rang(W) = `lastMessageAt`(W).
Une ligne X qui la précède dans le flux `lastMessageAt` porte soit
`lastMessageAt`(X) > rang(W) — donc rang(X) > rang(W), et W n'était pas la
gagnante —, soit l'égalité avec `id`(X) > `id`(W) — donc X gagne le départage,
même conclusion. W est en TÊTE de son flux ; K lignes par flux suffisent.

Coût : **une lecture de plus** par surface (deux au lieu d'une), sur des chemins
qui en font déjà plusieurs — pas de fenêtre à dimensionner, pas de `skip`.

### Ce que le compilateur garde, et qu'aucun témoin ne pourrait garder

Le piège de ce correctif n'est pas l'ordre : c'est le `select`. Une lecture qui
oublie `lastActivityAt` rend un rang réduit au dernier message — **le défaut
qu'on corrige, rejoué sous le correctif** — et aucun double de test ne le verrait
(un double rend ce qu'on lui dit, quel que soit le `select` : c'est la leçon des
dix-sept sites du Prisme, § « le `select` est le seul des trois qu'aucun témoin
de rang ne peut voir »).

Les trois colonnes sont donc **REQUISES** dans `RankedConversationRow`, et le
type que Prisma dérive d'un `select` partiel n'y est pas assignable. Mesuré :

```
$ sed -i 's/select: RANK_SELECT/select: { id: true, lastMessageAt: true }/' talkieFallback.ts
$ npx tsc --noEmit
talkieFallback.ts(41,63): error TS2322: Type 'Prisma__ConversationClient<{ id: string; lastMessageAt: Date; }, …>'
  is not assignable to type 'Promise<RankedConversationRow>'.            EXIT=2
```

## Le ROUGE, mesuré surface par surface

| mutation / état | témoins rouges |
|---|---|
| l'ancien tri, sur `core-lifecycle` (route, `app.inject`) | **2** / 6 |
| l'ancien tri, sur le talkie | **3** / 4 |
| l'ancien tri, sur le groupe exact d'un appel | **2** / 4 |
| l'ancien tri, sur la destination d'un appel manqué | **1** / 3 |
| `select` sans `lastActivityAt` | ne compile pas |

Les témoins qui PASSAIENT déjà avant le lot comptent autant : « sans activité, le
comportement d'avant #19800 est intact » est présent sur les quatre surfaces, et
c'est lui qui prouve que le lot ne change rien à la population qui n'a jamais
réagi.

### Les doubles ont dû être étendus pour que le rouge soit possible

`findConversationsIn` (`__tests__/helpers/direct-pair-world.ts`) ne lisait que la
PREMIÈRE clé d'un `orderBy` et le supposait objet : sur un TABLEAU, il prenait
`'0'` pour nom de champ et ne triait **rien, en silence** — un double qui aurait
rendu l'absence de départage indétectable, et qui aurait fait passer au vert
l'ordre fautif comme l'ordre juste. Il honore désormais les clés multiples, les
valeurs CHAÎNES (`id`) et la borne `take`.

> **Un double ment aussi par ce qu'il ACCEPTE** (leçon connue), et la forme la
> plus discrète de ce mensonge est un paramètre qu'il lit à moitié : un tableau
> d'ordre lu comme un objet ne jette pas, il ne trie plus.

## Les quatre surfaces qui RESTENT, et qui le DISENT

Le critère de fin de #19835 l'exigeait, et c'est la moitié la plus durable du
lot : « les surfaces qui restent sur `lastMessageAt` le disent, pour que la
question ne se repose pas ».

| surface | décision écrite au site |
|---|---|
| `routes/conversations/search.ts` | on cherche un **MESSAGE**, pas une activité : trier sur le rang remonterait une conversation où l'on vient de réagir au-dessus de celle où le mot cherché a été écrit |
| `routes/admin/communities-oversight.ts` | la supervision mesure le **TRAFIC** ; une réaction ne fait pas d'un salon muet un salon actif pour qui le supervise |
| `routes/admin/agent-configs.ts` | même raison |
| `routes/admin/system-rankings.ts` (`recent_activity`) | même raison, **plus un coût** : la colonne y est un **FILTRE** (`gte: startDate`) autant qu'un ordre, et filtrer sur un `max` de deux colonnes ne s'écrit pas plus en `where` qu'en `orderBy` — c'est le patron de #19748, pas un `orderBy` à remplacer |

La dernière ligne est la seule où le nom de l'API (`recent_activity`) dit
« activité » quand le code dit « message ». Elle est tranchée en faveur du
message, parce que la valeur est une constante d'API antérieure à #9026 qui ne
promet pas le rang de liste — et le dire au site vaut mieux que la laisser muette
pour un cycle de plus.

## Ce qui a été vérifié sans rien trouver

- **La préférence de régime passe toujours avant le rang** (#12966). Les deux
  flux parcourent les MÊMES `lookups` dans le même ordre, donc un tête-à-tête
  chiffré existant gagne dans les deux ; le rang ne départage qu'À régime égal.
  Un témoin le garde (« un chiffré moins actif se rouvre quand même »).
- **Le comparateur ne produit pas de `NaN`.** Deux lignes sans message ni
  activité ne se soustraient pas : le rang est comparé, pas retranché, et
  l'égalité tombe sur le départage par `id`. Une conversation dans cet état est
  une forme réelle (aucun chemin de création n'écrit les deux colonnes).
- **Le second tri de `findExactCallGroups` a été RETIRÉ, pas réécrit.** L'ordre
  vient de la lecture classée ; un ordre qui se redéclare est un ordre qui
  divergera (c'est la cause même de ce lot).
- **La huitième surface n'était pas dans l'issue.** #19835 énumérait cinq sites
  nommés plus « deux autres surfaces d'administration » ; le balayage en rend
  **huit**, et celle qui manquait à l'énumération est `talkieFallback.ts` — c'est
  à dire précisément celle qui avait sa propre issue (#19834). *Une énumération
  de sites porte deux affirmations, et la seconde — « ce sont les sites où la
  règle s'applique » — se remesure.*

## Ce que l'audit adversarial a trouvé, et qui a changé le lot

Le lot a été audité avant fusion, et l'audit a rendu **un constat bloquant** —
lequel ne portait ni sur le rang ni sur le `select`, mais sur ce que le correctif
a rendu CONCURRENT.

### Le constat bloquant : deux flux, deux résolutions du régime

`core-lifecycle` ne choisit pas seulement un rang : il choisit d'abord un
**RÉGIME** (`firstFound` le long de `directLookupWheres` — le chiffré d'abord,
« n'importe lequel » ensuite, #12966). La première rédaction mettait le rang
DEHORS :

```ts
highestRankedConversation((orderBy) => firstFound(lookups, (where) => findFirst({ where, orderBy, … })))
```

Les deux flux étant lancés **ensemble**, chacun refaisait la descente du régime
pour son compte, et **les deux lectures ne partagent aucun instantané**. Il
suffit qu'un tête-à-tête `e2ee` apparaisse entre elles pour que l'un retombe sur
« n'importe lequel » — donc sur le lisible — pendant que l'autre trouve le
chiffré ; le rang, comparant les deux têtes, sert alors **LE CLAIR**. C'est
exactement la bascule silencieuse que la décision du 2026-10-25 interdit
(#12949).

Mesuré, sur le même double, dans les deux sens :

```
imbrication de PRODUCTION (régime dehors)   → le chiffré      ✓
imbrication inverse       (rang dehors)     → LE CLAIR        ✗  ← la première rédaction
```

Le correctif est l'inversion, et il est **gratuit** : le compte de lectures est
inchangé (deux par index de `lookups` atteint), et ce sens-ci court-circuite au
premier index qui apparie. Témoin :
`__tests__/unit/services/conversations/conversation-reopen-regime-before-rank.test.ts`,
qui exerce les DEUX imbrications pour que la raison du sens retenu soit lisible
et pas seulement affirmée.

> **Une règle d'ordre lue par deux flux CONCURRENTS ne peut pas porter une
> décision qui la précède.** La preuve du top-K vaut sur UN jeu de lignes ; deux
> aller-retours ne sont pas un instantané. Toute décision antérieure au rang se
> résout DEHORS, et le rang ne départage qu'à l'intérieur de ce qu'elle a retenu.

### Ce que l'audit a corrigé d'autre dans le même lot

- **`recent_activity` de l'administration PASSE au rang**, au lieu de rester sur
  `lastMessageAt` avec une décision écrite. L'argument de coût de la première
  rédaction était **FAUX** : `max(a, b) ≥ X ⟺ a ≥ X OU b ≥ X`, la borne du rang
  s'écrit donc en `where` (et `list-rank.ts` le fait déjà). Et la surface PROMET
  l'activité — « Activité la plus récente » dans les quatre catalogues
  d'administration, champ servi nommé `lastActivity`. C'était un défaut qu'on
  documentait au lieu de le corriger.
- **Le flux d'activité ne lit plus que les lignes qui en portent une**
  (`{ lastActivityAt: { not: null } }`, comme `list-rank.ts`). Sans ce filtre, la
  colonne étant absente presque partout, ce flux dépensait sa fenêtre entière sur
  des lignes toutes à égalité sur `null` — les K plus récemment CRÉÉES, qui ne
  peuvent jamais gagner — et chargeait pour rien, sur le groupe d'appel, vingt
  lignes avec leur relation `participants`.
- **Le garde `NaN` était justifié par une forme IMPOSSIBLE.**
  `Conversation.lastMessageAt` est REQUISE (`DateTime @default(now())`) : deux
  colonnes nulles ne s'atteignent pas par ce modèle. La raison écrite au site dit
  désormais la vraie : une règle d'ordre n'a pas à dépendre de la nullabilité
  d'un schéma qu'elle ne lit pas.
- **`CALL_GROUP_WINDOW` est une TRONCATURE héritée, pas une borne démontrée.**
  Citer #19836 pour la justifier inversait le sens de cette issue. Le site le dit,
  et nomme ce qui n'est mesuré par rien.
- **Trois clients, pas deux** : iOS porte le même repli au rang
  (`TalkieVoiceCopy.swift`). Le constat du lot en est renforcé — des quatre
  sites, le serveur était le SEUL à trier sur le dernier message.
- **Deux témoins ne pouvaient pas tomber.** Celui de la fenêtre démontrait
  l'INVERSE de son titre (sur son jeu de lignes, une fenêtre d'une ligne par flux
  ne perdait rien : il faut que le MÊME flux porte deux lignes du top-K) ; et le
  départage sur `id` n'était gardé que par des `toEqual` sur le littéral de
  l'`orderBy` — aucun COMPORTEMENT ne tombait. Les deux sont réécrits, et le
  moteur du témoin n'applique plus `id` de lui-même : un double qui départage en
  douce rend la mutation indétectable.

### Le ROUGE après réécriture, remesuré

| mutation | témoins rouges |
|---|---|
| le rang DEHORS, le régime dedans (la première rédaction) | **1** (le témoin dédié, dans les deux sens) |
| départage sur `id` retiré d'un flux | **4**, dont **3 de comportement** |
| `outranks` départageant à l'envers | **2** |
| un seul flux lu | **5** / 15 |
| l'ancien tri sur `recent_activity` | **4** / 5 |

## Les suivis

| constat | issue |
|---|---|
| deux lignes de rang identique à la frontière d'une page de la liste | #19881 (**prise** par une autre session, PR #19891) |
| p95 du chemin de fusion de `GET /conversations`, et les index RÉELLEMENT créés en base | #19837 (avant promotion en production) — **mais l'issue nomme un index que `schema.prisma` DÉCLARE déjà** (`@@index([isActive, lastActivityAt])`, ligne 878) : ce qui reste à instruire est la création effective (sous Prisma/MongoDB, `@@index` déclaré ≠ index créé) et, pour les ordres de ce lot, un composé portant `_id` |
| les DEUX lecteurs de rang du dépôt divergent — `list-rank.ts` ne départage pas ses ex aequo et ne consomme pas `rankStreams()` | **#19904** (ouverte par ce lot) |
| `talkieFallback` : `deletedAt: null` sans `unsetOrNull` exclut les documents où la clé est ABSENTE (fail-closed, antérieur au lot) | **#19905** (ouverte par ce lot) |
| `CALL_GROUP_WINDOW` : une troncature de 20 qu'aucune mesure ne soutient | **#19906** (ouverte par ce lot) |
