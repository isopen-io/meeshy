# Iteration 156 — Plan d'implémentation (2026-07-09)

## Objectif
Corriger F123 : `EditMessageView` valide la query de mention avec `/^\w{0,30}$/` (sans tiret),
cassant l'autocomplete des usernames à tiret en édition. Centraliser la validation de query
dans un helper SSOT pur pour supprimer la classe de drift composer/édition.

## Modules affectés
- `packages/shared/types/mention.ts` — nouveau helper pur `isValidMentionQuery`.
- `packages/shared/__tests__/mention-extract.test.ts` — tests purs (RED→GREEN).
- `apps/web/components/common/bubble-message/EditMessageView.tsx` — **fix** (site du bug).
- `apps/web/hooks/composer/useMentions.ts` — convergence sur le helper (behavior-preserving).

## Phases
1. **RED** — Ajouter le bloc `describe('isValidMentionQuery')` important le symbole inexistant
   → échec d'import. ✅
2. **GREEN** — Implémenter `isValidMentionQuery(query)` = `^[MENTION_HANDLE_CHARS]{0,30}$`. ✅
3. **Fix** — `EditMessageView.tsx:128` : `/^\w{0,30}$/` → `isValidMentionQuery(...)`. ✅
4. **Convergence** — `useMentions.ts:205` : `/^[\w-]{0,30}$/` → `isValidMentionQuery(...)`. ✅
5. **Validation** — vitest (shared) + jest (web `useMentions`), lint/typecheck.

## Dépendances
Aucune. Le helper vit dans le même module que `detectMentionAtCursor`, déjà importé par les
deux consommateurs.

## Risques estimés
Très faible. Sur-ensemble strict de charset (`\w` ⊂ `[\w-]`) : aucune query auparavant
acceptée ne devient rejetée. Aucun contrat/API modifié. Le composer reste iso-comportement.

## Stratégie de rollback
Revert du commit unique. Aucune migration de données, aucun état persistant touché.

## Critères de validation
- `mention-extract.test.ts` verte (+6 tests). RED confirmé avant l'implémentation du helper.
- `useMentions.test.tsx` (composer) inchangée / verte — parité de comportement.
- Typecheck web OK (nouvel import résolu depuis la source `@meeshy/shared/types/mention`).

## Statut : COMPLÉTÉ — validé

Validation : `mention-extract.test.ts` 25/25 (dont 6 nouveaux), suite mentions shared 56/56,
composer `useMentions.test.tsx` 43/43 (aucune régression), typecheck shared sans erreur.

## Progress tracking
- [x] Phase 1 RED
- [x] Phase 2 GREEN (helper)
- [x] Phase 3 Fix EditMessageView
- [x] Phase 4 Convergence useMentions
- [x] Phase 5 Validation suites + typecheck
- [x] Commit + push

## Améliorations futures (backlog)
- F124 réaction self-echo (ID-space Participant vs User) — nécessite décision de contrat.
- F122 frontière gauche dans `detectMentionAtCursor` (UX-only).
- Envisager de migrer `MENTION_REGEX` (détection composer) vers un helper partagé si un 3e
  consommateur apparaît.
