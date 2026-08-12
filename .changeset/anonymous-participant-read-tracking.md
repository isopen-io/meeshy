---
"@meeshy/gateway": patch
---

Un invité de lien partagé peut enfin acquitter ses messages — son badge de non-lus ne pouvait jusqu'ici que monter

Le serveur soutenait déjà la MOITIÉ anonyme du suivi de lecture, et délibérément :
`MessageReadStatusService.getUnreadCount` résout aussi bien un `Participant.id` qu'un `User.id`,
`emitUnreadCountsToRecipients` adresse `ROOMS.user(userId ?? id)`, et `AuthHandler` fait rejoindre
cette room aux sockets anonymes précisément « because joining anything else had already left
anonymous participants without their unread badge ». Le compte était donc tenu, et poussé.

L'autre moitié — celle qui REMET LE COMPTEUR À ZÉRO — était fermée deux fois :

1. **La porte.** `message-read-status.ts` et les trois routes de lecture de `conversations/messages.ts`
   (`mark-read`, `read`, `mark-unread`) portaient `allowAnonymous: false` : 403 avant même de
   regarder la conversation. Elles acceptent désormais un appelant **authentifié sans compte** —
   `requireAuth: true` reste, un appelant sans jeton n'entre toujours pas. C'est la règle que
   `routes/reactions.ts` applique depuis toujours (« Les anonymes peuvent aussi réagir ») et que le
   POST d'envoi de message applique aussi : l'invité écrivait et réagissait, il ne pouvait pas lire.

2. **La clé.** Les six gardes d'appartenance de ces routes filtraient `Participant.userId` avec
   `authContext.userId`, qui **vaut un `Participant.id`** pour un anonyme (`middleware/auth.ts`,
   branche anonyme : `userId: participant.id`). La comparaison n'appariait donc rien : la garde ne
   sautait pas une ligne inexistante, elle rendait invisible une ligne qui existe. Les six passent
   par un `resolveCallerParticipant` unique, dont la précédence (`participantId` d'abord, `userId`
   ensuite) est celle de `canAccessConversation`, dans le même fichier — les deux réponses ne
   peuvent plus diverger sur l'identité de l'appelant.

Effets de bord réparés au passage : les préférences de confidentialité d'un anonyme sont désormais
demandées EN TANT QU'anonyme (`shouldShowReadReceipts(userId, isAnonymous)` — trois sites codaient
`false` en dur sous le commentaire « les utilisateurs authentifiés ne sont pas anonymes ici », qui
n'était vrai que parce que la porte était fermée) ; `mark-unread` ne relit plus deux fois le même
participant ; et `GET /messages/:messageId/read-status` cesse de filtrer l'appartenance EN RELATION,
la cinquième copie de la règle.

Le client iOS envoie déjà `X-Session-Token` sur ses appels REST (`APIClient.swift`) et appelle
exactement `/conversations/:id/mark-read` et `/mark-unread` : le suivi de lecture des invités y
fonctionne dès ce correctif, sans une ligne de Swift. La webapp, elle, avait débranché son propre
suivi pour les sessions anonymes (`bubble-stream-page.tsx`, « la route mark-as-read est JWT-only ») ;
le rebrancher demande d'abord que `apiService` porte `X-Session-Token`, ce qu'il ne fait pas encore.
