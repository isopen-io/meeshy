# Iteration 63 — Plan d'implémentation (2026-07-01)

## Objectif
Lot « Restauration de `formatCompactNumber` (F29-restore) » : restaurer le travail d'iter 61
(source unique du compteur compact) **silencieusement reverté** par le merge parallèle `9a431658`.

## Diagnostic (voir analyse)
`9a431658` (« corrections du review présence », forké d'un main pré-iter-61) a supprimé
`utils/format-number.ts` et réintroduit les 3 formatteurs locaux divergents à son merge. Régression
confirmée par `git log --full-history`.

## Étapes (délégation → vérification)

### Phase A — Restauration de la source unique
- [x] `git checkout deb81adf -- apps/web/utils/format-number.ts apps/web/__tests__/utils/format-number.test.ts`
      (fichiers inchangés depuis iter 61).

### Phase B — Re-convergence des 3 fichiers
- [x] `v2/PostDetail.tsx` : import + `const formatCount = formatCompactNumber`.
- [x] `v2/CommunityCarousel.tsx` : import + `const formatCount = formatCompactNumber` (`k` → `K`).
- [x] `app/(connected)/me/page.tsx` : import + `const formatNumber = formatCompactNumber`
      (`k` → `K` + palier million restauré).

### Phase C — Vérification & livraison
- [x] `jest format-number + CommunityCarousel` → **17/17**.
- [x] `tsc --noEmit` : aucune erreur sur les 4 fichiers touchés.
- [ ] Commit + push `claude/sharp-wozniak-9e5y85` ; PR vers `main` ; CI verte ; **merge**.

## Continuité
Iter 64 : F30 (converger les ~17 `navigator.clipboard.writeText` sur `copyToClipboard`, en sous-lots
prudents), ou nouveau cluster (slug/url, sanitize, F25b).

## Protocole renforcé (leçon iter 63)
Au **début** de chaque itération, après `git checkout origin/main` : vérifier que les sources uniques
récemment introduites (format-number, time-remaining, truncate, relative-time, avatar-utils…) existent
toujours (`ls`/`grep`). Un merge parallèle périmé peut les reverter sans conflit visible. Restaurer
avant de scouter un nouveau lot.

## Statut (mis à jour en fin d'itération)
- [x] Phase A / B — util + test restaurés ; 3 re-convergences appliquées.
- [x] Phase C — tests + tsc verts ; reste : commit + push + PR + CI + merge.
