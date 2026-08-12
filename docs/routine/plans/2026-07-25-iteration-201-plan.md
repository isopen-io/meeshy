# Plan — Iteration 201 : restaurer les chaînes arméniennes corrompues du SSOT des langues

## Objectives
Réparer la corruption « delays » (find/replace raté) sur l'entrée arménienne (`hy`)
du SSOT `packages/shared/utils/languages.ts` et de son miroir Python
`services/translator/src/services/language_capabilities.py`, et poser une garde de
test contre cette classe de régression.

## Affected modules
- `packages/shared/utils/languages.ts` (prod — `nativeName` + `translateText`)
- `services/translator/src/services/language_capabilities.py` (miroir — `nativeName`)
- `packages/shared/__tests__/languages.test.ts` (test — 3 gardes d'intégrité)
- `packages/shared/dist/**` (régénéré via `bun run build`)

## Implementation phases
1. **RED** — Ajouter les gardes d'intégrité (aucun champ ne contient `delays` ;
   `nativeName` non vide ; endonyme + prompt arméniens attendus). Échoue sur la
   valeur corrompue `'Հdelays'` (`.includes('delays') === true`).
2. **GREEN** — Restaurer `nativeName: 'Հայերեն'` et
   `translateText: 'Թարգմանել այս հաղորդագրությունը հայերեն'` (SSOT TS) ; miroir
   Python `"Հայերեն"`. Régénérer `dist`.
3. **Validation** — vitest `languages.test.ts` vert ; `grep delays` = 0.

## Dependencies
Aucune. Chaînes d'affichage pures.

## Estimated risks
Très faible. Données pures, aucune API/schéma/migration/clé i18n/logique.

## Rollback strategy
Révert du commit unique.

## Validation criteria
- `packages/shared` vitest 59/59 (dont 3 gardes).
- `grep delays` sur SSOT/dist/translator src = 0 occurrence.

## Completion status
- [x] Phase 1 RED (gardes ajoutés)
- [x] Phase 2 GREEN (TS + Python restaurés ; dist régénéré)
- [x] Phase 3 validation (59/59 verts ; grep delays = 0)
- [ ] Merge + delete branch (en cours)

## Progress tracking
Commit unique sur `claude/brave-archimedes-vp8ua9` depuis `main@00d0b4d1`.
Pivot depuis la cible v2/flags (doublon de la PR #2291 ouverte).

## Future improvements
Voir « Future improvements » de l'analyse 201 (backlog SSOT langues :
`language-utils.ts` bloqué sur extension SSOT, copies inline `LANGUAGE_NAMES`,
`CommentItem` time-ago, `date-format`).
