# Iteration 144 — Plan d'implémentation (2026-07-08)

## Objectifs
Corriger deux bugs de fonctions pures indépendants, chacun avec test de régression RED→GREEN :
- **F111** — `groupNotificationsByDate` : bucket « This week » inatteignable le jour d'ancrage (dimanche).
- **F112** — `mergeClientHeaders` : `location` incohérente avec un override `country`/`city` partiel.

## Modules affectés
- `apps/web/utils/notification-helpers.ts` (F111)
- `apps/web/__tests__/utils/notification-helpers.test.ts` (F111, tests)
- `services/gateway/src/services/GeoIPService.ts` (F112)
- `services/gateway/src/__tests__/unit/services/GeoIPService.test.ts` (F112, tests)

## Phases
1. **F111 — fix** : importer `calendarDayDiff` (SSOT DST-safe déjà co-importée avec `startOfLocalDayMs`) ;
   remplacer l'ancrage `getDay()` par `calendarDayDiff` + fenêtre glissante 7 jours ; ajouter le
   paramètre `now` optionnel (injection déterministe). ✅
2. **F111 — tests** : 6 cas (effondrement dominical, cohérence milieu de semaine, bornes des 5 buckets,
   ordre canonique + suppression des groupes vides). ✅
3. **F112 — fix** : recalculer `location` depuis city/country fusionnées via le helper `formatLocation`
   existant. ✅
4. **F112 — tests** : 2 cas (override country partiel, override city partiel sur geoData existant). ✅
5. **Validation** : jest ciblé sur les deux suites ; typecheck ; docs analyse+plan. ✅

## Dépendances
Aucune (deux surfaces disjointes web / gateway). Réutilise des SSOT existantes
(`calendar-date.calendarDayDiff`, `GeoIPService.formatLocation`) — pas de nouvelle abstraction.

## Risques estimés
Très faibles. F111 change le classement des jours J-2..J-6 en milieu de semaine (amélioration
intentionnelle de cohérence, documentée). F112 est un strict correctif de cohérence sans changement
des cas déjà couverts.

## Stratégie de rollback
Revert du commit unique — fonctions pures isolées, aucun changement de schéma / contrat réseau /
signature publique breaking (le 3e paramètre `now` est optionnel).

## Critères de validation
- `bunx jest __tests__/utils/notification-helpers.test.ts` → vert (78/78).
- `bunx jest src/__tests__/unit/services/GeoIPService.test.ts` → vert (6/6).
- Aucune erreur `tsc` nouvelle référençant les fichiers modifiés.
- CI verte après push.

## Statut de complétion
**Terminé** — implémentation + tests + docs. Reste : commit, push, PR.

## Améliorations futures
- F111 : envisager d'exposer la fenêtre « this week » (7 j) comme constante partagée si un autre
  regroupement (iOS/android) doit s'aligner.
- F112 : auditer les autres call sites qui lisent `geoData.location` pour confirmer qu'aucun ne
  re-dérive le format localement (candidat homogénéisation d'un futur cycle).
