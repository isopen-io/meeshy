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

## Les suivis

| constat | issue |
|---|---|
| deux lignes de rang identique à la frontière d'une page de la liste | #19881 (**prise** par une autre session, PR #19891) |
| index `Conversation(isActive, lastActivityAt)` et p95 du chemin de fusion | #19837 (avant promotion en production) |
| `recent_activity` de l'administration : filtrer sur le rang demande le patron de #19748 | consigné au site ; aucune issue ouverte faute de demande produit |
