# Cycle 86-ter — Trois cycles de correctifs sur un dossier que la production n'exécute pas

**Date** : 2026-08-22
**Branche** : `claude/keen-hamilton-t39wao`
**Périmètre** : passerelle, domaine communauté (`routes/communities.ts` ⟷ `routes/communities/`)

**Clients touchés** : aucun changement de contrat. Aucun nom d'événement ni
charge utile modifié. Cinq comportements que la passerelle ANNONÇAIT déjà se
mettent enfin à exister — dont une route qu'iOS appelle depuis toujours et qui
rendait `404`.

---

## 1. D'où vient ce cycle

Les cycles 79, 80, 81, 84 et 85 ont laissé « appartenance à une communauté »
nommément ouvert. Ce cycle le prend, avec la méthode du cycle 79 : prendre les
transitions d'un domaine et vérifier qu'elles forment une grille CLOSE.

La grille n'a jamais été instruite. Le domaine n'a pas de défaut de grille — il
a un défaut d'ADRESSE.

## 2. Ce que la passerelle sert vraiment sous `/communities`

`route-registration.ts:220` enregistre ce qu'il importe ligne 39 :

```ts
import { communityRoutes } from './routes/communities';
```

Deux modules répondent à ce spécificateur :

| chemin | taille | contenu |
|---|---|---|
| `routes/communities.ts` | 2047 lignes | une implémentation complète |
| `routes/communities/` | 1920 lignes | une implémentation complète |

La passerelle est en CommonJS (`"module": "commonjs"`, pas de `"type"` dans le
`package.json`). La résolution Node essaie le **FICHIER avant le dossier**.
Vérifié, pas supposé :

```
$ node -e "console.log(require.resolve('./services/gateway/src/routes/communities.ts'))"
/home/user/meeshy/services/gateway/src/routes/communities.ts
```

**Le dossier entier était mort, et l'a toujours été.** Pas une ligne de
`routes/communities/` n'a jamais servi une requête.

## 3. Ce qui y avait atterri

Le dossier n'était pas une ébauche abandonnée. Il portait du travail soigné,
récent, et raisonné — dont celui du cycle 84, commit `1488266c`, qui touche
`routes/communities/search.ts` et **rien d'autre** :

> `{ type: 'object' }` sans `properties` n'est PAS un objet libre :
> fast-json-stringify applique `additionalProperties: false` par défaut et
> sérialisait `creator` et chaque `members[i]` en `{}`. iOS type
> `APICommunityUser.id`/`.username` non-optionnels — le `{}` faisait échouer le
> décodage de TOUTE la réponse.

Le cycle 84 a conclu « la recherche de communautés iOS était morte » et l'a
close. Elle ne l'était pas : le fichier vivant, `communities.ts:370-371`, porte
encore mot pour mot

```ts
creator: { type: 'object' },
members: { type: 'array', items: { type: 'object' } }
```

Le défaut décrit, diagnostiqué, corrigé et documenté au cycle 84 était **intact
en production** au moment d'ouvrir ce cycle-ci.

## 4. Les cinq écarts, prouvés au ROUGE avant correction

`communities-live-wiring.test.ts` importe par le spécificateur de PRODUCTION —
`'../../../routes/communities'`, jamais un chemin explicite — et n'assert que
des comportements que les deux modules ne partagent PAS. Sur le dépôt tel qu'il
était :

| # | ce que la production faisait | qui le paie |
|---|---|---|
| 1 | `POST /communities/:id/conversations/:conversationId` → **404** | iOS `CommunityService.swift:202` l'appelle |
| 2 | `GET /communities/search` sert `creator` = `{}` | décodage iOS de la réponse ENTIÈRE |
| 3 | idem `members[]` = `[{}]` | idem |
| 4 | `GET /communities/:id/members` sert `isOnline` **brut** | tout membre ayant coupé `showOnlineStatus` |
| 5 | `POST /communities` persiste le nom **non assaini** | `<script>` stocké tel quel |

```
Tests: 5 failed, 5 passed, 10 total
```

Les cinq verts du même lot sont les garde-fous de la manœuvre inverse : ils
attestent ce que le module vivant ne doit PAS perdre au passage (§6).

Et le dossier mort portait déjà, inerte, la correction des cinq.

## 5. Pourquoi aucun témoin ne tombait

Trois causes distinctes, et c'est leur superposition qui rend le silence total.

**a. Les témoins du dossier importaient le dossier.**
`__tests__/unit/routes/communities/search.test.ts` importe
`'../../../../routes/communities/index'`, `communities-search.test.ts` importe
`'../../../routes/communities/search'`. Verts, sur du code sans appelant.

**b. Le témoin du fichier vivant neutralisait la couche défectueuse.**
`communities.test.ts` importe bien le spécificateur de production — mais il
mocke `@meeshy/shared/types/api-schemas` en `{ additionalProperties: true }`.
C'est exactement fast-json-stringify qu'il désarme, donc exactement la couche
où vivaient les défauts 2 et 3.

**c. Rien n'assert la SURFACE.** Aucun témoin ne demandait « quelles routes la
passerelle expose-t-elle ? ». Le `404` du défaut 1 n'était vu par personne.

## 6. Le correctif

`attachments.ts` (8 lignes), `users.ts` (14), `voice.ts` (6) : les trois autres
scissions du même lot se terminent toutes par un proxy de rétrocompatibilité —
`export { X } from './X/index'`. **La scission communauté est la seule qui n'a
pas eu le sien**, et c'est toute la différence entre un refactor terminé et un
dossier mort.

Ce cycle pose ce proxy. Ce qui exige d'abord de porter dans le dossier ce que
le fichier vivant, lui, avait de plus :

1. **`flattenCommunityCounts`** (`serialization.ts`, neuf) — l'agrégat Prisma
   `_count` vers `memberCount` / `conversationCount`, appliqué aux quatre
   routes qui rendent une communauté. Sans lui, la bascule aurait servi `0`
   partout : c'est la MÊME loi que le défaut 2, dans l'autre sens — le schéma
   de réponse décide seul, et un champ produit sous un autre NOM n'existe pas
   pour lui.
2. **Les quatre routes absentes du dossier** (`membership.ts`, neuf) :
   `GET /mine`, `POST /:id/join`, `POST /:id/leave`, `POST /:id/invite`.
   Séparées de `members.ts`, qui porte l'ADMINISTRATION du membre d'un autre.

Puis, dans le même lot et par obligation de la règle du dépôt — « quand on
répare ce qui rendait une donnée invisible, on pose la règle qui décide si elle
a le droit d'être vue » : **les deux écritures qui rendent le profil d'un TIERS
filtrent sa présence** (`member-presence.ts`, neuf). `POST /:id/invite` rend
l'invité, `POST /:id/members` rend l'ajouté ; les deux déclarent `isOnline` via
`userMinimalSchema` et le servaient brut dans les DEUX modules. Régime
« contexte acquis » (`resolvePrefsOnly`) : au moment où la réponse part, les
deux parties sont co-membres. La comparaison est `=== false` explicite, pas
`!vis?.showOnline` — en prefs-only un id absent est NORMAL et vaut VISIBLE.

## 7. Ce qui est prouvé

```
communities-live-wiring          13 passed   (5 étaient rouges avant)
17 suites communauté            342 passed
suite passerelle complète       807 suites / 18887 tests passed
tsc                             clean
```

Le ROUGE des gates de présence est prouvé par mutation, pas par construction :
`if (visibility.get(user.id)?.showOnline === false)` → `if (false)` fait tomber
exactement les deux témoins qui les nomment, et aucun autre.

Couverture `routes/communities` : **98.8 %** lignes / 95.65 % branches.
Globale passerelle : 95.39 %.

## 7-bis. Les passes parallèles, et ce que la fusion garde

Pendant ce cycle, une passe parallèle (**cycle 85-bis**, PR #3300) a trouvé le
MÊME ombrage et l'a documenté sur `main`. Les deux passes ont divergé sur la
suite, et la fusion garde le meilleur des deux :

| | cycle 85-bis (sur `main`) | cycle 86 (ici) |
|---|---|---|
| diagnostic de l'ombrage | identique | identique |
| geste | gater le LEGACY, laisser l'ombrage en place | **consolider** : porter puis basculer en coquille |
| `module-shadowing.test.ts` | posé, avec `KNOWN_UNREACHABLE = ['communities']` | **repointé**, liste vide |
| gate de présence | `applyPresenceVisibilityAsOffline` + `onMissingEntry` | idiome recopié à la main |
| `GET /:id/members` | porte **MIXTE** (co-membre ⇒ prefs-only, non-membre ⇒ strict) | prefs-only seul |

**Le gate de 85-bis est strictement meilleur que celui écrit ici, et c'est le
sien qui est retenu.** Sa porte mixte est un correctif de confidentialité que ce
cycle n'avait pas vu : le contrôle d'accès de `GET /communities/:id/members` ne
referme que les communautés PRIVÉES, donc sur une publique le lecteur peut être
un non-membre qui parcourt des tiers — régime strict, entrée absente masquée.
Fusionner en gardant la version d'ici aurait **rouvert** cette porte.

Le geste de 85-bis prévoyait explicitement le sien : son témoin porte en
commentaire « la consolidation de `communities` le fait tomber aussi, et oblige
alors à constater ce qu'on branche et ce qu'on retire ». Il est tombé, et le
constat est celui du §6 : rien n'est retiré (les quatre routes du legacy sont
portées), une route est branchée (`POST /:id/conversations/:conversationId`).

Preuve de non-régression de la fusion : les 10 témoins de
`communities-presence-gate.test.ts`, écrits par 85-bis contre le legacy et
importés par le spécificateur de production, passent **sans modification** contre
le répertoire consolidé.

## 8. Pistes laissées ouvertes

**Les trois autres paires fichier/dossier sont SAINES** — vérifié, pas supposé :
`attachments.ts`, `users.ts` et `voice.ts` sont des proxys de 6 à 14 lignes,
sans implémentation. La classe est close sur ce dépôt, et le proxy neuf porte
en commentaire la raison qui interdit de la rouvrir.

**La grille d'appartenance communauté reste à instruire** — ce cycle a rendu le
domaine ADRESSABLE, il ne l'a pas audité. Deux écarts sont déjà visibles et
non traités ici, faute d'appartenir à ce lot :

- `PATCH /communities/:id/members/:memberId/role` fait
  `update({ where: { id: memberId } })` **sans filtre `communityId`**, alors
  que le contrôle d'admin porte sur la communauté de l'URL. C'est exactement le
  filtre d'appartenance dont le cycle 85 a fait un corollaire.
- Le même segment `:memberId` est un `CommunityMember.id` pour `PATCH` et un
  `User.id` pour `DELETE` (`where: { communityId, userId: memberId }`). Deux
  lectures du même nom, dans deux routes voisines.

Les deux demandent leur propre passe : le premier est un correctif
d'autorisation qui exige de relire tous les appelants, le second un choix de
contrat qui touche les clients.

**Dette d'environnement, inchangée depuis le cycle 79.** `bun run lint` échoue
dans ce conteneur (ESLint 10 global résolu à la place de celui du dépôt, qui
attend un `.eslintrc`). Reproduit hors du diff. Le lint tourne en CI.

## 9. La leçon

Le cycle 85 a conclu qu'un correctif ne documente que l'exemplaire qu'il
touche, et a demandé : **cette entité a-t-elle une JUMELLE ?** La réponse ici
est plus dure que la question.

> **Un fichier peut avoir une jumelle qui porte le MÊME NOM, et la résolution
> de module décide seule laquelle vit.** Conversation / communauté se voit :
> deux entités, deux tables, deux fichiers qu'on peut ouvrir côte à côte.
> `routes/communities.ts` / `routes/communities/` ne se voit pas : le
> spécificateur d'import est identique, les deux compilent, les deux ont des
> témoins verts, et rien dans le code source ne dit lequel des deux répond.
> **Un refactor de scission n'est pas terminé quand le dossier est complet ; il
> est terminé quand l'ancien chemin ne porte plus d'implémentation.** Entre les
> deux, il n'y a pas un doublon — il y a un module mort qui accepte les
> correctifs et les témoins comme s'il vivait.

Et le corollaire opératoire, qui est ce que ce cycle livre vraiment :

> **Un témoin qui atteste un comportement doit être importé par le chemin de la
> PRODUCTION.** Les huit suites communauté du dépôt étaient vertes ; six
> visaient un module sans appelant, une désarmait le sérialiseur, aucune ne
> demandait quelles routes la passerelle expose. Le geste manquant tient en une
> ligne — copier le spécificateur d'import depuis `route-registration.ts` au
> lieu de le composer à la main — et c'est la seule chose qui aurait fait
> tomber quoi que ce soit pendant les trois cycles où le défaut a vécu.

Troisième forme, enfin, de la famille ouverte au cycle 77-bis :

| cycle | forme | comment on la voit |
|---|---|---|
| 77-bis | un état avec un lecteur et **aucun écrivain** | `grep` « qui écrit ça ? » |
| 78 | un producteur alimenté et **aucun lecteur** | `grep` « qui s'y abonne ? » |
| 79 | un lecteur qui s'exécute et **dont l'écriture ne porte sur rien** | aucun `grep` |
| **86** | un module entier, complet, testé, **sans appelant** | `require.resolve` |
