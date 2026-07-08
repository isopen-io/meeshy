# Iteration 123 — Plan d'implémentation (2026-07-07)

## Objectives
Corriger trois bugs latents concrets, indépendants et disjoints des PR ouvertes, chacun prouvé par un
test unitaire ciblé (RED→GREEN), sans changement de signature publique :
- **A** — Le moteur de traduction NLLB ne mappe que 8 des 40 langues déclarées → 32 langues
  silencieusement mistranslated (ex. demande de russe = français retourné).
- **B** — `isUrlOnly` (gateway) rate les schémas d'URL en majuscules → liens `Https://…` envoyés à NLLB
  et corrompus.
- **C** — Le `senderName` du dernier message de groupe (web) court-circuite le SSOT → nom vide pour les
  expéditeurs sans `displayName`.

## Affected modules
- `services/translator/src/services/translation_ml/translator_engine.py` — `lang_codes = dict(LANGUAGE_MAPPINGS)` + import.
- `services/translator/tests/test_31_extended_coverage.py` — +2 tests de couverture langue.
- `services/gateway/src/utils/url-content.ts` — flag `i` sur `URL_TOKEN_REGEX`.
- `services/gateway/src/__tests__/unit/utils/url-content.test.ts` — +1 `it` (3 assertions majuscules).
- `apps/web/utils/v2/transform-conversation.ts` — `getUserDisplayNameOrNull` sur le `senderName` de groupe.
- `apps/web/utils/v2/__tests__/transform-conversation.test.ts` — +3 `it` (describe group senderName).

## Implementation phases
1. **A** — RED (2 tests langue échouent : `missing NLLB mapping for 'af'`, `None`) → GREEN
   (`dict(LANGUAGE_MAPPINGS)` + import) → smoke import (63 langues). ✅
2. **B** — RED prouvé (ancien regex `false` sur `Https://`) → GREEN (flag `i`) → 10/10. ✅
3. **C** — RED (senderName `undefined` sans displayName) → GREEN (SSOT) → 8/8. ✅

## Dependencies
Aucune inter-cible (3 services distincts). `LANGUAGE_MAPPINGS` déjà exporté par `config.settings` ;
`getUserDisplayNameOrNull` déjà importé dans le fichier web.

## Estimated risks
Très faible pour les trois. A = sur-ensemble strict (8 valeurs identiques). B = `i` n'affecte que le
littéral de schéma (classe déjà `A-Za-z`). C = comportement strictement amélioré (repli au lieu de rien).

## Rollback strategy
Revert par cible (chacune isolée à 1 fichier source + 1 fichier test). Aucun couplage.

## Validation criteria
- [x] Translator : 2 nouveaux tests verts ; baseline `65 failed/16 passed` inchangé (+2 passants).
- [x] Gateway : `url-content.test.ts` 10/10 ; RED/GREEN prouvé par micro-bench.
- [x] Web : `transform-conversation.test.ts` 8/8.
- [x] `bun.lock` (churn d'install) reverté — diff strictement limité aux 6 fichiers ciblés.

## Completion status
**COMPLET.** 3 fix + tests + docs. Prêt à commit/push.

## Progress tracking
- [x] Analyse + plan.
- [x] Cible A (RED→GREEN + smoke).
- [x] Cible B (RED→GREEN).
- [x] Cible C (RED→GREEN).
- [ ] Commit + push.

## Future improvements
- **F89 (MEDIUM)** : dedup de traductions ordre-dépendant dans `use-message-translations.ts` (classer par
  qualité modèle puis récence). Caveat de reachability documenté dans l'analyse.
- **F88 (MINOR)** : clamp défensif de `truncateFilename` pour `maxLength < 4`.
