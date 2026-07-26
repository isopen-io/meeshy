# Plan d'implémentation — Iteration 216

## Objectifs
Faire converger le filtre d'auto-traduction du gateway sur le SSOT `normalizeLanguageCode` :
comparer source et cibles sur leur forme canonique, et canonicaliser le code cible fourni par le
client. Éliminer les auto-traductions NLLB `fr → fr` (texte corrompu) et les clés de stockage non
canoniques, en supprimant la duplication du filtre.

## Affected modules
- `services/gateway/src/services/message-translation/MessageTranslationService.ts`
  - `+ _resolveTargetLanguages()` (helper privé, SSOT `normalizeLanguageCode`)
  - `_processTranslationsAsync` — filtre inline → délégation
  - `_processRetranslationAsync` — filtre inline → délégation
- `services/gateway/src/__tests__/unit/services/MessageTranslationService.branches.test.ts`
  - +3 tests (locale-tag source, uppercase source, normalisation cible client)

## Implementation phases
1. **RED** — 3 tests dans `describe('_processTranslationsAsync — same-language filter')`. ✅
2. **GREEN** — helper `_resolveTargetLanguages` + délégation des 2 sites. ✅
3. **REFACTOR** — suppression des 2 copies du filtre inline (DRY). ✅

## Dependencies
- SSOT `normalizeLanguageCode` (`@meeshy/shared/utils/language-normalize`), déjà importé `:31`.
- Harnais jest gateway (shared/dist + prisma client générés).

## Estimated risks
Faible — normalisation idempotente sur codes canoniques ; garde `'auto'` préservée ; aucune PR
ouverte ne touche ce fichier.

## Rollback strategy
Revert du commit unique (un fichier source + un fichier de test).

## Validation criteria
- [x] RED prouvé sur les 3 nouveaux tests (source non patchée).
- [x] GREEN : 4/4 tests `same-language filter`.
- [x] Non-régression : 233/233 `MessageTranslationService`, 1049/1049 `translation|storyCaption`.
- [x] `tsc --noEmit` gateway : 0 erreur.

## Completion status
**COMPLETE** — implémenté, testé (RED→GREEN), type-check vert.

## Progress tracking
- [x] Analyse + plan
- [x] Tests RED
- [x] Helper + délégation (GREEN)
- [x] Suites de non-régression
- [x] Commit + push

## Future improvements
- Normaliser `originalLanguage` à l'écriture (`MessagingService.ts:181`) — source unique en base.
- `routes/anonymous.ts:919-934` — dédup `spokenLanguages` via `normalizeLanguageCode`.
