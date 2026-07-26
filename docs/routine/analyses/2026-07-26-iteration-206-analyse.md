# Iteration 206 — Convergence pagination : le clamp `limit=0 → 1` manquant dans le SSOT partagé + 3 routes gateway sans borne haute

## Protocole (démarrage)
`main` @ `e0a62247` (dernier merge : #2327 android conversation tag-autocomplete).
Branche `claude/brave-archimedes-5dh8qx` réinitialisée sur `origin/main`.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (shared/gateway). `bun install` OK ; `packages/shared` construit via
`bun run build` (le jest gateway mappe `@meeshy/shared/(.*)` → `dist`) ; prisma
`generate --generator client` exécuté (proxy laisse passer le générateur).

PRs ouvertes au démarrage — **audit anti-doublon** (14 PRs). Le swarm i18n/SSOT
couvre déjà : JWT (#2305 aussi isUserAnonymous), getUserDisplayName
(#2311/#2313/#2317/#2320), formatFileSize (#2309), language flags/names (#2315),
read-tracking/mergeViewed (#2307), auto-translate filter (#2323), plus des PRs
iOS/Android hors surface. **Aucune** ne touche `packages/shared/utils/validation.ts`
ni les routes `posts/interactions.ts` / `admin/reports.ts` → zéro conflit.

Sélection : **pivot hors du swarm display-name/dates** vers un défaut de
**correctness + Single Source of Truth** dans la couche pagination — un bug déjà
corrigé côté gateway (`validatePagination`, iter. antérieure) mais **jamais
propagé** au miroir partagé ni aux copies inline de routes.

## Current state (avant correctif)

### 1. `packages/shared/utils/validation.ts` — miroir partagé buggé
`CommonSchemas.pagination` et `CommonSchemas.messagePagination` :
```ts
limit: z.string().optional().transform((val) => Math.min(Math.max(1, parseInt(val ?? '', 10) || 20), 100)),
```
Le `parseInt(...) || 20` traite `0` (falsy) comme « absent » → `limit=0` renvoie
**une page pleine de 20** au lieu de plancher à 1. `limit=-5` (truthy) plancher
correctement à 1 → **deux entrées sous-minimum se comportent différemment**. Le
commentaire du fichier prétend « Mirrors the gateway's validatePagination » — mais
il reflète la version **pré-correctif**. `services/gateway/src/utils/pagination.ts:26-33`
a déjà corrigé exactement ce cas avec le pattern `Number.isNaN(parsed) ? default : parsed`.

Le test `validation.test.ts:53` figeait le bug : `.limit).toBeGreaterThanOrEqual(1)`
passe avec la valeur buggée `20` (20 ≥ 1). Assertion trop faible pour attraper la
régression.

### 2. Routes gateway hand-roll la pagination **sans borne haute**
Certaines routes réimplémentent la pagination inline, laissant un `limit` client
filer directement dans Prisma `take` :

| Fichier | Lignes | Avant | Zod ? |
|---|---|---|---|
| `routes/posts/interactions.ts` | 624-625, 656-657 | `parseInt(query.limit) \|\| 50` (aucun clamp) | **Non** |
| `routes/admin/reports.ts` | 153 | `parseInt(query.limit) \|\| 10` (aucun clamp) | **Non** |

(Pour contraste, `admin/languages.ts` et `admin/analytics.ts` portent la même
copie inline mais sont **déjà bornés** par un `validateQuery(...QuerySchema)` Zod
en amont — hors périmètre ; voir backlog.)

## Problems identified
1. **Correctness (Prisme des bornes)** : `limit=0` renvoie 20 au lieu de 1 dans
   le SSOT partagé — incohérent avec `limit=-5` et avec le gateway.
2. **Duplication divergente** : le miroir partagé prétend copier le gateway mais
   diverge ; 3 sites de route réimplémentent la pagination au lieu de consommer
   `validatePagination`.
3. **Risque DoS-ish** : `posts/interactions.ts` (×2) et `admin/reports.ts`
   n'ont **aucune borne haute** → un `limit=1000000` client atteint la DB.
4. **Test qui fige le bug** : `toBeGreaterThanOrEqual(1)` masque la valeur
   incorrecte 20.

## Root causes
- Le correctif `limit=0` a été appliqué au gateway `validatePagination` mais
  jamais rétro-propagé au miroir `CommonSchemas` (copié-collé figé).
- Les routes ont grandi avec un `parseInt || N` local avant que le SSOT
  `validatePagination` (avec clamp `maxLimit`) n'existe — jamais migrées.

## Business impact
- Un appel API `?limit=0` sur les endpoints consommant `CommonSchemas` renvoie
  20 résultats au lieu du minimum attendu — comportement surprenant côté client.
- Endpoints `posts/interactions.ts` (viewers de story, réservés à l'auteur) et
  `admin/reports.ts` : requête DB non bornée exploitable pour saturer la mémoire.

## Technical impact
- −1 classe de duplication ; le miroir partagé redevient un vrai miroir.
- 3 routes convergent sur le SSOT clampé → borne haute (100) + plancher (1) +
  `limit=0 → 1` gratuits.

## Risk assessment
**Faible.** `CommonSchemas.pagination`/`messagePagination` n'ont **aucun
consommateur de production** aujourd'hui (uniquement les tests) → le correctif du
miroir ne change aucun comportement live, il aligne l'API et le test. Les routes
gateway : `getPostViews`/`getPostInteractions` ont pour défaut `limit=50` (inchangé),
`getRecentReports` défaut `10` (inchangé) — seule la borne haute et le plancher
changent, aucune régression sur les chemins nominaux (tests verts).

## Proposed improvements (implémentées)
1. `validation.ts` : extraire `clampLimit`/`clampOffset` (SSOT local du module)
   utilisant `Number.isNaN(parsed) ? default : parsed`, consommés par les deux
   schémas. Commentaire réécrit (« Truly mirrors the gateway »).
2. `validation.test.ts` : durcir → `limit=0` **`.toBe(1)`**, `limit=-5`
   `.toEqual({ limit: 1, offset: 0 })`, `messagePagination` `limit=0` `.toBe(1)`.
3. `posts/interactions.ts` (×2) + `admin/reports.ts` : remplacer le
   `parseInt || N` par `validatePagination(offset, limit, { defaultLimit, maxLimit: 100 })`.
4. `interactions-extended.test.ts` : 2 nouveaux tests prouvant le clamp
   (`limit=9999 → 100`, `limit=0 → 1` transmis au service).

## Expected benefits
- Verdict de pagination **cohérent** app-wide (une seule règle de plancher/borne).
- Fin du risque de requête DB non bornée sur 3 endpoints.
- Miroir partagé fiable pour tout futur consommateur des `CommonSchemas`.

## Implementation complexity
**Triviale** — 1 module SSOT durci + 2 helpers, 3 sites de route recâblés, 5
assertions de test renforcées/ajoutées.

## Validation criteria
- `validation.test.ts` : 39/39 vert (vitest), dont la régression `limit=0 → 1`.
- Gateway : `interactions-extended.test.ts` + `admin-reports.test.ts` 48/48,
  `interactions.test.ts` + `interactions2.test.ts` + `utils/pagination` 150/150.
- `tsc --noEmit` gateway : 0 erreur sur les fichiers modifiés.

## Future improvements (backlog restant)
- **Borne haute manquante dans Zod** : `admin-schemas.ts:94`
  `z.number().max(100)` **sans `.min(1)`** → `limit=0`/négatif passe le max mais
  pas le plancher (limité par le `parseInt || N` inline en aval, mais fragile).
  Ajouter `.min(1)` + retirer le fallback inline redondant dans `languages.ts`
  (2 sites) et `analytics.ts`.
- Convergence `getSenderUserId` : `messages.ts:409,665` et
  `conversations/messages.ts:1098` lisent `message.sender?.userId` inline au lieu
  du SSOT `packages/shared/utils/sender-identity.ts` (non-bug aujourd'hui, mais
  duplication conceptuelle).
- Backlog i18n/SSOT display-name : couvert par le swarm (#2305→#2323).
