# Iteration 89 — Plan d'implémentation (2026-07-03)

## Objectifs
Fermer la fuite de contenu supprimé dans les previews « dernier message » : appliquer la garde
soft-delete `where: { deletedAt: null }` (SSOT = `routes/conversations/core.ts`) aux deux siblings
qui la manquaient — `GET /conversations/search` et `GET /users/me/dashboard-stats`.

## Modules affectés
- `services/gateway/src/routes/conversations/search.ts` (preview recherche)
- `services/gateway/src/routes/users/preferences.ts` (preview dashboard `getDashboardStats`)
- `services/gateway/src/__tests__/unit/routes/conversations/search.test.ts` (test)
- `services/gateway/src/__tests__/unit/routes/users/preferences-dashboard.test.ts` (test)

## Phases
1. **Audit d'exhaustivité** — énumérer TOUS les sites servant une preview « dernier message »
   (`grep messages: { take: 1, orderBy: createdAt desc }` sur routes/services/socketio). Résultat :
   3 sites, 1 correct (core.ts), 2 à corriger. ✅
2. **Fix search.ts** — insérer `where: { deletedAt: null }` en tête du bloc `messages`. ✅
3. **Fix preferences.ts** — idem sur le bloc `messages` de `recentConversations`. ✅
4. **Tests** — 1 test de forme de where-clause par sibling (assert sur le mock `findMany`). ✅
5. **Validation** — jest sur les 2 suites + suites voisines, aucune régression.
6. **Commit + push + PR.**

## Dépendances
Aucune. Changement local aux deux routes, indépendant des PR iOS ouvertes (#1413/#1412/#1410).

## Risques estimés
Très faible. Le filtre RESTREINT (exclut les supprimés) — comportement déjà en prod sur la liste
principale. Aucun chemin ne dépend d'un message supprimé en preview.

## Stratégie de rollback
Retirer les deux lignes `where: { deletedAt: null }` ajoutées ; revert du commit. Aucune migration,
aucun state.

## Critères de validation
- Garde présente dans les 2 siblings, forme identique à core.ts.
- 2 tests neufs verts (assertion de forme de where-clause).
- Suites `search.test.ts` + `preferences-dashboard.test.ts` vertes, aucune régression.

## Statut de complétion
- [x] Audit exhaustif des siblings preview
- [x] Fix search.ts
- [x] Fix preferences.ts
- [x] Tests neufs (2)
- [ ] Validation jest (en cours — bun install)
- [ ] Commit + push

## Progress tracking / Future improvements
- Candidats reportés (itérations dédiées) : `getReels` curseur non-monotone (pagination reels),
  `PostService.buildVisibilityFilter` sans contacts DM (story tray → 404 ouverture),
  `recordEngagementBatch` double-incrément d'agrégats.
