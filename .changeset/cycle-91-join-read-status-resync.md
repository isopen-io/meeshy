---
"@meeshy/gateway": patch
---

Les accusés de lecture ne se rattrapaient sur AUCUN client mobile après une coupure socket

`read-status:updated` n'est émis que par une **action** d'accusé — un pair qui lit, une
remise automatique. Un socket coupé à cet instant ne le reçoit jamais, et **rien ne le lui
rejoue** : la file de livraison hors ligne ne porte que des messages et leurs mutations.

La coche de l'expéditeur reste donc figée sur sa valeur d'avant la coupure. Les compteurs
étant monotones côté client depuis le cycle 85, un événement manqué n'est pas un retard
qu'un suivant corrigerait — c'est un **gel permanent**. Une personne qui lit sans écrire ne
voit plus jamais ses coches avancer.

Le cycle 90 a réparé le **web** en relançant son lot REST sur le front montant de la
reconnexion (`use-conversation-messages-rq.ts`). iOS et Android n'ont pas de lot REST
équivalent : ils n'avaient **aucun** rattrapage.

## Le rattrapage vit sur `conversation:join`

`ConversationHandler._resyncReadStatusToSocket` renvoie le résumé d'accusés courant
(`getLatestMessageSummary`) au socket qui rejoint. `conversation:join` est le point de
rattachement de **chaque** reconnexion des trois clients — web `_autoJoinLastConversation`,
iOS et Android re-joignent après authentification — et le payload est celui qu'ils traitent
déjà : **aucun changement client**.

Les deux rattrapages ne font pas double emploi : celui-ci pousse le résumé de conversation
vers les trois clients, celui du web détaille message par message pour un seul.

## `type: 'received'`, jamais `'read'`

Ce n'est pas un détail de forme. iOS (`ConversationSyncEngine`, `NotificationCoordinator`)
et Android ne remettent le compteur de non-lus à zéro que sur un `'read'` émis par
**soi-même**. Un rattrapage estampillé `read` aurait vidé la pastille du rejoignant à
**chaque ouverture de conversation** — le correctif aurait fabriqué un défaut pire que celui
qu'il ferme.

`received` ne porte que le `summary` agrégé : même contrat que la remise automatique en lot
(`MessageHandler.autoDeliverToOnlineRecipients`), qui est le précédent de cette forme. Ni
`lastReadAt` ni `unreadCount` ne l'accompagnent — ils n'appartiennent qu'aux diffusions
`read`.

## Le rattrapage ne peut pas faire reculer une coche

Vérifié sur les trois clients avant d'écrire la ligne, parce que c'était le seul moyen que ce
correctif nuise : `isStaleReceipt` (web, `conversation-ui-store.ts`),
`if newStatus.isBetterThan(current)` (iOS, `applyReadReceipt`), `deliveryRank` (Android,
`MessageRepository.applyReadReceipt`). Les trois n'appliquent le résumé que **vers le haut**.

Une conversation sans message n'émet rien. Canal best-effort : le join a déjà réussi et la
room est déjà rejointe, donc un rattrapage qui échoue ne le défait pas.

`participantId` porte la ligne `Participant` que le contrôle d'appartenance vient de
résoudre, jamais l'identité de room (un `User.id` dès que le rejoignant a un compte).

Documentation : `services/gateway/src/socketio/README.md` gagne la section
« `read-status:updated` — l'evenement manque pendant une coupure n'est rejoue nulle part ».
