# Système de Notifications Backend - Meeshy

Documentation technique complète du système de notifications backend implémenté pour Meeshy.

## Table des Matières

1. [Vue d'Ensemble](#vue-densemble)
2. [Architecture](#architecture)
3. [Modèles de Données](#modèles-de-données)
4. [NotificationService](#notificationservice)
5. [Types de Notifications](#types-de-notifications)
6. [API REST](#api-rest)
7. [Socket.IO Temps Réel](#socketio-temps-réel)
8. [Préférences Utilisateur](#préférences-utilisateur)
9. [Sécurité et Rate Limiting](#sécurité-et-rate-limiting)
10. [Intégration](#intégration)
11. [Tests](#tests)

---

## Vue d'Ensemble

Le système de notifications de Meeshy est un système complet et extensible qui supporte **11 types de notifications** différents, avec gestion des préférences utilisateur, notifications en temps réel via Socket.IO, et une API REST complète.

### Fonctionnalités Principales

- **11 types de notifications** : messages, réponses, mentions, réactions, appels, contacts, membres, système
- **Notifications en temps réel** : via Socket.IO pour une expérience utilisateur fluide
- **Préférences granulaires** : chaque utilisateur peut configurer ses préférences par type
- **Mode Ne Pas Déranger (DND)** : avec plages horaires configurables
- **Mute par conversation** : silencer des conversations spécifiques
- **Anti-spam** : rate limiting intégré (max 5 mentions/minute)
- **Formatage intelligent** : aperçus de messages, gestion des attachments, timestamps relatifs
- **Batch processing** : création optimisée de notifications multiples
- **Sécurité** : validation Zod, sanitization XSS, permissions strictes

---

## Architecture

### Stack Technique

- **Runtime** : Node.js avec TypeScript
- **Framework** : Fastify pour l'API REST
- **Base de Données** : MongoDB avec Prisma ORM
- **Temps Réel** : Socket.IO
- **Validation** : Zod
- **Logging** : Winston/Pino

### Diagramme de Flux

```
┌─────────────┐
│   Client    │
│  (Frontend) │
└──────┬──────┘
       │
       │ HTTP REST / WebSocket
       │
┌──────▼────────────────────────────────┐
│     Gateway API (Fastify)             │
│  ┌──────────────────────────────────┐ │
│  │  NotificationService             │ │
│  │  - createXxxNotification()       │ │
│  │  - markAsRead()                  │ │
│  │  - getNotifications()            │ │
│  └──────────────────────────────────┘ │
│  ┌──────────────────────────────────┐ │
│  │  Socket.IO Handler               │ │
│  │  - Emit 'notification'           │ │
│  │  - Listen 'mark_read'            │ │
│  └──────────────────────────────────┘ │
└───────────────┬───────────────────────┘
                │
       ┌────────┴────────┐
       │                 │
┌──────▼──────┐   ┌──────▼────────┐
│   MongoDB   │   │   Socket.IO   │
│   (Prisma)  │   │   Connections │
└─────────────┘   └───────────────┘
```

---

## Modèles de Données

### Notification Model

```prisma
model Notification {
  id              String    @id @default(auto()) @map("_id") @db.ObjectId
  userId          String    @db.ObjectId
  type            String    // Types: new_message, message_reply, etc.
  title           String
  content         String
  data            String?   // JSON stringifié
  priority        String    @default("normal")
  isRead          Boolean   @default(false)
  readAt          DateTime? // Timestamp de lecture
  emailSent       Boolean   @default(false)
  pushSent        Boolean   @default(false)
  expiresAt       DateTime?
  createdAt       DateTime  @default(now())

  // Informations de l'expéditeur
  senderId        String?   @db.ObjectId
  senderUsername  String?
  senderAvatar    String?
  messagePreview  String?

  // Références pour navigation
  conversationId  String?   @db.ObjectId
  messageId       String?   @db.ObjectId
  callSessionId   String?   @db.ObjectId
  friendRequestId String?   @db.ObjectId
  reactionId      String?   @db.ObjectId

  // Relations
  user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  message         Message?  @relation("NotificationMessage", fields: [messageId], references: [id], onDelete: Cascade)
  reaction        Reaction? @relation("NotificationReaction", fields: [reactionId], references: [id], onDelete: Cascade)

  // Index optimisés
  @@index([userId, isRead])
  @@index([userId, type])
  @@index([userId, createdAt])
  @@index([conversationId])
  @@index([messageId])
  @@index([expiresAt])
  @@index([readAt])
  @@index([friendRequestId])
  @@index([reactionId])
}
```

### NotificationPreference Model

```prisma
model NotificationPreference {
  id                    String   @id @default(auto()) @map("_id") @db.ObjectId
  userId                String   @unique @db.ObjectId

  // Canaux
  pushEnabled           Boolean  @default(true)
  emailEnabled          Boolean  @default(true)
  soundEnabled          Boolean  @default(true)

  // Préférences par type
  newMessageEnabled     Boolean  @default(true)
  replyEnabled          Boolean  @default(true)
  mentionEnabled        Boolean  @default(true)
  reactionEnabled       Boolean  @default(true)
  missedCallEnabled     Boolean  @default(true)
  systemEnabled         Boolean  @default(true)
  conversationEnabled   Boolean  @default(true)
  contactRequestEnabled Boolean  @default(true)
  memberJoinedEnabled   Boolean  @default(false)

  // Do Not Disturb
  dndEnabled            Boolean  @default(false)
  dndStartTime          String?  // Format: "22:00"
  dndEndTime            String?  // Format: "08:00"

  // Mute par conversation
  mutedConversations    String[] @default([]) @db.ObjectId

  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  user                  User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

---

## NotificationService

### Méthodes Principales

#### 1. createNotification()

Méthode de base pour créer une notification.

```typescript
await notificationService.createNotification({
  userId: 'user123',
  type: 'new_message',
  title: 'Nouveau message de Alice',
  content: 'Hello! Comment ça va?',
  priority: 'normal',
  senderId: 'alice123',
  senderUsername: 'alice',
  senderAvatar: 'https://...',
  conversationId: 'conv456',
  messageId: 'msg789',
  data: {
    conversationTitle: 'Chat Alice',
    action: 'view_message'
  }
});
```

#### 2. createReplyNotification()

Notification quand quelqu'un répond à votre message.

```typescript
await notificationService.createReplyNotification({
  originalMessageAuthorId: 'user123',
  replierId: 'bob456',
  replierUsername: 'bob',
  replyContent: 'Je suis d\'accord!',
  conversationId: 'conv789',
  originalMessageId: 'msg111',
  replyMessageId: 'msg222',
  attachments: [
    {
      id: 'att1',
      filename: 'photo.jpg',
      mimeType: 'image/jpeg',
      fileSize: 123456
    }
  ]
});
```

#### 3. createMentionNotificationsBatch()

Création optimisée de notifications de mention (batch).

```typescript
const count = await notificationService.createMentionNotificationsBatch(
  ['user1', 'user2', 'user3'], // Utilisateurs mentionnés
  {
    senderId: 'alice',
    senderUsername: 'Alice',
    messageContent: '@user1 @user2 @user3 regardez ça!',
    conversationId: 'conv456',
    messageId: 'msg789'
  },
  ['user1', 'user2', 'user3', 'alice'] // Membres de la conversation
);
```

#### 4. createReactionNotification()

Notification quand quelqu'un réagit à votre message.

```typescript
await notificationService.createReactionNotification({
  messageAuthorId: 'user123',
  reactorId: 'bob456',
  reactorUsername: 'bob',
  emoji: '❤️',
  messageContent: 'Super idée!',
  conversationId: 'conv789',
  messageId: 'msg111',
  reactionId: 'react222'
});
```

#### 5. createContactRequestNotification()

Notification de demande de contact.

```typescript
await notificationService.createContactRequestNotification({
  recipientId: 'user123',
  requesterId: 'alice456',
  requesterUsername: 'alice',
  message: 'Salut! On peut se connecter?',
  friendRequestId: 'fr789'
});
```

#### 6. createContactAcceptedNotification()

Notification d'acceptation de contact.

```typescript
await notificationService.createContactAcceptedNotification({
  requesterId: 'user123',
  accepterId: 'alice456',
  accepterUsername: 'alice',
  conversationId: 'conv_new_789'
});
```

#### 7. createMemberJoinedNotification()

Notification quand un membre rejoint un groupe (envoyée aux admins).

```typescript
const count = await notificationService.createMemberJoinedNotification({
  groupId: 'group123',
  groupTitle: 'Équipe Dev',
  newMemberId: 'newbie456',
  newMemberUsername: 'newbie',
  adminIds: ['admin1', 'admin2'],
  joinMethod: 'via_link'
});
```

#### 8. createDirectConversationNotification()

Notification de nouvelle conversation directe.

```typescript
await notificationService.createDirectConversationNotification({
  invitedUserId: 'user123',
  inviterId: 'alice456',
  inviterUsername: 'alice',
  conversationId: 'conv789'
});
```

#### 9. createGroupConversationNotification()

Notification d'invitation à un groupe.

```typescript
await notificationService.createGroupConversationNotification({
  invitedUserId: 'user123',
  inviterId: 'alice456',
  inviterUsername: 'alice',
  conversationId: 'group789',
  conversationTitle: 'Équipe Marketing'
});
```

#### 10. createMissedCallNotification()

Notification d'appel manqué.

```typescript
await notificationService.createMissedCallNotification({
  recipientId: 'user123',
  callerId: 'bob456',
  callerUsername: 'bob',
  conversationId: 'conv789',
  callSessionId: 'call111',
  callType: 'video'
});
```

#### 11. createSystemNotification()

Notification système (maintenance, annonces, etc.).

```typescript
await notificationService.createSystemNotification({
  userId: 'user123',
  title: 'Maintenance programmée',
  content: 'Le service sera indisponible demain de 2h à 4h',
  priority: 'high',
  systemType: 'maintenance',
  expiresAt: new Date('2025-12-31')
});
```

### Méthodes de Gestion

#### markAsRead()

```typescript
await notificationService.markAsRead('notif123', 'user456');
```

#### markAllAsRead()

```typescript
await notificationService.markAllAsRead('user456');
```

#### deleteNotification()

```typescript
await notificationService.deleteNotification('notif123', 'user456');
```

#### getUnreadCount()

```typescript
const count = await notificationService.getUnreadCount('user456');
```

#### getNotificationStats()

```typescript
const stats = await notificationService.getNotificationStats('user456');
// Returns:
// {
//   total: 150,
//   unread: 12,
//   byType: {
//     new_message: 80,
//     message_reply: 30,
//     user_mentioned: 15,
//     ...
//   }
// }
```

---

## Types de Notifications

### 1. NEW_MESSAGE - "Message de XXXX"

**Déclencheur** : Nouveau message dans une conversation

**Priorité** : NORMAL

**Conditions** :
- Utilisateur n'est pas l'expéditeur
- Membre actif de la conversation
- `newMessageEnabled` = true
- Conversation non muted

**Exemple** :
```
Titre: "Nouveau message de Alice"
Contenu: "Hello! Comment ça va aujourd'hui? 😊"
```

### 2. MESSAGE_REPLY - "Réponse de XXXX"

**Déclencheur** : Quelqu'un répond à votre message

**Priorité** : NORMAL

**Conditions** :
- Utilisateur n'est pas celui qui répond
- `replyEnabled` = true

**Exemple** :
```
Titre: "Réponse de Bob"
Contenu: "Je suis d'accord avec toi! 👍"
```

### 3. USER_MENTIONED - "XXXX vous a cité"

**Déclencheur** : Mention avec @username

**Priorité** : NORMAL

**Rate Limiting** : Max 5 mentions/minute par sender

**Conditions** :
- `mentionEnabled` = true
- Rate limit non dépassé

**Exemple** :
```
Titre: "Alice vous a mentionné"
Contenu: "@john peux-tu vérifier le bug?"
```

### 4. MESSAGE_REACTION - "XXXX a réagi"

**Déclencheur** : Réaction emoji sur votre message

**Priorité** : LOW

**Conditions** :
- Utilisateur n'est pas celui qui réagit
- `reactionEnabled` = true

**Exemple** :
```
Titre: "Bob a réagi à votre message"
Contenu: "❤️ Super idée pour le projet!"
```

### 5. CONTACT_REQUEST - "XXXX veut se connecter"

**Déclencheur** : Demande de contact

**Priorité** : HIGH

**Conditions** :
- `contactRequestEnabled` = true

**Exemple** :
```
Titre: "Alice veut se connecter"
Contenu: "Salut! On s'est rencontré à la conf hier!"
```

### 6. CONTACT_ACCEPTED - "XXXX accepte"

**Déclencheur** : Acceptation de contact

**Priorité** : NORMAL

**Exemple** :
```
Titre: "Alice accepte la connexion"
Contenu: "Alice a accepté votre invitation. Vous pouvez maintenant discuter."
```

### 7. NEW_CONVERSATION_DIRECT - "Conversation avec XXXX"

**Déclencheur** : Nouvelle conversation 1-to-1

**Priorité** : NORMAL

**Exemple** :
```
Titre: "Nouvelle conversation avec Alice"
Contenu: "Alice a démarré une conversation avec vous"
```

### 8. NEW_CONVERSATION_GROUP - "Invitation à YYYY"

**Déclencheur** : Invitation à un groupe

**Priorité** : NORMAL

**Exemple** :
```
Titre: "Invitation à 'Équipe Marketing'"
Contenu: "Alice vous a invité à rejoindre 'Équipe Marketing'"
```

### 9. MEMBER_JOINED - "XXXX a rejoint"

**Déclencheur** : Nouveau membre dans un groupe

**Priorité** : LOW

**Destinataires** : Admins et créateur uniquement

**Conditions** :
- `memberJoinedEnabled` = true (off par défaut)

**Exemple** :
```
Titre: "Nouveau membre dans 'Équipe Dev'"
Contenu: "Bob a rejoint le groupe"
```

### 10. MISSED_CALL - "Appel manqué"

**Déclencheur** : Appel audio/vidéo manqué

**Priorité** : HIGH

**Conditions** :
- `missedCallEnabled` = true

**Exemple** :
```
Titre: "Appel vidéo manqué"
Contenu: "Appel manqué de Thomas"
```

### 11. SYSTEM - "Notification système"

**Déclencheur** : Maintenance, annonces, alertes

**Priorité** : NORMAL ou URGENT

**Conditions** :
- `systemEnabled` = true

**Exemple** :
```
Titre: "Maintenance programmée"
Contenu: "Le service sera indisponible demain de 2h à 4h"
```

---

## API REST

### Endpoints

#### GET /api/notifications

Récupérer les notifications de l'utilisateur.

**Query Parameters** :
- `page` (number, default: 1)
- `limit` (number, default: 20)
- `unread` (boolean, optional)
- `type` (string, optional)

**Response** :
```json
{
  "success": true,
  "data": {
    "notifications": [
      {
        "id": "notif123",
        "userId": "user456",
        "type": "new_message",
        "title": "Nouveau message de Alice",
        "content": "Hello!",
        "priority": "normal",
        "isRead": false,
        "createdAt": "2025-01-21T10:30:00Z",
        "senderId": "alice123",
        "senderUsername": "alice",
        "conversationId": "conv789"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "hasMore": true
    },
    "unreadCount": 12
  }
}
```

#### GET /api/notifications/unread/count

Obtenir le nombre de notifications non lues.

**Response** :
```json
{
  "success": true,
  "data": {
    "count": 12
  }
}
```

#### PATCH /api/notifications/:id/read

Marquer une notification comme lue.

**Response** :
```json
{
  "success": true,
  "message": "Notification marquée comme lue"
}
```

#### PATCH /api/notifications/read-all

Marquer toutes les notifications comme lues.

**Response** :
```json
{
  "success": true,
  "message": "Toutes les notifications marquées comme lues"
}
```

#### DELETE /api/notifications/:id

Supprimer une notification.

**Response** :
```json
{
  "success": true,
  "message": "Notification supprimée"
}
```

#### DELETE /api/notifications/read

Supprimer toutes les notifications lues.

**Response** :
```json
{
  "success": true,
  "message": "Notifications lues supprimées"
}
```

#### GET /api/notifications/stats

Obtenir les statistiques des notifications.

**Response** :
```json
{
  "success": true,
  "data": {
    "total": 150,
    "unread": 12,
    "byType": {
      "new_message": 80,
      "message_reply": 30,
      "user_mentioned": 15,
      "message_reaction": 10,
      "missed_call": 5,
      "new_conversation_group": 8,
      "system": 2
    }
  }
}
```

#### GET /api/notifications/preferences

Récupérer les préférences de notification.

**Response** :
```json
{
  "success": true,
  "data": {
    "id": "pref123",
    "userId": "user456",
    "pushEnabled": true,
    "emailEnabled": true,
    "soundEnabled": true,
    "newMessageEnabled": true,
    "replyEnabled": true,
    "mentionEnabled": true,
    "reactionEnabled": true,
    "missedCallEnabled": true,
    "systemEnabled": true,
    "conversationEnabled": true,
    "contactRequestEnabled": true,
    "memberJoinedEnabled": false,
    "dndEnabled": false,
    "dndStartTime": null,
    "dndEndTime": null,
    "mutedConversations": []
  }
}
```

#### PUT /api/notifications/preferences

Mettre à jour les préférences de notification.

**Body** :
```json
{
  "replyEnabled": false,
  "dndEnabled": true,
  "dndStartTime": "22:00",
  "dndEndTime": "08:00",
  "mutedConversations": ["conv123", "conv456"]
}
```

**Response** :
```json
{
  "success": true,
  "message": "Préférences mises à jour",
  "data": { /* updated preferences */ }
}
```

---

## Socket.IO Temps Réel

### Événements Serveur → Client

#### `notification`

Notification en temps réel envoyée à l'utilisateur.

**Payload** :
```typescript
{
  id: string;
  userId: string;
  type: string;
  title: string;
  content: string;
  priority: string;
  isRead: boolean;
  createdAt: Date;
  senderId?: string;
  senderUsername?: string;
  senderAvatar?: string;
  conversationId?: string;
  messageId?: string;
  data?: any;
}
```

**Exemple Client** :
```typescript
socket.on('notification', (notification) => {
  console.log('Nouvelle notification:', notification);
  // Afficher un toast, mettre à jour le badge, etc.
});
```

#### `notification:read`

Confirmation qu'une notification a été marquée comme lue.

#### `notification:unread_count`

Mise à jour du compteur de notifications non lues.

**Payload** :
```typescript
{
  count: number;
}
```

### Événements Client → Serveur

#### `notification:mark_read`

Marquer une notification comme lue (via Socket.IO).

**Payload** :
```typescript
{
  notificationId: string;
}
```

#### `notification:mark_all_read`

Marquer toutes les notifications comme lues.

---

## Préférences Utilisateur

### Do Not Disturb (DND)

Le mode Ne Pas Déranger permet de silencer les notifications pendant une plage horaire.

**Configuration** :
```typescript
{
  dndEnabled: true,
  dndStartTime: "22:00",  // Format HH:MM
  dndEndTime: "08:00"
}
```

**Comportement** :
- Les notifications ne sont **PAS créées** pendant la plage DND
- Exceptions : notifications `URGENT` (système critique)

### Mute par Conversation

Silencer des conversations spécifiques.

**Configuration** :
```typescript
{
  mutedConversations: ["conv123", "conv456", "conv789"]
}
```

**Comportement** :
- Aucune notification n'est créée pour ces conversations
- Vérification effectuée avant la création

### Préférences par Type

Chaque type de notification peut être activé/désactivé individuellement.

**Tableau de Compatibilité** :

| Type | Préférence | DND Respecté | Mute Conversation |
|------|-----------|--------------|-------------------|
| NEW_MESSAGE | `newMessageEnabled` | ✅ | ✅ |
| MESSAGE_REPLY | `replyEnabled` | ✅ | ✅ |
| USER_MENTIONED | `mentionEnabled` | ✅ | ✅ |
| MESSAGE_REACTION | `reactionEnabled` | ✅ | ✅ |
| CONTACT_REQUEST | `contactRequestEnabled` | ✅ | ❌ |
| CONTACT_ACCEPTED | `contactRequestEnabled` | ✅ | ❌ |
| NEW_CONVERSATION_* | `conversationEnabled` | ✅ | ❌ |
| MEMBER_JOINED | `memberJoinedEnabled` | ✅ | ✅ |
| MISSED_CALL | `missedCallEnabled` | ⚠️ | ❌ |
| SYSTEM | `systemEnabled` | ⚠️ | ❌ |

**Légende** :
- ✅ = Toujours respecté
- ⚠️ = Respecté sauf si priorité URGENT
- ❌ = Jamais respecté (notifications importantes)

---

## Sécurité et Rate Limiting

### Anti-Spam Mentions

**Limite** : Maximum 5 mentions par minute d'un sender vers un recipient

**Implémentation** :
```typescript
private recentMentions: Map<string, number[]> = new Map();
private readonly MAX_MENTIONS_PER_MINUTE = 5;
private readonly MENTION_WINDOW_MS = 60000;

private shouldCreateMentionNotification(senderId: string, recipientId: string): boolean {
  const key = `${senderId}:${recipientId}`;
  const now = Date.now();
  const cutoff = now - this.MENTION_WINDOW_MS;

  const timestamps = this.recentMentions.get(key) || [];
  const recentTimestamps = timestamps.filter(ts => ts > cutoff);

  if (recentTimestamps.length >= this.MAX_MENTIONS_PER_MINUTE) {
    logger.warn(`Rate limit exceeded: ${senderId} → ${recipientId}`);
    return false;
  }

  recentTimestamps.push(now);
  this.recentMentions.set(key, recentTimestamps);
  return true;
}
```

### Validation Zod

Toutes les entrées API sont validées avec Zod :

```typescript
const updatePreferencesSchema = z.object({
  pushEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  soundEnabled: z.boolean().optional(),
  newMessageEnabled: z.boolean().optional(),
  replyEnabled: z.boolean().optional(),
  mentionEnabled: z.boolean().optional(),
  reactionEnabled: z.boolean().optional(),
  // ... autres champs
  dndEnabled: z.boolean().optional(),
  dndStartTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  dndEndTime: z.string().regex(/^\d{2}:\d{2}$/).optional()
});
```

### Permissions

- **Lecture** : Utilisateur ne peut lire que ses propres notifications
- **Modification** : Utilisateur ne peut modifier/supprimer que ses propres notifications
- **Création** : Uniquement via services backend authentifiés

**Vérification Middleware** :
```typescript
fastify.get('/notifications/:id', {
  onRequest: [fastify.authenticate]
}, async (request, reply) => {
  const { id } = request.params;
  const { userId } = request.user;

  const notification = await prisma.notification.findFirst({
    where: { id, userId }
  });

  if (!notification) {
    return reply.status(404).send({
      success: false,
      message: 'Notification non trouvée'
    });
  }

  // ...
});
```

### Sanitization XSS

Tous les contenus texte sont sanitizés avant stockage pour prévenir les attaques XSS.

```typescript
import DOMPurify from 'isomorphic-dompurify';

const sanitizedContent = DOMPurify.sanitize(userInput);
```

---

## Intégration

### Dans MessagingService

Émettre des notifications quand un message est envoyé :

```typescript
// /gateway/src/services/MessagingService.ts

import { notificationService } from './NotificationService';

export class MessagingService {
  async sendMessage(data: SendMessageData) {
    // ... créer le message ...

    // Émettre notifications aux membres
    const members = await this.getConversationMembers(data.conversationId);

    for (const member of members) {
      if (member.userId !== data.senderId) {
        await notificationService.createMessageNotification({
          recipientId: member.userId,
          senderId: data.senderId,
          senderUsername: data.senderUsername,
          messageContent: data.content,
          conversationId: data.conversationId,
          messageId: message.id,
          attachments: data.attachments
        });
      }
    }

    // Si réponse, créer notification spécifique
    if (data.replyToId) {
      const originalMessage = await this.getMessage(data.replyToId);
      if (originalMessage && originalMessage.senderId !== data.senderId) {
        await notificationService.createReplyNotification({
          originalMessageAuthorId: originalMessage.senderId,
          replierId: data.senderId,
          replierUsername: data.senderUsername,
          replyContent: data.content,
          conversationId: data.conversationId,
          originalMessageId: data.replyToId,
          replyMessageId: message.id,
          attachments: data.attachments
        });
      }
    }

    // Extraire et notifier les mentions
    const mentions = await mentionService.extractMentions(data.content);
    if (mentions.length > 0) {
      const memberIds = members.map(m => m.userId);
      await notificationService.createMentionNotificationsBatch(
        mentions,
        {
          senderId: data.senderId,
          senderUsername: data.senderUsername,
          messageContent: data.content,
          conversationId: data.conversationId,
          messageId: message.id,
          attachments: data.attachments
        },
        memberIds
      );
    }
  }
}
```

### Dans ReactionService

Émettre des notifications quand une réaction est ajoutée :

```typescript
// /gateway/src/services/ReactionService.ts

export class ReactionService {
  async addReaction(data: AddReactionData) {
    // ... créer la réaction ...

    // Notifier l'auteur du message
    const message = await this.getMessage(data.messageId);
    if (message && message.senderId !== data.userId) {
      await notificationService.createReactionNotification({
        messageAuthorId: message.senderId,
        reactorId: data.userId,
        reactorUsername: data.username,
        emoji: data.emoji,
        messageContent: message.content,
        conversationId: message.conversationId,
        messageId: data.messageId,
        reactionId: reaction.id
      });
    }
  }
}
```

### Dans ConversationService

Émettre des notifications quand un membre rejoint :

```typescript
// /gateway/src/services/ConversationService.ts

export class ConversationService {
  async addMember(conversationId: string, newMemberId: string) {
    // ... ajouter le membre ...

    const conversation = await this.getConversation(conversationId);
    const newMember = await this.getUser(newMemberId);

    // Notifier les admins
    const adminIds = await this.getConversationAdmins(conversationId);

    await notificationService.createMemberJoinedNotification({
      groupId: conversationId,
      groupTitle: conversation.title,
      newMemberId,
      newMemberUsername: newMember.username,
      adminIds,
      joinMethod: 'invited'
    });
  }
}
```

---

## Tests

### Tests Unitaires

Exemple de tests pour NotificationService :

```typescript
// /gateway/src/__tests__/NotificationService.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NotificationService } from '../services/NotificationService';
import { PrismaClient } from '../../shared/prisma/client';

describe('NotificationService', () => {
  let notificationService: NotificationService;
  let prisma: PrismaClient;

  beforeEach(() => {
    prisma = new PrismaClient();
    notificationService = new NotificationService(prisma);
  });

  afterEach(async () => {
    await prisma.$disconnect();
  });

  describe('createNotification', () => {
    it('devrait créer une notification de base', async () => {
      const notification = await notificationService.createNotification({
        userId: 'user123',
        type: 'new_message',
        title: 'Test',
        content: 'Test content',
        priority: 'normal'
      });

      expect(notification).toBeDefined();
      expect(notification?.type).toBe('new_message');
      expect(notification?.title).toBe('Test');
    });

    it('ne devrait PAS créer de notification si DND actif', async () => {
      // Mock preferences avec DND
      await prisma.notificationPreference.create({
        data: {
          userId: 'user123',
          dndEnabled: true,
          dndStartTime: '00:00',
          dndEndTime: '23:59'
        }
      });

      const notification = await notificationService.createNotification({
        userId: 'user123',
        type: 'new_message',
        title: 'Test',
        content: 'Test'
      });

      expect(notification).toBeNull();
    });
  });

  describe('createReplyNotification', () => {
    it('devrait créer une notification de réponse', async () => {
      const notification = await notificationService.createReplyNotification({
        originalMessageAuthorId: 'user1',
        replierId: 'user2',
        replierUsername: 'User2',
        replyContent: 'Great idea!',
        conversationId: 'conv1',
        originalMessageId: 'msg1',
        replyMessageId: 'msg2'
      });

      expect(notification).toBeDefined();
      expect(notification?.type).toBe('message_reply');
      expect(notification?.title).toContain('Réponse de User2');
    });

    it('ne devrait PAS créer si on répond à soi-même', async () => {
      const notification = await notificationService.createReplyNotification({
        originalMessageAuthorId: 'user1',
        replierId: 'user1',
        replierUsername: 'User1',
        replyContent: 'Oops',
        conversationId: 'conv1',
        originalMessageId: 'msg1',
        replyMessageId: 'msg2'
      });

      expect(notification).toBeNull();
    });
  });

  describe('createMentionNotificationsBatch', () => {
    it('devrait créer des notifications pour plusieurs mentions', async () => {
      const count = await notificationService.createMentionNotificationsBatch(
        ['user1', 'user2', 'user3'],
        {
          senderId: 'alice',
          senderUsername: 'Alice',
          messageContent: '@user1 @user2 @user3 hello!',
          conversationId: 'conv1',
          messageId: 'msg1'
        },
        ['user1', 'user2', 'user3', 'alice']
      );

      expect(count).toBe(3);
    });

    it('devrait respecter le rate limiting', async () => {
      // Créer 5 notifications (limite)
      for (let i = 0; i < 5; i++) {
        await notificationService.createMentionNotificationsBatch(
          ['victim'],
          {
            senderId: 'spammer',
            senderUsername: 'Spammer',
            messageContent: '@victim spam',
            conversationId: 'conv1',
            messageId: `msg${i}`
          },
          ['victim', 'spammer']
        );
      }

      // La 6ème doit être bloquée
      const count = await notificationService.createMentionNotificationsBatch(
        ['victim'],
        {
          senderId: 'spammer',
          senderUsername: 'Spammer',
          messageContent: '@victim more spam',
          conversationId: 'conv1',
          messageId: 'msg6'
        },
        ['victim', 'spammer']
      });

      expect(count).toBe(0); // Bloqué
    });
  });

  describe('markAsRead', () => {
    it('devrait marquer une notification comme lue', async () => {
      const notification = await notificationService.createNotification({
        userId: 'user123',
        type: 'new_message',
        title: 'Test',
        content: 'Test'
      });

      const result = await notificationService.markAsRead(
        notification!.id,
        'user123'
      );

      expect(result).toBe(true);

      const updated = await prisma.notification.findUnique({
        where: { id: notification!.id }
      });

      expect(updated?.isRead).toBe(true);
      expect(updated?.readAt).toBeDefined();
    });
  });

  describe('getNotificationStats', () => {
    it('devrait retourner les statistiques correctes', async () => {
      // Créer plusieurs notifications de types différents
      await notificationService.createNotification({
        userId: 'user123',
        type: 'new_message',
        title: 'Test',
        content: 'Test'
      });

      await notificationService.createNotification({
        userId: 'user123',
        type: 'message_reply',
        title: 'Test',
        content: 'Test'
      });

      const stats = await notificationService.getNotificationStats('user123');

      expect(stats.total).toBeGreaterThan(0);
      expect(stats.unread).toBeGreaterThan(0);
      expect(stats.byType).toHaveProperty('new_message');
      expect(stats.byType).toHaveProperty('message_reply');
    });
  });
});
```

### Lancer les Tests

```bash
# Tests unitaires
cd gateway
npm test

# Tests avec coverage
npm run test:coverage

# Tests en mode watch
npm run test:watch
```

---

## Résumé de l'Implémentation

### Fichiers Créés/Modifiés

1. **`/gateway/shared/prisma/schema.prisma`**
   - Ajout de champs `readAt`, `friendRequestId`, `reactionId` au modèle `Notification`
   - Ajout de préférences `replyEnabled`, `mentionEnabled`, `reactionEnabled`, `contactRequestEnabled`, `memberJoinedEnabled`, `mutedConversations` au modèle `NotificationPreference`
   - Ajout de la relation `notifications` au modèle `Reaction`
   - Ajout d'index optimisés

2. **`/gateway/shared/types/notification.ts`** (NOUVEAU)
   - Définition de tous les enums et types TypeScript
   - `NotificationType`, `NotificationPriority`
   - Interfaces complètes pour toutes les données

3. **`/gateway/src/services/NotificationService.ts`** (ÉTENDU)
   - Ajout de 8 nouvelles méthodes de création de notifications
   - Ajout de méthodes helper privées
   - Mise à jour de `shouldSendNotification()` pour supporter les nouveaux types
   - Ajout de `getNotificationStats()` et `deleteAllReadNotifications()`

4. **Client Prisma** généré avec les nouveaux schémas

### Prochaines Étapes

Pour compléter l'implémentation :

1. ✅ **Schéma Prisma** - Complété
2. ✅ **Types TypeScript** - Complétés
3. ✅ **NotificationService** - Complété
4. ⏳ **NotificationEventsHandler** - À implémenter (Socket.IO)
5. ⏳ **Routes API** - À mettre à jour avec nouveaux endpoints
6. ⏳ **Intégration Services** - À intégrer dans MessagingService, etc.
7. ⏳ **Schémas Zod** - À créer pour validation complète
8. ⏳ **Tests** - À écrire (unitaires + intégration)

---

## Support

Pour toute question ou problème :
- Documentation architecture : `/NOTIFICATION_SYSTEM_ARCHITECTURE.md`
- Référence des types : `/NOTIFICATION_TYPES_REFERENCE.md`
- Guide de migration : `/NOTIFICATION_MIGRATION_GUIDE.md`

---

**Version** : 2.0
**Dernière mise à jour** : 2025-01-21
**Auteur** : Équipe Meeshy Backend
