## Leçon 46 — enqueue offline du delete : on excluait l'AUTEUR au lieu du SUPPRESSEUR (2026-07-08, routine messaging, iter 144)

`MessageHandler.handleMessageDelete` rejoue les suppressions aux destinataires hors-ligne via
`_enqueueOfflineEventForParticipants(conversationId, senderParticipantId, 'deleted', …)`, dont la boucle saute
`p.id === senderParticipantId` (l'ACTEUR de l'action) — plus les participants en ligne. L'appel delete passait
`message.senderId`, c.-à-d. l'**id participant de l'AUTEUR** du message. C'est correct sur `message:send`/`message:edit`
(seul l'auteur édite → auteur == acteur), mais `handleMessageDelete` autorise aussi admins/modérateurs (de conversation
OU globaux) à supprimer le message d'AUTRUI. Sur ce chemin auteur ≠ suppresseur.

**Scénario de perte** : auteur A (hors-ligne), modérateur B (en ligne) supprime le message de A. L'emit live
`message:deleted` part vers la room conversation → A hors-ligne le rate. La boucle d'enqueue atteint A mais
`p.id === message.senderId` (id participant de A) → `continue` → **A n'est jamais mis en file**. À la reconnexion
(`_drainPendingMessages`) A ne reçoit pas la suppression et continue d'afficher un message retiré par un modérateur,
jusqu'à un refetch complet sans rapport. Le `senderParticipantId` était de toute façon **redondant** pour sa raison
d'être (l'acteur vient d'agir via sa socket → il est en ligne → déjà exclu par `connectedUsers.has`), et donc
uniquement NUISIBLE quand auteur ≠ acteur.

**Fix** : passer l'id participant du **suppresseur**, pas de l'auteur. Sa ligne participant conversation-scoped est
déjà chargée (`message.conversation.participants` filtré par `where: { userId, isActive }` = l'utilisateur courant) ;
ajouter `id` à ce `select` et passer `message.conversation.participants[0]?.id`. Fallback = `undefined` (PAS
`message.senderId`) : quand le suppresseur est un admin GLOBAL non-participant, `participants` est vide → skip personne
(l'admin global n'est pas dans la boucle des participants de la conv, et s'il l'était il serait en ligne donc exclu).
Piège écarté : la proposition initiale `?? message.senderId` réintroduisait le bug pour les deletes d'admin global.
Test RED : admin supprime le message d'un auteur hors-ligne → 0 enqueue avant, 1 enqueue (auteur) après. 430 tests
MessageHandler verts, tsc OK.

**Règle réutilisable** : un paramètre « exclure l'acteur » n'est juste que si la variable passée EST l'acteur sur
TOUS les chemins. Dès qu'une action a plusieurs auteurs possibles (l'auteur du contenu vs. un modérateur agissant
dessus), ne pas dériver l'« acteur à exclure » d'un champ du CONTENU (`senderId`, `ownerId`, `createdBy`) — le dériver
de l'IDENTITÉ de l'appelant (participant/utilisateur authentifié courant). Signature du bug : `skip = entity.authorId`
alors que l'action est autorisée à un tiers. Et si l'exclusion est de toute façon redondante avec une autre garde
(ici « en ligne »), la retirer ou la fonder sur l'identité de l'appelant — jamais sur le contenu.

---
