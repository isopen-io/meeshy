# Plan — Itération 244 : canonicaliser les comparaisons de langue du hook web

## Objectives

Éliminer la comparaison de codes de langue bruts dans
`apps/web/hooks/use-message-translations.ts` en la routant par la SSOT
`normalizeLanguageForDedup`, pour que le Prisme matche les codes région-tagués /
casse-mixte (`en-US` = `en`, `fr-FR` = `fr`).

## Affected modules

- `apps/web/hooks/use-message-translations.ts` — helper `sameLanguage` + 6 sites.
- `apps/web/__tests__/hooks/use-message-translations.test.tsx` — +5 témoins.

## Implementation phases

1. **RED** — 5 témoins région-tagués/casse (original tagué = préféré ; traduction
   taguée matche ; `getPreferredLanguageContent` sans `translatedFrom` parasite ;
   `shouldRequestTranslation` false ; `getRequiredTranslations` vide). ✅
2. **GREEN** — helper `sameLanguage(a, b)` = `normalizeLanguageForDedup(a) ===
   normalizeLanguageForDedup(b)` (faux si code vide), appliqué aux 6 comparaisons. ✅
3. **Docstring** — documenter la frontière de normalisation et la SSOT. ✅

## Dependencies

- SSOT `normalizeLanguageForDedup` (`packages/shared/utils/language-normalize.ts`)
  — consommée, non modifiée.

## Estimated risks

Faible. Canonicalisation idempotente ⇒ zéro régression sur les codes canoniques.
Signature publique du hook inchangée.

## Rollback strategy

Révert du commit unique. Aucun schéma, aucune migration, aucun changement de
contrat wire.

## Validation criteria

- Jest : suite du hook 50/50 ; voisines 32/32 ; `tsc` sans nouvelle erreur. ✅
- CI verte sur la PR. ⏳

## Completion status

- [x] Phase 1 RED
- [x] Phase 2 GREEN
- [x] Phase 3 docstring
- [x] Analyse + plan
- [ ] CI verte / merge

## Progress tracking

Itération autonome unique. Commit sur `claude/brave-archimedes-wkfh6n`.

## Future improvements

Voir la section « Future improvements » de l'analyse 244 : dedup map interne
keyée par code brut ; audit des consommateurs web restants.
