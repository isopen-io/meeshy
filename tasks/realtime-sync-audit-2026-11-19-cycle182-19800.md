# Cycle 182 — l'axe « activité » du rang de liste n'avait jamais existé

*2026-11-19, à la suite du cycle 181 (#19755, fusionné dans `dev` par `0da8f615f3`).
Branche `claude/exciting-planck-rq80jf`, PR #19824. Instruit **#19800**, ouvert par le
tri colonne par colonne de #19748.*

---

## Pourquoi celui-là

Les suivis du cycle 181 étaient #19786 (le verrou de génération de clé qui pend),
#19787 (rien ne fait tourner une clé), #19788 (`décision-produit`), #19789 (trois
déchiffrements sans appelant), et les cinq colonnes que le tri de #19748 a
rendues : #19799 (`deactivatedAt`, pris par la PR #19807), #19800, #19801, #19802,
#19803. #19786 était déjà pris par la PR #19809.

#19800 les surclasse sur le critère des deux cycles précédents — un défaut
**mesuré**, qui porte sur la **population entière** — avec une propriété de plus :
il ne manque pas un cas limite d'une feature, **il supprime une feature entière**,
et quatre gestes du produit avec elle.

## Le défaut

`recordConversationActivity` est l'**unique écrivain** de
`Conversation.lastActivityAt`, et son `where` monotone portait deux branches :

```ts
where: { id: conversationId, OR: [{ lastActivityAt: null }, { lastActivityAt: { lt: at } }] }
```

`{ champ: null }` est une ÉGALITÉ : sous MongoDB elle exige la clé PRÉSENTE. `{ lt }`
n'apparie pas davantage une clé absente. **Aucun chemin de création n'écrit la
colonne**, donc `updateMany` rendait `count: 0` pour toute conversation, la première
écriture ne pouvait jamais avoir lieu, et la colonne restait absente **pour
toujours**. Sixième occurrence du piège de `utils/prisma-unset.ts`.

Le rang de liste étant max(`lastMessageAt`, `lastActivityAt`) (#9026, directive
porteur du 2026-10-01), **l'axe « activité » du classement n'existait pas** :

| geste | site | effet réel |
|---|---|---|
| réaction à un message | `ReactionService.ts:282` | aucun |
| réaction à une pièce jointe | `AttachmentReactionService.ts:181` | aucun |
| appel (début, fin, manqué) | `callMessageBroadcasters.ts:61` | aucun |
| épingle / désépingle | `messages-pin.ts:119` | aucun |

## La mesure se prend par l'autre bout, et c'est ce qui la rend robuste

L'issue affirmait « mesuré sur les dix-neuf sites de `conversation.create` /
`createMany` / `participants: { create }` ». Je ne retrouve pas ce compte : la
passerelle porte **onze** `prisma.conversation.create`, aucun `createMany`, aucun
`upsert` (les `participants: { create }` imbriqués créent des participations, pas
des conversations). Et le compte n'a aucune importance :

> **Pour prouver qu'une colonne n'est jamais écrite, compter ses ÉCRIVAINS coûte
> une commande et ne peut pas être incomplet ; énumérer les CRÉATIONS coûte un
> inventaire et l'est presque toujours.** Il existe **un seul**
> `data: { lastActivityAt }` dans tout le dépôt, et c'est le site réparé. La
> conclusion ne dépend donc d'aucune énumération — et un compte faux dans l'issue
> ne l'aurait pas affaiblie.

C'est la leçon 93 (« un compte est une AFFIRMATION ») prise par le côté utile : ne
pas seulement vérifier le compte hérité, mais **chercher la mesure qui rend le
compte inutile**.

## L'issue nommait CINQ alimenteurs ; il y en a QUATRE

`messagePostSaveEffects.ts:160` est un **HOMONYME** :
`EngagementService.recordConversationActivity(userId, axisKey, conversationId)`
écrit `EngagementConversationCredit` et n'a rien à voir avec la colonne. Ce fichier
n'importe pas l'unité de ce lot — mesuré sur les importateurs, qui sont les quatre
du tableau ci-dessus.

> **Deux fonctions de même nom dans le même dépôt se distinguent par leur
> SIGNATURE et leur importateur, jamais par un `grep` du nom** — et un `grep` du
> nom est exactement ce qu'on fait pour dresser la liste des appelants. Le doc
> de l'unité disait d'ailleurs déjà le contraire de l'issue (« un message avance
> `lastMessageAt` ; tout le reste avance `lastActivityAt` ») : **la contradiction
> était lisible dans le fichier même qu'on venait d'ouvrir.**

## Ce que le correctif n'est PAS, et pourquoi

| option | écartée parce que |
|---|---|
| écrire la colonne à chaque création | couvre les lignes À VENIR ; 100 % de la population est DÉJÀ en base. `prisma-unset.ts` le dit : les deux moitiés ne se substituent pas |
| `...unsetOrNull('lastActivityAt')` | rend une clé `OR` qu'un `where` portant déjà la sienne ne peut pas spreader — **et un appel de helper sort du champ du cliquet qui garde ce site** (il reconnaît une BRANCHE littérale du même tableau). Corollaire du cycle 181, constat B, appliqué en PRÉVENTION cette fois |
| `AND: [unsetOrNull(…), { lt }]` | la conjonction IMPOSSIBLE que le cliquet refuse depuis le cycle 180, constat F |
| une migration de rattrapage | inutile : le premier geste pose la colonne, et jusque-là tous les lecteurs retombent sur `lastMessageAt` |

## Ce qui part À CÔTÉ — la colonne change de POPULATION

C'est le seul vrai risque, et le quatrième critère de fin. Vérifié lecteur par
lecteur **avant** d'écrire, parce que l'ordre inverse n'existe pas (cycle 84) :

| site | forme | verdict |
|---|---|---|
| `utils/list-rank.ts:104` | `OR: [{ lt }, { null }, { isSet: false }]` | **dit déjà l'absence** depuis #8309 |
| `utils/list-rank.ts:161` (flux B) | `{ lastActivityAt: { not: null } }` | juste : ce flux veut les lignes qui PORTENT une activité |
| `list-cursor.ts:75` · `emitConversationActivityUpdate.ts:77` | `select` + `listRankFromColumns` | juste |
| `packages/shared/utils/conversation-list-rank.ts` | `toMillis(null \| undefined) → null` | juste, et son doc-comment l'écrit |

**Le coût de performance est réel, voulu, et il faut le dire** : le flux B ne
rendait JAMAIS rien, donc `lifted.length === 0` et le chemin rapide — une seule
lecture — était pris à CHAQUE `GET /conversations`. La colonne peuplée, le chemin
de fusion s'active dès qu'une ligne est effectivement remontée : deux lectures de
plus. C'est ce que la conception à deux flux a été écrite pour payer.

> **Un filtre faux peut CACHER le coût du chemin qu'il désamorce** — c'est la
> leçon du cycle 181 (« un filtre inerte rend son balayage gratuit, donc
> invisible ») rejouée sur un CHEMIN plutôt que sur une requête, et dans l'autre
> sens : ici le chemin coûteux est le chemin JUSTE, et c'est le correctif qui
> l'allume. Avant de réparer un filtre inerte, lire ce qui s'exécute quand il
> rendra enfin quelque chose.

## Les témoins, et les TROIS doubles qui ne POUVAIENT pas voir ce défaut

Six témoins verts couvraient cette unité pendant toute la vie du défaut. Aucun ne
pouvait tomber, et les trois raisons sont différentes :

1. **`conversationActivity.test.ts` appliquait le `where` à la main**, et son type
   de ligne — `{ lastActivityAt: Date | null }` — **ne savait pas REPRÉSENTER
   l'état nominal**. Sa branche `filter === null ⇒ current === null` tenait
   l'absence pour une égalité, c'est-à-dire qu'elle **codait le défaut dans le
   double**. Il évalue désormais par `matchesMongoWhere` contre des documents nus.
2. **`attachment-reaction-list-activity.test.ts`** comparait la clause reçue à sa
   propre copie, en rendant `count: 1` quelle que soit la clause — « un double ment
   aussi par ce qu'il ACCEPTE ».
3. **`ReactionService.lastReaction.test.ts`** : même forme, `toHaveBeenCalledWith`
   sur un littéral recopié.

> **Un double qui APPLIQUE une sémantique à la main en fige sa compréhension du
> jour.** Celui-ci était écrit par quelqu'un qui croyait `{ champ: null }`
> équivalent à « pas encore » — la croyance exacte que le défaut incarne. Le double
> ne pouvait donc pas être en désaccord avec la production : **les deux sortaient
> de la même erreur.** Un double qui évalue un `where` contre des DOCUMENTS n'a
> aucune croyance à figer.

La paire du cycle 181 est reprise côte à côte, pour que la seconde ligne ne se
relise jamais comme une garde :

| forme de la ligne | avant le correctif |
|---|---|
| aucune clé `lastActivityAt` — ce que la création produit | **ROUGE** |
| `lastActivityAt: null` explicite — ce qu'une fixture écrit | **VERT** |

### Le témoin de bout en bout : deux moitiés justes qui ne se touchaient jamais

`conversation-activity-lifts-the-served-rank.test.ts` compose les deux VRAIES
unités — `AttachmentReactionService` (qui écrit) et `loadRankedConversationPage`
(qui trie) — sur les MÊMES documents, dans la forme que la base porte. La
conversation tranquille passe devant la bavarde, et le reste à la relecture.

> **Les deux moitiés de #9026 étaient gardées CHEZ ELLES, et c'est là que le défaut
> vivait.** L'écriture avait ses témoins, le tri avait les siens
> (`conversation-list-rank-absent-activity.test.ts` est même excellent : il dit
> l'absence, il a été écrit POUR ça). Aucun ne traversait la frontière, et le
> défaut n'était ni dans l'un ni dans l'autre : il était dans le fait que le
> premier n'arrivait jamais jusqu'au second. **Une règle qui s'exprime en deux
> unités demande un témoin qui les COMPOSE — sinon chaque moitié atteste une
> règle que l'autre ne reçoit pas.**

## Le cliquet : une colonne de plus, et la forme que ses fixtures ne couvraient pas

`lastActivityAt` rejoint `soft-state-equality-filter-guard` (#19748). Mesuré sur la
colonne : **1 site**, celui-ci — et il était nu. Deux fixtures neuves épinglent la
forme que le balayage n'avait jamais rencontrée :

> **une égalité nue dont la SŒUR de `OR` est un INTERVALLE.** La clause EST une
> alternative, donc elle a la forme du remède, et aucune de ses branches ne dit
> l'absence. Une sonde qui demanderait « ce champ a-t-il une sœur dans son `OR` ? »
> la bénirait — c'est la troisième façon, après la conjonction impossible
> (cycle 180) et l'absence niée (cycle 181), de ressembler au remède sans l'être.

Et une note de nom partagé : `lastActivityAt` vit aussi sur `UserSession`, où elle
est REQUISE (`DateTime @default(now())`) — `isSet` n'y existe pas, donc le piège
n'y est pas (cycle 181, constat D). **Le nom est partagé, le piège ne l'est pas**,
et c'est écrit au cliquet pour qu'un futur site de session ne s'y fasse pas
accuser.

### Ce que la nouvelle colonne apprend sur les cliquets de ce dépôt

> **Un cliquet qui garde les LECTURES ne dit rien d'une colonne dont c'est
> l'ÉCRITURE qui est nue.** `list-rank.ts` dit l'absence en trois branches depuis
> #8309 : la colonne avait l'air entièrement sous garde. Le seul site nu était un
> `updateMany`, c'est-à-dire la moitié que personne ne pense à auditer quand on
> parle de « filtres de soft-state » — le mot *filtre* oriente vers la lecture. Le
> balayage, lui, ne s'y est jamais trompé : il relève tout `where`, y compris celui
> d'une écriture. **C'est le VOCABULAIRE de la règle qui cachait le site, pas
> l'instrument.**

## Preuve

- **RED prouvé par mutation** (branche d'absence retirée) : 3 suites, **5 témoins
  tombent** ; le cliquet NOMME le site ;
- `conversationActivity` **8 verts**, `attachment-reaction-list-activity` **6**,
  `ReactionService.lastReaction` **8**, `conversation-activity-lifts-the-served-rank`
  **3** (neuf), `soft-state-equality-filter-guard` **23** ;
- `tsc --noEmit` sur `services/gateway` : **EXIT=0** ;
- suite passerelle complète, audit adversarial et verdict CI : voir le commentaire
  de clôture de #19800 et la PR #19824.

## Ce qui n'a pas été mesuré, et ne doit pas se lire comme vert

- **Aucun comportement contre un vrai MongoDB 8** : pas de base dans ce conteneur.
  `isSet: false` dans un `updateMany` n'est pas mesuré contre le moteur — la forme
  employée est celle que le dépôt porte déjà à six endroits pour d'autres colonnes
  (forme attestée, cycle 180 constat I). C'est #19739.
- **L'index `@@index([isActive, lastActivityAt])` existe-t-il en base ?** Prisma ne
  le crée que par `db push`. Sans lui, le flux B — qui s'allume avec ce lot — est un
  balayage.
- **La latence du chemin de fusion sous charge**, et la part des pages où une ligne
  est effectivement remontée : inconnue, et c'est elle qui décide du coût réel.
- **Ce que les clients font d'un rang qui bouge sans message** : la colonne devient
  vivante pour la première fois ; aucun client n'a jamais reçu un `listRankAt`
  supérieur à son `lastMessageAt` en production.

---

## L'audit adversarial a rendu NON BLOQUANT, et ses quatre constats visaient la PREUVE

Le lot est passé par `auditeur-adversarial`. Verdict **NON BLOQUANT** pour `dev` —
le correctif d'une ligne est jugé juste, et « le seul remède qui marche sous
MongoDB ». Les quatre constats à solder ne portaient pas sur la production : ils
portaient sur **le cliquet et les témoins que le lot livrait comme sa preuve**.

> C'est la forme du cycle 181 rejouée à l'identique : **un lot dont la preuve est
> un cliquet doit auditer le cliquet comme il auditerait la production.** Deux
> cycles de suite, le défaut du lot était dans l'INSTRUMENT, là où ni le `tsc` ni
> les témoins ne regardent.

### Constat A — le cliquet était un PIÈGE ARMÉ, et la phrase qui l'absolvait était fausse

Le balayage est indexé par **nom de colonne**, aveugle au modèle. J'ai ajouté
`lastActivityAt` à ses colonnes et absous le risque de collision de nom par une
phrase : « `lastActivityAt` vit aussi sur `UserSession`, où elle est REQUISE :
aucun filtre ne peut y poser l'égalité nue que ce cliquet cherche ». La seconde
moitié est vraie. **La première est fausse, et c'est elle qui portait
l'absolution.** Reproduit dans les deux sens :

```
where: { lastActivityAt: null }              sur userSession  ⇒  tsc EXIT=0, cliquet ROUGE
where: { lastActivityAt: { isSet: false } }  sur userSession  ⇒  TS2353 — NE COMPILE PAS
```

Un cliquet qui rougit là où **le seul remède qu'il nomme ne compile pas** ne
laisse que deux issues, mauvaises toutes les deux : geler la ligne sous une
absolution réservée à une discipline d'ÉCRITURE qu'elle n'a pas, ou retirer la
colonne et perdre la garde sur `Conversation`.

> **Une limite qu'on ÉCRIT au lieu de la mesurer protège le site qu'elle cache**,
> et une ABSOLUTION est une limite comme une autre. Celle-ci était honnête,
> motivée, sourcée — elle citait le cycle 181, constat D, c'est-à-dire **exactement
> la leçon qu'elle violait**. Citer la leçon juste n'est pas l'appliquer : la
> phrase disait « le nom est partagé, le piège ne l'est pas », ce qui est vrai du
> PIÈGE et faux du CLIQUET, qui ne voit que le nom.

Le balayage RÉSOUT donc le modèle — délégué de l'appel englobant
(`prisma.conversation.updateMany({`), annotation `Prisma.<Modèle>WhereInput`,
sinon `''` — et `MODELES_PAR_COLONNE` borne `lastActivityAt` à `conversation`.
Deux décisions de forme, et chacune a sa raison :

- **un modèle non résolu reste GARDÉ.** `''` n'est jamais une absolution : la
  direction sûre d'un cliquet est le faux positif, qui fait regarder ;
- **sur une colonne REQUISE, le remède n'est pas `isSet`, c'est de SUPPRIMER le
  filtre** — il n'y a rien à apparier de plus. C'est écrit au cliquet, pour que
  le prochain rouge ait une sortie.

La portée par modèle ne s'applique QU'aux colonnes qui la déclarent : les trois
colonnes triées avant ce lot restent gardées sur tout modèle, leur mesure ayant
été prise ainsi. Un témoin le vérifie plutôt que de le supposer.

### Constats B1 et B2 — les deux mesures qui PORTAIENT la preuve étaient fausses

Tout l'argument du lot est « aucun chemin de création n'écrit la colonne ». La
**conclusion tient** — l'audit l'a revérifiée sur les treize sites. Les deux
mesures publiées, non :

- **« dix-neuf chemins de création »** ne se reproduit dans aucune découpe : 11
  sous `services/gateway/src`, 13 avec les deux seeds du dépôt, 36 avec les tests.
  Je l'avais corrigé dans le fichier de PRODUCTION et laissé dans **quatre**
  fichiers de témoins — ce qui est pire qu'une erreur uniforme : le lot disait
  deux chiffres différents, et le plus visible était le faux ;
- **« un seul `data: { lastActivityAt }` dans tout le dépôt »** est faux de
  quatre. La phrase est vraie **sur `Conversation`** et muette sur le modèle.

> **La seconde est le constat A dans la mesure qui prétendait prouver le lot.**
> La même cécité au modèle, au même endroit du raisonnement, dans le même lot —
> une fois dans l'instrument, une fois dans la preuve. Quand une cécité se
> manifeste deux fois, ce n'est pas une inattention : c'est que la question
> « sur quel MODÈLE ? » n'était pas dans ma liste.

### Constat C — un titre qui promettait plus que son assertion

`ReactionService.lastReaction` dit « lastActivityAt avance, **de façon
monotone** ». Avant ce lot il comparait la clause entière par `toEqual`, ce qui
ÉPINGLAIT `lt`. En la remplaçant par une évaluation d'EFFET sur un document à
colonne ABSENTE, j'ai gagné la détection du défaut et **perdu l'épinglage de
l'opérateur** : sur ce document, la branche d'absence apparie quel que soit
l'opérateur de la troisième. `lt` → `gt` laissait le témoin VERT.

> **Remplacer une assertion de FORME par une assertion d'EFFET n'est pas un gain
> net** : la forme épinglait quelque chose que l'effet, sur CE document, ne peut
> pas voir. La question à poser en convertissant un témoin est « que l'ancienne
> forme gardait-elle que la nouvelle ne garde plus ? », et la réponse se trouve
> en mutant ce que l'ancienne nommait.

Il évalue désormais deux documents DATÉS de part et d'autre de l'instant, et il
tombe sur `lt` → `gt` (mesuré).

### Ce que l'audit a vérifié sans rien trouver, et qui compte autant

- **L'attaque « date future épinglée pour toujours » n'existe pas** : les quatre
  alimenteurs posent une horloge SERVEUR. *Reste, non mesurable ici* : plusieurs
  instances à horloges décalées — même exposition que `lastMessageAt`, pas
  introduite par ce lot.
- **Rien ne fuit à côté** : un seul `select` charge la colonne, scopé par
  l'appartenance ; aucun client ne la lit ; un seul `orderBy` dessus.
- **Rétrocompatibilité #9223 satisfaite, mesurée** dans les deux sens.
- **La jumelle structurelle est juste** : `services/auth/session-activity.ts:124-130`
  est le sosie exact du site réparé, sur `UserSession`, où la colonne est requise.
- **Pas de rattrapage à ouvrir** : le premier geste suffit, aucun lecteur ne
  distingue absente de nulle.

### Les cinq suivis ouverts

| constat | issue |
|---|---|
| le rang ne redescend jamais au retrait d'une réaction, et le va-et-vient re-remonte sans borne | #19833 (`décision-produit`) |
| la destination de la copie vocale du talkie diverge entre serveur et clients | #19834 |
| sept surfaces trient encore sur `lastMessageAt` là où le produit dit « récemment active » | #19835 |
| la preuve du top-K n'est gardée par aucun témoin (épuisement de FENÊTRE du flux B) | #19836 |
| **avant toute promotion en production** : index absent des deux environnements, chemin de fusion non mesuré | #19837 |

#19836 mérite d'être dit, parce que l'audit a trouvé une clause de production
qu'**aucun témoin du dépôt n'exerce** — et que le témoin a RAISON de ne pas la
voir : elle est logiquement redondante avec le filtre `isLifted` qui suit. Elle ne
l'est pas pour la FENÊTRE, et c'est de cette clause que dépend la preuve écrite
dans le doc-comment (« top-K par rang ⊆ top-K(A) ∪ top-K(B) »). **La preuve était
écrite ; elle n'était pas gardée** — avec cinq lignes de fixture et `limit: 10`,
aucun témoin ne peut saturer la fenêtre.

### La tête avait bougé pendant l'audit, et il l'a dit

Le brief désignait `d40fff5fc9` ; l'audit a travaillé sur `7ba571119e`, trois
commits plus loin, et l'a relevé de lui-même : « c'est heureux, sans ce commit mon
constat sur la pagination aurait été élevé ». Le témoin de pagination
(`conversation-list-rank-populated-activity.test.ts`), écrit pendant que l'audit
tournait, répondait à l'angle qu'il allait relever.

> **Un brief d'audit nomme un SHA, et un lot vivant avance.** L'agent qui compare
> ce qu'il lit à ce que son brief annonce rend un audit de l'arbre ; celui qui ne
> compare pas rend un audit d'un arbre qui n'existe plus. C'est la même discipline
> que « un compte se compte, il ne s'hérite pas », appliquée à un identifiant de
> commit.
