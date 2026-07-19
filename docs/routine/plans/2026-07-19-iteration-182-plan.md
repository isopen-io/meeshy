# Iteration 182 — Plan : borner le cache de debounce de `deviceCountry`

## Objectifs
Éliminer la fuite mémoire non bornée du middleware `deviceCountry` en portant la
stratégie d'éviction déjà mergée pour son jumeau `deviceLocale` (itér. 181, #2057),
et restaurer l'invariant « Mirrors deviceLocale.ts exactly » revendiqué par
l'en-tête.

## Modules affectés
- `services/gateway/src/middleware/deviceCountry.ts` (production)
- `services/gateway/src/__tests__/unit/middleware/deviceCountry.test.ts` (tests)

Aucune signature publique modifiée ; ajout de deux exports test-only.

## Phases
1. **RED** — Ajouter 3 tests d'éviction miroir de `deviceLocale.test.ts`
   (`bounded debounce cache (memory-leak guard)`) important
   `_deviceCountryCacheSize` / `_DEVICE_COUNTRY_MAX_TRACKED_USERS`. Ils échouent
   (import manquant / cap dépassé).
2. **GREEN** — Porter dans `deviceCountry.ts` : constante `MAX_TRACKED_USERS`,
   `pruneStaleDebounceEntries(now)`, sweep gardé avant `set`, seams
   `_deviceCountryCacheSize()` + `_DEVICE_COUNTRY_MAX_TRACKED_USERS`, doc mise à
   jour.
3. **REFACTOR** — Vérifier la fidélité mot-à-mot avec le jumeau (mêmes noms, même
   ordre de garde). Rien de plus (pas de sur-abstraction : deux middlewares
   distincts restent lisibles indépendamment).

## Dépendances
Aucune. Le code source de référence (`deviceLocale.ts`) est déjà mergé sur `main`.

## Risques estimés
Très faible — port mécanique behaviour-preserving. Seuil 10 000 >> régime nominal.

## Stratégie de rollback
Revert du commit unique. Aucune migration, aucun changement de schéma, aucune
donnée persistée touchée.

## Validation
- `npx jest src/__tests__/unit/middleware/deviceCountry.test.ts` → 17/17.
- `npx jest src/__tests__/unit/middleware/deviceLocale.test.ts` → non-régression.
- `tsc` gateway propre.

## Statut d'achèvement
- [x] Analyse rédigée
- [x] RED (tests d'éviction ajoutés — suite ne charge pas, seams manquants)
- [x] GREEN (éviction implémentée — `deviceCountry.test.ts` 17/17)
- [x] Non-régression (`deviceLocale.test.ts` + toute la suite middleware : 247/247) + tsc (1 seule erreur pré-existante `@meeshy/shared` dans `sanitize.ts`, hors périmètre)
- [x] Commit + push

## Progress tracking
Itér. 182 en cours.

## Améliorations futures
- Envisager d'extraire un helper partagé `createDebouncedUserWriteCache` si un
  3e middleware jumeau apparaît (règle de 3 — pas avant, pour ne pas sur-abstraire
  deux cas).
