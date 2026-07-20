# Plan — Iteration 185 : parité regex numérique `verifyPhone.code` ↔ `verifyEmail.code`

## Objectifs
Aligner le contrat de validation de `AuthSchemas.verifyPhone.code` sur son frère
`AuthSchemas.verifyEmail.code` en imposant la forme numérique 6 chiffres
(`/^[0-9]{6}$/`), et verrouiller la parité par des tests.

## Modules affectés
- `packages/shared/utils/validation.ts` (`AuthSchemas.verifyPhone`, ligne 383).
- `packages/shared/__tests__/validation.test.ts` (nouveau bloc de tests).

## Phases d'implémentation
1. **RED** — Ajouter le bloc `describe('AuthSchemas verification codes')` :
   parité `verifyEmail`/`verifyPhone`, rejet `'abcdef'`, rejet mauvaises
   longueurs. Confirmer que `verifyPhone` rejet-`'abcdef'` échoue sur le code
   actuel.
2. **GREEN** — `z.string().length(6)` → `z.string().length(6).regex(/^[0-9]{6}$/)`.
3. **VALIDATION** — `vitest run __tests__/validation.test.ts` + suite complète
   `packages/shared` + `tsc --noEmit`.

## Dépendances
Aucune. Changement interne au schéma partagé ; aucun appelant ne change de
signature. `AuthService.verifyPhone` (consommateur) conserve son check aval
(defense-in-depth inchangée).

## Risques estimés
Très faible. Un seul `.regex()` ajouté (copie verbatim du frère). Seules les
chaînes 6-caractères non-numériques (déjà rejetées à la vérification aval)
deviennent rejetées en amont. Aucun code numérique valide n'est affecté.

## Stratégie de rollback
Revert du commit : `.regex(/^[0-9]{6}$/)` retiré de la ligne 383, retour au
`.length(6)` seul. Aucune migration de données, aucune forme persistée touchée.

## Critères de validation
- [x] `vitest run __tests__/validation.test.ts` — 42 tests verts (37 + 5).
- [x] Suite complète `packages/shared` — 1374 tests verts, 46 fichiers.
- [x] `tsc --noEmit` (shared) — 0 erreur.
- [x] RED confirmé : sans le fix, `verifyPhone rejette 'abcdef'` échoue.

## Statut de complétion
**COMPLÉTÉ** — fix + tests implémentés et validés localement (bun/vitest,
parité CI).

## Suivi de progression
- RED : fait (5 tests, 1 rouge sans fix).
- GREEN : fait (regex ajoutée ligne 383).
- Validation : fait (42/42 fichier, 1374/1374 suite, tsc 0 erreur).

## Améliorations futures
- Extraire un helper partagé `sixDigitCode` réutilisé par `verifyEmail`/
  `verifyPhone` (et futurs OTP) pour garantir la parité par construction.
- Unifier `participantsFilters.limit` sur le patron pagination si un jour câblé.
