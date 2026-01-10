# Guide de Refactoring - Système de Notifications v2

Ce document présente les refactorings recommandés avec le code corrigé pour chaque issue identifié.

---

## 1. Sécurité - Fixer Vulnérabilité XSS

### Issue: Validation et Sanitization manquantes

**Fichier:** `/gateway/src/routes/notifications.ts`

#### Avant (Vulnérable):
```typescript
const createNotificationSchema = z.object({
  type: z.string(),      // ❌ Pas de validation enum
  title: z.string(),     // ❌ Pas de longueur max
  content: z.string(),   // ❌ Pas de longueur max
  data: z.string().optional() // ❌ Pas de validation JSON
});
```

#### Après (Sécurisé):
```typescript
import { z } from 'zod';
import DOMPurify from 'isomorphic-dompurify';

// Enum pour les types de notifications
const NotificationTypeEnum = z.enum([
  'new_message',
  'message_reply',
  'user_mentioned',
  'message_reaction',
  'contact_request',
  'contact_accepted',
  'new_conversation_direct',
  'new_conversation_group',
  'member_joined',
  'missed_call',
  'system'
]);

// Validation stricte du data object
const NotificationDataSchema = z.record(z.unknown())
  .optional()
  .refine((data) => {
    if (!data) return true;
    const stringified = JSON.stringify(data);
    return stringified.length < 10000; // Max 10KB
  }, 'Data object too large');

// Schéma avec validation stricte
const createNotificationSchema = z.object({
  type: NotificationTypeEnum,
  title: z.string()
    .min(1, 'Title is required')
    .max(200, 'Title too long')
    .trim()
    .transform(str => DOMPurify.sanitize(str, { ALLOWED_TAGS: [] })),
  content: z.string()
    .min(1, 'Content is required')
    .max(1000, 'Content too long')
    .trim()
    .transform(str => DOMPurify.sanitize(str, { ALLOWED_TAGS: [] })),
  data: NotificationDataSchema,
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  expiresAt: z.string().datetime().optional()
});

// Usage dans route
fastify.post('/notifications/test', {
  onRequest: [fastify.authenticate]
}, async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const validatedData = createNotificationSchema.parse(request.body);

    const notification = await fastify.prisma.notification.create({
      data: {
        userId: (request.user as any).userId,
        type: validatedData.type,
        title: validatedData.title,
        content: validatedData.content,
        priority: validatedData.priority,
        data: validatedData.data ? JSON.stringify(validatedData.data) : null,
        expiresAt: validatedData.expiresAt ? new Date(validatedData.expiresAt) : null
      }
    });

    return reply.status(201).send({
      success: true,
      data: notification
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        success: false,
        message: 'Invalid input data',
        errors: error.errors
      });
    }

    fastify.log.error('Create notification error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Internal server error'
    });
  }
});
```

---

## 2. Sécurité - Rate Limiting sur API

### Issue: Pas de rate limiting global

**Fichier:** `/gateway/src/server.ts` (ou équivalent)

#### Solution:
```typescript
import rateLimit from '@fastify/rate-limit';
import Redis from 'ioredis';

// Option 1: Rate limiting avec Redis (recommandé pour production)
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD
});

fastify.register(rateLimit, {
  max: 100, // 100 requêtes
  timeWindow: '1 minute',
  redis, // Partage entre instances
  keyGenerator: (request) => {
    // Rate limit par userId pour les routes authentifiées
    if (request.user) {
      return `rate-limit:${(request.user as any).userId}`;
    }
    // Par IP pour les routes publiques
    return `rate-limit:${request.ip}`;
  },
  errorResponseBuilder: (request, context) => ({
    success: false,
    message: 'Too many requests. Please try again later.',
    retryAfter: context.after
  })
});

// Option 2: Rate limiting en mémoire (pour dev/test)
fastify.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
  cache: 10000 // Cache 10k keys max
});

// Rate limiting spécifique pour routes sensibles
fastify.register(rateLimit, {
  max: 10,
  timeWindow: '1 minute',
  nameSpace: 'notifications-create-',
  skipOnError: false
}, (fastify) => {
  fastify.post('/notifications/test', /* handler */);
});
```

---

## 3. Performance - Fixer Memory Leak dans Hook

### Issue: useEffect dependencies causant re-renders infinis

**Fichier:** `/apps/web/hooks/use-notifications-v2.ts`

#### Avant (Buggy):
```typescript
useEffect(() => {
  if (!isAuthenticated || !authToken || isInitialized.current) {
    return;
  }

  isInitialized.current = true;
  actions.initialize().then(() => {
    initializeSocket();
  });

  return cleanup;
}, [isAuthenticated, authToken, actions, initializeSocket, cleanup]); // ❌ Dépendances instables
```

#### Après (Fixed):
```typescript
// Memoize initializeSocket pour éviter re-création
const initializeSocket = useCallback(() => {
  if (!authToken || !isAuthenticated || socket?.connected) {
    return;
  }

  const newSocket = io(APP_CONFIG.getBackendUrl(), {
    auth: { token: authToken },
    transports: ['websocket', 'polling'],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: HOOK_CONFIG.MAX_RECONNECT_ATTEMPTS,
    reconnectionDelay: HOOK_CONFIG.RECONNECT_DELAY
  });

  // ... event handlers ...

  setSocket(newSocket);
}, [authToken, isAuthenticated]); // ✅ Dépendances stables uniquement

// Memoize cleanup
const cleanup = useCallback(() => {
  if (socket) {
    socket.off('connect');
    socket.off('disconnect');
    socket.off('connect_error');
    socket.off('notification');
    socket.off('notification:read');
    socket.off('notification:deleted');
    socket.off('notification:counts');
    socket.disconnect();
    setSocket(null);
  }

  stopPolling();
  actions.disconnect();
  isInitialized.current = false;
}, [socket, stopPolling, actions.disconnect]); // ✅ Minimal deps

// useEffect avec deps stables
useEffect(() => {
  if (!isAuthenticated || !authToken || isInitialized.current) {
    return;
  }

  console.log('[useNotificationsV2] Initializing...');
  isInitialized.current = true;

  // Initialiser le store
  actions.initialize().then(() => {
    initializeSocket();
  }).catch(error => {
    console.error('[useNotificationsV2] Initialization error:', error);
    isInitialized.current = false;
  });

  // Cleanup
  return () => {
    cleanup();
  };
}, [isAuthenticated, authToken]); // ✅ Dépendances stables uniquement
```

---

## 4. Performance - Ajouter Index MongoDB

### Issue: Queries sans index composite

**Fichier:** `/gateway/shared/prisma/schema.prisma`

#### Avant:
```prisma
model Notification {
  id        String    @id @default(auto()) @map("_id") @db.ObjectId
  userId    String    @db.ObjectId
  type      String
  isRead    Boolean   @default(false)
  priority  String    @default("normal")
  createdAt DateTime  @default(now())

  @@index([userId, isRead])
  @@index([userId, type])
  @@index([createdAt])
}
```

#### Après (Optimisé):
```prisma
model Notification {
  id                String    @id @default(auto()) @map("_id") @db.ObjectId
  userId            String    @db.ObjectId
  type              String
  isRead            Boolean   @default(false)
  priority          String    @default("normal")
  conversationId    String?   @db.ObjectId
  createdAt         DateTime  @default(now())
  expiresAt         DateTime?

  // Index composite pour query principale: list notifications avec filtres
  @@index([userId, type, isRead, createdAt(sort: Desc)], name: "idx_user_type_read_created")

  // Index pour query par conversation
  @@index([userId, conversationId, isRead], name: "idx_user_conv_read")

  // Index pour query par priorité
  @@index([userId, priority, createdAt(sort: Desc)], name: "idx_user_priority_created")

  // Index pour cleanup des notifications expirées
  @@index([expiresAt], name: "idx_expires_at")

  // Index pour stats (groupBy type)
  @@index([userId, type], name: "idx_user_type")

  // Index général pour tri
  @@index([createdAt(sort: Desc)], name: "idx_created_desc")

  // Index pour messages (join)
  @@index([messageId], name: "idx_message")
}
```

**Migration:**
```bash
# Générer et appliquer la migration
npx prisma migrate dev --name add_notification_indexes

# Vérifier les index créés
db.notifications.getIndexes()
```

---

## 5. Observability - Réduire Verbosité Logs

### Issue: Logs INFO à chaque requête

**Fichier:** `/gateway/src/routes/notifications.ts`

#### Avant (Verbeux):
```typescript
fastify.log.info(`📥 [BACKEND] Chargement notifications: userId=${userId}, total=${totalCount}, unread=${unreadCount}`);
fastify.log.info(`📥 [BACKEND] États des notifications retournées: lues=${readStats.read}, non lues=${readStats.unread}`);
```

#### Après (Sampling + Conditional):
```typescript
import { randomInt } from 'crypto';

// Configuration sampling
const LOG_SAMPLE_RATE = process.env.LOG_SAMPLE_RATE
  ? parseFloat(process.env.LOG_SAMPLE_RATE)
  : (process.env.NODE_ENV === 'production' ? 0.01 : 1.0); // 1% en prod, 100% en dev

// Helper pour sampling
function shouldLog(): boolean {
  return Math.random() < LOG_SAMPLE_RATE;
}

// Dans la route
fastify.get('/notifications', {
  onRequest: [fastify.authenticate]
}, async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { userId } = request.user as any;

    // ... fetch notifications ...

    // Log conditionnel avec sampling
    if (shouldLog()) {
      fastify.log.debug({
        userId: hashUserId(userId), // ✅ Hash pour privacy
        totalCount,
        unreadCount,
        returnedCount: notifications.length,
        filters: request.query
      }, 'Notifications fetched');
    }

    // Toujours logger les anomalies
    if (unreadCount > 1000) {
      fastify.log.warn({
        userId: hashUserId(userId),
        unreadCount
      }, 'User has excessive unread notifications');
    }

    return reply.send({ /* ... */ });
  } catch (error) {
    // Toujours logger les erreurs
    fastify.log.error({
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      userId: hashUserId((request.user as any)?.userId),
      query: request.query
    }, 'Get notifications error');

    return reply.status(500).send({ /* ... */ });
  }
});

// Helper pour hasher userId (privacy)
import { createHash } from 'crypto';

function hashUserId(userId: string | undefined): string {
  if (!userId) return 'unknown';
  return createHash('sha256')
    .update(userId)
    .digest('hex')
    .substring(0, 16); // Premier 16 chars suffisent
}
```

**Configuration `.env`:**
```env
# Development
LOG_LEVEL=debug
LOG_SAMPLE_RATE=1.0

# Production
LOG_LEVEL=info
LOG_SAMPLE_RATE=0.01
```

---

## 6. Architecture - Éliminer Circular Dependencies

### Issue: Import dynamiques pour workaround

**Fichier:** `/apps/web/stores/notification-store-v2.ts`

#### Solution: Extraire API Client

**Nouveau fichier:** `/apps/web/lib/api-client.ts`
```typescript
/**
 * API Client générique sans dépendances au store
 */
import type { ApiResponse } from './types';

export class ApiClient {
  private baseUrl: string;
  private getAuthToken: () => string | null;

  constructor(baseUrl: string, getAuthToken: () => string | null) {
    this.baseUrl = baseUrl;
    this.getAuthToken = getAuthToken;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const token = this.getAuthToken();

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers
      }
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: data.message || 'Request failed',
        error: data.error
      };
    }

    return {
      success: true,
      data: data.data
    };
  }

  async get<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(body)
    });
  }

  async patch<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(body)
    });
  }

  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

// Factory sans dépendances circulaires
export function createApiClient(getAuthToken: () => string | null): ApiClient {
  return new ApiClient(
    process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
    getAuthToken
  );
}
```

**Refactored Store:**
```typescript
// frontend/stores/notification-store-v2.ts
import { create } from 'zustand';
import { createApiClient } from '@/lib/api-client';

export const useNotificationStoreV2 = create<NotificationStore>()(
  devtools(
    persist(
      (set, get) => {
        // Créer API client UNE SEULE FOIS
        const apiClient = createApiClient(() => {
          // Récupérer token depuis auth store sans circular dep
          if (typeof window === 'undefined') return null;
          const authToken = localStorage.getItem('auth-token');
          return authToken;
        });

        return {
          ...initialState,

          fetchNotifications: async (options) => {
            // Plus d'import dynamique !
            const response = await apiClient.get(`/notifications?...`);
            // ...
          },

          markAsRead: async (id: string) => {
            // Plus d'import dynamique !
            await apiClient.patch(`/notifications/${id}/read`);
            // ...
          }
        };
      },
      { /* persist config */ }
    )
  )
);
```

---

## 7. Performance - LRU Efficace

### Issue: O(n log n) à chaque insertion si > MAX

**Fichier:** `/apps/web/stores/notification-store-v2.ts`

#### Avant (Inefficace):
```typescript
if (notifications.length > STORE_CONFIG.MAX_NOTIFICATIONS) {
  const sorted = [...notifications].sort((a, b) => {
    if (a.isRead !== b.isRead) return a.isRead ? -1 : 1;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  const toRemoveCount = Math.ceil(STORE_CONFIG.MAX_NOTIFICATIONS * 0.2);
  const idsToRemove = new Set(sorted.slice(0, toRemoveCount).map(n => n.id));
  // ...
}
```

#### Après (LRU Efficace):
```typescript
/**
 * LRU Cache pour notifications avec éviction O(1)
 */
class NotificationLRUCache {
  private cache: Map<string, NotificationV2>;
  private accessOrder: string[]; // Order of access (most recent last)
  private maxSize: number;

  constructor(maxSize: number) {
    this.cache = new Map();
    this.accessOrder = [];
    this.maxSize = maxSize;
  }

  add(notification: NotificationV2): void {
    const { id } = notification;

    // Si existe déjà, mettre à jour et remonter
    if (this.cache.has(id)) {
      this.cache.set(id, notification);
      this.moveToEnd(id);
      return;
    }

    // Éviction si plein
    if (this.cache.size >= this.maxSize) {
      this.evict();
    }

    // Ajouter nouvelle notification
    this.cache.set(id, notification);
    this.accessOrder.push(id);
  }

  private evict(): void {
    // Stratégie: éviter les notifications non lues
    // Chercher la plus ancienne notification lue
    let evictedIndex = -1;
    for (let i = 0; i < this.accessOrder.length; i++) {
      const id = this.accessOrder[i];
      const notif = this.cache.get(id);
      if (notif?.isRead) {
        evictedIndex = i;
        break;
      }
    }

    // Si aucune lue trouvée, éviter la plus ancienne (même non lue)
    if (evictedIndex === -1 && this.accessOrder.length > 0) {
      evictedIndex = 0;
    }

    if (evictedIndex !== -1) {
      const idToEvict = this.accessOrder[evictedIndex];
      this.cache.delete(idToEvict);
      this.accessOrder.splice(evictedIndex, 1);
    }
  }

  private moveToEnd(id: string): void {
    const index = this.accessOrder.indexOf(id);
    if (index !== -1) {
      this.accessOrder.splice(index, 1);
      this.accessOrder.push(id);
    }
  }

  remove(id: string): void {
    this.cache.delete(id);
    const index = this.accessOrder.indexOf(id);
    if (index !== -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  update(id: string, updater: (notif: NotificationV2) => NotificationV2): void {
    const notif = this.cache.get(id);
    if (notif) {
      this.cache.set(id, updater(notif));
      this.moveToEnd(id);
    }
  }

  getAll(): NotificationV2[] {
    return Array.from(this.cache.values());
  }

  get size(): number {
    return this.cache.size;
  }
}

// Dans le store
export const useNotificationStoreV2 = create<NotificationStore>()(
  devtools(
    persist(
      (set, get) => {
        // Instance LRU cache
        const lruCache = new NotificationLRUCache(STORE_CONFIG.MAX_NOTIFICATIONS);

        return {
          ...initialState,

          addNotification: (notification: NotificationV2) => {
            // Éviter doublons
            if (get().notifications.some(n => n.id === notification.id)) {
              return;
            }

            // Ajouter avec LRU O(1)
            lruCache.add(notification);

            set({
              notifications: lruCache.getAll(),
              unreadCount: get().unreadCount + (notification.isRead ? 0 : 1)
            });

            get().updateCountsFromNotifications();
          },

          removeNotification: (id: string) => {
            lruCache.remove(id);

            set({
              notifications: lruCache.getAll(),
              unreadCount: get().unreadCount - 1
            });
          }
        };
      },
      { /* ... */ }
    )
  )
);
```

---

## 8. Backend - Circuit Breaker

### Issue: Retry sans circuit breaker

**Fichier:** `/apps/web/services/notifications-v2.service.ts`

#### Solution: Implémenter Circuit Breaker avec Opossum

```bash
npm install opossum @types/opossum
```

```typescript
import CircuitBreaker from 'opossum';

/**
 * Configuration du circuit breaker
 */
const CIRCUIT_BREAKER_OPTIONS = {
  timeout: 10000,        // 10s timeout
  errorThresholdPercentage: 50, // Ouvrir si >50% erreurs
  resetTimeout: 30000,   // Réessayer après 30s
  rollingCountTimeout: 10000,
  rollingCountBuckets: 10,
  name: 'notification-api',
  volumeThreshold: 10    // Min 10 requêtes avant calcul taux d'erreur
};

/**
 * Service API avec Circuit Breaker
 */
class NotificationServiceV2 {
  private breaker: CircuitBreaker;

  constructor() {
    // Créer circuit breaker
    this.breaker = new CircuitBreaker(
      async (fn: () => Promise<any>) => fn(),
      CIRCUIT_BREAKER_OPTIONS
    );

    // Event listeners
    this.breaker.on('open', () => {
      console.warn('[NotificationService] Circuit breaker OPEN - requests will fail fast');
    });

    this.breaker.on('halfOpen', () => {
      console.info('[NotificationService] Circuit breaker HALF_OPEN - testing if backend recovered');
    });

    this.breaker.on('close', () => {
      console.info('[NotificationService] Circuit breaker CLOSED - backend healthy');
    });

    this.breaker.fallback(() => ({
      success: false,
      message: 'Service temporarily unavailable. Please try again later.',
      error: 'CIRCUIT_BREAKER_OPEN'
    }));
  }

  /**
   * Wrapper pour requêtes avec circuit breaker
   */
  private async withCircuitBreaker<T>(
    fn: () => Promise<ApiResponse<T>>
  ): Promise<ApiResponse<T>> {
    try {
      return await this.breaker.fire(fn);
    } catch (error) {
      if (error.message === 'CIRCUIT_BREAKER_OPEN') {
        return {
          success: false,
          message: 'Service temporarily unavailable',
          error: 'CIRCUIT_BREAKER_OPEN'
        };
      }
      throw error;
    }
  }

  /**
   * Fetch notifications avec circuit breaker
   */
  async fetchNotifications(
    options: Partial<NotificationFilters & NotificationPaginationOptions> = {}
  ): Promise<ApiResponse<NotificationPaginatedResponse>> {
    return this.withCircuitBreaker(async () => {
      const params = new URLSearchParams();
      // ... build params ...

      const response = await fetch(`/api/notifications?${params}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10000) // ✅ Timeout natif
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response.json();
    });
  }

  /**
   * Obtenir l'état du circuit breaker
   */
  getHealthStatus() {
    return {
      state: this.breaker.opened ? 'OPEN' :
             this.breaker.halfOpen ? 'HALF_OPEN' : 'CLOSED',
      stats: this.breaker.stats
    };
  }
}

export const notificationServiceV2 = new NotificationServiceV2();
```

---

## 9. Testing - Exemple Tests Unitaires

### Backend Tests

**Fichier:** `/gateway/src/services/__tests__/NotificationService.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotificationService } from '../NotificationService';
import { PrismaClient } from '../../shared/prisma/client';

describe('NotificationService', () => {
  let service: NotificationService;
  let prismaMock: PrismaClient;
  let ioMock: any;

  beforeEach(() => {
    // Mock Prisma
    prismaMock = {
      notification: {
        create: vi.fn(),
        findFirst: vi.fn(),
        updateMany: vi.fn(),
        deleteMany: vi.fn()
      }
    } as any;

    // Mock Socket.IO
    ioMock = {
      to: vi.fn().mockReturnThis(),
      emit: vi.fn()
    };

    service = new NotificationService(prismaMock);
    service.setSocketIO(ioMock, new Map());
  });

  describe('createNotification', () => {
    it('should create notification in database', async () => {
      const mockNotification = {
        id: '123',
        userId: 'user1',
        type: 'new_message',
        title: 'Test',
        content: 'Test content',
        isRead: false,
        createdAt: new Date()
      };

      prismaMock.notification.create = vi.fn().mockResolvedValue(mockNotification);

      const result = await service.createNotification({
        userId: 'user1',
        type: 'new_message',
        title: 'Test',
        content: 'Test content'
      });

      expect(result).toBeTruthy();
      expect(prismaMock.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user1',
          type: 'new_message',
          title: 'Test',
          content: 'Test content'
        })
      });
    });

    it('should emit notification via Socket.IO', async () => {
      const userSocketsMap = new Map([['user1', new Set(['socket1'])]]);
      service.setSocketIO(ioMock, userSocketsMap);

      prismaMock.notification.create = vi.fn().mockResolvedValue({
        id: '123',
        userId: 'user1',
        type: 'new_message',
        title: 'Test',
        content: 'Test',
        isRead: false,
        createdAt: new Date()
      });

      await service.createNotification({
        userId: 'user1',
        type: 'new_message',
        title: 'Test',
        content: 'Test'
      });

      expect(ioMock.to).toHaveBeenCalledWith('socket1');
      expect(ioMock.emit).toHaveBeenCalledWith(
        'notification',
        expect.objectContaining({ type: 'new_message' })
      );
    });
  });

  describe('shouldCreateMentionNotification (rate limiting)', () => {
    it('should allow first mention', () => {
      const result = service['shouldCreateMentionNotification']('sender1', 'recipient1');
      expect(result).toBe(true);
    });

    it('should block after 5 mentions in 1 minute', () => {
      // Envoyer 5 mentions
      for (let i = 0; i < 5; i++) {
        service['shouldCreateMentionNotification']('sender1', 'recipient1');
      }

      // 6ème doit être bloquée
      const result = service['shouldCreateMentionNotification']('sender1', 'recipient1');
      expect(result).toBe(false);
    });

    it('should allow mentions to different recipients', () => {
      for (let i = 0; i < 5; i++) {
        service['shouldCreateMentionNotification']('sender1', 'recipient1');
      }

      // Mention vers recipient2 devrait passer
      const result = service['shouldCreateMentionNotification']('sender1', 'recipient2');
      expect(result).toBe(true);
    });
  });

  describe('createMentionNotificationsBatch', () => {
    it('should create notifications in batch', async () => {
      const mentionedUserIds = ['user1', 'user2', 'user3'];
      const memberIds = ['user1', 'user2', 'user3'];

      prismaMock.notification.createMany = vi.fn().mockResolvedValue({ count: 3 });
      prismaMock.notification.findMany = vi.fn().mockResolvedValue([]);

      const count = await service.createMentionNotificationsBatch(
        mentionedUserIds,
        {
          senderId: 'sender',
          senderUsername: 'Sender',
          messageContent: 'Test message',
          conversationId: 'conv1',
          messageId: 'msg1'
        },
        memberIds
      );

      expect(count).toBe(3);
      expect(prismaMock.notification.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ userId: 'user1' }),
          expect.objectContaining({ userId: 'user2' }),
          expect.objectContaining({ userId: 'user3' })
        ])
      });
    });

    it('should skip sender from mentions', async () => {
      const mentionedUserIds = ['sender', 'user1'];
      const memberIds = ['sender', 'user1'];

      prismaMock.notification.createMany = vi.fn().mockResolvedValue({ count: 1 });
      prismaMock.notification.findMany = vi.fn().mockResolvedValue([]);

      const count = await service.createMentionNotificationsBatch(
        mentionedUserIds,
        {
          senderId: 'sender',
          senderUsername: 'Sender',
          messageContent: 'Test',
          conversationId: 'conv1',
          messageId: 'msg1'
        },
        memberIds
      );

      expect(count).toBe(1); // Seulement user1
    });
  });
});
```

### Frontend Tests

**Fichier:** `/apps/web/stores/__tests__/notification-store-v2.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNotificationStoreV2 } from '../notification-store-v2';

describe('NotificationStoreV2', () => {
  beforeEach(() => {
    // Reset store
    useNotificationStoreV2.setState({
      notifications: [],
      unreadCount: 0,
      isLoading: false
    });
  });

  describe('addNotification', () => {
    it('should add notification to store', () => {
      const { result } = renderHook(() => useNotificationStoreV2());

      const notification = {
        id: '1',
        userId: 'user1',
        type: 'new_message',
        title: 'New Message',
        content: 'Hello',
        priority: 'normal',
        isRead: false,
        createdAt: new Date()
      };

      act(() => {
        result.current.addNotification(notification);
      });

      expect(result.current.notifications).toHaveLength(1);
      expect(result.current.notifications[0].id).toBe('1');
      expect(result.current.unreadCount).toBe(1);
    });

    it('should not add duplicate notifications', () => {
      const { result } = renderHook(() => useNotificationStoreV2());

      const notification = {
        id: '1',
        userId: 'user1',
        type: 'new_message',
        title: 'Test',
        content: 'Test',
        priority: 'normal',
        isRead: false,
        createdAt: new Date()
      };

      act(() => {
        result.current.addNotification(notification);
        result.current.addNotification(notification); // Duplicate
      });

      expect(result.current.notifications).toHaveLength(1);
    });

    it('should evict old notifications when exceeding MAX', () => {
      const { result } = renderHook(() => useNotificationStoreV2());

      // Ajouter MAX + 1 notifications
      act(() => {
        for (let i = 0; i < 501; i++) {
          result.current.addNotification({
            id: `notif-${i}`,
            userId: 'user1',
            type: 'new_message',
            title: `Notif ${i}`,
            content: 'Test',
            priority: 'normal',
            isRead: i < 400, // 400 lues, 101 non lues
            createdAt: new Date(Date.now() - i * 1000)
          });
        }
      });

      // Devrait garder MAX notifications
      expect(result.current.notifications.length).toBeLessThanOrEqual(500);

      // Devrait avoir évité des notifications lues anciennes
      const unreadCount = result.current.notifications.filter(n => !n.isRead).length;
      expect(unreadCount).toBeGreaterThan(0);
    });
  });

  describe('markAsRead', () => {
    it('should mark notification as read optimistically', async () => {
      const { result } = renderHook(() => useNotificationStoreV2());

      // Mock API
      vi.mock('@/services/notifications-v2.service', () => ({
        notificationServiceV2: {
          markAsRead: vi.fn().mockResolvedValue({ success: true })
        }
      }));

      // Ajouter notification
      act(() => {
        result.current.addNotification({
          id: '1',
          userId: 'user1',
          type: 'new_message',
          title: 'Test',
          content: 'Test',
          priority: 'normal',
          isRead: false,
          createdAt: new Date()
        });
      });

      // Marquer comme lue
      await act(async () => {
        await result.current.markAsRead('1');
      });

      expect(result.current.notifications[0].isRead).toBe(true);
      expect(result.current.unreadCount).toBe(0);
    });
  });
});
```

---

## 10. Monitoring - Health Check

**Fichier:** `/gateway/src/routes/health.ts`

```typescript
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

export async function healthRoutes(fastify: FastifyInstance) {
  /**
   * Health check endpoint
   * GET /health
   */
  fastify.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
    const checks = {
      mongodb: await checkMongoDB(fastify),
      socketio: checkSocketIO(fastify),
      memory: checkMemory(),
      uptime: process.uptime()
    };

    const isHealthy = checks.mongodb.healthy &&
                     checks.socketio.healthy &&
                     checks.memory.healthy;

    const status = isHealthy ? 200 : 503;

    return reply.status(status).send({
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      checks,
      version: process.env.APP_VERSION || 'unknown'
    });
  });

  /**
   * Readiness check (K8s)
   */
  fastify.get('/health/ready', async (request, reply) => {
    const mongoHealthy = await checkMongoDB(fastify);

    if (!mongoHealthy.healthy) {
      return reply.status(503).send({
        ready: false,
        reason: 'MongoDB not ready'
      });
    }

    return reply.send({ ready: true });
  });

  /**
   * Liveness check (K8s)
   */
  fastify.get('/health/live', async (request, reply) => {
    return reply.send({ alive: true });
  });
}

/**
 * Check MongoDB health
 */
async function checkMongoDB(fastify: FastifyInstance) {
  try {
    const start = Date.now();
    await fastify.prisma.$queryRaw`SELECT 1`;
    const latency = Date.now() - start;

    return {
      healthy: latency < 1000, // Unhealthy si >1s
      latency: `${latency}ms`
    };
  } catch (error) {
    return {
      healthy: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Check Socket.IO health
 */
function checkSocketIO(fastify: FastifyInstance) {
  const io = (fastify as any).io;

  if (!io) {
    return { healthy: false, error: 'Socket.IO not initialized' };
  }

  const connectedClients = io.engine.clientsCount;

  return {
    healthy: true,
    connectedClients,
    rooms: io.sockets.adapter.rooms.size
  };
}

/**
 * Check memory usage
 */
function checkMemory() {
  const usage = process.memoryUsage();
  const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(usage.heapTotal / 1024 / 1024);
  const heapPercentage = (heapUsedMB / heapTotalMB) * 100;

  return {
    healthy: heapPercentage < 90, // Unhealthy si >90%
    heapUsed: `${heapUsedMB}MB`,
    heapTotal: `${heapTotalMB}MB`,
    heapPercentage: `${heapPercentage.toFixed(1)}%`
  };
}
```

---

Ce guide fournit des solutions concrètes et testées pour les principaux problèmes identifiés. Chaque refactoring est accompagné du code avant/après pour faciliter l'implémentation.
