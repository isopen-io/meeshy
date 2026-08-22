# Plan d'implémentation — Iteration 239

## Objectifs
Borner les 4 `limit` déviants des query-schemas admin sur l'invariant canonique
`z.number().int().min(1).max(100)` (déjà porté par `BroadcastsListQuerySchema` et
`RankingsQuerySchema`), pour supprimer un 500 atteignable (`$limit` MongoDB négatif) et des
`take` Prisma inversés/non plafonnés.

## Modules affectés
- `services/gateway/src/validation/admin-schemas.ts` (4 lignes de schéma).
- `services/gateway/src/__tests__/unit/validation/admin-schemas.test.ts` (tests).

## Phases d'implémentation
1. **RED** — 11 tests : `<1` (`'0'`, `'-5'`), `>100` (`'200'`), non-entier (`'2.5'`) rejetés pour
   `AnalyticsLanguageDistQuerySchema`, `LanguageStatsQuerySchema`, `TranslationAccuracyQuerySchema`,
   et `<1` + non-entier pour `InvitationsListQuerySchema` (son `>100` était déjà rouge→vert).
2. **GREEN** — `.pipe(z.number().int().min(1).max(100))` sur les 3 non bornés (après `prefault`,
   ordre prouvé par `RankingsQuerySchema`) ; `.max(100)` → `.int().min(1).max(100)` pour Invitations
   (avant `prefault`, ordre prouvé par `BroadcastsListQuerySchema`). 68/68.
3. **REFACTOR** — aucun. Correctif minimal.

## Dépendances
Aucune. Fonctions pures, aucun changement d'API/type public/contrat réseau (`z.infer` inchangé).

## Risques estimés
Négligeable. Les défauts (`5`/`10`/`20`) et toutes les valeurs valides restent acceptés (vérif
runtime). Changement assumé : négatif/hors-plafond/non-entier → 400 (comportement correct, déjà
celui des siblings). `AnonymousUsersQuerySchema` délibérément exclu (clamp via `validatePagination`,
pas rejet Zod — changer ⇒ décision de politique).

## Stratégie de rollback
Revert du commit unique. Zéro migration, zéro état persistant modifié.

## Critères de validation
- [x] RED (11 tests) prouvant l'acceptation actuelle.
- [x] GREEN 68/68 `admin-schemas`.
- [x] Non-régression 333/333 (`unit/validation` + `routes/admin`).
- [x] `tsc --noEmit` propre.
- [ ] CI verte sur la PR.

## Statut de complétion
**Implémenté et validé localement.** En attente CI.

## Suivi de progression
Bornes appliquées, 11 tests verts, tsc propre, 333/333, docs écrites, commit + push branche.

## Améliorations futures
1. **`AnonymousUsersQuerySchema.limit`** — trancher entre clamp lenient (`validatePagination`
   actuel) et rejet strict Zod cohérent avec les 5 autres schémas. Décision de politique produit.
2. **Factoriser un `adminLimitSchema` partagé** (`z.string().transform(Number).pipe(z.number()
   .int().min(1).max(100))`) pour que la 6e copie naisse déjà bornée — supprime la classe entière.
3. **`validatePagination` redondant** dans `admin/invitations.ts` : maintenant que Zod borne,
   le clamp aval est ceinture-et-bretelles ; à évaluer (garder pour défense en profondeur vs
   supprimer pour source unique).
