# Prochaines Étapes - Système de Notifications Backend

Ce document liste les **prochaines étapes** pour compléter l'implémentation du système de notifications backend Meeshy.

---

## État Actuel

### ✅ Complété (6/9 tâches - 67%)

1. ✅ Schéma Prisma étendu avec nouveaux champs et index
2. ✅ Client Prisma généré
3. ✅ Types TypeScript créés (`/gateway/shared/types/notification.ts`)
4. ✅ NotificationService étendu avec 8 nouvelles méthodes
5. ✅ Validation des préférences pour 11 types de notifications
6. ✅ Documentation complète backend

### ⏳ Restant (3/9 tâches - 33%)

7. ⏳ NotificationEventsHandler pour Socket.IO
8. ⏳ Routes API avec validation Zod et filtres avancés
9. ⏳ Tests unitaires et d'intégration

---

## Tâche 1: NotificationEventsHandler (2-3 heures)

### Objectif

Créer un handler dédié pour gérer les événements Socket.IO liés aux notifications.

### Fichier à Créer

`/gateway/src/handlers/NotificationEventsHandler.ts`

### Contenu

```typescript
/**
 * NotificationEventsHandler - Gestion des événements Socket.IO pour les notifications
 */

import type { Server as SocketIOServer, Socket } from 'socket.io';
import { NotificationService } from '../services/NotificationService';
import { logger } from '../utils/logger';

export class NotificationEventsHandler {
  constructor(
    private io: SocketIOServer,
    private notificationService: NotificationService
  ) {}

  /**
   * Initialiser les listeners Socket.IO pour les notifications
   */
  setupEventListeners() {
    this.io.on('connection', (socket: Socket) => {
      const userId = socket.data.userId;

      if (!userId) {
        logger.warn('Socket connected without userId');
        return;
      }

      logger.info('NotificationEventsHandler: User connected', { userId });

      // Envoyer le compteur initial de notifications non lues
      this.sendInitialUnreadCount(socket, userId);

      // Marquer une notification comme lue
      socket.on('notification:mark_read', async ({ notificationId }: { notificationId: string }) => {
        try {
          await this.notificationService.markAsRead(notificationId, userId);
          socket.emit('notification:read', { notificationId });

          // Mettre à jour le compteur
          const count = await this.notificationService.getUnreadCount(userId);
          socket.emit('notification:unread_count', { count });

          logger.info('Notification marked as read', { notificationId, userId });
        } catch (error) {
          logger.error('Error marking notification as read:', error);
          socket.emit('notification:error', {
            message: 'Erreur lors du marquage de la notification'
          });
        }
      });

      // Marquer toutes les notifications comme lues
      socket.on('notification:mark_all_read', async () => {
        try {
          await this.notificationService.markAllAsRead(userId);
          socket.emit('notification:all_read');

          // Mettre à jour le compteur
          socket.emit('notification:unread_count', { count: 0 });

          logger.info('All notifications marked as read', { userId });
        } catch (error) {
          logger.error('Error marking all notifications as read:', error);
          socket.emit('notification:error', {
            message: 'Erreur lors du marquage des notifications'
          });
        }
      });

      // Supprimer une notification
      socket.on('notification:delete', async ({ notificationId }: { notificationId: string }) => {
        try {
          await this.notificationService.deleteNotification(notificationId, userId);
          socket.emit('notification:deleted', { notificationId });

          logger.info('Notification deleted', { notificationId, userId });
        } catch (error) {
          logger.error('Error deleting notification:', error);
          socket.emit('notification:error', {
            message: 'Erreur lors de la suppression de la notification'
          });
        }
      });

      // Récupérer les statistiques
      socket.on('notification:get_stats', async () => {
        try {
          const stats = await this.notificationService.getNotificationStats(userId);
          socket.emit('notification:stats', stats);

          logger.info('Notification stats retrieved', { userId, stats });
        } catch (error) {
          logger.error('Error getting notification stats:', error);
          socket.emit('notification:error', {
            message: 'Erreur lors de la récupération des statistiques'
          });
        }
      });

      // Déconnexion
      socket.on('disconnect', () => {
        logger.info('NotificationEventsHandler: User disconnected', { userId });
      });
    });
  }

  /**
   * Envoyer le compteur initial de notifications non lues
   */
  private async sendInitialUnreadCount(socket: Socket, userId: string) {
    try {
      const count = await this.notificationService.getUnreadCount(userId);
      socket.emit('notification:unread_count', { count });

      logger.info('Initial unread count sent', { userId, count });
    } catch (error) {
      logger.error('Error sending initial unread count:', error);
    }
  }
}
```

### Intégration

Dans `/gateway/src/index.ts` ou `/gateway/src/server.ts` :

```typescript
import { NotificationEventsHandler } from './handlers/NotificationEventsHandler';

// Après initialisation de Socket.IO et NotificationService
const notificationEventsHandler = new NotificationEventsHandler(io, notificationService);
notificationEventsHandler.setupEventListeners();
```

---

## Tâche 2: Routes API avec Validation Zod (2-3 heures)

### Objectif

Mettre à jour `/gateway/src/routes/notifications.ts` avec :
- Validation Zod complète
- Filtrage avancé (type, priorité, date)
- Nouveaux endpoints

### Schémas Zod à Ajouter

```typescript
import { z } from 'zod';

// Schéma pour query parameters GET /notifications
const getNotificationsQuerySchema = z.object({
  page: z.string().optional().transform(val => parseInt(val || '1', 10)),
  limit: z.string().optional().transform(val => parseInt(val || '20', 10)),
  unread: z.enum(['true', 'false']).optional().transform(val => val === 'true'),
  type: z.enum([
    'new_message',
    'new_conversation_direct',
    'new_conversation_group',
    'message_reply',
    'member_joined',
    'contact_request',
    'contact_accepted',
    'user_mentioned',
    'message_reaction',
    'missed_call',
    'system'
  ]).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  startDate: z.string().optional().transform(val => val ? new Date(val) : undefined),
  endDate: z.string().optional().transform(val => val ? new Date(val) : undefined)
});

// Schéma pour update preferences
const updatePreferencesSchema = z.object({
  pushEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  soundEnabled: z.boolean().optional(),
  newMessageEnabled: z.boolean().optional(),
  replyEnabled: z.boolean().optional(),
  mentionEnabled: z.boolean().optional(),
  reactionEnabled: z.boolean().optional(),
  missedCallEnabled: z.boolean().optional(),
  systemEnabled: z.boolean().optional(),
  conversationEnabled: z.boolean().optional(),
  contactRequestEnabled: z.boolean().optional(),
  memberJoinedEnabled: z.boolean().optional(),
  dndEnabled: z.boolean().optional(),
  dndStartTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  dndEndTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  mutedConversations: z.array(z.string()).optional()
});
```

### Nouveaux Endpoints à Ajouter

```typescript
// DELETE /api/notifications/read - déjà existant
// PATCH /api/notifications/conversation/:id/mute
fastify.patch('/notifications/conversation/:id/mute', {
  onRequest: [fastify.authenticate]
}, async (request, reply) => {
  const { id } = request.params as { id: string };
  const { userId } = request.user as any;

  // Récupérer les préférences
  let preferences = await fastify.prisma.notificationPreference.findUnique({
    where: { userId }
  });

  if (!preferences) {
    preferences = await fastify.prisma.notificationPreference.create({
      data: { userId, mutedConversations: [id] }
    });
  } else {
    const mutedConversations = [...preferences.mutedConversations, id];
    preferences = await fastify.prisma.notificationPreference.update({
      where: { userId },
      data: { mutedConversations }
    });
  }

  return reply.send({
    success: true,
    message: 'Conversation mutée',
    data: preferences
  });
});

// PATCH /api/notifications/conversation/:id/unmute
fastify.patch('/notifications/conversation/:id/unmute', {
  onRequest: [fastify.authenticate]
}, async (request, reply) => {
  const { id } = request.params as { id: string };
  const { userId } = request.user as any;

  const preferences = await fastify.prisma.notificationPreference.findUnique({
    where: { userId }
  });

  if (preferences) {
    const mutedConversations = preferences.mutedConversations.filter(cid => cid !== id);
    await fastify.prisma.notificationPreference.update({
      where: { userId },
      data: { mutedConversations }
    });
  }

  return reply.send({
    success: true,
    message: 'Conversation unmutée'
  });
});
```

### Filtrage Avancé

Mettre à jour GET `/notifications` pour supporter les nouveaux filtres :

```typescript
fastify.get('/notifications', {
  onRequest: [fastify.authenticate]
}, async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const query = getNotificationsQuerySchema.parse(request.query);
    const { userId } = request.user as any;

    const whereClause: any = { userId };

    if (query.unread !== undefined) {
      whereClause.isRead = !query.unread;
    }

    if (query.type) {
      whereClause.type = query.type;
    }

    if (query.priority) {
      whereClause.priority = query.priority;
    }

    if (query.startDate || query.endDate) {
      whereClause.createdAt = {};
      if (query.startDate) {
        whereClause.createdAt.gte = query.startDate;
      }
      if (query.endDate) {
        whereClause.createdAt.lte = query.endDate;
      }
    }

    // ... reste de la logique ...
  } catch (error) {
    // ... gestion erreur ...
  }
});
```

---

## Tâche 3: Tests Unitaires (4-6 heures)

### Fichier à Créer

`/gateway/src/__tests__/NotificationService.test.ts`

### Structure des Tests

```typescript
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
    // Cleanup
    await prisma.notification.deleteMany({});
    await prisma.notificationPreference.deleteMany({});
    await prisma.$disconnect();
  });

  describe('createNotification', () => {
    it('devrait créer une notification de base', async () => {
      // Test implementation
    });

    it('ne devrait PAS créer si DND actif', async () => {
      // Test implementation
    });

    it('ne devrait PAS créer si type désactivé dans préférences', async () => {
      // Test implementation
    });
  });

  describe('createReplyNotification', () => {
    it('devrait créer une notification de réponse', async () => {
      // Test implementation
    });

    it('ne devrait PAS créer si on répond à soi-même', async () => {
      // Test implementation
    });
  });

  describe('createMentionNotificationsBatch', () => {
    it('devrait créer des notifications pour plusieurs mentions', async () => {
      // Test implementation
    });

    it('devrait respecter le rate limiting (5/minute)', async () => {
      // Test implementation
    });

    it('ne devrait PAS notifier le sender', async () => {
      // Test implementation
    });
  });

  describe('createReactionNotification', () => {
    it('devrait créer une notification de réaction', async () => {
      // Test implementation
    });

    it('ne devrait PAS créer si on réagit à son propre message', async () => {
      // Test implementation
    });
  });

  describe('createMemberJoinedNotification', () => {
    it('devrait créer des notifications pour tous les admins', async () => {
      // Test implementation
    });

    it('ne devrait PAS créer si aucun admin', async () => {
      // Test implementation
    });
  });

  describe('markAsRead', () => {
    it('devrait marquer une notification comme lue et définir readAt', async () => {
      // Test implementation
    });
  });

  describe('getNotificationStats', () => {
    it('devrait retourner les statistiques correctes', async () => {
      // Test implementation
    });
  });
});
```

### Commandes de Test

```bash
# Installer les dépendances de test
cd gateway
npm install --save-dev vitest @vitest/ui

# Lancer les tests
npm test

# Tests avec coverage
npm run test:coverage

# Tests en mode watch
npm run test:watch

# Interface UI pour les tests
npm run test:ui
```

---

## Tâche 4: Intégration avec Services Existants (3-4 heures)

### Dans MessagingService

Fichier : `/gateway/src/services/MessagingService.ts`

```typescript
// Après création d'un message
import { notificationService } from './NotificationService';

// Dans la méthode sendMessage() ou createMessage()
// 1. Notifier les membres (nouveau message)
for (const member of conversationMembers) {
  if (member.userId !== message.senderId) {
    await notificationService.createMessageNotification({
      recipientId: member.userId,
      senderId: message.senderId,
      senderUsername: sender.username,
      senderAvatar: sender.avatar,
      messageContent: message.content,
      conversationId: message.conversationId,
      messageId: message.id,
      conversationTitle: conversation.title,
      attachments: message.attachments
    });
  }
}

// 2. Si réponse à un message, créer notification spécifique
if (message.replyToId) {
  const originalMessage = await prisma.message.findUnique({
    where: { id: message.replyToId }
  });

  if (originalMessage && originalMessage.senderId !== message.senderId) {
    await notificationService.createReplyNotification({
      originalMessageAuthorId: originalMessage.senderId,
      replierId: message.senderId,
      replierUsername: sender.username,
      replierAvatar: sender.avatar,
      replyContent: message.content,
      conversationId: message.conversationId,
      conversationTitle: conversation.title,
      originalMessageId: message.replyToId,
      replyMessageId: message.id,
      attachments: message.attachments
    });
  }
}

// 3. Extraire et notifier les mentions
const mentions = await mentionService.extractMentions(message.content);
if (mentions.length > 0) {
  const memberIds = conversationMembers.map(m => m.userId);
  await notificationService.createMentionNotificationsBatch(
    mentions,
    {
      senderId: message.senderId,
      senderUsername: sender.username,
      senderAvatar: sender.avatar,
      messageContent: message.content,
      conversationId: message.conversationId,
      conversationTitle: conversation.title,
      messageId: message.id,
      attachments: message.attachments
    },
    memberIds
  );
}
```

### Dans ReactionService

Fichier : `/gateway/src/services/ReactionService.ts`

```typescript
// Après ajout d'une réaction
const message = await prisma.message.findUnique({
  where: { id: reactionData.messageId },
  include: { sender: true }
});

if (message && message.senderId !== reactionData.userId) {
  await notificationService.createReactionNotification({
    messageAuthorId: message.senderId!,
    reactorId: reactionData.userId,
    reactorUsername: reactor.username,
    reactorAvatar: reactor.avatar,
    emoji: reactionData.emoji,
    messageContent: message.content,
    conversationId: message.conversationId,
    messageId: message.id,
    reactionId: reaction.id
  });
}
```

---

## Commandes à Exécuter

### 1. Vérifier que le Client Prisma est à Jour

```bash
cd /Users/smpceo/Documents/Services/Meeshy/meeshy/gateway
npx prisma generate --schema=./shared/prisma/schema.prisma
```

### 2. Vérifier la Compilation TypeScript

```bash
npx tsc --noEmit
```

### 3. Lancer les Tests (Après Implémentation)

```bash
npm test
```

### 4. Démarrer le Serveur de Développement

```bash
npm run dev
```

### 5. Tester Manuellement les Endpoints

```bash
# Créer une notification test
curl -X POST http://localhost:3000/api/notifications/test \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "system",
    "title": "Test Notification",
    "content": "Ceci est un test"
  }'

# Récupérer les notifications
curl -X GET http://localhost:3000/api/notifications \
  -H "Authorization: Bearer YOUR_TOKEN"

# Marquer comme lue
curl -X PATCH http://localhost:3000/api/notifications/NOTIF_ID/read \
  -H "Authorization: Bearer YOUR_TOKEN"

# Obtenir les statistiques
curl -X GET http://localhost:3000/api/notifications/stats \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Checklist Finale

### Backend

- [x] Schéma Prisma étendu
- [x] Client Prisma généré
- [x] Types TypeScript créés
- [x] NotificationService étendu
- [x] Validation des préférences
- [ ] NotificationEventsHandler créé
- [ ] Routes API mises à jour avec validation Zod
- [ ] Tests unitaires écrits (20+ test cases)
- [ ] Tests d'intégration écrits
- [ ] Intégration dans MessagingService
- [ ] Intégration dans ReactionService
- [ ] Intégration dans ConversationService
- [ ] Documentation complétée

### Déploiement

- [ ] Code review effectué
- [ ] Tests passent (coverage > 80%)
- [ ] Performance vérifiée (< 50ms par notification)
- [ ] Backup MongoDB avant déploiement
- [ ] Déploiement en staging
- [ ] Tests en staging
- [ ] Déploiement en production
- [ ] Monitoring activé

---

## Estimation Temporelle Totale

| Tâche | Temps Estimé | Status |
|-------|--------------|--------|
| 1. NotificationEventsHandler | 2-3 heures | ⏳ À faire |
| 2. Routes API + Zod | 2-3 heures | ⏳ À faire |
| 3. Tests Unitaires | 4-6 heures | ⏳ À faire |
| 4. Intégration Services | 3-4 heures | ⏳ À faire |
| **TOTAL** | **11-16 heures** | **33% complété** |

---

## Ressources

- **Documentation Backend** : `/gateway/README_BACKEND_NOTIFICATIONS.md`
- **Architecture** : `/NOTIFICATION_SYSTEM_ARCHITECTURE.md`
- **Résumé Implémentation** : `/gateway/IMPLEMENTATION_SUMMARY.md`
- **Types TypeScript** : `/gateway/shared/types/notification.ts`

---

**Dernière Mise à Jour** : 2025-01-21
**Auteur** : Équipe Meeshy Backend
