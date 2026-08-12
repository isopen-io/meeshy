# Plan — Iteration 207 : `freezeMessageStatus` converge sur le SSOT `mergeViewedLanguages`

## Objectives
Éliminer le dernier site d'écriture `viewedLanguages` qui contourne le SSOT :
dédup + plafond de `freezeMessageStatus` mesurés sur la valeur **brute** →
doublon logique de langue (`fr-FR` + `fr`) sur stock legacy dénormalisé, et
plafond `MAX_VIEWED_LANGUAGES` sur-compté. Convergence sur `mergeViewedLanguages`
sans perdre l'optimisation `updateMany` groupé par langue.

## Affected modules
- `services/gateway/src/services/MessageReadStatusService.ts` (`freezeMessageStatus`, garde de dédup)
- `services/gateway/src/__tests__/unit/services/MessageReadStatusService.test.ts` (+1 test régression)

## Implementation phases
1. **RED** — test : entrée existante `['fr-FR']` + lecture `fr` → attend
   **aucun** push (aujourd'hui push doublon `{ push: 'fr' }`). ✅ prouvé.
2. **GREEN** — remplacer la garde brute par `const known = mergeViewedLanguages(entry.viewedLanguages, [])`
   puis `known.includes(code)` / `known.length >= MAX`. SSOT déjà importé. ✅
3. **Validate** — suite complète verte, 5 tests langue existants inchangés. ✅

## Dependencies
Aucune. `mergeViewedLanguages` déjà importé (`:30`). `code` déjà normalisé via
`languageFor` → `normalizeLanguageCode`. Le `{ push: code }` groupé reste intact.

## Estimated risks
Très faible. Seule la **décision** de pousser change (vue normalisée de
l'existant) ; la perf du chemin courant (0 push quand rien de neuf) et le
groupage par langue sont préservés. Aucun schéma, aucune migration.

## Rollback strategy
Révert du commit unique — la garde revient à la comparaison brute.

## Validation criteria
- `MessageReadStatusService.test.ts` : 216/216 (dont le nouveau régression legacy).
- RED prouvé par stash du seul fichier source (1 failed, push doublon observé).
- `tsc --noEmit` gateway : 0 erreur (0 sur les fichiers touchés).

## Completion status
**Terminé** — implémenté + validé localement (216/216, tsc 0).

## Progress tracking
- [x] RED test régression legacy dénormalisé
- [x] GREEN convergence SSOT `mergeViewedLanguages`
- [x] Suite gateway verte + tsc 0
- [x] Docs analyse + plan
- [ ] Commit + push + PR

## Future improvements
Voir §Future de l'analyse : `{ push }` brut concurrent-unsafe (`$addToSet` si
Prisma l'expose un jour), normalisation des retours `viewedLanguages` bruts du
read-path `getMessageStatusDetails`.
