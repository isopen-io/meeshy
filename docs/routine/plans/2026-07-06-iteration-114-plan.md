# Iteration 114 — Plan d'implémentation (2026-07-06)

## Objectives
Corriger **F84** : le « load more » des chats anonymes (lien partagé) recharge la page 1 en boucle
(doublons + historique ancien inaccessible), car `getNextPageParam` renvoie un ID de message (string)
que la branche offset anonyme retransforme en page 1.

## Affected modules
- `apps/web/hooks/queries/use-conversation-messages-rq.ts` — `getNextPageParam`.
- `apps/web/__tests__/hooks/queries/use-conversation-messages-rq.test.tsx` — 1 test de régression.
- Caller (hérité, inchangé) : `apps/web/components/common/bubble-stream-page.tsx` (surface chat anonyme).

## Implementation phases
1. **Fix** — brancher `getNextPageParam` sur `linkId` : mode anonyme (offset) → `allPages.length + 1` ;
   mode authentifié (cursor) → inchangé. Commentaire du *pourquoi*. ✅
2. **Test** — « anonymous loadMore advances the offset » : 1ᵉʳ appel `loadMessages(20,0)`, 2ᵉ appel
   `loadMessages(20,20)` (pas `(20,0)`), 3 messages distincts sans doublon. ✅
3. **Validation** — `npx jest use-conversation-messages-rq.test.tsx` : 19/19. ✅

## Dependencies
Aucune. Aucun changement de signature/API.

## Estimated risks
Très faible. Chemin authentifié inchangé (branche `linkId` prise en premier). Mode anonyme : boucle
cassée → offset croissant correct.

## Rollback strategy
Réversible en une ligne (retirer la branche `if (linkId)`). Aucun état persistant.

## Validation criteria
- [x] 18 tests existants préservés + 1 neuf = 19/19 (jest).
- [x] 1ᵉʳ appel offset 0, 2ᵉ appel offset = limit ; pas de doublon dans la liste finale.

## Completion status
**COMPLET.** Fix + test + docs. Prêt à commit/push/PR.

## Progress tracking
- [x] Analyse (`2026-07-06-iteration-114-analyse.md`).
- [x] Plan (ce fichier).
- [x] Fix `use-conversation-messages-rq.ts`.
- [x] Test de régression.
- [x] `npx jest` vert (19/19).
- [ ] Commit + push + PR.

## Future improvements
- **F85** (MEDIUM, translator) : `Synthesizer._segment_text` perte de phrase courte — PR Python ciblée.
- **F86** (LOW) : dedup traduction premium/basic ignorant le timestamp — intention produit à confirmer.
