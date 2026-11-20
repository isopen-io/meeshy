# Cycle 186 — les deux suites instructibles de #19835 : une population amputée, une fenêtre qui décidait

> ## ⚠️ CE QUE CE JOURNAL RACONTE, ET CE QUE LE LOT A FINALEMENT LIVRÉ (mise à jour du 2026-11-20)
>
> **La moitié « talkie » de ce cycle a été livrée par QUELQU'UN D'AUTRE pendant qu'il
> attendait sa CI.** #19910 (PR #19932) a fusionné dans `dev` une version de
> `talkieFallback.ts` qui SUBSUME ce que cette branche y portait — `unsetOrNull('deletedAt')`,
> le régime dit en POSITIF, `unsetOrNull('communityId')` — et qui va plus loin : état
> terminal (`closedAt`), hiérarchie d'écriture avec la dispense du tête-à-tête,
> `deletedForMe` de l'émetteur. C'est-à-dire aussi le suivi #19920 que ce cycle avait ouvert.
>
> Elle fait mieux sur un point que ce cycle n'avait gardé que par un témoin : `stream.where`
> entre DANS le `AND` au lieu d'être répandu à côté, si bien qu'un flux qui porterait un
> jour sa propre clé `OR` ne remplacerait plus celles du `where`. Ici la sûreté du spread
> était accidentelle ; chez eux elle est structurelle.
>
> **La version de `dev` a donc été gardée ENTIÈREMENT** (directive #18654), et ce journal
> conserve son analyse parce qu'elle reste vraie du DÉFAUT — la mesure par l'écrivain, la
> fuite du salon de communauté, la raison pour laquelle les témoins de la veille ne
> pouvaient pas tomber. Ce qu'il ne faut plus lire, c'est « ce lot corrige
> `talkieFallback.ts` » : il ne le corrige plus, il le GARDE. Les treize témoins de
> `talkie-destination-population-entiere.test.ts` passent contre l'implémentation de `dev`
> sans modification, et c'est tout leur intérêt : ils n'ont été écrits contre aucune des
> deux en particulier, seulement contre ce que la fonction doit RETENIR.
>
> **Ce que ce lot livre encore en propre** : #19906 (la fenêtre du groupe exact d'appel et
> l'éligibilité descendue en base), la garde de composition de `rankStreams()` pour les
> cinq appelants du rang, le double de `callGroupConversation.test.ts` qui ÉVALUE son
> `where` au lieu de le traduire, et les quatre leçons.
>
> **Et la leçon de collision**, qui n'est pas dans les quatre : *un lot qui attend sa CI
> n'a aucun droit sur les fichiers qu'il a touchés.* La règle de la branche poussée tôt
> (#5243) réduit la FENÊTRE de collision ; elle ne la supprime pas, et elle ne dit rien du
> cas où la collision se produit pendant qu'on attend un verdict. Ici le coût a été nul
> parce que l'autre version était MEILLEURE — ce qui est une chance, pas une méthode.


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

## 2 bis. Ce que l'audit adversarial a trouvé, et qui a changé le lot

L'audit a rendu **BLOQUANT**. Trois de ses cinq constats ont été repris ; le lot a
été corrigé avant toute fusion. Chacun a été REPRODUIT avant d'être cru.

### A (bloquant) — réparer la population ARMAIT une fuite que la panne tenait fermée

Le doc-comment de `talkieFallback.ts` promet depuis #17141 qu'« une copie n'atterrit
ni dans une communauté, ni dans une conversation chiffrée ». La moitié « chiffrée »
est tenue par le filtre de régime ; **la moitié « communauté » ne l'était par rien**.

Un salon de communauté est une `Conversation` de type `group` portant un
`communityId` (`core-lifecycle.ts` : `type` libre, `communityId: communityId || null`),
avec une ligne `Participant` active par membre (`admitSalonOccupants`). Deux membres
d'une même communauté le PARTAGENT donc au sens de cette fonction.

Et les clients ne rejouent PAS leur loi sur une destination NOMMÉE — vérifié
ligne à ligne : le web court-circuite `mayCarryTheCopy`
(`if (named !== null && canSendPlaintext({ conversationId: named })) return named;`),
iOS ne contrôle rien (`let conversationId = if let named { named } else { … }`). Le
message vocal privé d'Alice à Bob aurait été publié dans le salon.

Le défaut était INERTE tant que le `where` ne rendait rien à personne. **Le lot qui
répare la population l'armait** — « une PANNE peut tenir la porte, et la réparer
l'ouvre », cycle 84. Corrigé par `unsetOrNull('communityId')` dans le même `AND`
(#19919) ; le prédicat retiré fait tomber **3 des 13** témoins. Le reste de l'écart
entre la loi serveur et la loi cliente (canal d'annonces, admission d'écriture) fait
PERDRE la voix sans rien exposer : c'est #19920.

### B (à corriger) — « la substitution ne change rien » se contredisait six lignes plus haut

Le doc-comment présentait `NOT BLIND → READABLE` comme un refactor neutre. C'est
faux, et faux dans le seul cas qui compte : sur la VALEUR du mode les deux formes
s'accordent (`null`, `''`, `server`, `hybrid`, `e2ee` en toute casse, mode inconnu),
elles divergent sur la clé ABSENTE — c'est-à-dire sur la population, c'est-à-dire
sur la moitié du correctif. Réécrit pour dire ce que la substitution FAIT (elle
admet les documents sans mode, et « pas de mode » veut dire « en clair ») et ce
qu'elle RETIRE (la dépendance à la sémantique du `NOT`).

### C (à corriger) — la fenêtre décidait encore, parce que l'ÉLIGIBILITÉ passait après elle

Le `where` de `findExactCallGroups` disait l'exactitude des MEMBRES ;
`isPlainLiveGroup` jugeait l'éligibilité EN MÉMOIRE, donc APRÈS `take: 20`. Vingt
salons de communauté aux membres exacts et plus récents suffisaient à cacher le
groupe ordinaire — **le défaut même que le lot déclarait fermé**, à une probabilité
plus basse.

`closedAt`, `deletedAt` et `communityId` descendent en base par `unsetOrNull` (trois
colonnes nullables, donc exact). Ce qui RESTE en mémoire est dit au site sans
l'arrondir : `isActive` et `isAnnouncementChannel` sont des booléens REQUIS, donc
sans `isSet` et sans égalité sûre ; et le RÉGIME ne descend pas pour une raison
différente — `isPlainLiveGroup` admet un mode INCONNU là où
`SERVER_READABLE_REGIME_FILTER` le refuse, donc le descendre changerait la POLITIQUE
d'un appel de groupe.

### E (remarque, reprise) — un flux du rang pouvait écraser le `where` de son appelant

Les cinq appelants composent par `{ ...where, ...stream.where }` : un flux qui
rendrait `AND`, `OR`, `NOT` ou `participants` retirerait en silence les prédicats de
soft-state, le régime, ou l'anti-jointure d'exactitude — **sans qu'aucun témoin
d'appelant ne tombe**, la requête restant valide et servant simplement plus. Le lot
écrivait beaucoup sur le danger de deux `OR` frères et créait, du même geste, sa
version. Garde posée dans `highest-ranked-conversation.test.ts`, pour les cinq
appelants d'un coup.

### F (remarque, reprise) — un témoin qui passait pour une autre raison que la sienne

« un groupe dont un membre actif n'a PAS de compte est un sur-ensemble » restait
vert sans la branche `{ userId: { isSet: false } }` : `sameSet` rejette l'anonyme sur
la longueur. Le témoin attestait le filtre MÉMOIRE, pas la branche qu'il nommait.

Ce que cette branche décide vraiment est **une place dans la fenêtre** : sans elle,
l'anonyme n'apparie ni `{ userId: null }` (clé absente) ni `{ notIn }` (négation),
donc son groupe est retenu en base, et vingt de ces groupes remplissent la fenêtre.
Le témoin se construit donc SOUS PRESSION de fenêtre — le seul régime où un filtre
de base qu'un filtre mémoire double a un effet observable. Il tombe désormais.

### Constats NON repris, et pourquoi

| constat | décision |
|---|---|
| B, trou résiduel : un document legacy avec `encryptionEnabledAt` non nul et `encryptionMode` ABSENT serait admis | aucun écrivain actuel ne peut produire cette forme (`switchData` écrit toujours les deux, et `encryptionRegime.ts` est l'unique écrivain, gardé). `SERVER_READABLE_REGIME_FILTER` porte le même trou PARTOUT ailleurs (#12966) : ce n'est pas une régression du lot, et le refermer est une question de régime, pas de destination |
| D : émetteur `isActive: true` + `bannedAt` (lignes d'avant la migration du 2026-11-07) | inchangé par le diff, et c'est une propriété de la migration, pas de ce lot |
| H : le comportement réel de `participants: { none: { … OR … } }` contre `mongo:8` | **non mesurable ici** (ni Mongo ni démon Docker). Forme validée au compilateur hors spread. `dev` ÉTANT le staging (#9226), la fusion EST la mesure ; la promotion en production reste gouvernée par #9223 |

**Ce que l'audit a coûté, et ce qu'il a rapporté** : il a trouvé une FUITE que le
lot créait, et deux affirmations du lot qui dépassaient ce que le code faisait. Les
témoins du lot, eux, ne pouvaient trouver ni l'une ni les autres — ils gardaient ce
que le lot avait décidé de garder.

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
- `calls` + `talkie` + `conversations` + `socketio` → **141 suites, 1517 tests verts** (avant audit) ; `calls` + `talkie` + `conversations` après correction → **37 suites, 527 tests verts**
- Gardes : `gateway-file-size-budget`, `gateway-test-file-size-budget`,
  `shared-file-size-budget`, `route-file-size-budget`,
  `journal-one-file-per-entry-guard`, `tsc-never-loaded-tests-ratchet` →
  **6 suites, 46 tests verts**
- ROUGE prouvé, mutation par mutation : 6/10 sur chaque moitié de #19905 ; 2/6 sur le `none` de #19906 ; 3/13 sur `unsetOrNull('communityId')` de #19919 ; 2/11 sur `unsetOrNull('communityId')` de l'éligibilité ; 2/11 sur la branche `isSet: false`
- Audit adversarial : verdict BLOQUANT, trois constats repris, lot corrigé avant toute fusion (§ 2 bis)
