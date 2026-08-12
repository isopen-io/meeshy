# Iteration 128 — Plan d'implémentation (2026-07-07)

## Objectives
Fermer **F88** (backlog iter 127) : garantir totalement l'invariant documenté de `truncateFilename`
(*« the result never exceeds maxLength »*), y compris sous le régime `maxLength ≤ 3` où l'ellipse est
structurellement impossible à loger.

## Affected modules
- `apps/web/utils/truncate.ts` — +1 garde de production (source unique de troncature).
- `apps/web/__tests__/utils/truncate.test.ts` — nouveaux cas de régression.

## Implementation phases
1. **RED** — repro node du débordement (`maxLength ∈ {1,2,3}`, avec/sans extension) ; ajout de tests
   ciblés (`hard-truncates without an ellipsis…`) + extension du balayage `never exceeds maxLength` à
   `max ∈ {1,2,3}`. Confirmer 2 échecs via `git stash` du seul fichier source. ✅
2. **GREEN** — garde `if (maxLength <= 3) return filename.slice(0, Math.max(0, maxLength));` insérée
   après le court-circuit `filename.length <= maxLength`. ✅
3. **REFACTOR** — aucun (fix minimal, pas de duplication introduite). ✅

## Dependencies
Aucune. Fonction pure, sans import partagé.

## Estimated risks
Minimal. Garde antérieure : tout `maxLength ≥ 4` (défaut 32 inclus, tous tests préexistants) inchangé.
Aucun appelant production n'atteint la branche modifiée.

## Rollback strategy
Revert du commit (2 fichiers, sans état persistant ni migration). Réversible sans effet de bord.

## Validation criteria
- [x] TDD RED→GREEN prouvé (`git stash` du source → 2 fails → pop → 10/10).
- [x] `__tests__/utils` : 925/925 tests verts (l'échec `user-language-preferences` est préexistant,
      résolution `@meeshy/shared`, sans lien avec ce diff).
- [x] Zéro changement de comportement pour `maxLength ≥ 4`.

## Completion status
**COMPLET** — F88 fermé.

## Progress tracking
- [x] Analyse rédigée (`analyses/2026-07-07-iteration-128-analyse.md`).
- [x] Plan rédigé (ce fichier).
- [x] Implémentation + tests.
- [ ] Commit + push + PR.

## Future improvements
- **F93** : documenter le contrat distinct de `truncateText` (`maxLength` contenu + ellipse) — voir
  analyse iter 128.
