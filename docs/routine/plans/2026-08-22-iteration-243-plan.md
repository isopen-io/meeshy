# Plan — Iteration 243 : canonicalisation du résolveur d'aperçu Prisme

## Objectives

Éliminer la rétrogradation de la langue primaire du lecteur quand la langue
d'origine du message est région-taguée, en canonicalisant les codes de langue au
point de comparaison du résolveur d'aperçu (les DEUX jumeaux).

## Affected modules

- `packages/shared/utils/conversation-helpers.ts` — `resolveLastMessagePreview`.
- `packages/shared/__tests__/utils/resolve-last-message-preview.test.ts` — +4 témoins.
- `packages/MeeshySDK/Sources/MeeshySDK/Models/CoreModels.swift` — miroir.
- `packages/MeeshySDK/Tests/MeeshySDKTests/Models/ConversationPrismeResolutionTests.swift` — +4 témoins.

## Implementation phases

1. **RED (TS)** — 4 témoins région-tagués (origine primaire, origine top-rank,
   clé région-taguée, langue lecteur région-taguée). ✅
2. **GREEN (TS)** — canonicaliser `preferred`/`original`/clés via
   `normalizeLanguageForDedup`. ✅
3. **Miroir (Swift)** — même logique via `MeeshyUser.normalizeLanguageCode`, +4
   témoins XCTest. ✅
4. **Docstring** — documenter la frontière de normalisation et la SSOT. ✅

## Dependencies

- SSOT `normalizeLanguageForDedup` / `normalizeLanguageCode`
  (`language-normalize.ts`) — consommée, non modifiée.
- Miroir Swift `MeeshyUser.normalizeLanguageCode` — consommé.

## Estimated risks

Faible. Canonicalisation idempotente sur les codes canoniques → zéro régression.
Signature publique inchangée.

## Rollback strategy

Révert du commit unique. Aucun schéma, aucune migration, aucun changement de
contrat wire.

## Validation criteria

- TS : `resolve-last-message-preview.test.ts` 24/24 ; suite shared 2372/2372 ;
  `tsc --noEmit` propre. ✅
- Swift : témoins posés ; suite NON exécutée (pas de toolchain) — à re-jouer sur un
  runner Xcode. ⏳
- CI verte sur la PR. ⏳

## Completion status

- [x] Phase 1 RED (TS)
- [x] Phase 2 GREEN (TS)
- [x] Phase 3 miroir Swift + témoins
- [x] Phase 4 docstring
- [x] Analyse + plan
- [ ] CI verte / merge

## Progress tracking

Itération autonome unique. Commit sur `claude/brave-archimedes-3orp03`, PR ouverte.

## Future improvements

Voir la section « Améliorations futures » de l'analyse 243 : audit du pré-filtre
gateway `buildLastMessagePreviewTranslations`, backfill DB de `originalLanguage`,
convergence de la divergence traduction-vide entre les jumeaux.
