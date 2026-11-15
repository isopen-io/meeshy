# Iteration 237 — Les schémas de pagination admin convergent sur UNE forme entière bornée

## Protocole (démarrage)
`main` @ `c04229b1` (dernier commit : « Merge PR #3862 — tolérance aux orphelins,
hygiène des logs, transitions de présence, burn éphémère, tokens push »). Branche
`claude/brave-archimedes-rgfqsc` alignée sur `origin/main` au départ.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (web/shared/gateway). Setup parité : `bun install --ignore-scripts`
(3854 paquets), `npx prisma generate --generator client` + `bun run build` dans
`packages/shared`. Suite `admin-schemas.test.ts` verte au départ (68 tests).

**Audit anti-doublon** (3 PRs ouvertes au départ, toutes de `jcnm`) : #3865
(`scripts/pilotage`, GitHub Pages), #3864 (`apps/android` stories), #3861
(`services/gateway/src/jobs/broadcast-*.ts` — descente Prisme des diffusions).
**Aucune ne touche `services/gateway/src/validation/admin-schemas.ts` ni les
routes `admin/broadcasts.ts` / `admin/system-rankings.ts`** — zéro chevauchement
de fichier. (PR #3861 modifie les *jobs* de diffusion, pas la *route* de liste.)

## Sélection : **Priorité 2 — feature modernisée dont des jumeaux de contrat portent une divergence**

Le dépôt tient un cliquet documenté, `pagination-parse-sweep`
(`routes/__tests__/pagination-parse-sweep.ts`), qui interdit à toute route
NON-admin de parser une pagination de querystring à la main : la source unique
est `validatePagination` (`utils/pagination.ts`). Il **exclut `admin/` par
préfixe**, avec deux raisons ÉCRITES :

> 1. plusieurs routes admin paginent par PAGE (`page`/`skip`)…
> 2. plusieurs déclarent des querystrings **Zod-coercées (numériques), où le
>    `parseInt` opère sur une valeur déjà validée**.

La raison #2 est une AFFIRMATION sur les schémas admin — « la valeur est déjà
validée » — et trois d'entre eux ne la tenaient qu'À MOITIÉ. C'est le défaut de
cette itération : rendre la prémisse du cliquet VRAIE de façon uniforme, au lieu
de supposée.

## Current state (avant correctif)

`admin-schemas.ts` déclare huit schémas de querystring paginés. La borne
`offset`/`limit` y est réécrite huit fois, avec des divergences RÉELLES (pas
cosmétiques) :

| schéma | `limit` | `offset` |
|---|---|---|
| `AnalyticsLanguageDistQuerySchema` | `int().min(1).max(100)` ✓ | — |
| `InvitationsListQuerySchema` | `int().min(1).max(100)` ✓ | `transform(Number)` **sans borne** |
| `LanguageStatsQuerySchema` | `int().min(1).max(100)` ✓ | — |
| `TranslationAccuracyQuerySchema` | `int().min(1).max(100)` ✓ | — |
| **`AnonymousUsersQuerySchema`** | `transform(Number)` **AUCUNE borne** | `transform(Number)` **sans borne** |
| **`BroadcastsListQuerySchema`** | `min(1).max(100)` **sans `.int()`** | `transform(Number)` **sans borne** |
| **`RankingsQuerySchema`** | `min(1).max(100)` **sans `.int()`** | — (pas d'offset) |

`AnonymousUsersQuerySchema` acceptait donc `?limit=999999`, `?limit=abc` (→ `NaN`)
et `?offset=-5` verbatim ; `Broadcasts`/`Rankings` acceptaient `?limit=2.5`. La
suite de tests le documentait par omission : `AnonymousUsers` n'avait AUCUN témoin
de borne (il n'en a pas), là où chaque sibling « correct » teste le rejet
`.int()`/min/max. Le test d'`Invitations` le nomme lui-même : « sibling
BroadcastsListQuery bounds it 1..100 » — la parenté était connue, la convergence
jamais faite.

## Problems identified

1. **La prémisse du cliquet `pagination-parse-sweep` (raison #2) est fausse pour
   trois schémas.** Le clamp inline des routes admin (`admin/broadcasts.ts:52-53`,
   `admin/system-rankings.ts:916`) est justifié par « la valeur est déjà
   validée » ; pour `AnonymousUsers`/`Broadcasts`/`Rankings` la valeur ne l'était
   pas (borne absente, `offset` non borné, `limit` non entier). Le clamp inline
   était donc, pour ces trois-là, le SEUL rempart des trous — l'inverse de ce que
   la raison #2 affirme.
2. **Jumeaux divergents.** Sept déclarations `limit` et trois `offset` réécrites,
   dont trois s'écartent de la forme entière bornée que les autres portent — une
   violation directe du bar « UNE source de vérité par règle / aucune jumelle
   divergente » (§ maintenabilité, dimension 11).
3. **`Number('abc') → NaN` traversait `AnonymousUsersQuerySchema`.** Compensé en
   aval par `validatePagination` dans l'unique route consommatrice, donc LATENT —
   mais un piège armé : le jour où ce schéma est câblé ailleurs, ou où la route
   cesse d'appeler le SSOT, `NaN`/négatif/hors-borne passe.

## Root causes

Chaque champ `limit`/`offset` a été écrit par le lot qui a introduit SON schéma,
jamais dérivé d'une forme commune. Le biais est mécanique (« on déclare ce qu'on
vient d'ajouter ») : les schémas récents ont hérité de la bonne forme
(`.int().min(1).max(100)`), les plus anciens (`AnonymousUsers`) de la forme nue,
et deux (`Broadcasts`/`Rankings`) d'une forme intermédiaire sans `.int()`.

## Business impact

Faible en production (routes ADMIN, entrées absurdes), mais réel sur la
CONSISTANCE : `?limit=999999` rend un résultat 200 borné sur une route et un 400
sur sa jumelle, pour la même classe d'entrée. La valeur principale est de
solidifier la prémisse d'un cliquet existant — sans quoi une future évolution qui
retirerait un clamp inline (au motif, juste, que « le schéma valide ») ouvrirait
un trou silencieux.

## Technical impact

`admin-schemas.ts` uniquement (déclarations de schéma) + son test unitaire. Les
routes et leurs tests sont INCHANGÉS : les tests de route mockent `validateQuery`
en no-op (ils exercent le clamp inline sur des chaînes brutes), donc un changement
de schéma ne peut ni les casser ni changer le comportement du handler. Le clamp
inline reste en place — c'est la politique ÉCRITE du cliquet (raison #2), pas une
dette.

## Risk assessment

- **Faible.** Aucun changement de type inféré (`transform(Number)` rendait déjà
  des `number`). `tsc --noEmit` (gateway) : 0 erreur. Aucun test d'intégration ne
  frappe ces routes avec la validation réelle (vérifié).
- **Changement de contrat (assumé) :** ce qui passait en 200-borné passe désormais
  en **400** pour les entrées hors-borne / non entières / négatives sur les trois
  schémas resserrés — un alignement sur la majorité des siblings admin, jamais une
  nouvelle permissivité. `?offset` gagne un plancher `min(0)` (pas de plafond, pour
  ne pas introduire de 400 surprise sur une pagination profonde — le SSOT garde le
  plafond `MAX_PAGINATION_OFFSET` au niveau route).
- **Rollback :** rétablir les sept expressions de champ d'origine + retirer les 10
  témoins jumeaux.

## Proposed improvements (implémenté)

Deux fabriques locales dans `admin-schemas.ts`, dérivées de la forme d'`Invitations`
(le sibling déjà correct) :

```ts
const paginationLimit = (defaultLimit: number, maxLimit = 100) =>
  z.string().transform(Number).pipe(z.number().int().min(1).max(maxLimit)).prefault(String(defaultLimit));
const paginationOffset = () =>
  z.string().transform(Number).pipe(z.number().int().min(0)).prefault('0');
```

appliquées aux huit schémas. `AnonymousUsers` gagne toutes ses bornes ;
`Broadcasts` gagne le plancher d'offset + `.int()` ; `Rankings` gagne `.int()` ;
les quatre déjà corrects passent DRY.

## Expected benefits

- La prémisse « admin querystrings sont Zod-validées » du cliquet
  `pagination-parse-sweep` tient uniformément.
- Une seule forme à faire évoluer (plafond, entier, plancher) pour les huit
  schémas.
- Trois pièges armés désamorcés (`NaN`/négatif/non-entier).

## Implementation complexity

Triviale — extraction de forme + application. Un fichier de prod, un de test.

## Validation criteria

- [x] Baseline `admin-schemas.test.ts` verte (68).
- [x] RED prouvé : 10 témoins de borne échouent sur les schémas nus.
- [x] GREEN : `admin-schemas.test.ts` 78/78.
- [x] Routes inchangées : `system-rankings` + `admin-anonymous-users` + sweep
      pagination → 263/263 (7 suites).
- [x] Large filet `(validation|admin|invitation|language|translation-accuracy)` →
      2051/2051 (69 suites).
- [x] `tsc --noEmit` (gateway) : 0 erreur.

## Future improvements (non retenus, tracés)

- **Dette admin `page`-based, déjà NOMMÉE par le cliquet** : `admin/agent.ts`
  (`Math.max(1, parseInt('abc',10))` vaut `NaN`) et `admin/languages.ts` (négatif
  non borné) — à traiter par un lot admin dédié « helper page-based », comme le
  cliquet le prescrit. Distinct de ce lot (offset/limit, pas page/skip).
- **Mutualisation shared** : `paginationLimit`/`paginationOffset` pourraient
  descendre dans `packages/shared` si les schémas de `messages`/`notification`/
  `mentions` (formes `regex(/^\d+$/)` divergentes) convergeaient aussi — mais ces
  schémas alimentent des routes hors admin dont le type de sortie (chaîne vs
  nombre) doit être vérifié consommateur par consommateur. Hors périmètre.
