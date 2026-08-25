# Itération 266 — Analyse : `?limit` malformé → `take: NaN` → HTTP 500 (routes qui contournent le SSOT de pagination)

## État courant

`validatePagination(offset, limit, { defaultLimit, maxLimit })`
(`services/gateway/src/utils/pagination.ts`) est la source UNIQUE du décodage
`offset`/`limit` d'une querystring dans le gateway. Elle est déjà adoptée par
19 fichiers de routes et bornée par un test dédié
(`src/__tests__/unit/utils/pagination.test.ts`) :

- `NaN` (absent / non-parsable) → `defaultLimit` ;
- valeur explicite sous le minimum (`'0'`, `'-5'`) → plancher `1` ;
- au-dessus de `maxLimit` → `maxLimit` ;
- offset négatif / non-parsable → `0` ; offset géant → `MAX_PAGINATION_OFFSET`.

Plusieurs routes **contournaient** ce SSOT avec un `parseInt`/`Number` inline, et
leurs schémas déclarent `limit`/`offset` en `{ type: 'string' }` — donc AUCUNE
coercition AJV : la valeur brute atteint le gestionnaire.

Forme antérieure typique (`GET /conversations`) :

```ts
const limit = Math.min(parseInt(request.query.limit || '30', 10), 100);
const offset = parseInt(request.query.offset || '0', 10);
```

## Problèmes identifiés

Sur une entrée entièrement contrôlée par l'appelant :

1. **`?limit=abc` → `parseInt('abc',10)` = `NaN` → `Math.min(NaN,100)` = `NaN` →
   `take: NaN`** → `PrismaClientValidationError` → **HTTP 500**.
2. **`?limit=-1` → `take: -1`** → Prisma rejette (`take` doit être ≥ 0) → **HTTP 500**.
3. **`?limit=0` → `take: 0`** → page vide silencieuse (au lieu d'un plancher de 1).
4. **Aucun plafond** sur certains sites (`links/retrieval.ts`,
   `links/messages-retrieval.ts` : `parseInt(limit)` brut) → `?limit=999999`
   touchait Mongo sans borne.
5. **Piège de forme masquée** : `Math.max(1, parseInt('abc',10))` vaut `NaN`
   (et non `1`) — le garde `Math.max(1, …)` de `admin/agent.ts` NE protège PAS
   contre l'entrée non numérique.

## Causes racines

Chaque site réimplémentait à la main le décodage que le SSOT tient déjà —
exactement l'anti-motif « bypass the SSOT ». Le garde d'origine confondait
« la chaîne existe » (`|| '30'`, truthy) avec « la chaîne est un nombre sûr ».
`NaN`/négatif franchissait la frontière et devenait une exception un étage plus
bas, dans le moteur Prisma. C'est la forme, à une frontière de désérialisation
de querystring, du motif récurrent du dépôt : *une entrée malformée doit valoir
un repli neutre borné, jamais une exception un étage plus bas* (cf. itération
265, `decodeCursor`).

Un balayage (`pagination-parse-sweep`) a de plus trouvé un site que le `grep`
manuel ratait — `posts/feed.ts` parsait par `Number(…)` (pas `parseInt`), avec
une clôture correcte mais réécrite : SSOT dupliqué, à consolider.

## Impact métier

- **Robustesse / surface de déni de service** : un client bugué ou malveillant
  déclenche un 500 sur des routes utilisateur et anonymes (liste de
  conversations, messages épinglés, détails de statut, récupération de messages
  par lien partagé, liens de tracking, feed de posts) avec une simple
  querystring.
- **Bande passante** : sur les sites sans plafond, `?limit` élevé faisait
  remonter des pages non bornées.

## Impact technique

Défaut latent transformé en chemin borné. Pour toute entrée LÉGITIME (valeurs
numériques valides), le comportement est identique (round-trip inchangé) : seul
le traitement des entrées malformées change — désormais un repli borné au lieu
d'un 500 ou d'une page vide.

## Évaluation du risque

**Faible.** Chaque migration est mécanique (un `parseInt`/`Number` inline → un
appel au SSOT déjà testé), préservant `defaultLimit`/`maxLimit` de chaque site.
`tsc --noEmit` gateway = 0 erreur ; les suites de routes consommatrices restent
vertes. Un seul effet de bord de test : `conversation-core.test.ts` doublait
partiellement `utils/pagination` (piège du double partiel documenté dans
`services/gateway/CLAUDE.md`) — corrigé par `jest.requireActual` + surcharge
ciblée, gardant le vrai `validatePagination`.

## Sites migrés (offset/limit, routes NON-admin)

| fichier | route | defaultLimit / maxLimit |
|---|---|---|
| `conversations/core.ts` | `GET /conversations` | 30 / 100 |
| `conversations/messages.ts` | `GET …/pinned-messages` | 50 / 100 |
| `conversations/participants.ts` | `GET …/participants` (curseur) | 20 / 100 |
| `messages.ts` | `GET /messages/:id/status-details` | 20 / 100 |
| `messages.ts` | `GET /attachments/:id/status-details` | 20 / 100 |
| `links/admin.ts` | liste liens (admin de compte) | 20 / 50 |
| `links/user.ts` | liste liens utilisateur | 50 / 100 |
| `links/retrieval.ts` | messages par lien partagé | 50 / 100 |
| `links/messages-retrieval.ts` | messages par lien (détaillé) | 50 / 100 |
| `tracking-links/tracking.ts` (×3) | clics / liste tracking | 20–50 / 100 |
| `tracking-links/creation.ts` | liste liens de tracking | 20 / 50 |
| `posts/feed.ts` (×2) | feed / archive (curseur) | 20–50 / 50 |

## Améliorations livrées

- Router chacun des sites ci-dessus par `validatePagination` (SSOT), en
  préservant ses bornes.
- Ajouter un **cliquet de non-régression** : `pagination-parse-sweep`
  (`services/gateway/src/routes/__tests__/`) — inventaire des `parseInt`/`Number`
  bruts sur un champ de pagination dans les routes NON-admin, gelé à VIDE, avec
  4 auto-gardes RED-provables (voit un parse brut ; ignore le SSOT ; ignore un
  `parseInt` non-pagination ; ignore un parse en commentaire).

## Hors lot (dette NOMMÉE)

`admin/` est exclu par PRÉFIXE (règle « le préfixe est le critère », PR #3498) :
plusieurs routes admin paginent par PAGE (`page`/`skip`, modèle que
`validatePagination(offset, limit)` ne décrit pas) ou déclarent des querystrings
Zod-coercées. La dette admin restante — `admin/agent.ts` (page-based,
`Math.max(1, parseInt('abc'))` = `NaN`) et `admin/languages.ts` (négatif non
borné) — est réelle mais derrière l'auth admin ; à traiter par un lot admin
dédié (helper page-based), et rendue VISIBLE par le doc-comment du balayage.

## Bénéfices attendus

- Aucune querystring malformée ne peut plus produire un 500 sur ces routes.
- Les sites sans plafond sont désormais bornés.
- La régression est fermée par un cliquet, dans l'idiome du dépôt.

## Complexité d'implémentation

Faible — migrations mécaniques + un module de balayage + son test.

## Critères de validation

- [x] RED : `pagination-parse-sweep` rejoué avant migration signale ~15 sites
      (+ `posts/feed.ts` que le grep ratait).
- [x] GREEN : `pagination-parse-sweep` → inventaire VIDE, 5/5 tests.
- [x] `tsc --noEmit` gateway → 0 erreur.
- [x] `conversation-core.test.ts` → 159/159 (après correction du double partiel).
- [x] Suites consommatrices links/tracking/retrieval → 717/717 ;
      posts/participants/messages/detail → 822/822.
- [ ] Suite complète `unit/routes` verte, commit + push.
