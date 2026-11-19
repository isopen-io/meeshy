# Cycle 183 — la preuve du top-K était écrite ; elle n'était gardée par rien

*2026-11-19, à la suite du cycle 182 (#19800, fusionné dans `dev`).
Branche `claude/exciting-planck-0vkcxe`. Instruit **#19836**, ouvert par l'audit
adversarial du cycle 182 (constat D).*

---

## Pourquoi celui-là

Les cinq suivis du cycle 182 : #19833 (`décision-produit`, au porteur), #19834
(la destination de la copie vocale du talkie — question produit à trancher),
#19835 (sept surfaces trient encore sur `lastMessageAt` — une décision PAR
surface, donc pas un lot), #19836, #19837 (index et p95 sur staging et
production — hors de portée d'un conteneur).

#19836 est le seul des cinq qui soit entièrement instruisible ici, et il porte
sur la propriété la plus structurelle de la route la plus chaude du produit :
**l'ordre de `GET /conversations`**. Sa forme est inhabituelle et c'est ce qui le
rend intéressant : ce n'est pas une panne, c'est une **preuve de production
qu'aucun témoin n'exerce**.

## Le constat, et pourquoi le témoin avait RAISON de ne rien voir

`routes/conversations/utils/list-rank.ts` sert le top-K par rang —
`max(lastMessageAt, lastActivityAt)` — en lisant deux flux bornés, parce qu'un
`max` de deux colonnes ne s'écrit pas en `orderBy` Prisma. Son doc-comment porte
la preuve :

> Le top-K par rang est inclus dans top-K(A) ∪ top-K(B)

La borne du flux B portait deux clauses :

```ts
byActivity: [{ lastActivityAt: { lt: bound } }, { lastMessageAt: { lt: bound } }],
```

La seconde est **logiquement redondante** avec le filtre `isLifted` qui suit :
une ligne dont `lastActivityAt < bound ≤ lastMessageAt` a pour rang son
`lastMessageAt`, donc n'est jamais « remontée », donc `isLifted` l'écarte de
toute façon. Son retrait laissait les neuf témoins de rang **VERTS** (mesuré par
l'audit du cycle 182).

Elle ne l'est pas pour la **FENÊTRE**. Le flux B lit `take: window` lignes triées
par `lastActivityAt desc`. Sans cette clause, ces K places se remplissent de
lignes de la page 1 — qu'`isLifted` écarte, mais **trop tard** : elles ont déjà
consommé la fenêtre, et une ligne réellement remontée de la page 2 en est
évincée.

> **Une clause logiquement redondante peut être indispensable à une BORNE DE
> LECTURE.** La redondance se juge sur le jeu de lignes RENDU, jamais sur le
> verdict du filtre qui suit. Un filtre en aval corrige une ligne de trop ; il ne
> rend pas une ligne qui n'a pas été lue.

## La conséquence est une PERTE, pas un désordre

C'est ce que l'issue ne disait pas, et c'est ce qui décide de la gravité. Le
témoin le mesure sur trois lignes et `limit: 1` :

| ligne | `lastMessageAt` | `lastActivityAt` | rang |
|---|---|---|---|
| `p1-haut` | 11-20 | 11-14 | 11-20 |
| `x-remontee` | 11-01 | 11-13 | 11-13 |
| `y-msg` | 11-12 | — | 11-12 |

Page 1 = `[p1-haut]`, borne = 11-20. `p1-haut` porte une activité ANTÉRIEURE à la
borne : sans la clause sur `lastMessageAt`, il entre dans le flux B, y occupe la
seule place de la fenêtre, et `isLifted` le jette. `lifted` est donc vide, le
chemin rapide est pris, et la page 2 rend `[y-msg]`.

`x-remontee` n'apparaît sur **aucune** page : la page 3 borne sur le rang de
`y-msg` (11-12), inférieur au sien (11-13). La conversation disparaît de la liste
jusqu'à la réconciliation complète du client — 24 h sur iOS comme sur le web.

## Le second volet de l'issue : le dimensionnement, tranché par la mesure

L'issue demandait, « dans le même mouvement », si `take: window` est le bon
dimensionnement ou si la borne du flux B doit porter `skip`. **Verdict :
`take: window` est juste, et `skip` sur le flux B est FAUX.**

La preuve du top-K suppose K = `offset + limit`, et elle suppose un **top**-K :

- **`take: limit`** ne lit que le premier de B. Sur `offset: 1, limit: 1` avec
  deux lignes remontées en tête, la page sert la troisième ligne au lieu de la
  seconde. Sur le flux A à `offset: 2, limit: 1`, elle rend une page **VIDE**.
- **`skip: offset` sur B** est le même sinistre par l'autre bout : l'ordre de B
  est `lastActivityAt`, pas le rang, donc sauter `offset` lignes dans SON ordre
  jette des lignes qui appartiennent à la fenêtre du rang.

Les deux sont désormais des mutations que le témoin DÉTECTE, et la preuve est
écrite au site plutôt que dans ce journal : le doc-comment de `list-rank.ts` porte
un § « Ce que la preuve EXIGE de la fenêtre », qui nomme les trois paramètres non
réglables et le témoin qui les garde.

## Le témoin, et ce qui le rend capable de tomber

`src/__tests__/unit/routes/conversation-list-rank-window.test.ts` — cinq témoins,
qui marchent page par page à `limit: 1` et à `offset` profond.

**Son moteur HONORE `skip`**, là où celui du jumeau
(`conversation-list-rank-populated-activity.test.ts`) le fixe à zéro. Ce n'est
pas un détail de confort : un double qui ignore `skip` rend la mutation
« `skip: offset` sur B » **indétectable**. C'est la leçon « un double de test ment
aussi par ce qu'il ACCEPTE », prise par le côté du paramètre qu'il IGNORE —
`skip` n'est même pas déclaré dans `RankedPagePrisma`, donc son apparition ne
casserait aucun type.

### Le ROUGE, mesuré sur les quatre mutations

| mutation | résultat |
|---|---|
| `byActivity` sans `{ lastMessageAt: { lt: bound } }` | **2 échecs** / 5 |
| flux B `take: window` → `take: limit` | **1 échec** / 5 |
| flux B avec `skip: offset` ajouté | **3 échecs** / 5 |
| `byMessageKeys` `take: window` → `take: limit` | **2 échecs** / 5 |

Production intacte : **14 témoins verts** sur les quatre suites de rang (9
héritées + 5 neuves), `tsc --noEmit` à `EXIT=0`.

## Ce que l'instruction a trouvé en plus : la borne ne départage pas (#19881)

En écrivant la marche par curseur, la question « et deux lignes de rang
IDENTIQUE ? » s'est posée d'elle-même. Mesurée avec le vrai
`loadRankedConversationPage` :

```
ex-aequo-1 (lastMessageAt 11-20) · ex-aequo-2 (lastMessageAt 11-20) · c-plus-vieux (11-10)

PAGE 1 = [ ex-aequo-1 ]
PAGE 2 = [ c-plus-vieux ]          ← borne = 11-20, `lt` STRICTE
→ ex-aequo-2 n'apparaît sur AUCUNE page
```

Défaut DISTINCT de #19836, et antérieur : la fenêtre décide quelles lignes sont
CANDIDATES, la borne décide où la page COMMENCE. Il est ouvert en **#19881**, avec
ce qui le rend peu coûteux : **l'identité est déjà dans le curseur, et déjà
résolue.** `beforeCursor` EST un `Conversation.id` ; `resolveListCursor` le lit,
l'autorise dans le scope du lecteur, puis **n'en garde que le rang** — jeté une
ligne avant d'être utile. Il n'y a donc ni format de curseur à changer, ni
rétrocompatibilité à instruire.

Et le patron du départage vit DÉJÀ dans la même fonction : le chemin delta porte
`orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }]`, et son doc-comment l'explique
(« `id` départage les égalités »). Le chemin de rang ne l'a jamais reçu.

> **Une jumelle peut vivre dans la MÊME fonction, sous l'autre branche d'un `if`.**
> Les formes connues cherchent la jumelle dans une autre table, un autre site, un
> autre moment, un autre médium. Celle-ci est à onze lignes de distance, dans
> l'unité qui porte les deux ordres — et elle a la discipline que l'autre branche
> n'a pas.

Depuis #19800 une seconde porte s'ouvre sur ce défaut : l'égalité n'a plus besoin
d'être entre deux `lastMessageAt`. Le rang d'une ligne remontée par son activité
peut valoir exactement le `lastMessageAt` d'une autre — une réaction sur A au
moment où un message arrive dans B.

## Ce que l'instruction a vérifié sans rien trouver

- **Le comparateur de `mergeByRank` n'a pas de défaut `NaN`.** Deux lignes de rang
  nul donnent `NEGATIVE_INFINITY - NEGATIVE_INFINITY = NaN`, et une conversation
  sans message ni activité est une forme RÉELLE (aucun chemin de création n'écrit
  les deux colonnes). La spécification tranche : `SortCompare` convertit un
  comparateur rendant `NaN` en `+0`, donc le tri reste stable. Vérifié avant de
  l'écrire comme un défaut — c'eût été un faux positif publié.
- **Curseur et `offset` ne se combinent jamais** : `core-list.ts` passe
  `offset: beforeCursor ? 0 : offset`. La preuve du top-K à K = `offset + limit`
  vaut donc dans les deux régimes séparément, et `window` ne grandit pas sous un
  curseur.
- **`extraRows` ne rejoue pas la borne**, et c'est correct : tous les `pageIds`
  viennent de lectures déjà bornées. Le témoin `offset: 2` l'exerce (la page
  demandée n'est pas dans `firstRows`).

## Les suivis

| constat | issue |
|---|---|
| deux lignes de rang identique à la frontière d'une page : la seconde est perdue | **#19881** (ouverte par ce lot, mesurée) |
| la destination de la copie vocale du talkie diverge entre serveur et clients | #19834 (question produit) |
| sept surfaces trient encore sur `lastMessageAt` | #19835 (une décision par surface) |
| index absent et p95 du chemin de fusion non mesuré | #19837 (avant promotion en production) |
