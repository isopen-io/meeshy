# Iteration 121 — Plan d'implémentation (2026-07-06)

## Objectives
Restaurer le correctif **F84** (pagination « load more » anonyme via lien partagé), annulé sur `main`
par un écrasement de merge collatéral (commit iOS `06687928a` remettant `getNextPageParam` en version
pré-F84).

## Affected modules
- `apps/web/hooks/queries/use-conversation-messages-rq.ts` — `getNextPageParam` (restauration).
- `apps/web/__tests__/hooks/queries/use-conversation-messages-rq.test.tsx` — test de régression restauré.

## Implementation phases
1. **Constat** — vérifier que `main` a bien perdu le correctif (diff de `06687928a`). ✅
2. **Restauration** — ré-appliquer verbatim `getNextPageParam: (lastPage, allPages) => { … if (linkId)
   return allPages.length + 1; … }` + ré-ajout du test « anonymous loadMore advances the offset ». ✅
3. **Validation** — `npx jest use-conversation-messages-rq.test.tsx` : 19/19. ✅

## Dependencies
Aucune. Restauration d'un correctif déjà revu/mergé.

## Estimated risks
Très faible. Verbatim d'un correctif mergé ; chemin authentifié inchangé.

## Rollback strategy
Revert du commit (isolé).

## Validation criteria
- [x] 18 tests existants + 1 restauré = 19/19 (jest).
- [x] `getNextPageParam` = version F84 (2ᵉ arg `allPages`, branche `if (linkId)`).

## Completion status
**COMPLET.** Restauration + test + docs. Prêt à commit/push/PR.

## Progress tracking
- [x] Analyse + plan.
- [x] Restauration source + test.
- [x] `npx jest` vert (19/19).
- [ ] Commit + push + PR.

## Future improvements
- **F86** (LOW) : dedup traduction premium/basic ignorant le timestamp — intention produit à confirmer.
- **Process** : contrôle systématique en début d'itération que les correctifs récents survivent sur `main`.
