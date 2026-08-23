# Plan — Itération 256 : retrait d'`AuthTestService` + `authenticate()` legacy

## Objectives
Retirer le chemin d'authentification mort (faux backend à identifiants codés en
dur + jeton base64 non signé) et son unique appelant `@deprecated`.

## Affected modules
- `services/gateway/src/services/AuthTestService.ts` → **supprimé**
- `services/gateway/src/__tests__/unit/services/AuthTestService.test.ts` → **supprimé**
- `services/gateway/src/middleware/auth.ts` → retrait de `authenticate()` legacy
- `services/gateway/src/__tests__/unit/middleware/auth-extended.test.ts` →
  retrait mock AuthTestService + import `authenticate` + 3 `describe`

## Implementation phases
1. `git rm` des deux fichiers `AuthTestService*`.
2. Retirer la fonction `authenticate()` (`auth.ts:630-678`), conserver le
   marqueur `LEGACY COMPATIBILITY` (couvre `requireRole`/`requireEmailVerification`).
3. Dans `auth-extended.test.ts` : retirer `mockAuthServiceVerify`/`GetUser`,
   `jest.mock('../../../services/AuthTestService')`, l'import `authenticate`,
   l'en-tête de doc, et les trois `describe` (`authenticate (legacy)`,
   `authenticate legacy — development mode`, `… with valid user returned`).
4. `tsc --noEmit` + `test:coverage`.

## Dependencies
Prérequis CI parity : `bun install --ignore-scripts`, `prisma generate`,
`packages/shared build`.

## Estimated risks
Très faibles — code mort. Risque résiduel : un test conservé référençant un
symbole retiré → capté par `tsc`.

## Rollback strategy
`git revert` du commit (suppression pure, aucune migration de données).

## Validation criteria
- `tsc --noEmit` exit 0.
- Suite gateway verte, seuils tenus.
- `grep` : plus aucune référence de code à `AuthTestService` ni à l'import
  `authenticate` de `middleware/auth`.

## Completion status
- [x] Fichiers supprimés (`AuthTestService.ts` + son test)
- [x] `authenticate()` retirée de `middleware/auth.ts`
- [x] Tests nettoyés (mock + import + 3 `describe` retirés)
- [x] `tsc --noEmit` gateway exit 0
- [x] Suites auth vertes (65/65)
- [x] `test:coverage` complète verte — 843 suites, 19283 tests, exit 0 ; couverture 95.4/89.48/93.36/96.11 (seuils 87/80/86/83 tenus)
- [ ] Merge main

## Future improvements
Poursuivre le balayage des services gateway importés uniquement par leur test.
