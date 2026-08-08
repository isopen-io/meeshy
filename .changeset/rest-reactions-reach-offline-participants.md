---
"@meeshy/gateway": patch
---

Les réactions faites en REST atteignent désormais les participants hors ligne.

`ReactionHandler` (transport socket) enfilait chaque bascule de réaction dans la file de
livraison pour chaque participant hors ligne. Les **quatre routes REST** de réaction
(`POST /reactions`, `DELETE /reactions/:messageId/:emoji`,
`POST|DELETE /conversations/:id/messages/:messageId/reactions`) et le chemin de réaction
d'agent n'émettaient que vers la room `conversation:<id>` : une réaction posée pendant
qu'un pair était hors ligne lui était perdue définitivement. REST est le transport
**primaire** des réactions sur iOS (`MeeshySDK/Services/ReactionService.swift`).

Correctif : une implémentation unique de l'audience hors ligne
(`socketio/reactionOfflineQueue.ts`) et un diffuseur unique nommant les deux audiences
(`socketio/broadcastReactionMutation.ts`), par lesquels passent désormais les sept
écrivains de réaction.
