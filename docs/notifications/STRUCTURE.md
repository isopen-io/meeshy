# Structure du Système de Notifications

## Vue d'ensemble

Le système de notifications utilise une architecture groupée logiquement pour une meilleure organisation et évolutivité. Cette structure sépare clairement les différentes préoccupations d'une notification.

## Structure Complète

```typescript
interface Notification {
  // CORE - Identité de base
  id: string;
  userId: string;
  type: NotificationType;
  priority: NotificationPriority;

  // CONTENT - Message affiché
  content: string;

  // ACTOR - Qui a déclenché la notification
  actor?: NotificationActor;

  // CONTEXT - Où c'est arrivé
  context: NotificationContext;

  // METADATA - Données spécifiques au type
  metadata: NotificationMetadata;

  // STATE - État de lecture
  state: NotificationState;

  // DELIVERY - Suivi multi-canal
  delivery: NotificationDelivery;
}
```

## Groupes Détaillés

### 1. CORE - Identité

```typescript
{
  id: string;           // ID unique MongoDB
  userId: string;       // Destinataire
  type: NotificationType;  // Type de notification
  priority: NotificationPriority;  // Urgence
}
```

**Types disponibles:**
- Messages: `new_message`, `message_reply`, `user_mentioned`, `message_reaction`
- Conversations: `new_conversation_direct`, `new_conversation_group`, `member_joined`, `member_left`
- Contacts: `contact_request`, `contact_accepted`, `friend_request`, `friend_accepted`
- Appels: `missed_call`, `incoming_call`, `call_ended`
- Système: `system`, `maintenance`, `update_available`

**Priorités:**
- `low`: Informations non urgentes
- `normal`: Notifications standard (défaut)
- `high`: Important, requiert attention
- `urgent`: Critique, action immédiate

### 2. CONTENT - Message

```typescript
{
  content: string;  // Texte de la notification (aperçu du message, description, etc.)
}
```

**Important:** Le `title` n'est PAS stocké en base de données. Il est construit dynamiquement côté frontend via i18n en fonction du `type`, `actor`, `context` et `metadata`.

### 3. ACTOR - Qui a déclenché

```typescript
interface NotificationActor {
  id: string;
  username: string;
  displayName?: string | null;
  avatar?: string | null;
}
```

**Exemples:**
```json
{
  "actor": {
    "id": "user_123",
    "username": "alice",
    "displayName": "Alice Martin",
    "avatar": "https://cdn.meeshy.com/avatars/alice.jpg"
  }
}
```

**Quand actor est null:**
- Notifications système
- Événements automatiques
- Actions sans utilisateur identifiable

### 4. CONTEXT - Où c'est arrivé

```typescript
interface NotificationContext {
  conversationId?: string;
  conversationTitle?: string;
  conversationType?: 'direct' | 'group' | 'public' | 'global' | 'broadcast';
  messageId?: string;
  originalMessageId?: string;  // Pour les réponses
  callSessionId?: string;
  friendRequestId?: string;
  reactionId?: string;
}
```

**Exemples:**

Pour un message:
```json
{
  "context": {
    "conversationId": "conv_789",
    "conversationTitle": "Équipe Dev",
    "conversationType": "group",
    "messageId": "msg_456"
  }
}
```

Pour une mention:
```json
{
  "context": {
    "conversationId": "conv_789",
    "messageId": "msg_456",
    "originalMessageId": "msg_123"
  }
}
```

Pour un appel manqué:
```json
{
  "context": {
    "conversationId": "conv_789",
    "callSessionId": "call_999"
  }
}
```

### 5. METADATA - Données type-spécifiques

Le champ `metadata` utilise des **discriminated unions** TypeScript pour garantir la cohérence des données selon le type de notification.

```typescript
type NotificationMetadata =
  | MessageNotificationMetadata
  | MentionNotificationMetadata
  | ReactionNotificationMetadata
  | CallNotificationMetadata
  | FriendRequestNotificationMetadata
  | MemberEventNotificationMetadata
  | SystemNotificationMetadata;
```

**Exemples par type:**

**Message:**
```json
{
  "type": "new_message",
  "metadata": {
    "attachments": [
      {
        "id": "att_1",
        "filename": "photo.jpg",
        "mimeType": "image/jpeg",
        "size": 245678
      }
    ]
  }
}
```

**Mention:**
```json
{
  "type": "user_mentioned",
  "metadata": {
    "mentionedAt": 45,  // Position dans le texte
    "mentionContext": "Merci @alice pour ton aide"
  }
}
```

**Réaction:**
```json
{
  "type": "message_reaction",
  "metadata": {
    "reactionEmoji": "❤️",
    "messagePreview": "Super idée!"
  }
}
```

**Appel:**
```json
{
  "type": "missed_call",
  "metadata": {
    "callType": "video",
    "duration": null,  // null car manqué
    "participants": ["user_123", "user_456"]
  }
}
```

**Invitation groupe:**
```json
{
  "type": "new_conversation_group",
  "metadata": {
    "isMember": false,  // Pas encore membre
    "action": "join_conversation"  // Action suggérée
  }
}
```

### 6. STATE - État de lecture

```typescript
interface NotificationState {
  isRead: boolean;
  readAt: Date | null;
  createdAt: Date;
  expiresAt?: Date;  // Optionnel, pour notifications temporaires
}
```

**Exemple:**
```json
{
  "state": {
    "isRead": false,
    "readAt": null,
    "createdAt": "2025-01-28T10:30:00.000Z",
    "expiresAt": "2025-02-28T10:30:00.000Z"
  }
}
```

### 7. DELIVERY - Suivi multi-canal

```typescript
interface NotificationDelivery {
  emailSent: boolean;
  pushSent: boolean;
}
```

**Exemple:**
```json
{
  "delivery": {
    "emailSent": true,
    "pushSent": false
  }
}
```

## Exemples Complets

### Notification: Nouveau Message

```json
{
  "id": "notif_abc123",
  "userId": "user_789",
  "type": "new_message",
  "priority": "normal",
  "content": "Salut! Comment vas-tu?",

  "actor": {
    "id": "user_456",
    "username": "bob",
    "displayName": "Bob Dupont",
    "avatar": "https://cdn.meeshy.com/avatars/bob.jpg"
  },

  "context": {
    "conversationId": "conv_123",
    "conversationTitle": "Bob Dupont",
    "conversationType": "direct",
    "messageId": "msg_789"
  },

  "metadata": {
    "attachments": []
  },

  "state": {
    "isRead": false,
    "readAt": null,
    "createdAt": "2025-01-28T10:30:00.000Z"
  },

  "delivery": {
    "emailSent": false,
    "pushSent": true
  }
}
```

### Notification: Mention dans Groupe

```json
{
  "id": "notif_xyz789",
  "userId": "user_123",
  "type": "user_mentioned",
  "priority": "high",
  "content": "Merci @alice pour ton aide sur le projet!",

  "actor": {
    "id": "user_456",
    "username": "charlie",
    "displayName": "Charlie Martin",
    "avatar": "https://cdn.meeshy.com/avatars/charlie.jpg"
  },

  "context": {
    "conversationId": "conv_789",
    "conversationTitle": "Projet Alpha",
    "conversationType": "group",
    "messageId": "msg_999",
    "originalMessageId": "msg_888"
  },

  "metadata": {
    "mentionedAt": 7,
    "mentionContext": "Merci @alice pour ton aide sur le projet!"
  },

  "state": {
    "isRead": false,
    "readAt": null,
    "createdAt": "2025-01-28T14:15:00.000Z"
  },

  "delivery": {
    "emailSent": true,
    "pushSent": true
  }
}
```

### Notification: Appel Manqué

```json
{
  "id": "notif_call456",
  "userId": "user_123",
  "type": "missed_call",
  "priority": "high",
  "content": "Appel vidéo manqué",

  "actor": {
    "id": "user_789",
    "username": "diane",
    "displayName": "Diane Rousseau",
    "avatar": "https://cdn.meeshy.com/avatars/diane.jpg"
  },

  "context": {
    "conversationId": "conv_456",
    "conversationType": "direct",
    "callSessionId": "call_123"
  },

  "metadata": {
    "callType": "video",
    "duration": null,
    "participants": ["user_789", "user_123"]
  },

  "state": {
    "isRead": false,
    "readAt": null,
    "createdAt": "2025-01-28T16:45:00.000Z"
  },

  "delivery": {
    "emailSent": false,
    "pushSent": true
  }
}
```

### Notification: Système

```json
{
  "id": "notif_sys999",
  "userId": "user_123",
  "type": "system",
  "priority": "normal",
  "content": "Une nouvelle fonctionnalité de traduction automatique est disponible!",

  "actor": null,

  "context": {},

  "metadata": {
    "category": "feature_announcement",
    "link": "/settings/translation",
    "icon": "🌐"
  },

  "state": {
    "isRead": false,
    "readAt": null,
    "createdAt": "2025-01-28T09:00:00.000Z",
    "expiresAt": "2025-02-28T09:00:00.000Z"
  },

  "delivery": {
    "emailSent": false,
    "pushSent": false
  }
}
```

## Construction Dynamique du Title

Le `title` n'est **jamais stocké en base de données**. Il est construit dynamiquement côté frontend via i18n.

**Pourquoi?**
- ✅ Support multilingue automatique
- ✅ Mise à jour facile des textes
- ✅ Cohérence de l'affichage
- ✅ Réduction de l'espace en DB

**Comment?**

```typescript
// Frontend: apps/web/utils/notification-helpers.ts

function buildNotificationTitle(
  notification: Notification,
  t: TranslateFunction
): string {
  const actorName = getActorDisplayName(notification.actor);

  switch (notification.type) {
    case 'new_message':
      return t('titles.newMessage', { sender: actorName });
      // FR: "Message de Alice"
      // EN: "Message from Alice"

    case 'user_mentioned':
      return t('titles.mentioned', { sender: actorName });
      // FR: "Alice vous a mentionné"
      // EN: "Alice mentioned you"

    case 'message_reaction':
      const emoji = notification.metadata?.reactionEmoji || '❤️';
      return t('titles.reaction', { sender: actorName, emoji });
      // FR: "Alice a réagi avec ❤️"
      // EN: "Alice reacted with ❤️"

    // ... autres types
  }
}
```

**Fichiers i18n:**
```json
// locales/fr/notifications.json
{
  "titles": {
    "newMessage": "Message de {sender}",
    "mentioned": "{sender} vous a mentionné",
    "reaction": "{sender} a réagi avec {emoji}",
    "missedCall": "Appel {type} manqué",
    "contactRequest": "{sender} veut se connecter"
  }
}
```

## Base de Données (MongoDB)

### Schema Prisma

```prisma
model Notification {
  id       String   @id @default(auto()) @map("_id") @db.ObjectId
  userId   String   @db.ObjectId
  type     String
  content  String
  priority String   @default("normal")

  // Groupes (Json)
  actor    Json?
  context  Json
  metadata Json

  // State
  isRead    Boolean   @default(false)
  readAt    DateTime?
  expiresAt DateTime?
  createdAt DateTime  @default(now())

  // Delivery
  delivery Json

  user User @relation(fields: [userId], references: [id])

  // Indexes optimisés
  @@index([userId, isRead])
  @@index([userId, type])
  @@index([userId, createdAt(sort: Desc)])
  @@index([createdAt])
  @@index([type])
}
```

### Indexes

1. **`[userId, isRead]`**: Requêtes de notifications non lues
2. **`[userId, type]`**: Filtrage par type
3. **`[userId, createdAt(sort: Desc)]`**: Tri chronologique
4. **`[createdAt]`**: Nettoyage des anciennes notifications
5. **`[type]`**: Statistiques par type

## API Endpoints

### GET /notifications
Récupère les notifications paginées avec filtres

**Query params:**
- `offset`: Offset de pagination (défaut: 0)
- `limit`: Nombre de résultats (défaut: 50, max: 100)
- `type`: Filtrer par type
- `unreadOnly`: Seulement les non lues (boolean)
- `priority`: Filtrer par priorité
- `conversationId`: Filtrer par conversation
- `sortBy`: Champ de tri (défaut: createdAt)
- `sortOrder`: Ordre (asc/desc, défaut: desc)

**Response:**
```json
{
  "success": true,
  "data": [/* Notification[] */],
  "pagination": {
    "offset": 0,
    "limit": 50,
    "total": 123,
    "hasMore": true
  },
  "unreadCount": 45
}
```

### GET /notifications/unread-count
Compte les notifications non lues

**Response:**
```json
{
  "success": true,
  "count": 45
}
```

### POST /notifications/:id/read
Marque une notification comme lue

**Response:**
```json
{
  "success": true,
  "data": {/* Notification */}
}
```

### POST /notifications/read-all
Marque toutes les notifications comme lues

**Response:**
```json
{
  "success": true,
  "count": 12
}
```

### DELETE /notifications/:id
Supprime une notification

**Response:**
```json
{
  "success": true
}
```

## Socket.IO - Temps Réel

### Événements émis par le serveur

**`notification:new`**: Nouvelle notification
```typescript
{
  ...Notification  // Structure complète
}
```

### Événements attendus par le client

Actuellement, le client écoute mais le serveur n'émet pas encore:
- `notification:read`: Notification marquée comme lue ailleurs
- `notification:deleted`: Notification supprimée ailleurs
- `notification:counts`: Mise à jour des compteurs

## Type Guards

Utiliser les type guards pour typer correctement le metadata:

```typescript
import {
  isMessageNotification,
  isMentionNotification,
  isReactionNotification,
  isCallNotification
} from '@meeshy/shared/types/notification';

if (isMessageNotification(notification)) {
  // notification.metadata est typé comme MessageNotificationMetadata
  const attachments = notification.metadata.attachments;
}

if (isReactionNotification(notification)) {
  // notification.metadata est typé comme ReactionNotificationMetadata
  const emoji = notification.metadata.reactionEmoji;
}
```

## Bonnes Pratiques

### 1. Création de Notifications

```typescript
// ✅ BON: Utiliser NotificationService
await notificationService.createMessageNotification({
  userId: recipientId,
  senderId: currentUserId,
  messageId: message.id,
  conversationId: conversation.id,
  preview: message.content
});

// ❌ MAUVAIS: Créer directement en DB
await prisma.notification.create({
  data: { /* ... */ }
});
```

### 2. Lecture de Notifications

```typescript
// ✅ BON: Utiliser les champs groupés
const actorName = notification.actor?.displayName || notification.actor?.username;
const conversationId = notification.context.conversationId;
const attachments = notification.metadata.attachments;

// ❌ MAUVAIS: Accès plat
const actorName = notification.senderDisplayName;  // N'existe pas
const conversationId = notification.conversationId;  // N'existe pas
```

### 3. Affichage du Title

```typescript
// ✅ BON: Utiliser buildNotificationTitle avec i18n
const title = buildNotificationTitle(notification, t);

// ❌ MAUVAIS: Utiliser notification.title
const title = notification.title;  // N'existe pas en DB
```

### 4. Type Guards

```typescript
// ✅ BON: Utiliser les type guards
if (isMessageNotification(notification)) {
  // metadata est correctement typé
  const attachments = notification.metadata.attachments;
}

// ❌ MAUVAIS: Cast manuel
const attachments = (notification.metadata as any).attachments;
```

## Performance

### Pagination

Utiliser `offset` et `limit` pour charger progressivement:

```typescript
// Première page
const page1 = await fetchNotifications({ offset: 0, limit: 50 });

// Page suivante
const page2 = await fetchNotifications({ offset: 50, limit: 50 });
```

### Filtrage

Utiliser les filtres serveur plutôt que filtrer côté client:

```typescript
// ✅ BON
const unread = await fetchNotifications({ unreadOnly: true });

// ❌ MAUVAIS
const all = await fetchNotifications();
const unread = all.filter(n => !n.state.isRead);
```

### Indexes

Les indexes MongoDB sont optimisés pour:
- Tri chronologique inversé (plus récentes d'abord)
- Filtrage par utilisateur + état de lecture
- Filtrage par type

## Évolution Future

### Fonctionnalités Prévues

1. **Groupement de Notifications**
   - Grouper plusieurs notifications similaires
   - Ex: "Alice, Bob et 3 autres ont réagi à votre message"

2. **Notifications Riches**
   - Actions rapides (accepter/refuser)
   - Prévisualisation d'images
   - Boutons d'action intégrés

3. **Préférences Avancées**
   - Personnalisation par type
   - Horaires silencieux
   - Fréquence de digest email

4. **Synchronisation Multi-Device**
   - Marquer lu sur un appareil = lu partout
   - Événements Socket.IO bidirectionnels
   - État partagé temps réel

5. **Analytics**
   - Taux d'ouverture
   - Temps de réponse
   - Engagement par type
