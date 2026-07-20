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
## Objectif
Converger les réimplémentations locales de l'algorithme d'horloge (`formatDuration` MM:SS / H:MM:SS) vers la
source unique `formatClock` (`packages/shared/utils/duration-format.ts`), en préservant le comportement.

## Modules affectés (apps/web)
- `components/video/CompactVideoPlayer.tsx`
- `components/video-calls/OngoingCallBanner.tsx`
- `components/audio/AudioEffectsTimelineView.tsx`
- `app/dashboard/LastMessagePreview.tsx`

## Phases
1. **Analyse d'équivalence** — comparer chaque copie locale au contrat `formatClock` (unités s vs ms,
   gestion des heures, centièmes, garde `!finite`). ✅
2. **Conversion** — import `formatClock` depuis `@meeshy/shared/utils/duration-format` ; remplacer le corps
   local par une délégation ; supprimer le paramètre mort `includeHours` (LastMessagePreview) et nettoyer le
   site d'appel. ✅
3. **Validation** — `jest` sur les suites des composants touchés ; `tsc --noEmit` diff baseline. ✅

## Dépendances
- `@meeshy/shared` doit être buildé en `dist/` pour que le jest mapping `@meeshy/shared/* → dist/*` résolve
  (`cd packages/shared && bun run build`). Prérequis CI standard.

## Risques & mitigations
- **Changement de comportement ≥ 1 h** (`OngoingCallBanner`) : assumé comme **correction** (rollover d'heures).
  Aucun test n'assertait de durée ≥ 1 h. Risque nul en pratique.
- **Unités ms vs s** : `formatClock` attend des **secondes** ; toutes les sources ms passent `ms / 1000`.
  `formatClock` refait un `Math.floor(seconds*1000)` interne → équivalence exacte pour ms entiers.
- **Paramètre `includeHours` supprimé** : vérifié inutilisé (2 sites d'appel = `true`).

## Stratégie de rollback
Révert du commit unique ; changements isolés à 4 fichiers + 2 docs, aucune migration ni schéma.

## Critères de validation
- [x] Tests jest des composants touchés : verts (36 + 88 + 95).
- [x] `tsc --noEmit` apps/web : baseline stable (1198 → 1198, 0 erreur neuve).
- [x] Aucune copie locale résiduelle de l'algorithme d'horloge dans les 4 fichiers ciblés.

## Statut : COMPLET

## Améliorations futures (voir tableau « Consignés » de l'analyse)
- F32-reste : `AttachmentDetails.tsx`, `AudioPostComposer.tsx` (même conversion ms→`formatClock`).
- F32-humain : source unique distincte pour les durées **humaines** (j/h/min) des modales admin agent.
