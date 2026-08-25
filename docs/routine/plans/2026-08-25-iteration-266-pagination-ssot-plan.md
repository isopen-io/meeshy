# Itération 266 — Plan : consolider le décodage de pagination sur le SSOT `validatePagination`

## Objectifs

1. Fermer la classe de défaut « `?limit`/`?offset` malformé → `take: NaN`/négatif
   → HTTP 500 (ou page vide / non bornée) » sur toutes les routes NON-admin.
2. Empêcher la ré-introduction par un cliquet de balayage.

## Modules affectés

- `services/gateway/src/routes/conversations/core.ts`
- `services/gateway/src/routes/conversations/messages.ts`
- `services/gateway/src/routes/conversations/participants.ts`
- `services/gateway/src/routes/messages.ts`
- `services/gateway/src/routes/links/{admin,user,retrieval,messages-retrieval}.ts`
- `services/gateway/src/routes/tracking-links/{tracking,creation}.ts`
- `services/gateway/src/routes/posts/feed.ts`
- `services/gateway/src/routes/__tests__/pagination-parse-sweep.{ts,test.ts}` (NEW)
- `services/gateway/src/__tests__/unit/routes/conversation-core.test.ts` (fix double partiel)

## Phases

1. **Cartographie** — balayer les `parseInt`/`Number` bruts sur pagination ;
   distinguer NaN-unsafe (à migrer) vs guardés/Zod/page-based (admin, hors lot).
2. **Migration** — router chaque site NON-admin par
   `validatePagination(offset, limit, { defaultLimit, maxLimit })`, en préservant
   les bornes existantes de chaque site.
3. **Cliquet** — écrire `pagination-parse-sweep` (module + test), inventaire VIDE,
   `admin/` exclu par préfixe avec raison écrite ; 4 auto-gardes RED-provables.
4. **Réparation d'harnais** — `conversation-core.test.ts` doublait partiellement
   `utils/pagination` ; passer en `jest.requireActual` + surcharge ciblée.
5. **Validation** — `tsc`, sweep, suites consommatrices, suite `unit/routes`.

## Dépendances

Aucune nouvelle dépendance. Réutilise `validatePagination` (existant, testé) et
`stripComments` (existant, `response-schema-sweep.ts`).

## Risques estimés

Faible. Migrations mécaniques, comportement inchangé pour les entrées valides.
Seul risque identifié et traité : les tests qui doublent PARTIELLEMENT
`utils/pagination` pour une route désormais consommatrice du SSOT (une seule
casualty — `conversation-core.test.ts`).

## Stratégie de rollback

Revert du commit unique (aucune migration de schéma, aucune variable
d'environnement, aucun changement de contrat de fil).

## Critères de validation

- `tsc --noEmit` gateway = 0 erreur.
- `pagination-parse-sweep` = inventaire VIDE + 5/5.
- Suites consommatrices vertes ; suite `unit/routes` verte.

## Statut d'achèvement

- [x] Phase 1 — cartographie
- [x] Phase 2 — migration (14 sites, 10 fichiers)
- [x] Phase 3 — cliquet `pagination-parse-sweep`
- [x] Phase 4 — réparation `conversation-core.test.ts`
- [~] Phase 5 — validation (tsc + suites ciblées vertes ; suite `unit/routes`
      complète en cours), puis commit + push.

## Améliorations futures

1. **Lot admin dédié** : `admin/agent.ts` (page-based, `Math.max(1, NaN)` = `NaN`)
   et `admin/languages.ts` (négatif non borné). Introduire un helper page-based
   (`validatePage(page, limit, …) → { skip, limit }`) et migrer les routes admin,
   puis étendre le balayage à `admin/` (retirer l'exclusion de préfixe).
2. **Bornes de querystring** : à terme, déclarer `limit`/`offset` en schéma
   numérique coercé (`type: 'integer'`, `minimum`/`maximum`) pour rejeter à la
   frontière AJV — mais la garde SSOT reste la défense en profondeur.
