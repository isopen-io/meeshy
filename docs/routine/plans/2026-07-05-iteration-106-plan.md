# Iteration 106 — Plan d'implémentation (2026-07-05)

## Objectifs
Éliminer la divergence F73 entre `isValidEmail` et `getEmailValidationError`
(`packages/shared/utils/email-validator.ts`) : garantir l'invariant
`getEmailValidationError(x) === null ⟺ isValidEmail(x) === true`, en rétablissant la Single Source of
Truth (le validateur booléen canonique) sous la couche de messages.

## Modules affectés
- `packages/shared/utils/email-validator.ts` (source, fonction pure `getEmailValidationError`).
- `packages/shared/__tests__/email-validator.test.ts` (tests).
- Bénéficiaires automatiques (aucun changement) : `apps/web/hooks/use-field-validation.ts`,
  `use-register-form.ts`, `use-registration-validation.ts`.

## Phases d'implémentation
1. **RED** — repro Node autonome (impls verbatim) prouvant `getEmailValidationError('a'×65+'@b.co') === null`
   alors qu'`isValidEmail === false`. ✅
2. **GREEN** —
   - Ajout garde `localPart.length > 64` → message « Partie avant @ trop longue (maximum 64 caractères) ».
   - Garde finale : `EMAIL_REGEX.test(...)` → `!isValidEmail(email)` (délégation SSOT).
   - JSDoc : invariant explicite. ✅
3. **Tests** — 4 cas ajoutés : local part 65 (message dédié), local part 64 (valide), invariant de
   parité sur 27 échantillons, régression documentée. ✅
4. **Validation** — vitest ciblé + suite complète shared + build tsc. ✅
5. **Docs** — analyse + plan + push. ⏳

## Dépendances
Aucune. Fonctions pures, pas de migration, pas de changement de schéma ni d'API.

## Risques estimés
Très faibles : les nouvelles gardes **mirroir** `isValidEmail` (aucun email nouvellement rejeté qui
serait accepté par le validateur canonique) ; comportement inchangé sur tous les cas existants (prouvé
par sweep de parité + 44 tests existants verts).

## Stratégie de rollback
`git revert` du commit unique. Fonction pure, sans état, sans effet de bord.

## Critères de validation
- [x] RED prouvé avant le fix.
- [x] `email-validator.test.ts` 48/48.
- [x] Suite shared 1284/1284 (45/45 fichiers), 0 régression.
- [x] `bun run build` 0 erreur.
- [ ] CI verte après push.

## Statut d'achèvement
**Implémentation + validation locale : COMPLET.** Reste : commit, push, ouverture PR, CI.

## Progress tracking
- [x] Analyse rédigée (`2026-07-05-iteration-106-analyse.md`).
- [x] Fix implémenté.
- [x] Tests verts.
- [x] Build vert.
- [ ] Poussé sur `claude/brave-archimedes-9bcdyw` + PR.

## Améliorations futures
- **F74** : lookbehind manquant dans `resolveDisplayContent` (dead code — à faire si câblé).
- **F75** : suffixe `generateCommunityIdentifier` non garanti à 6 car. (proba négligeable).
- Reports antérieurs : F51b, F56b, F60b, F67b, F68b, F69, F70 (voir analyse).
