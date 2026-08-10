---
'@meeshy/gateway': patch
---

Le rappel d'un message retire les notifications qu'il avait produites, et l'annonce aux appareils.

Le cycle précédent a sorti le message rappelé de l'inbox de mentions ; il a laissé derrière lui
l'inbox de notifications, qui porte le MÊME contenu par une autre voie. `Notification.content` et
`metadata.messagePreview` sont un extrait du message, **dénormalisé à la création** : aucun filtre à
la lecture ne pouvait les rattraper, la ligne ne relit jamais le message dont elle détient une
copie. « Bob vous a mentionné · <le texte qu'il regrette> » restait donc lisible, avec l'identité de
l'auteur et le titre de la conversation, dans la liste de notifications de chaque destinataire —
mention, réponse et réaction confondues — sans date de fin.

Rien ne l'en retirait : le `onDelete: Cascade` de `Notification.message` demande une suppression
**physique**, et le retrait doux ne bascule que `deletedAt`. Même mécanisme que les `TrackingLink`
du cycle 43 et les `Mention` du cycle 46.

Le retrait vit dans `applyMessageRemovalEffects` — l'unité que les trois écrivains interactifs de
`deletedAt` traversent — et porte sur `Notification.messageId`, la colonne que `createNotification`
renseigne depuis `context.messageId` pour les cinq types ancrés sur un message. La moitié volatile
(`notification:deleted` par ligne, un `notification:counts` par destinataire) est déléguée au
`NotificationService` partagé via un port étroit : l'écriture durable ne dépend jamais du câblage
socket, seule l'annonce est optionnelle.
