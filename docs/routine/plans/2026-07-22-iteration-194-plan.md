# Iteration 194 — Plan : câbler `normalizeLanguageCode` (SSOT) dans `v2/flags`

## Objectifs
Remplacer la troncature aveugle `slice(0, 2)` de `getFlag`/`getLanguageName` par
le SSOT partagé `normalizeLanguageCode`, afin que les codes ISO 639-2/639-3
canoniques (`swe`, `spa`, `jpn`, `por`, `ger`, `dut`, `chi`, …) rendent le
drapeau/nom national correct au lieu du globe générique.

## Modules affectés
- `apps/web/components/v2/flags.ts` (production — import + 2 helpers + constante
  `GLOBE`)
- `apps/web/__tests__/components/v2/flags.test.ts` (tests — cas collision 639-2/3)

## Phases
1. **RED** — ajouter à `flags.test.ts` :
   - `getFlag('swe'|'spa'|'jpn'|'por')` → drapeau national (échoue : globe).
   - `getFlag('ger'|'dut'|'chi')` → 639-1 correspondant.
   - `getFlag('swe')` ≠ globe (invariant anti-troncature).
   - `getLanguageName('swe')` → `'Svenska'`, `getLanguageName('spa')` →
     `'Espanol'` (échoue : `'SWE'`/`'SPA'`).
   - `getLanguageName('fil')` → `'FIL'` (non normalisable, fallback préservé).
2. **GREEN** — `flags.ts` :
   - `import { normalizeLanguageCode } from '@meeshy/shared/utils/language-normalize';`
   - `const GLOBE = '\u{1F310}';`
   - `getFlag` = `normalizeLanguageCode(code)` → `GLOBE` si falsy, sinon
     `FLAG_MAP[normalized] || GLOBE`.
   - `getLanguageName` = `normalizeLanguageCode(code)` → si falsy
     `code ? code.toUpperCase() : 'Unknown'`, sinon
     `LANGUAGE_NAMES[normalized] || normalized.toUpperCase()`.
3. **VALIDATION** — jest `flags.test.ts` + suites v2 ; `tsc --noEmit` web ;
   grep `slice(0, 2)` = 0 dans `flags.ts`.

## Dépendances
`@meeshy/shared/utils/language-normalize` — déjà consommé par 3 modules web
(`language-detection.ts`, `user-language-preferences.ts`,
`bubble-stream-page.tsx`). Jest mappe `@meeshy/shared/(.*)` →
`packages/shared/dist/$1` → nécessite `packages/shared` construit (fait au
démarrage, parité CI).

## Risques estimés
Minimal. Élargissement de comportement strict (globe/code-brut → drapeau/nom
correct) ; codes 639-1 valides, BCP-47, inconnus et vides inchangés. Aucun cycle
d'import (`flags.ts` côté web).

## Stratégie de rollback
Revert du commit unique. Les 2 fichiers sont indépendants ; aucune migration,
aucun état persistant.

## Critères de validation
- RED→GREEN prouvé sur les cas 639-2/3.
- Tests de régression existants verts (`fr`, `fr-FR`, `id`, `no`, `xx`,
  vide/null, maps-en-sync).
- `tsc --noEmit` propre.
- Grep `slice(0, 2)` = 0 dans `flags.ts`.

## Statut de complétion
- [x] Analyse rédigée
- [x] RED test — 4 échecs prouvés sur le code pré-fix (`getFlag('swe')` globe,
  `getFlag('swe') !== globe`, `getLanguageName('swe')` = `'SWE'`, + variantes)
- [x] GREEN (`flags.ts`) — import SSOT + `GLOBE` + 2 helpers ; 16/16 verts
- [x] Validation jest (v2 : 12 suites / 107 tests verts, dont flags 16/16) +
  tsc (0 erreur nouvelle sur `flags.ts` / `language-normalize` ; 1196 erreurs
  pré-existantes inchangées dans des fichiers non liés) + grep `slice(0, 2)` = 0
- [ ] Commit + push + merge

## Améliorations futures
- `getLanguageInfo` shared BCP-47 (cycle d'import à casser — extraire
  `SUPPORTED_CODES`) — reporté de 192/193.
- Parité sentinelle `'unknown'` / normalisation iOS/Android (190/191).
