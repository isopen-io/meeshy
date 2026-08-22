# Plan — Itération 246 : canonicaliser la clé de dédup des traductions du hook web

## Objectives

Router la **clé** de `translationsMap` dans
`apps/web/hooks/use-message-translations.ts` par la SSOT
`normalizeLanguageForDedup`, pour que deux traductions de même langue à codes
verbatim distincts (`fr` / `fr-FR` / `FR`) fusionnent en une entrée et que le
classement de qualité (premium > medium > basic) s'applique entre elles.

## Affected modules

- `apps/web/hooks/use-message-translations.ts` — variable `dedupKey` + 2 sites
  (`.get` / `.set`) dans `processMessageWithTranslations`.
- `apps/web/__tests__/hooks/use-message-translations.test.tsx` — +2 témoins.

## Implementation phases

1. **RED** — 2 témoins : (a) `fr` basic + `fr-FR` premium ⇒ 1 entrée, contenu
   premium ; (b) `fr-FR` premium + `FR` basic (ordre inverse, casse mixte) ⇒
   1 entrée, contenu premium. ✅
2. **GREEN** — `const dedupKey = normalizeLanguageForDedup(language ?? '')`,
   appliqué à `translationsMap.get` / `.set` ; `BubbleTranslation.language`
   reste verbatim. ✅
3. **Docstring** — documenter la frontière : clé canonicalisée, valeur verbatim,
   SSOT. ✅

## Dependencies

- SSOT `normalizeLanguageForDedup` (`packages/shared/utils/language-normalize.ts`)
  — déjà importée dans le fichier (itération 244), non modifiée.

## Estimated risks

Faible. Canonicalisation idempotente sur codes canoniques ⇒ zéro régression sur
les traductions déjà distinctes. `normalizeLanguageForDedup('')` = `''` : parité
exacte avec l'ancien `language ?? ''`. Signature publique du hook inchangée.

## Rollback strategy

Révert du commit unique. Aucun schéma, aucune migration, aucun changement de
contrat wire.

## Validation criteria

- Jest : suite du hook 52/52 ; voisine `message-translation.service` 18/18 ;
  `tsc` sans erreur dans le fichier touché. ✅
- CI verte sur la PR. ⏳

## Completion status

- [x] Phase 1 RED
- [x] Phase 2 GREEN
- [x] Phase 3 docstring
- [x] Analyse + plan
- [ ] CI verte / merge

## Progress tracking

Itération autonome unique. Branche `claude/brave-archimedes-nbji5y`.

## Future improvements

Voir la section « Future improvements » de l'analyse 246 : audit des
consommateurs web restants de codes bruts ; miroir potentiel iOS/Android.
