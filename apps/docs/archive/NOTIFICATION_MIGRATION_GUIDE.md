# Guide de Migration - Système de Notifications v2

Ce document détaille le processus de migration du système de notifications actuel vers la version complète avec les 8+ types de notifications.

---

## Vue d'Ensemble de la Migration

### État Actuel ✅
- ✅ Modèle `Notification` et `NotificationPreference` existants
- ✅ `NotificationService` avec Socket.IO
- ✅ Routes REST CRUD complètes
- ✅ Anti-spam pour mentions (5/minute)
- ✅ Support de `createMentionNotificationsBatch`
- ✅ Types existants : `new_message`, `missed_call`, `new_conversation`, `user_mentioned`

### État Cible 🎯
- 🎯 11 types de notifications typés (TypeScript enums)
- 🎯 8+ formats de notifications contextuels
- 🎯 Préférences granulaires par type
- 🎯 Mute par conversation
- 🎯 Actions rapides dans les notifications
- 🎯 Grouping et filtrage avancés
- 🎯 Store Zustand frontend complet
- 🎯 Composants UI riches

---

## Plan de Migration en 7 Phases

### Phase 1: Préparation (Sans Breaking Changes)

#### Étape 1.1 : Backup et Tests
```bash
# 1. Backup MongoDB
mongodump --uri="mongodb://your-connection-string" --out=/backup/$(date +%Y%m%d)

# 2. Créer une branche de migration
git checkout -b feature/notifications-v2

# 3. Exécuter les tests existants
cd gateway && npm test
cd frontend && npm test
```

#### Étape 1.2 : Ajouter les Enums TypeScript (sans toucher Prisma)
```typescript
// /shared/types/notification.ts (NOUVEAU FICHIER)

export enum NotificationType {
  NEW_MESSAGE = 'new_message',
  NEW_CONVERSATION_DIRECT = 'new_conversation_direct',
  NEW_CONVERSATION_GROUP = 'new_conversation_group',
  MESSAGE_REPLY = 'message_reply',
  MEMBER_JOINED = 'member_joined',
  CONTACT_REQUEST = 'contact_request',
  CONTACT_ACCEPTED = 'contact_accepted',
  USER_MENTIONED = 'user_mentioned',
  MESSAGE_REACTION = 'message_reaction',
  MISSED_CALL = 'missed_call',
  SYSTEM = 'system'
}

export enum NotificationPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent'
}

// Interface commune pour les notifications
export interface NotificationEventData {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  content: string;
  priority: NotificationPriority;
  isRead: boolean;
  createdAt: Date;
  sender?: {
    id: string;
    username: string;
    avatar?: string;
  };
  messagePreview?: string;
  context?: {
    conversationId?: string;
    conversationTitle?: string;
    conversationType?: 'direct' | 'group' | 'public' | 'global';
    messageId?: string;
    callSessionId?: string;
    friendRequestId?: string;
  };
  metadata?: {
    attachments?: {
      count: number;
      firstType: 'image' | 'video' | 'audio' | 'document';
      firstFilename: string;
    };
    reactionEmoji?: string;
    action?: string;
  };
}
```

**Test**: Compiler pour vérifier qu'il n'y a pas de breaking changes.

---

### Phase 2: Migration Prisma (Avec Gestion de Compatibilité)

#### Étape 2.1 : Étendre le Schéma Prisma (Backwards Compatible)

```prisma
// /gateway/shared/prisma/schema.prisma

model Notification {
  id        String    @id @default(auto()) @map("_id") @db.ObjectId
  userId    String    @db.ObjectId

  // MAINTENIR la compatibilité: type reste String (pas Enum)
  // L'enum sera géré côté TypeScript uniquement
  type      String

  title     String
  content   String
  data      String?
  priority  String    @default("normal")

  isRead    Boolean   @default(false)
  readAt    DateTime? // NOUVEAU: pour analytics

  emailSent Boolean   @default(false)
  pushSent  Boolean   @default(false)
  expiresAt DateTime?

  createdAt DateTime  @default(now())

  // Informations de l'expéditeur (existant)
  senderId       String?   @db.ObjectId
  senderUsername String?
  senderAvatar   String?
  messagePreview String?

  // Références pour navigation (existant + nouveaux)
  conversationId  String?   @db.ObjectId
  messageId       String?   @db.ObjectId
  callSessionId   String?   @db.ObjectId
  friendRequestId String?   @db.ObjectId // NOUVEAU
  reactionId      String?   @db.ObjectId // NOUVEAU

  // Relations
  user      User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  message   Message?     @relation("NotificationMessage", fields: [messageId], references: [id], onDelete: Cascade)

  // NOUVEAU: Relation optionnelle vers Reaction
  // reaction  Reaction?    @relation("NotificationReaction", fields: [reactionId], references: [id], onDelete: Cascade)
  // NOTE: Décommenter après avoir mis à jour le modèle Reaction

  // Index optimisés (existant + nouveaux)
  @@index([userId, isRead])
  @@index([userId, type])
  @@index([userId, createdAt])
  @@index([conversationId])
  @@index([messageId])
  @@index([expiresAt])
  @@index([readAt]) // NOUVEAU
  @@index([friendRequestId]) // NOUVEAU
  @@index([reactionId]) // NOUVEAU
  @@map("notifications")
}

model NotificationPreference {
  id                    String   @id @default(auto()) @map("_id") @db.ObjectId
  userId                String   @unique @db.ObjectId

  // Canaux (existant)
  pushEnabled           Boolean  @default(true)
  emailEnabled          Boolean  @default(true)
  soundEnabled          Boolean  @default(true)

  // Préférences par type (existant)
  newMessageEnabled     Boolean  @default(true)
  missedCallEnabled     Boolean  @default(true)
  systemEnabled         Boolean  @default(true)
  conversationEnabled   Boolean  @default(true)

  // NOUVEAU: Préférences granulaires
  replyEnabled          Boolean  @default(true)
  mentionEnabled        Boolean  @default(true)
  reactionEnabled       Boolean  @default(true)
  contactRequestEnabled Boolean  @default(true)
  memberJoinedEnabled   Boolean  @default(false) // Off par défaut

  // Do Not Disturb (existant)
  dndEnabled            Boolean  @default(false)
  dndStartTime          String?
  dndEndTime            String?

  // NOUVEAU: Mute par conversation
  mutedConversations    String[] @default([]) @db.ObjectId

  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  user                  User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("notification_preferences")
}

// NOUVEAU: Ajouter relation dans Reaction
model Reaction {
  // ... champs existants ...

  // NOUVEAU
  notifications Notification[] @relation("NotificationReaction")

  // ... reste du modèle ...
}
```

#### Étape 2.2 : Créer et Exécuter la Migration

```bash
# 1. Générer la migration Prisma
cd gateway
npx prisma migrate dev --name add_notification_fields_v2

# 2. Vérifier la migration générée
cat shared/prisma/migrations/YYYYMMDDHHMMSS_add_notification_fields_v2/migration.sql

# 3. Si tout est OK, appliquer
npx prisma migrate deploy

# 4. Régénérer le client Prisma
npx prisma generate
```

#### Étape 2.3 : Script de Migration des Données Existantes

```typescript
// /gateway/scripts/migrate-notification-types.ts

import { PrismaClient } from '../shared/prisma/client';

const prisma = new PrismaClient();

/**
 * Migration des types de notifications existants vers le nouveau format
 * Maintient la compatibilité backwards
 */
async function migrateNotificationTypes() {
  console.log('🔄 Démarrage de la migration des types de notifications...');

  // Mapping ancien type → nouveau type
  const typeMapping: Record<string, string> = {
    'new_message': 'new_message', // Pas de changement
    'new_conversation': 'new_conversation_direct', // Par défaut direct, sera corrigé ensuite
    'missed_call': 'missed_call',
    'user_mentioned': 'user_mentioned',
    'message_edited': 'system', // Déprécié, migrer vers system
  };

  // 1. Migrer les types existants
  for (const [oldType, newType] of Object.entries(typeMapping)) {
    const result = await prisma.notification.updateMany({
      where: { type: oldType },
      data: { type: newType }
    });

    console.log(`✅ Migré ${result.count} notifications de type "${oldType}" → "${newType}"`);
  }

  // 2. Corriger "new_conversation" en fonction du type de conversation
  const newConversationNotifs = await prisma.notification.findMany({
    where: { type: 'new_conversation_direct' },
    include: {
      conversation: true
    }
  });

  let groupConvCount = 0;
  for (const notif of newConversationNotifs) {
    if (notif.conversation && notif.conversation.type === 'group') {
      await prisma.notification.update({
        where: { id: notif.id },
        data: { type: 'new_conversation_group' }
      });
      groupConvCount++;
    }
  }

  console.log(`✅ Corrigé ${groupConvCount} notifications de groupe`);

  // 3. Initialiser les nouvelles préférences pour tous les utilisateurs
  const users = await prisma.user.findMany({
    select: { id: true }
  });

  for (const user of users) {
    await prisma.notificationPreference.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        pushEnabled: true,
        emailEnabled: true,
        soundEnabled: true,
        newMessageEnabled: true,
        missedCallEnabled: true,
        systemEnabled: true,
        conversationEnabled: true,
        replyEnabled: true,
        mentionEnabled: true,
        reactionEnabled: true,
        contactRequestEnabled: true,
        memberJoinedEnabled: false,
        dndEnabled: false,
        mutedConversations: []
      },
      update: {
        replyEnabled: true,
        mentionEnabled: true,
        reactionEnabled: true,
        contactRequestEnabled: true,
        memberJoinedEnabled: false,
        mutedConversations: []
      }
    });
  }

  console.log(`✅ Initialisé les préférences pour ${users.length} utilisateurs`);

  console.log('🎉 Migration terminée avec succès!');
}

migrateNotificationTypes()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

**Exécution**:
```bash
cd gateway
tsx scripts/migrate-notification-types.ts
```

---

### Phase 3: Extension du Backend (Incrémental)

#### Étape 3.1 : Mettre à Jour NotificationService (Backwards Compatible)

```typescript
// /gateway/src/services/NotificationService.ts

import { NotificationType, NotificationPriority } from '../../shared/types/notification';

export class NotificationService {
  // ... code existant ...

  /**
   * NOUVEAU: Helper pour valider et normaliser le type de notification
   */
  private normalizeNotificationType(type: string): string {
    // Accepter les anciens types pour compatibilité
    const legacyMapping: Record<string, NotificationType> = {
      'new_message': NotificationType.NEW_MESSAGE,
      'new_conversation': NotificationType.NEW_CONVERSATION_DIRECT,
      'missed_call': NotificationType.MISSED_CALL,
      'user_mentioned': NotificationType.USER_MENTIONED,
      'message_edited': NotificationType.SYSTEM
    };

    return legacyMapping[type] || type;
  }

  /**
   * Mise à jour de createNotification pour supporter les nouveaux types
   */
  async createNotification(data: CreateNotificationData): Promise<NotificationEventData | null> {
    // Normaliser le type
    const normalizedType = this.normalizeNotificationType(data.type);

    // ... reste du code existant avec normalizedType ...

    const notification = await this.prisma.notification.create({
      data: {
        userId: data.userId,
        type: normalizedType,
        title: data.title,
        content: data.content,
        priority: data.priority || NotificationPriority.NORMAL,
        // ... reste des champs ...
      }
    });

    // ... reste du code ...
  }

  /**
   * NOUVEAU: createReplyNotification
   */
  async createReplyNotification(data: {
    originalMessageAuthorId: string;
    replierId: string;
    replierUsername: string;
    replierAvatar?: string;
    replyContent: string;
    conversationId: string;
    conversationTitle?: string;
    originalMessageId: string;
    replyMessageId: string;
    attachments?: AttachmentPreview[];
  }): Promise<NotificationEventData | null> {
    // Ne pas notifier si l'auteur répond à son propre message
    if (data.originalMessageAuthorId === data.replierId) {
      return null;
    }

    const messagePreview = this.formatMessagePreview(
      data.replyContent,
      data.attachments
    );

    return this.createNotification({
      userId: data.originalMessageAuthorId,
      type: NotificationType.MESSAGE_REPLY,
      title: `Réponse de ${data.replierUsername}`,
      content: messagePreview,
      priority: NotificationPriority.NORMAL,
      senderId: data.replierId,
      senderUsername: data.replierUsername,
      senderAvatar: data.replierAvatar,
      messagePreview,
      conversationId: data.conversationId,
      messageId: data.replyMessageId,
      data: {
        originalMessageId: data.originalMessageId,
        conversationTitle: data.conversationTitle,
        attachments: this.formatAttachmentInfo(data.attachments),
        action: 'view_message'
      }
    });
  }

  /**
   * NOUVEAU: createReactionNotification
   */
  async createReactionNotification(data: {
    messageAuthorId: string;
    reactorId: string;
    reactorUsername: string;
    reactorAvatar?: string;
    emoji: string;
    messageContent: string;
    conversationId: string;
    conversationTitle?: string;
    messageId: string;
    reactionId: string;
  }): Promise<NotificationEventData | null> {
    if (data.messageAuthorId === data.reactorId) {
      return null;
    }

    const messagePreview = this.truncateMessage(data.messageContent, 15);

    return this.createNotification({
      userId: data.messageAuthorId,
      type: NotificationType.MESSAGE_REACTION,
      title: `${data.reactorUsername} a réagi à votre message`,
      content: `${data.emoji} ${messagePreview}`,
      priority: NotificationPriority.LOW,
      senderId: data.reactorId,
      senderUsername: data.reactorUsername,
      senderAvatar: data.reactorAvatar,
      messagePreview,
      conversationId: data.conversationId,
      messageId: data.messageId,
      data: {
        reactionId: data.reactionId,
        emoji: data.emoji,
        conversationTitle: data.conversationTitle,
        action: 'view_message'
      }
    });
  }

  // ... Ajouter les autres méthodes (voir NOTIFICATION_SYSTEM_ARCHITECTURE.md) ...
}
```

**Test Incrémental**:
```bash
# Tester uniquement les nouvelles méthodes
npm test -- NotificationService.test.ts
```

#### Étape 3.2 : Créer les Nouveaux Services (Isolation)

Créer les services un par un, en isolation :

1. **ReactionService** (nouveau fichier)
2. **ConversationService** (nouveau fichier)
3. **FriendRequestService** (nouveau fichier)

Chaque service doit être testé individuellement avant intégration.

---

### Phase 4: Frontend Store (Avec Fallback)

#### Étape 4.1 : Créer le Store Zustand

```typescript
// /apps/web/stores/notification-store.ts

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { NotificationEventData } from '@/types/notification';

// ... (code complet dans NOTIFICATION_SYSTEM_ARCHITECTURE.md) ...

export const useNotificationStore = create<NotificationState>()(
  devtools(
    persist(
      (set, get) => ({
        // ... implémentation ...
      }),
      {
        name: 'notification-store-v2',
        version: 1,
        // Migration depuis l'ancien store (si existant)
        migrate: (persistedState: any, version: number) => {
          if (version === 0) {
            // Migrer depuis une version précédente
            return {
              ...persistedState,
              unreadCount: persistedState.unreadCount || 0,
              notifications: [], // Recharger les notifications
              page: 1
            };
          }
          return persistedState;
        }
      }
    )
  )
);
```

#### Étape 4.2 : Créer le Hook avec Détection de Compatibilité

```typescript
// /apps/web/hooks/use-notifications.ts

import { useEffect, useCallback, useRef } from 'react';
import { useNotificationStore } from '@/stores/notification-store';
import { useWebSocket } from './use-websocket';
import { useAuthStore } from '@/stores/auth-store';

export function useNotifications() {
  const socket = useWebSocket();
  const { user } = useAuthStore();
  const store = useNotificationStore();

  // Détection de compatibilité backend
  const [isV2Supported, setIsV2Supported] = useState(false);

  useEffect(() => {
    // Vérifier si le backend supporte la v2
    fetch('/api/notifications/stats', { credentials: 'include' })
      .then(res => {
        if (res.ok) {
          // Vérifier la présence de champs v2 dans la réponse
          return res.json();
        }
        throw new Error('V2 not supported');
      })
      .then(data => {
        setIsV2Supported(!!data.data.byType); // V2 a le grouping par type
      })
      .catch(() => {
        setIsV2Supported(false);
        console.warn('Backend Notifications V2 not supported, using V1 fallback');
      });
  }, []);

  // ... reste de l'implémentation ...

  return {
    ...store,
    isV2Supported
  };
}
```

---

### Phase 5: Composants UI (Progressive Enhancement)

#### Étape 5.1 : Créer les Composants de Base

```typescript
// /apps/web/components/notifications/NotificationBell.tsx

'use client';

import { Bell } from 'lucide-react';
import { useNotifications } from '@/hooks/use-notifications';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function NotificationBell() {
  const { unreadCount, isV2Supported } = useNotifications();

  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative"
      aria-label={`Notifications (${unreadCount} non lues)`}
    >
      <Bell className="h-5 w-5" />
      {unreadCount > 0 && (
        <span className={cn(
          "absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center",
          "rounded-full bg-red-500 text-[10px] font-bold text-white",
          "ring-2 ring-background"
        )}>
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}

      {/* Badge Beta pour indiquer V2 */}
      {isV2Supported && (
        <span className="absolute -bottom-1 -right-1 px-1 text-[8px] bg-blue-500 text-white rounded">
          v2
        </span>
      )}
    </Button>
  );
}
```

#### Étape 5.2 : Feature Flag pour Activer Progressivement

```typescript
// /apps/web/lib/feature-flags.ts

export const FEATURE_FLAGS = {
  NOTIFICATIONS_V2: process.env.NEXT_PUBLIC_ENABLE_NOTIFICATIONS_V2 === 'true',
  NOTIFICATIONS_GROUPED: process.env.NEXT_PUBLIC_ENABLE_NOTIFICATIONS_GROUPED === 'true',
  NOTIFICATIONS_MUTE: process.env.NEXT_PUBLIC_ENABLE_NOTIFICATIONS_MUTE === 'true',
};

// Utilisation dans les composants
import { FEATURE_FLAGS } from '@/lib/feature-flags';

export function NotificationList() {
  const { notifications } = useNotifications();

  return (
    <div>
      {FEATURE_FLAGS.NOTIFICATIONS_V2 && (
        <NotificationFilters />
      )}

      {FEATURE_FLAGS.NOTIFICATIONS_GROUPED ? (
        <GroupedNotificationList notifications={notifications} />
      ) : (
        <FlatNotificationList notifications={notifications} />
      )}
    </div>
  );
}
```

**Fichier .env.local**:
```bash
# Phase 5: Activé seulement en développement
NEXT_PUBLIC_ENABLE_NOTIFICATIONS_V2=true
NEXT_PUBLIC_ENABLE_NOTIFICATIONS_GROUPED=false
NEXT_PUBLIC_ENABLE_NOTIFICATIONS_MUTE=false
```

---

### Phase 6: Tests et Validation

#### Étape 6.1 : Tests de Régression

```bash
# Backend: Vérifier que les anciennes notifications fonctionnent toujours
cd gateway
npm test

# Frontend: Vérifier l'UI existante
cd frontend
npm test
npm run e2e
```

#### Étape 6.2 : Tests des Nouvelles Fonctionnalités

```typescript
// /gateway/src/__tests__/notification-v2.test.ts

import { describe, it, expect } from 'vitest';
import { NotificationService } from '../services/NotificationService';
import { NotificationType } from '../../shared/types/notification';

describe('Notifications V2', () => {
  describe('Réponses', () => {
    it('devrait créer une notification de réponse', async () => {
      const notif = await notificationService.createReplyNotification({
        originalMessageAuthorId: 'user1',
        replierId: 'user2',
        replierUsername: 'User2',
        replyContent: 'Great idea!',
        conversationId: 'conv1',
        originalMessageId: 'msg1',
        replyMessageId: 'msg2'
      });

      expect(notif).toBeDefined();
      expect(notif?.type).toBe(NotificationType.MESSAGE_REPLY);
    });

    it('ne devrait PAS créer de notification si on répond à soi-même', async () => {
      const notif = await notificationService.createReplyNotification({
        originalMessageAuthorId: 'user1',
        replierId: 'user1', // Même utilisateur
        replierUsername: 'User1',
        replyContent: 'Oops',
        conversationId: 'conv1',
        originalMessageId: 'msg1',
        replyMessageId: 'msg2'
      });

      expect(notif).toBeNull();
    });
  });

  describe('Réactions', () => {
    it('devrait créer une notification de réaction', async () => {
      const notif = await notificationService.createReactionNotification({
        messageAuthorId: 'user1',
        reactorId: 'user2',
        reactorUsername: 'User2',
        emoji: '❤️',
        messageContent: 'Hello world',
        conversationId: 'conv1',
        messageId: 'msg1',
        reactionId: 'react1'
      });

      expect(notif).toBeDefined();
      expect(notif?.type).toBe(NotificationType.MESSAGE_REACTION);
      expect(notif?.content).toContain('❤️');
    });
  });
});
```

---

### Phase 7: Déploiement Progressif (Canary Release)

#### Étape 7.1 : Déploiement Backend (avec Feature Flag)

```typescript
// /gateway/src/env.ts

export const ENV = {
  // ... autres variables ...
  ENABLE_NOTIFICATIONS_V2: process.env.ENABLE_NOTIFICATIONS_V2 === 'true',
  ENABLE_REPLY_NOTIFICATIONS: process.env.ENABLE_REPLY_NOTIFICATIONS === 'true',
  ENABLE_REACTION_NOTIFICATIONS: process.env.ENABLE_REACTION_NOTIFICATIONS === 'true',
};

// Utilisation dans NotificationService
if (ENV.ENABLE_REPLY_NOTIFICATIONS) {
  await this.createReplyNotification(data);
}
```

**Stratégie de déploiement**:
1. **Semaine 1**: Activer uniquement `ENABLE_REPLY_NOTIFICATIONS` pour 10% des utilisateurs (via A/B test)
2. **Semaine 2**: Si stable, activer pour 50% des utilisateurs
3. **Semaine 3**: Activer `ENABLE_REACTION_NOTIFICATIONS`
4. **Semaine 4**: Activer tous les types pour 100% des utilisateurs

#### Étape 7.2 : Monitoring et Rollback

```typescript
// /gateway/src/middleware/notification-monitoring.ts

import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';

export async function notificationMonitoringMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const startTime = Date.now();

  reply.addHook('onSend', async (request, reply, payload) => {
    const duration = Date.now() - startTime;

    // Logger les métriques
    logger.info('Notification API Call', {
      method: request.method,
      url: request.url,
      duration,
      statusCode: reply.statusCode,
      userId: (request.user as any)?.userId
    });

    // Alerter si temps de réponse > 2s
    if (duration > 2000) {
      logger.warn('Slow Notification API Call', {
        method: request.method,
        url: request.url,
        duration
      });
    }
  });
}
```

**Plan de Rollback**:
```bash
# Si problème détecté, rollback immédiat
# 1. Désactiver les feature flags
export ENABLE_NOTIFICATIONS_V2=false
export ENABLE_REPLY_NOTIFICATIONS=false
export ENABLE_REACTION_NOTIFICATIONS=false

# 2. Redémarrer les services
pm2 restart gateway

# 3. Vérifier que les anciennes notifications fonctionnent
curl -H "Authorization: Bearer $TOKEN" https://api.meeshy.me/api/notifications
```

---

## Checklist de Migration

### Phase 1: Préparation ✅
- [ ] Backup MongoDB effectué
- [ ] Branche `feature/notifications-v2` créée
- [ ] Tests existants passent
- [ ] Enums TypeScript ajoutés
- [ ] Documentation lue et comprise

### Phase 2: Migration Prisma ✅
- [ ] Schéma Prisma mis à jour
- [ ] Migration générée et vérifiée
- [ ] Migration appliquée en dev
- [ ] Script de migration de données exécuté
- [ ] Données migrées vérifiées manuellement
- [ ] Client Prisma régénéré

### Phase 3: Backend ✅
- [ ] NotificationService étendu
- [ ] createReplyNotification implémenté et testé
- [ ] createReactionNotification implémenté et testé
- [ ] createMemberJoinedNotification implémenté et testé
- [ ] createContactRequestNotification implémenté et testé
- [ ] createContactAcceptedNotification implémenté et testé
- [ ] ReactionService créé et testé
- [ ] ConversationService créé et testé
- [ ] FriendRequestService créé et testé
- [ ] Routes REST ajoutées
- [ ] Événements Socket.IO ajoutés
- [ ] Tests unitaires écrits et passent (>80% coverage)

### Phase 4: Frontend Store ✅
- [ ] useNotificationStore créé
- [ ] useNotifications hook créé
- [ ] Intégration Socket.IO fonctionnelle
- [ ] Pagination infinie implémentée
- [ ] Grouping par conversation/type implémenté
- [ ] Tests frontend écrits

### Phase 5: Composants UI ✅
- [ ] NotificationBell créé et stylé
- [ ] NotificationList créé avec scroll infini
- [ ] NotificationItem créé avec formatage contextuel
- [ ] Toasts de notification implémentés
- [ ] Sons de notification ajoutés
- [ ] Navigation contextuelle fonctionnelle
- [ ] Feature flags configurés
- [ ] Tests E2E écrits avec Playwright

### Phase 6: Tests et Validation ✅
- [ ] Tests de régression passent
- [ ] Tests de charge effectués (1000+ notifications)
- [ ] Tests de sécurité effectués (rate limiting, XSS)
- [ ] Tests d'accessibilité (a11y) effectués
- [ ] Tests multi-navigateurs effectués
- [ ] Tests mobile effectués

### Phase 7: Déploiement ✅
- [ ] Feature flags configurés en production
- [ ] Monitoring configuré (Prometheus/Grafana)
- [ ] Alertes configurées (Sentry, Slack)
- [ ] Plan de rollback documenté
- [ ] Déploiement canary effectué (10% → 50% → 100%)
- [ ] Métriques validées (latence, taux d'erreur)
- [ ] Documentation utilisateur mise à jour
- [ ] Équipe formée sur les nouvelles fonctionnalités

---

## Gestion des Erreurs Courantes

### Erreur 1: "Notification type 'xxx' not found"

**Cause**: Type de notification non reconnu après migration.

**Solution**:
```typescript
// Ajouter un fallback dans normalizeNotificationType
private normalizeNotificationType(type: string): string {
  const validTypes = Object.values(NotificationType);

  if (validTypes.includes(type as NotificationType)) {
    return type;
  }

  // Fallback vers SYSTEM pour types inconnus
  console.warn(`Unknown notification type: ${type}, falling back to SYSTEM`);
  return NotificationType.SYSTEM;
}
```

### Erreur 2: "Cannot read property 'conversationTitle' of undefined"

**Cause**: Données manquantes dans les métadonnées.

**Solution**:
```typescript
// Toujours utiliser optional chaining
const title = notification.context?.conversationTitle || 'Conversation';
```

### Erreur 3: "Rate limit exceeded" en masse

**Cause**: Migration a créé des notifications en batch sans respecter rate limit.

**Solution**:
```typescript
// Désactiver temporairement le rate limit pour la migration
if (process.env.MIGRATION_MODE === 'true') {
  return true; // Bypass rate limit
}
```

### Erreur 4: "Socket.IO not connected"

**Cause**: Frontend essaie d'écouter les événements avant la connexion.

**Solution**:
```typescript
useEffect(() => {
  if (!socket || !socket.connected) {
    console.warn('Socket.IO not connected, waiting...');
    return;
  }

  // Écouter les événements seulement si connecté
  socket.on(SERVER_EVENTS.NOTIFICATION, handleNotification);

  return () => {
    socket.off(SERVER_EVENTS.NOTIFICATION, handleNotification);
  };
}, [socket, socket?.connected]); // Dépendre de l'état de connexion
```

---

## Métriques de Succès

Après la migration, surveiller ces métriques pendant 2 semaines :

| Métrique | Objectif | Alerte Si |
|----------|----------|-----------|
| Taux de livraison temps réel | > 95% | < 90% |
| Temps de création notification | < 50ms | > 200ms |
| Taux d'erreur API | < 0.5% | > 2% |
| Latence API /notifications | < 100ms | > 500ms |
| Taux de lecture (engagement) | > 60% | < 40% |
| Taux de clics (CTR) | > 30% | < 15% |
| Temps moyen de lecture | < 5 min | > 30 min |
| Requêtes rate-limitées | < 0.1% | > 1% |

---

## Support et Escalation

En cas de problème pendant la migration :

1. **Problème mineur** (latence légère, UI glitch) → Log dans Sentry, créer un ticket
2. **Problème modéré** (certaines notifications ne s'affichent pas) → Rollback des feature flags concernés
3. **Problème critique** (système de notifications down) → Rollback complet et escalade immédiate

**Contacts d'escalation**:
- Backend Lead: [email]
- Frontend Lead: [email]
- DevOps: [email]
- On-call: [phone]

---

## Ressources Additionnelles

- [NOTIFICATION_SYSTEM_ARCHITECTURE.md](./NOTIFICATION_SYSTEM_ARCHITECTURE.md) - Architecture complète
- [NOTIFICATION_TYPES_REFERENCE.md](./NOTIFICATION_TYPES_REFERENCE.md) - Référence des types
- [API Documentation](./docs/api/notifications.md) - Documentation API
- [Prisma Migration Guide](https://www.prisma.io/docs/guides/migrate) - Documentation Prisma officielle

---

**Version**: 1.0
**Dernière mise à jour**: 2025-01-21
**Auteur**: Architecture Team
