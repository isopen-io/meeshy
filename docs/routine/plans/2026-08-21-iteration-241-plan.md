# Plan d'implémentation — Iteration 241

## Objectifs
Aligner les deux dernières primitives de rôle non conformes (`hasMinimumRole`,
`hasMinimumMemberRole`) sur la garantie de normalisation de casse que porte déjà toute leur
famille dans `packages/shared/types/role-types.ts`, et geler cette garantie par test.

## Modules affectés
- `packages/shared/types/role-types.ts` (production — 2 primitives)
- `packages/shared/types/__tests__/role-types.test.ts` (tests — +7)
- `docs/routine/{analyses,plans}/2026-08-21-iteration-241-*.md`

## Phases d'implémentation
1. **RED** — Ajouter les tests « case insensitive » manquants (miroir des frères
   `isGlobalAdmin`/`isMemberAdmin`) pour `isGlobalModerator`, `isMemberModerator`,
   `hasMinimumRole`, `hasMinimumMemberRole`. → 6 rouges sur `main`. ✅
2. **GREEN** — Case-fold l'entrée dans les deux primitives (`.toUpperCase()` global,
   `.toLowerCase()` membre), conserver `|| 0` (fail-closed inconnus), corriger le commentaire
   `v8 ignore` à prémisse fausse, resserrer l'annotation sur la seule ligne `requiredLevel`,
   ajouter un test « unknown global role → false » couvrant `userLevel || 0`. → 105/105. ✅
3. **VALIDATION** — vitest shared complet, gateway présence/rôle, `tsc` shared + gateway. ✅

## Dépendances
- `packages/shared` rebuild (`bun run build`) requis avant les tests gateway (consomment `dist`).

## Risques estimés
- **Faible.** Changement additif : aucun résultat `true` ne bascule `false`. Fail-closed inconnus
  préservé (pas de passage par `normalizeGlobalRole`). Contournements web (`.toLowerCase()`)
  restent corrects (double-fold idempotent).

## Stratégie de rollback
`git revert` du commit unique (retire les 2 `.toXCase()` et les 7 tests).

## Critères de validation
- [x] RED 6 tests rouges sur `main`.
- [x] GREEN `role-types.test.ts` 105/105.
- [x] vitest shared 2335/2335 (96 fichiers).
- [x] gateway `[Pp]resence|role` 53/53 (7 suites).
- [x] `tsc --noEmit` shared + gateway propre.
- [ ] CI verte sur la PR.

## État d'avancement
**Terminé** (local). En attente : push + PR + CI.

## Suivi de progression
- Commit unique sur `claude/brave-archimedes-gtr9c0`, repartie de `origin/main` @ `d3686997`.

## Améliorations futures
1. Retrait des 2 contournements `.toLowerCase()` web (redondants) — passe web-ready dédiée.
2. SSOT du set « rôles globaux privilégiés » (`conversation-helpers.ts:346`,
   `messageEditAdmission.ts:59`) → `isGlobalModerator` drop-in, maintenant que la casse est foldée.
