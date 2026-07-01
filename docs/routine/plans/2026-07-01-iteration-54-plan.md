# Iteration 54 — Plan d'implémentation (2026-07-01)

## Objectif
Lot « Suppression du résolveur de nom mort — F26b-b » : `apps/web/utils/user.ts` (ordre name-first,
dernière copie divergente de `getUserDisplayName`) est **orphelin** (zéro importeur production).
Le supprimer avec son test, plus retirer 2 `jest.mock('@/utils/user', ...)` stale, clôt le cluster
`getUserDisplayName` autour de la source unique `utils/user-display-name`.

## Pré-requis runner (parité CI)
- [x] `bun install` (jest web présent).
- [x] Baseline vert : `user.test.ts` + `invite-user-modal.test.tsx` + `user-settings.test.tsx` = 91/91.
- [x] Cartographie : `@/utils/user` importé **uniquement** par les tests (aucun consommateur prod).

## Étapes (suppression → vérification)

### Phase A — Supprimer le module mort
- [x] `git rm apps/web/utils/user.ts` (dernière copie name-first du résolveur).
- [x] `git rm apps/web/__tests__/utils/user.test.ts` (test du module mort).

### Phase B — Retirer les mocks stale
- [x] `__tests__/components/conversations/invite-user-modal.test.tsx` : supprimer le bloc
      `jest.mock('@/utils/user', () => ({ getUserInitials: ... }))` (composant → `@/lib/avatar-utils`).
- [x] `__tests__/components/settings/user-settings.test.tsx` : supprimer le même mock stale.

### Phase C — Vérification & livraison
- [x] `jest invite-user-modal.test.tsx user-settings.test.tsx` → **62/62** vert.
- [x] Aucune référence résiduelle à `@/utils/user` (grep = 0).
- [ ] Commit + push `claude/sharp-wozniak-k04xk9` ; PR vers `main` ; CI verte ; **merge squash**.

## Hors périmètre (consigné dans l'analyse)
- F26c-d (initiale G7), F26c-c (widgets), F25b, F2, F10, F21.

## Continuité
Iter 55 : **F26c-d** (initiale d'avatar G7 `MemberSelectionStep` via `getUserDisplayName(...).charAt(0)`
→ `getUserInitials` de `@/lib/avatar-utils`, source unique des initiales) pour clore le sous-cluster
initiales ; sinon F26c-c (widgets dashboard) ou nouveau scout (slug/url, sanitize, date-relative).

## Incidents de merge (parallélisme multi-agents)
- Si un commit parallèle réintroduit un import de `@/utils/user`, le rediriger vers le canonique
  (`utils/user-display-name` pour les noms, `lib/avatar-utils` pour les initiales) plutôt que de
  ressusciter le module supprimé.

## Statut (mis à jour en fin d'itération)
- [x] Phase A — `utils/user.ts` + `__tests__/utils/user.test.ts` supprimés.
- [x] Phase B — 2 mocks `@/utils/user` stale retirés.
- [x] Phase C — 62/62 vert, zéro référence résiduelle ; commit + push + PR + CI + merge.
