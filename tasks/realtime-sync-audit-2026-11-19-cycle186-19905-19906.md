# Cycle 186 — les deux suites instructibles de #19835 : une population amputée, une fenêtre qui décidait

**Date** : 2026-11-19 · **Branche** : `claude/exciting-planck-wo4zwx` · **Base** : `dev` (`839daad99`, qui contient #19901)
**Issues** : #19905, #19906 · **Milestone** : #285 « Aucune surface du rang de liste n'ampute sa population ni sa fenêtre »

Les deux défauts ont été RELEVÉS par l'audit adversarial du cycle 185 et laissés
ouverts avec leur raison. Ce cycle les instruit. Les deux autres suites du même
audit ne sont pas de ce lot : #19904 touche `list-rank.ts`, qu'une branche vivante
écrit déjà (PR #19891 — règle de la branche poussée tôt, #5243, celui qui n'a rien
écrit cède) ; #19837 demande staging ou production.

---

## 1. #19905 — deux clauses qui exigeaient la clé PRÉSENTE, et la population qui en sortait

### Ce qui était servi

```ts
const where = { id: { in: … }, isActive: true, deletedAt: null, type: { in: PRIVATE_TYPES }, NOT: SERVER_BLIND_REGIME_FILTER };
```

`deletedAt: null` est une ÉGALITÉ : elle exige la clé présente et nulle. La mesure
qui tranche se prend par l'ÉCRIVAIN plutôt que par l'énumération des créations —
c'est la méthode qu'a fixée #19800, et elle est la seule qui ne peut pas être
incomplète :

> **Sur `Conversation`, l'unique site du dépôt qui écrive `deletedAt` est
> `services/conversations/obsoleteConversation.ts`** (`data: { isActive: false,
> closedAt: now, closedBy: actorId, deletedAt: now, purgeAfter }`), et il pose une
> DATE — jamais `null`. Mesuré le 2026-11-19 sur les 38 écritures de `Conversation`
> de `services/gateway/src`, et sur les treize chemins de création, dont aucun ne
> porte la colonne.

Une conversation VIVANTE n'a donc pas la clé. La clause n'écartait pas un cas
limite : elle écartait **tout le monde**. `mostRecentSharedConversation` rendait
`null` pour toute paire, la copie vocale du talkie n'était jamais proposée, et le
symptôme est muet par construction — fail-closed, l'émetteur a enregistré pour rien.

`NOT: SERVER_BLIND_REGIME_FILTER` portait la MÊME exigence par un autre chemin :
toute négation sous MongoDB exige la clé présente (#8309, mesuré contre `mongo:8`),
donc une conversation sans `encryptionMode` en sortait aussi.

### Le correctif, et pourquoi il ne mesure rien

```ts
const where = {
  id: { in: … }, isActive: true, type: { in: PRIVATE_TYPES },
  AND: [unsetOrNull('deletedAt'), SERVER_READABLE_REGIME_FILTER],
};
```

- `unsetOrNull('deletedAt')` apparie les DEUX états de « pas encore » (absente, nulle).
- `SERVER_READABLE_REGIME_FILTER` est le complément EXACT de `SERVER_BLIND_REGIME_FILTER`,
  déclaré comme tel dans le même fichier, et il dit l'absence dans une branche
  (`isSet: false`). `NOT BLIND ≡ READABLE` : la substitution ne change rien à ce qui
  est retenu et **retire la question** de ce que Prisma fait d'un `NOT` englobant un
  `AND`. Une forme positive n'a pas de sémantique de négation à connaître — c'est
  moins cher qu'une mesure, et ça ne se périme pas. (Ce site était le SEUL du dépôt
  à NIER ce filtre, dont le doc-comment dit qu'il est écrit sans négation de
  document pour cette raison exacte.)
- Les deux prédicats rendent une clé `OR` : ils vivent sous `AND`, jamais en frères
  du même objet, où le second écraserait le premier en silence (leçon 318).

### Pourquoi les témoins de la veille ne pouvaient pas tomber

Les fixtures de #19835 — posées la veille, sur la MÊME fonction — portaient
`deletedAt: null` et `encryptionMode: null` EXPLICITEMENT, sous un commentaire qui
énonçait correctement la règle. La phrase est vraie ; c'est elle qui a rendu la
fixture fausse. **Connaître le piège a servi à faire PASSER les témoins.**

Le témoin neuf (`talkie-destination-population-entiere.test.ts`, 10 témoins)
construit ses documents vivants SANS les deux clés — la forme que les treize
chemins de création produisent. Chaque moitié du correctif, rétablie seule, fait
tomber **6 des 10**.

---

## 2. #19906 — une fenêtre qui décidait de ce qui était TROUVÉ

### Ce qui était servi

`findExactCallGroups` lisait les SUR-ENSEMBLES (« les groupes qui contiennent ces
membres »), bornés à `take: 20` par flux, puis jugeait l'exactitude EN MÉMOIRE :

```
lecture : les 20 premiers par rang, parmi tous les sur-ensembles
filtre  : ceux dont l'ensemble est exactement le bon
```

Un groupe appariant exactement mais rangé derrière vingt sur-ensembles plus récents
était donc invisible, et `reserveTarget` en créait un neuf — un DOUBLON de groupe,
sans erreur ni trace.

### Le levier qui ne demande aucune mesure

L'issue prescrivait « mesurer en staging, puis décider ». Elle énumérait les
décisions qui DÉPENDENT de la mesure ; elle n'affirmait pas qu'il n'en existe aucune
qui n'en dépende pas. Celle retenue porte l'exactitude EN BASE :

```ts
participants: { none: { isActive: true, OR: [{ userId: { isSet: false } }, { userId: null }, { userId: { notIn: […cible] } }] } }
```

À l'intersection (un `some` par membre visé) s'ajoute son complément (« aucun actif
d'ici n'est hors de la cible ») : les deux ENSEMBLE sont l'égalité des ensembles.
La fenêtre reste et devient démontrablement inoffensive — ce qu'elle tronque est la
queue d'un ensemble DÉJÀ exact, ordonné par le rang sur lequel l'appelant choisit,
et la preuve du top-K garantit que les vingt premiers par rang SONT les vingt
premiers. `reserveTarget` les consomme dans cet ordre.

### Ce qui rend le lot sûr sans base de données

Le filtre ne peut que RESSERRER : `sameSet` en mémoire reste autoritatif. Un filtre
de base qui ne fait que retirer des candidats ne peut introduire aucun faux positif.
Le seul risque est d'en retirer un VRAI, et c'est le point instruit : un participant
sans compte n'a pas de clé `userId`, donc l'intrus se dit en branches POSITIVES —
jamais par une négation de document. **Choisir la direction d'erreur avant d'écrire
le filtre est ce qui permet de le livrer sans l'avoir exécuté contre la vraie base.**

La mesure n'est pas annulée : elle change de catégorie. « Combien de groupes un même
ensemble de membres peut-il porter » est désormais une question de volumétrie
(#19837), plus une dette de correction — et le site le dit, là où il disait avant
que rien ne soutenait la fenêtre, ce qui se lisait comme un défaut ouvert.

---

## 3. Ce que ce cycle n'a pas fait, et pourquoi

| | raison |
|---|---|
| #19904 (`list-rank.ts` ne départage pas ses ex aequo) | PR #19891 écrit déjà ce fichier — règle #5243, celui qui n'a rien écrit cède |
| #19837 (index + mesure du chemin de fusion) | demande staging ou production |
| la carte `tasks/lessons.md` | PR #19891 l'écrit aussi ; les deux leçons de ce cycle vivent dans `tasks/lessons/`, que la garde `journal-one-file-per-entry-guard` accepte sans lien de carte. La ligne de carte est due quand #19891 aura fusionné |

**Le `NOT` de Prisma sur un `AND` imbriqué contre une clé absente n'a pas été
mesuré** — le conteneur n'a ni MongoDB ni démon Docker. Le lot ne s'en est pas
remis à une supposition : il a retiré la négation.

---

## 4. Preuve

- `npx tsc --noEmit` (gateway) → **0 erreur**
- `calls` + `talkie` + `conversations` + `socketio` → **141 suites, 1517 tests verts**
- Gardes : `gateway-file-size-budget`, `gateway-test-file-size-budget`,
  `shared-file-size-budget`, `route-file-size-budget`,
  `journal-one-file-per-entry-guard`, `tsc-never-loaded-tests-ratchet` →
  **6 suites, 46 tests verts**
- ROUGE prouvé : 6/10 sur chaque moitié de #19905, 2/6 sur #19906
