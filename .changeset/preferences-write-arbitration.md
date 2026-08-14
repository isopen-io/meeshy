---
"@meeshy/web": patch
---

L'arbitre de version garde désormais les deux portes d'écriture des préférences de conversation, et un onglet revenu au premier plan reprend son temps réel sans attendre.

**Web.** Les quatre bascules optimistes (`togglePin`, `toggleMute`, `toggleArchive`, `setReaction`) posaient la réponse de leur `PUT` sans arbitrage, à côté du portillon `version` que `applyRemotePreferences()` applique déjà aux diffusions socket. Trois pertes d'état en découlaient : deux bascules rapprochées dont les réponses reviennent dans le désordre laissaient gagner la plus ANCIENNE ; une diffusion arrivée pendant le vol de la requête était rembobinée par la réponse ; la rétractation d'un échec réseau restaurait un instantané périmé et annulait une action sans rapport. `isStaleWriteResponse()` arbitre les réponses HTTP comme les diffusions — mais seulement quand la réponse PORTE une version, sans quoi un déploiement mixte perdrait l'écriture — et la rétractation ne s'applique qu'à sa propre écriture, reconnue par identité référentielle sur un état immuable. Les quatre méthodes passent par un `writeOptimistic(conversationId, patch, request)` unique.

**Web (socket).** `visibilitychange` → reprise immédiate. Un onglet en arrière-plan voit ses timers étranglés à ~1/minute et son socket coupé ; les deux boucles de reprise reposant sur des timers, un lecteur passif pouvait rester privé de tout événement temps réel une minute ou plus après son retour. La garde teste l'état réel du socket et non le miroir local, précisément parce qu'un onglet gelé peut être déconnecté sans que `disconnect` atteigne jamais ce miroir ; le timer de backoff en attente est annulé et l'échelle repart de zéro.

**Gateway.** `PUT /api/user-preferences/conversations/:id` répond `400` sur un `categoryId` malformé au lieu de `500` : l'id atteignait Prisma, qui levait `Malformed ObjectID`, et le `catch` du handler classait une erreur d'appelant en incident serveur.
