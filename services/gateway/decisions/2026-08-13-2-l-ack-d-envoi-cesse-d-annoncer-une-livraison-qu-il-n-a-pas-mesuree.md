## 2026-08-13 (2) : L'ACK d'envoi cesse d'annoncer une livraison qu'il n'a pas mesurée

**Statut** : Accepté

**Contexte** : `MessagingService.createSuccessResponse` — le constructeur de l'ACK d'envoi de
message — composait un bloc `metadata` de six sections à chaque message envoyé. Trois d'entre
elles n'étaient pas des mesures :

- `deliveryStatus` valait `{recipientCount: 1, deliveredCount: 1, readCount: 1}` **en dur**. Un
  envoi dans un groupe de douze annonçait « livré à 1, lu par 1 » à l'instant même de la
  persistance, avant que le moindre destinataire ait reçu quoi que ce soit.
- `performance` rapportait `dbQueryTime`, `translationQueueTime` et `validationTime` comme des
  **fractions arbitraires** du temps total (× 0,6 / 0,2 / 0,1). Aucun de ces trois segments n'a
  jamais été chronométré ; leur somme valait mécaniquement 90 % du total.
- `context` portait `isFirstMessage: false` et `triggerNotifications: true` en constantes, et
  faisait DEUX balayages du contenu (`extractMentions` + `containsLinks`) — sur le chemin de
  l'ACK, celui que l'architecture garde délibérément libre de tout effet de bord (« Every
  post-save side effect […] is therefore moved OFF the ACK path »).

**Rien de tout cela n'atteignait un client.** Les TROIS appelants de `handleMessage`
(`MessageHandler.handleMessageSend`, `handleMessageSendWithAttachments`,
`MeeshySocketIOManager.handleAgentResponse`) n'utilisent que `success`, `data` et `error` — et
`MessageHandler._sendResponse` remplace même la réponse entière par `buildMessageAckData(data)`
avant de rappeler le client. Le bloc était calculé puis jeté, à chaque message.

**Décision** : `MessageResponse` ne porte plus de `metadata`. `createSuccessResponse` devient
synchrone et ne fait plus que normaliser `senderId` (Participant.id → User.id) ; `createErrorResponse`
rend `{success, error, data: null}`. Le compte des accusés faisant autorité reste là où il se
calcule — `MessageReadStatusService.getConversationReadStatuses` — et sort par
`GET /conversations/:id/messages` et `GET /messages/:messageId`. **Si l'ACK doit un jour porter un
statut de livraison, il viendra de là, jamais d'une constante.**

**Alternatives rejetées** :
- *Câbler les vrais compteurs sur l'ACK* : coûterait une lecture DB supplémentaire sur le chemin
  le plus chaud du produit, pour une valeur qu'aucun client ne demande — et que tous obtiennent
  déjà par la route de messages et les events `read-status:updated`.
- *Garder `metadata` en ne corrigeant que `deliveryStatus`* : laisserait cinq sections sans lecteur,
  donc cinq occasions de re-diverger (cycle 100 : un champ sans écrivain ne reste pas neutre).

**Conséquences** : charge utile client **inchangée** (le transport ne transmettait déjà rien de ce
bloc) ; deux balayages de contenu et un objet à six branches en moins par message envoyé ; les
types `MessageResponseMetadata`, `DeliveryStatus` (local), `RecipientDeliveryDetail`,
`PerformanceMetrics`, `MessageContext`, `DebugInfo`, `MessageBroadcastPayload` et
`MessageBroadcastEvent` disparaissent de `packages/shared/types/messaging.ts`, faute de tout
producteur comme de tout consommateur.
