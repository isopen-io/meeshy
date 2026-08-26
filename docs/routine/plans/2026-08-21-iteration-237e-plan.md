# Iteration 237 — Plan : dedup région-aveugle pour les codes irréductibles

## Objectif
Rendre `normalizeLanguageForDedup` (`packages/shared/utils/language-normalize.ts`)
région-aveugle pour TOUS les codes, pas seulement ceux que `normalizeLanguageCode`
sait réduire. Sans quoi un code irréductible tagué région (`'yue-HK'`, `'xyz-AB'`)
ne collapse pas avec sa forme nue (`'yue'`, `'xyz'`), sur-comptant les langues dans
`spokenLanguages` (gateway `anonymous.ts`) et la dedup de préférences
(`conversation-helpers.ts`).

## Modules affectés
- `packages/shared/utils/language-normalize.ts` — repli de `normalizeLanguageForDedup`
  + docstring.
- `packages/shared/__tests__/language-normalize.test.ts` — 2 tests
  (strip région irréductible + garde « ne jamais perdre la donnée »).

## Phases
1. **RED** — écrire les 2 tests. Le premier (`'xyz-AB'` → `'xyz'`) tombe rouge sur `main`
   (reçoit `'xyz-ab'`) ; le second (`'-US'`, `'@@@'`, `''`) passe déjà (garde de
   non-régression).
2. **GREEN** — le repli extrait le sous-tag primaire :
   ```ts
   const normalized = normalizeLanguageCode(code);
   if (normalized) return normalized;
   const primary = code.trim().split(/[-_]/)[0]?.toLowerCase();
   return primary ? primary : code.toLowerCase();
   ```
   Rebuild `packages/shared` (`bun run build`) pour la validation cross-package gateway.
3. **Validation** — vitest shared (2358/2358), parité Swift, tsc shared, suites gateway
   consommatrices sous bun (215/215).

## Dépendances
Aucune. `normalizeLanguageCode` inchangé → parité Swift intacte. Aucun changement de type.

## Risques estimés
- **Négligeable.** Aucun test n'assertait le comportement région-fuyant d'un code
  irréductible ; les assertions `'zh-Hant-HK' → 'zh'` portent sur un code réductible,
  hors du chemin modifié.

## Stratégie de rollback
`git revert` du commit unique (2 fichiers). Aucun changement d'API ni de wire format.

## Critères de validation
- [x] RED prouvé (`'xyz-AB'` : attendu `'xyz'`, reçu `'xyz-ab'`).
- [x] GREEN : `language-normalize.test.ts` + parité → 29/29.
- [x] Suite shared vitest complète : 2358/2358.
- [x] `tsc --noEmit` shared : 0 erreur.
- [x] Gateway `(anonymous|links-admin|links/types|viewed-languages)` sous bun : 215/215.
- [ ] CI verte sur la PR.

## Statut d'achèvement
**Complet.** 2 fichiers modifiés. Aucune régression détectée localement.

## Progression
1. ✅ RED (2 tests, 1 rouge confirmé)
2. ✅ GREEN (repli sous-tag primaire + docstring)
3. ✅ Validation shared (2358/2358) + gateway (215/215) + tsc

## Améliorations futures
1. Dépouillement des 24 `jest.mock('@meeshy/shared/…')` mortes (non validable ce sandbox,
   suite web jest ne résout pas `@meeshy/shared/*`).
2. Miroir Swift si iOS agrège un jour des `spokenLanguages` verbatim.
