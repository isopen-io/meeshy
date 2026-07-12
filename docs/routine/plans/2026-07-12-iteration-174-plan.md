# Plan d'implémentation — Iteration 174

## Objectif
Corriger le bug de mauvaise-variable dans `ensureUniqueShareLinkIdentifier` (les
variantes de collision étaient construites depuis l'input non-trimé au lieu de la
valeur trimée effectivement vérifiée), dans ses **deux** copies dupliquées.

## Modules affectés
- `services/gateway/src/routes/conversations/utils/identifier-generator.ts`
- `services/gateway/src/routes/links/utils/link-helpers.ts`
- `services/gateway/src/__tests__/unit/routes/identifier-generator.test.ts` (tests)
- `services/gateway/src/__tests__/unit/routes/links/link-helpers.test.ts` (tests)

## Phases
1. **RED** — Ajout de 2 tests par fichier de test (whitespace + collision
   timestamp ; whitespace + collision compteur). Confirmation de l'échec exact.
2. **GREEN** — `const trimmedBase = baseIdentifier.trim()` ; utilisation cohérente
   pour l'assignation initiale et les deux variantes de collision.
3. **VALIDATION** — Exécution des suites affectées + suites route liées.

## Dépendances
Aucune (correctif isolé, pure logique de chaîne). Nécessite `prisma generate`
(client shared) pour compiler les imports de type mockés.

## Risques estimés
Minimal. Changement de variable local, aucun changement de signature ni de
contrat sur les chemins no-collision / empty-input (couverts par tests
existants, restés verts).

## Stratégie de rollback
`git revert` du commit — changement autonome, aucune migration de données ni
d'état persistant modifié par le code lui-même.

## Critères de validation
- [x] Tests RED échouent sur le code d'origine (sortie exacte reproduite).
- [x] Tests GREEN passent après correctif (25/25 + 30/30).
- [x] Suites route liées vertes (33 suites / 493 tests).
- [x] Aucune régression sur les chemins existants.

## Statut : COMPLET

## Améliorations futures
- **Unifier les deux copies** de `ensureUniqueShareLinkIdentifier` (+ `generateInitialLinkId`,
  `generateFinalLinkId`) en une seule SSOT importée par les deux route-groups,
  éliminant par construction la classe de bug « une copie corrigée, l'autre
  oubliée ». Refactor à périmètre plus large — candidat pour une itération dédiée.
