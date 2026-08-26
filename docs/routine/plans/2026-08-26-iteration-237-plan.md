# Plan d'implémentation — Iteration 237

## Objectives
Faire converger les huit schémas de querystring paginés de `admin-schemas.ts` sur
UNE forme entière bornée (fabriques `paginationLimit` / `paginationOffset`),
fermant trois divergences réelles (`AnonymousUsers` sans borne ; `Broadcasts`
offset non borné + `limit` non entier ; `Rankings` `limit` non entier) et rendant
vraie la prémisse #2 du cliquet `pagination-parse-sweep`.

## Affected modules
- `services/gateway/src/validation/admin-schemas.ts` (prod)
- `services/gateway/src/__tests__/unit/validation/admin-schemas.test.ts` (test)

**Explicitement NON touché** : `admin/broadcasts.ts`, `admin/system-rankings.ts`
(clamp inline = politique écrite du cliquet, raison #2), `admin/agent.ts`,
`admin/languages.ts` (dette `page`-based déjà tracée, lot séparé).

## Implementation phases
1. **RED** — ajouter aux blocs `AnonymousUsersQuerySchema`, `BroadcastsListQuerySchema`,
   `RankingsQuerySchema` les témoins de borne que leurs siblings portent déjà
   (rejet `>100`, `<1`, non-entier, non-numérique, offset négatif/non-entier). 10
   témoins, tous ROUGE sur les schémas nus. ✅
2. **GREEN** — deux fabriques locales (`paginationLimit(defaultLimit, maxLimit=100)`,
   `paginationOffset()`) dérivées de la forme d'`Invitations`, appliquées aux huit
   schémas. ✅
3. **Validation** — voir critères ci-dessous. ✅

## Dependencies
Aucune. Pas de nouveau type inféré (`transform(Number)` rendait déjà `number`).

## Estimated risks
- **Faible.** Changement de contrat assumé : hors-borne / non entier / offset
  négatif → 400 (au lieu de 200-borné) sur les trois schémas resserrés — alignement
  sur la majorité des siblings. Rollback = rétablir les sept expressions + retirer
  les témoins.

## Rollback strategy
`git revert` du commit ; ou restaurer les champs d'origine dans `admin-schemas.ts`.

## Validation criteria
- [x] RED : 10 témoins échouent avant fix (`10 failed, 68 passed`).
- [x] GREEN : `admin-schemas.test.ts` → 78/78.
- [x] Routes inchangées : `(admin-schemas|system-rankings|admin-anonymous-users|admin-analytics|pagination)` → 263/263.
- [x] Large filet `(validation|admin|invitation|language|translation-accuracy)` → 2051/2051 (69 suites).
- [x] `tsc --noEmit` (gateway) → 0 erreur.

## Completion status
- [x] RED écrit et prouvé.
- [x] GREEN posé.
- [x] Validations locales exécutées.
- [ ] Commit + push + PR.

## Progress tracking
- Baseline : 68/68 sur `admin-schemas.test.ts`.
- Post-fix : 78/78 (+10 gardes de borne).
- Adjacentes : 263/263 (7 suites) ; large : 2051/2051 (69 suites).

## Future improvements
- Lot admin `page`-based dédié (`admin/agent.ts`, `admin/languages.ts`) — helper
  page/skip borné, comme le cliquet `pagination-parse-sweep` le prescrit.
- Mutualisation `packages/shared` si `messages`/`notification`/`mentions`
  convergent (formes `regex(/^\d+$/)`, type de sortie à vérifier par consommateur).
