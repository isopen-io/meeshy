# Iteration 73 — Plan d'implémentation (2026-07-01)

## Objectives
Corriger la corruption des codes ISO 639-3 supportés par `normalizeLanguageCode` (4e priorité du Prisme
Linguistique — `deviceLocale`), sur les 3 sites mirror, sans régression sur les entrées ISO 639-1 / BCP-47.

## Affected modules
- `packages/shared/utils/language-normalize.ts` (source de vérité TS) — logique
- `packages/shared/__tests__/language-normalize.test.ts` — tests TS
- `packages/MeeshySDK/Sources/MeeshySDK/Models/LanguageData.swift` — `supportedCodeSet`
- `packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthModels.swift` — `MeeshyUser.normalizeLanguageCode`
- `packages/MeeshySDK/Tests/MeeshySDKTests/Auth/MeeshyUserPreferredContentLanguagesTests.swift` — tests Swift

## Implementation phases
1. [x] Diagnostic : identifier les 5 codes 639-3 supportés (`bas`/`ksf`/`nnh`/`dua`/`ewo`) et la
   troncature fautive.
2. [x] TS : réécrire `normalizeLanguageCode` pour consulter `getSupportedLanguageCodes()` (préservation
   639-3 supportés + réduction 639-3 gardée par validité du préfixe).
3. [x] TS : étendre la suite de tests (préservation / rejet / réduction).
4. [x] Swift : ajouter `LanguageData.supportedCodeSet` (O(1)).
5. [x] Swift : mirror de la logique dans `MeeshyUser.normalizeLanguageCode` + tests.
6. [x] Validation TS (vitest + build). Swift : tests écrits (exécution Xcode indisponible sous Linux).

## Dependencies
- `languages.ts` est un module sans import → aucun cycle introduit par l'import dans `language-normalize.ts`.
- `LanguageData` et `AuthModels` sont dans le même module SDK (`MeeshySDK`) → accès direct.

## Estimated risks
Faible. Rétro-compat totale sur ISO 639-1/BCP-47 (tests existants verts). Seul écart : ISO 639-3 inconnu
irréductible → `undefined` (plus sûr) ; codes 639-3 supportés préservés (correction).

## Rollback strategy
`git revert` du commit unique. Aucune migration de données, aucun changement de schéma/API.

## Validation criteria
- TS `language-normalize.test.ts` : 16/16 verts.
- TS `conversation-helpers.test.ts` : 79/79 verts.
- TS `bun run build` (shared) : OK.
- Swift : tests mirror mis à jour (exécution reportée — environnement sans Xcode).

## Completion status
**Implémenté et validé côté TS.** Swift mirror écrit + tests mis à jour (exécution CI iOS hors
environnement Linux courant — le workflow « iOS Tests » de la CI les exécutera).

## Progress tracking
- 2026-07-01 : fix TS + Swift + tests livrés sur `claude/brave-archimedes-x80ify`.

## Future improvements
- **Data-parity SDK** : ajouter `ksf`/`nnh` à `LanguageData.swift` (présents côté TS, absents Swift).
- Envisager un **test cross-platform automatisé** comparant `getSupportedLanguageCodes()` (TS) et
  `LanguageData.allLanguages` (Swift) pour prévenir les dérives de la liste de langues.
