# Iteration 68 — Plan d'implémentation (2026-07-01)

## Objectif
Sous-lot **F30-d** : converger les 2 jumeaux de partage de conversation (Web Share + fallback presse-papier)
vers la source unique `copyToClipboard`, rendant le partage fonctionnel même sans Web Share ni Clipboard API.

## Étapes (délégation → vérification)

### Phase A — Conversion des 2 jumeaux
- [x] `components/conversations/header/use-header-actions.ts` : branche `else` du `handleShareConversation`
      → `copyToClipboard(fullMessage)` ; `if (success) toast succès else toast erreur`. `try/catch` externe
      conservé (gère `navigator.share` / AbortError).
- [x] `components/conversations/conversation-item/ConversationItem.tsx` : idem (jumeau).

### Phase B — Vérification & livraison
- [x] `tsc --noEmit` : multiset d'erreurs **identique** à la baseline `main` (0 régression).
- [x] `jest __tests__/components/conversations/{conversation-item,header}` → **27/27 verts**.
- [ ] Commit + push `claude/sharp-wozniak-0fc6ol` (force-with-lease) ; PR vers `main` ; CI verte ; **merge**.

## Continuité
Iter 69 : protocole renforcé v2, puis F30-e (`Header.tsx`, 4× fire-and-forget — pattern distinct) ou
« admin links » (`admin/share-links`, `admin/tracking-links`, `tracking-links.ts`). Ou F31 (dédup `truncateText`).

## Statut (mis à jour en fin d'itération)
- [x] Phase A — 2 jumeaux convertis.
- [x] Phase B — tsc 0 régression + 27/27 ; reste : push + PR + CI + merge.
