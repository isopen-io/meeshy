# Plan — Itération 247 : canonicaliser le pré-filtre serveur d'aperçu via la SSOT

## Objectives

Router les trois comparaisons de codes de langue de
`buildLastMessagePreviewTranslations`
(`services/gateway/src/routes/conversations/utils/last-message-preview.ts`) par la
SSOT `normalizeLanguageForDedup`, pour qu'une clé de traduction taguée région
(`'fr-FR'`), 3-lettres (`'fra'`) ou une langue d'origine taguée (`'en-US'`)
matche le rang région-strippé du prisme du lecteur — au lieu d'être droppée avant
d'atteindre le résolveur client. Fermeture du suivi explicite de l'itération 243.

## Affected modules

- `services/gateway/src/routes/conversations/utils/last-message-preview.ts` —
  import de `normalizeLanguageForDedup` + 3 substitutions dans
  `buildLastMessagePreviewTranslations`.
- `services/gateway/src/__tests__/unit/routes/conversations/last-message-prisme.test.ts`
  — +3 témoins.

## Implementation phases

1. **RED** — 3 témoins : (a) clé `'fr-FR'` + prisme `['fr']` ⇒ `{ fr }` ;
   (b) clé `'fra'` + prisme `['fr']` ⇒ `{ fr }` ; (c) origine `'en-US'` +
   prisme `['en','fr']` avec auto-trad `en` redondante ⇒ `{ fr }` seul. ✅ (3
   RED confirmés, 11 pré-existants verts)
2. **GREEN** — `normalizeLanguageForDedup` sur `original`, `target`, et la clé
   dans `.find`. ✅
3. **Docstring** — commenter la frontière (3 sources canonicalisées, jumeau du
   résolveur client, idempotence). ✅

## Dependencies

- SSOT `normalizeLanguageForDedup`
  (`packages/shared/utils/language-normalize.ts`) — déjà consommée par plusieurs
  sites gateway ; non modifiée.

## Estimated risks

Faible. Canonicalisation idempotente sur codes canoniques ⇒ zéro régression sur
les messages déjà canoniques (11 témoins pré-existants verts sans retouche).
Signature publique inchangée, aucun schéma / contrat wire / migration.

## Rollback strategy

Révert du commit unique. Aucun schéma, aucune migration, aucun changement de
contrat wire.

## Validation criteria

- Jest gateway : suite `last-message-prisme` 14/14 ; voisines 52/52. ✅
- `tsc --noEmit` gateway : exit 0. ✅
- CI verte sur la PR. ⏳

## Completion status

- [x] Phase 1 RED (3 témoins)
- [x] Phase 2 GREEN
- [x] Phase 3 docstring
- [x] Analyse + plan
- [x] Suites voisines + tsc verts
- [ ] CI verte / merge

## Progress tracking

Itération autonome unique. Branche `claude/brave-archimedes-ifrujw`.

## Future improvements

Voir la section « Future improvements » de l'analyse 247 : `anonymous.ts`
(garde d'accès, priorité 1), `reelAffinity.ts`, `_findUsersForLanguage`, les
quatre sites web, et le backfill de base — tous du même root cause (comparaison
de codes de langue hors SSOT).
