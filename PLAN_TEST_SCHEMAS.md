# Plan de Test - Corrections Schémas Fastify

**Date:** 2026-01-18
**Objectif:** Valider que tous les champs manquants sont correctement sérialisés par Fastify après corrections.

---

## Vue d'Ensemble

### Stratégie de Test

1. **Tests Unitaires** - Validation des schémas JSON individuels
2. **Tests d'Intégration** - Vérification de la sérialisation complète
3. **Tests E2E** - Validation frontend → backend → frontend
4. **Tests de Régression** - Compatibilité avec données existantes

### Couverture Cible

- **Schémas:** 7/7 (100%)
- **Champs critiques:** 12/12 (100%)
- **Champs haute priorité:** 18/18 (100%)
- **Compatibilité ascendante:** 100%

---

## Phase 1: Tests Unitaires (Schémas JSON)

### 1.1 Validation Structure Schéma

**Fichier:** `packages/shared/types/__tests__/api-schemas.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import {
  messageSchema,
  conversationSchema,
  messageTranslationSchema,
  messageAttachmentSchema
} from '../api-schemas.js';

describe('API Schemas - Structure Validation', () => {
  describe('messageSchema', () => {
    it('should have all critical E2EE fields', () => {
      expect(messageSchema.properties).toHaveProperty('encryptedContent');
      expect(messageSchema.properties).toHaveProperty('encryptionMetadata');
      expect(messageSchema.properties.encryptedContent).toMatchObject({
        type: 'string',
        nullable: true
      });
    });

    it('should have delivery status fields', () => {
      expect(messageSchema.properties).toHaveProperty('receivedByAllAt');
      expect(messageSchema.properties).toHaveProperty('deliveredToAllAt');
      expect(messageSchema.properties).toHaveProperty('readByAllAt');
    });

    it('should have view-once limit field', () => {
      expect(messageSchema.properties).toHaveProperty('maxViewOnceCount');
      expect(messageSchema.properties.maxViewOnceCount).toMatchObject({
        type: 'number',
        nullable: true
      });
    });

    it('should have pinning fields', () => {
      expect(messageSchema.properties).toHaveProperty('pinnedAt');
      expect(messageSchema.properties).toHaveProperty('pinnedBy');
    });

    it('should have reaction fields', () => {
      expect(messageSchema.properties).toHaveProperty('reactionSummary');
      expect(messageSchema.properties).toHaveProperty('reactionCount');
      expect(messageSchema.properties.reactionSummary).toMatchObject({
        type: 'object',
        nullable: true
      });
    });

    it('should have validated mentions field', () => {
      expect(messageSchema.properties).toHaveProperty('validatedMentions');
      expect(messageSchema.properties.validatedMentions).toMatchObject({
        type: 'array'
      });
    });
  });

  describe('conversationSchema', () => {
    it('should have announcement mode field', () => {
      expect(conversationSchema.properties).toHaveProperty('isAnnouncementChannel');
      expect(conversationSchema.properties.isAnnouncementChannel).toMatchObject({
        type: 'boolean',
        nullable: true
      });
    });

    it('should have encryption key rotation field', () => {
      expect(conversationSchema.properties).toHaveProperty('serverEncryptionKeyId');
    });

    it('should have auto-translate field', () => {
      expect(conversationSchema.properties).toHaveProperty('autoTranslateEnabled');
    });

    it('should have write permissions fields', () => {
      expect(conversationSchema.properties).toHaveProperty('defaultWriteRole');
      expect(conversationSchema.properties).toHaveProperty('slowModeSeconds');
    });

    it('should have encryption metadata fields', () => {
      expect(conversationSchema.properties).toHaveProperty('encryptionProtocol');
      expect(conversationSchema.properties).toHaveProperty('encryptionEnabledBy');
    });
  });

  describe('messageTranslationSchema', () => {
    it('should have encryption fields', () => {
      expect(messageTranslationSchema.properties).toHaveProperty('isEncrypted');
      expect(messageTranslationSchema.properties).toHaveProperty('encryptionKeyId');
      expect(messageTranslationSchema.properties).toHaveProperty('encryptionIv');
      expect(messageTranslationSchema.properties).toHaveProperty('encryptionAuthTag');
    });

    it('should have update timestamp', () => {
      expect(messageTranslationSchema.properties).toHaveProperty('updatedAt');
    });
  });

  describe('messageAttachmentSchema', () => {
    it('should have transcription fields (already fixed)', () => {
      expect(messageAttachmentSchema.properties).toHaveProperty('transcriptionText');
      expect(messageAttachmentSchema.properties).toHaveProperty('transcription');
      expect(messageAttachmentSchema.properties).toHaveProperty('translationsJson');
    });
  });
});
```

**Exécution:**
```bash
cd /Users/smpceo/Documents/v2_meeshy/packages/shared
npm run test -- api-schemas.test.ts
```

**Critère de succès:** Tous les tests passent (100%)

---

## Phase 2: Tests d'Intégration (Sérialisation Fastify)

### 2.1 Test Sérialisation E2EE Messages

**Fichier:** `services/gateway/src/__tests__/integration/message-serialization.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { messageSchema } from '@meeshy/shared/types/api-schemas';

describe('Message Serialization - E2EE Fields', () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    app = Fastify();
    app.get('/test-message', {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  message: messageSchema
                }
              }
            }
          }
        }
      }
    }, async (request, reply) => {
      const mockMessage = {
        id: '507f1f77bcf86cd799439011',
        conversationId: '507f1f77bcf86cd799439012',
        content: 'Original content',
        originalLanguage: 'fr',
        messageType: 'text',
        messageSource: 'user',
        isEdited: false,
        isDeleted: false,
        isViewOnce: false,
        viewOnceCount: 0,
        maxViewOnceCount: 5, // ✅ Nouveau champ
        isBlurred: false,
        deliveredCount: 0,
        readCount: 0,
        reactionCount: 3, // ✅ Nouveau champ
        isEncrypted: true,
        encryptedContent: 'base64_encrypted_data', // ✅ Nouveau champ
        encryptionMetadata: { // ✅ Nouveau champ
          iv: 'abc123',
          authTag: 'def456',
          keyVersion: 1
        },
        pinnedAt: new Date('2026-01-18T10:00:00Z'), // ✅ Nouveau champ
        pinnedBy: '507f1f77bcf86cd799439013', // ✅ Nouveau champ
        reactionSummary: { '❤️': 2, '👍': 1 }, // ✅ Nouveau champ
        validatedMentions: ['507f1f77bcf86cd799439014'], // ✅ Nouveau champ
        receivedByAllAt: new Date('2026-01-18T10:01:00Z'), // ✅ Nouveau champ
        createdAt: new Date('2026-01-18T10:00:00Z'),
        timestamp: new Date('2026-01-18T10:00:00Z'),
        translations: [],
        attachments: []
      };

      return { success: true, data: { message: mockMessage } };
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should serialize E2EE fields correctly', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test-message'
    });

    const body = JSON.parse(response.body);
    const message = body.data.message;

    // Vérifier que les champs E2EE sont présents
    expect(message.encryptedContent).toBe('base64_encrypted_data');
    expect(message.encryptionMetadata).toEqual({
      iv: 'abc123',
      authTag: 'def456',
      keyVersion: 1
    });
  });

  it('should serialize delivery status fields correctly', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test-message'
    });

    const body = JSON.parse(response.body);
    const message = body.data.message;

    expect(message.receivedByAllAt).toBeDefined();
    expect(message.deliveredToAllAt).toBeUndefined(); // Non fourni
  });

  it('should serialize pinning fields correctly', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test-message'
    });

    const body = JSON.parse(response.body);
    const message = body.data.message;

    expect(message.pinnedAt).toBeDefined();
    expect(message.pinnedBy).toBe('507f1f77bcf86cd799439013');
  });

  it('should serialize reaction fields correctly', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test-message'
    });

    const body = JSON.parse(response.body);
    const message = body.data.message;

    expect(message.reactionSummary).toEqual({ '❤️': 2, '👍': 1 });
    expect(message.reactionCount).toBe(3);
  });

  it('should serialize view-once limit correctly', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test-message'
    });

    const body = JSON.parse(response.body);
    const message = body.data.message;

    expect(message.maxViewOnceCount).toBe(5);
  });

  it('should serialize validated mentions correctly', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test-message'
    });

    const body = JSON.parse(response.body);
    const message = body.data.message;

    expect(message.validatedMentions).toEqual(['507f1f77bcf86cd799439014']);
  });
});
```

**Exécution:**
```bash
cd /Users/smpceo/Documents/v2_meeshy/services/gateway
npm run test:integration -- message-serialization.test.ts
```

**Critère de succès:** Tous les nouveaux champs sont présents dans la réponse JSON sérialisée.

---

### 2.2 Test Sérialisation Conversation

**Fichier:** `services/gateway/src/__tests__/integration/conversation-serialization.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { conversationSchema } from '@meeshy/shared/types/api-schemas';

describe('Conversation Serialization - New Fields', () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    app = Fastify();
    app.get('/test-conversation', {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  conversation: conversationSchema
                }
              }
            }
          }
        }
      }
    }, async (request, reply) => {
      const mockConversation = {
        id: '507f1f77bcf86cd799439011',
        title: 'Test Conversation',
        type: 'group',
        status: 'active',
        visibility: 'private',
        isActive: true,
        memberCount: 5,
        participants: [],
        isAnnouncementChannel: true, // ✅ Nouveau champ
        slowModeSeconds: 30, // ✅ Nouveau champ
        defaultWriteRole: 'moderator', // ✅ Nouveau champ
        autoTranslateEnabled: true, // ✅ Nouveau champ
        encryptionMode: 'server',
        encryptionProtocol: 'aes-256-gcm', // ✅ Nouveau champ
        encryptionEnabledBy: '507f1f77bcf86cd799439013', // ✅ Nouveau champ
        serverEncryptionKeyId: 'key-rotation-001', // ✅ Nouveau champ
        isArchived: false, // ✅ Nouveau champ (deprecated)
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-18T10:00:00Z')
      };

      return { success: true, data: { conversation: mockConversation } };
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should serialize announcement mode field', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test-conversation'
    });

    const body = JSON.parse(response.body);
    const conversation = body.data.conversation;

    expect(conversation.isAnnouncementChannel).toBe(true);
  });

  it('should serialize write permission fields', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test-conversation'
    });

    const body = JSON.parse(response.body);
    const conversation = body.data.conversation;

    expect(conversation.defaultWriteRole).toBe('moderator');
    expect(conversation.slowModeSeconds).toBe(30);
  });

  it('should serialize encryption fields', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test-conversation'
    });

    const body = JSON.parse(response.body);
    const conversation = body.data.conversation;

    expect(conversation.encryptionProtocol).toBe('aes-256-gcm');
    expect(conversation.encryptionEnabledBy).toBe('507f1f77bcf86cd799439013');
    expect(conversation.serverEncryptionKeyId).toBe('key-rotation-001');
  });

  it('should serialize auto-translate field', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test-conversation'
    });

    const body = JSON.parse(response.body);
    const conversation = body.data.conversation;

    expect(conversation.autoTranslateEnabled).toBe(true);
  });
});
```

**Exécution:**
```bash
npm run test:integration -- conversation-serialization.test.ts
```

---

## Phase 3: Tests E2E (Frontend ↔ Backend)

### 3.1 Test E2EE Message Flow

**Fichier:** `apps/web/tests/e2e/e2ee-message.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('E2EE Message - Complete Flow', () => {
  test('should create, send, and display encrypted message with all fields', async ({ page }) => {
    // 1. Login
    await page.goto('/login');
    await page.fill('[data-testid="email-input"]', 'test@meeshy.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="login-button"]');

    // 2. Ouvrir conversation E2EE
    await page.click('[data-testid="conversation-list-item-e2ee"]');

    // 3. Envoyer message chiffré
    await page.fill('[data-testid="message-input"]', 'Top secret message');
    await page.click('[data-testid="send-button"]');

    // 4. Attendre la réponse API
    const messageResponse = await page.waitForResponse(
      response => response.url().includes('/api/messages') && response.status() === 200
    );

    // 5. Vérifier que la réponse contient les champs E2EE
    const messageData = await messageResponse.json();
    const message = messageData.data.message;

    expect(message.encryptedContent).toBeDefined();
    expect(message.encryptionMetadata).toBeDefined();
    expect(message.encryptionMetadata.iv).toBeDefined();
    expect(message.encryptionMetadata.authTag).toBeDefined();
    expect(message.isEncrypted).toBe(true);

    // 6. Vérifier que le message s'affiche déchiffré
    const messageElement = await page.locator('[data-testid="message-content"]').last();
    await expect(messageElement).toHaveText('Top secret message');
  });
});
```

**Exécution:**
```bash
cd /Users/smpceo/Documents/v2_meeshy/apps/web
npm run test:e2e -- e2ee-message.spec.ts
```

---

### 3.2 Test Message Épinglé

**Fichier:** `apps/web/tests/e2e/pinned-message.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Pinned Message', () => {
  test('should pin message and display pin info', async ({ page }) => {
    await page.goto('/conversations/test-conversation');

    // 1. Clic droit sur message
    await page.click('[data-testid="message-item-1"]', { button: 'right' });

    // 2. Cliquer sur "Épingler"
    await page.click('[data-testid="pin-message-action"]');

    // 3. Vérifier la réponse API
    const pinResponse = await page.waitForResponse(
      response => response.url().includes('/pin') && response.status() === 200
    );

    const pinData = await pinResponse.json();
    const message = pinData.data.message;

    expect(message.pinnedAt).toBeDefined();
    expect(message.pinnedBy).toBeDefined();

    // 4. Vérifier l'affichage UI
    const pinnedBadge = await page.locator('[data-testid="pinned-badge"]');
    await expect(pinnedBadge).toBeVisible();

    // 5. Ouvrir panneau messages épinglés
    await page.click('[data-testid="pinned-messages-button"]');
    const pinnedPanel = await page.locator('[data-testid="pinned-messages-panel"]');
    await expect(pinnedPanel).toBeVisible();
    await expect(pinnedPanel).toContainText('Épinglé par');
  });
});
```

---

### 3.3 Test Réactions

**Fichier:** `apps/web/tests/e2e/message-reactions.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Message Reactions', () => {
  test('should add reaction and update summary/count', async ({ page }) => {
    await page.goto('/conversations/test-conversation');

    // 1. Hover sur message
    await page.hover('[data-testid="message-item-1"]');

    // 2. Cliquer sur bouton réaction
    await page.click('[data-testid="add-reaction-button"]');

    // 3. Sélectionner emoji
    await page.click('[data-testid="emoji-picker-heart"]');

    // 4. Vérifier la réponse API
    const reactionResponse = await page.waitForResponse(
      response => response.url().includes('/reactions') && response.status() === 200
    );

    const reactionData = await reactionResponse.json();
    const message = reactionData.data.message;

    expect(message.reactionSummary).toBeDefined();
    expect(message.reactionSummary['❤️']).toBe(1);
    expect(message.reactionCount).toBe(1);

    // 5. Vérifier l'affichage UI
    const reactionDisplay = await page.locator('[data-testid="reaction-summary"]');
    await expect(reactionDisplay).toContainText('❤️ 1');
  });
});
```

---

### 3.4 Test Mode Annonce

**Fichier:** `apps/web/tests/e2e/announcement-channel.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Announcement Channel', () => {
  test('should disable message input for non-admin in announcement mode', async ({ page }) => {
    // 1. Activer mode annonce (en tant qu'admin)
    await page.goto('/conversations/test-group/settings');
    await page.click('[data-testid="announcement-mode-toggle"]');

    // 2. Vérifier la réponse API
    const updateResponse = await page.waitForResponse(
      response => response.url().includes('/conversations') && response.method() === 'PATCH'
    );

    const updateData = await updateResponse.json();
    const conversation = updateData.data.conversation;

    expect(conversation.isAnnouncementChannel).toBe(true);

    // 3. Se déconnecter et se reconnecter en tant que membre
    await page.goto('/logout');
    await page.goto('/login');
    await page.fill('[data-testid="email-input"]', 'member@meeshy.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="login-button"]');

    // 4. Ouvrir la conversation
    await page.goto('/conversations/test-group');

    // 5. Vérifier que l'input est désactivé
    const messageInput = await page.locator('[data-testid="message-input"]');
    await expect(messageInput).toBeDisabled();

    // 6. Vérifier le message d'avertissement
    const banner = await page.locator('[data-testid="announcement-banner"]');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Seuls les administrateurs peuvent envoyer des messages');
  });
});
```

---

## Phase 4: Tests de Régression (Compatibilité)

### 4.1 Test Compatibilité Documents Existants

**Fichier:** `services/gateway/src/__tests__/regression/backward-compatibility.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { messageSchema } from '@meeshy/shared/types/api-schemas';
import Fastify from 'fastify';

describe('Backward Compatibility - Old Documents', () => {
  it('should serialize old message without new fields', async () => {
    const app = Fastify();

    app.get('/old-message', {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              data: {
                type: 'object',
                properties: { message: messageSchema }
              }
            }
          }
        }
      }
    }, async () => {
      // Message ancien format (sans nouveaux champs)
      const oldMessage = {
        id: '507f1f77bcf86cd799439011',
        conversationId: '507f1f77bcf86cd799439012',
        content: 'Old message',
        originalLanguage: 'fr',
        messageType: 'text',
        messageSource: 'user',
        isEdited: false,
        isDeleted: false,
        isViewOnce: false,
        viewOnceCount: 0,
        isBlurred: false,
        deliveredCount: 0,
        readCount: 0,
        isEncrypted: false,
        createdAt: new Date('2025-01-01T00:00:00Z'),
        timestamp: new Date('2025-01-01T00:00:00Z'),
        translations: [],
        // ❌ Pas de: pinnedAt, reactionSummary, encryptedContent, etc.
      };

      return { data: { message: oldMessage } };
    });

    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/old-message'
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);

    // Vérifier que le message est sérialisé sans erreur
    expect(body.data.message.id).toBe('507f1f77bcf86cd799439011');
    expect(body.data.message.content).toBe('Old message');

    // Les nouveaux champs ne doivent pas être présents (nullable)
    expect(body.data.message.pinnedAt).toBeUndefined();
    expect(body.data.message.reactionSummary).toBeUndefined();
    expect(body.data.message.encryptedContent).toBeUndefined();

    await app.close();
  });

  it('should serialize conversation without new fields', async () => {
    const app = Fastify();

    app.get('/old-conversation', {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              data: {
                type: 'object',
                properties: {
                  conversation: require('@meeshy/shared/types/api-schemas').conversationSchema
                }
              }
            }
          }
        }
      }
    }, async () => {
      const oldConversation = {
        id: '507f1f77bcf86cd799439011',
        title: 'Old Conversation',
        type: 'group',
        status: 'active',
        visibility: 'private',
        isActive: true,
        memberCount: 3,
        participants: [],
        createdAt: new Date('2025-01-01T00:00:00Z'),
        updatedAt: new Date('2025-01-01T00:00:00Z'),
        // ❌ Pas de: isAnnouncementChannel, serverEncryptionKeyId, etc.
      };

      return { data: { conversation: oldConversation } };
    });

    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/old-conversation'
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);

    expect(body.data.conversation.id).toBe('507f1f77bcf86cd799439011');
    expect(body.data.conversation.isAnnouncementChannel).toBeUndefined();

    await app.close();
  });
});
```

---

## Phase 5: Tests de Performance

### 5.1 Benchmark Sérialisation

**Fichier:** `services/gateway/src/__tests__/performance/serialization-benchmark.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { messageSchema } from '@meeshy/shared/types/api-schemas';

describe('Serialization Performance', () => {
  it('should serialize complex message in < 50ms', async () => {
    const app = Fastify();

    app.get('/complex-message', {
      schema: {
        response: { 200: { type: 'object', properties: { message: messageSchema } } }
      }
    }, async () => {
      const complexMessage = {
        id: '507f1f77bcf86cd799439011',
        conversationId: '507f1f77bcf86cd799439012',
        content: 'Complex message with all fields',
        originalLanguage: 'fr',
        messageType: 'text',
        messageSource: 'user',
        isEdited: true,
        editedAt: new Date(),
        isDeleted: false,
        isViewOnce: true,
        viewOnceCount: 3,
        maxViewOnceCount: 5,
        isBlurred: true,
        pinnedAt: new Date(),
        pinnedBy: '507f1f77bcf86cd799439013',
        deliveredCount: 10,
        readCount: 8,
        reactionCount: 15,
        reactionSummary: { '❤️': 5, '👍': 4, '😂': 3, '🔥': 2, '👏': 1 },
        isEncrypted: true,
        encryptedContent: 'very_long_base64_encrypted_content_'.repeat(10),
        encryptionMetadata: {
          iv: 'abc123',
          authTag: 'def456',
          keyVersion: 2,
          protocol: 'aes-256-gcm'
        },
        validatedMentions: Array.from({ length: 10 }, (_, i) => `user-${i}`),
        receivedByAllAt: new Date(),
        deliveredToAllAt: new Date(),
        readByAllAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        timestamp: new Date(),
        sender: {
          id: '507f1f77bcf86cd799439013',
          username: 'testuser',
          displayName: 'Test User',
          avatar: 'https://example.com/avatar.jpg',
          isOnline: true
        },
        translations: Array.from({ length: 5 }, (_, i) => ({
          id: `trans-${i}`,
          messageId: '507f1f77bcf86cd799439011',
          targetLanguage: ['en', 'es', 'de', 'it', 'pt'][i],
          translatedContent: `Translated to ${i}`,
          translationModel: 'premium',
          createdAt: new Date()
        })),
        attachments: []
      };

      return { message: complexMessage };
    });

    await app.ready();

    // Mesurer le temps de sérialisation
    const startTime = performance.now();

    const response = await app.inject({
      method: 'GET',
      url: '/complex-message'
    });

    const endTime = performance.now();
    const duration = endTime - startTime;

    expect(response.statusCode).toBe(200);
    expect(duration).toBeLessThan(50); // < 50ms

    console.log(`Serialization time: ${duration.toFixed(2)}ms`);

    await app.close();
  });
});
```

---

## Checklist de Validation Finale

### Pré-déploiement

- [ ] **Tous les tests unitaires passent** (Phase 1)
- [ ] **Tous les tests d'intégration passent** (Phase 2)
- [ ] **Tests E2E critiques passent** (Phase 3)
  - [ ] E2EE message flow
  - [ ] Pinned messages
  - [ ] Reactions
  - [ ] Announcement channel
- [ ] **Tests de compatibilité passent** (Phase 4)
- [ ] **Benchmarks performance < 50ms** (Phase 5)

### Documentation

- [ ] **Swagger UI mise à jour** (`/documentation`)
- [ ] **CHANGELOG.md mis à jour**
- [ ] **Migration guide créé** (si nécessaire)
- [ ] **Client SDK régénéré** (TypeScript/Python)

### Validation Manuelle

- [ ] **Tester avec Postman/Insomnia**
  - [ ] Créer message E2EE → Vérifier `encryptedContent`
  - [ ] Épingler message → Vérifier `pinnedAt`/`pinnedBy`
  - [ ] Ajouter réaction → Vérifier `reactionSummary`
  - [ ] Activer mode annonce → Vérifier `isAnnouncementChannel`

- [ ] **Tester sur frontend**
  - [ ] Message E2EE s'affiche correctement
  - [ ] Badge épinglé visible
  - [ ] Compteur réactions visible
  - [ ] Input désactivé en mode annonce

### Monitoring Post-déploiement

- [ ] **Surveiller logs erreurs** (24h)
- [ ] **Vérifier métriques performance** (Grafana)
- [ ] **Monitoring sentry** (erreurs sérialisation)
- [ ] **Feedback utilisateurs** (bugs signalés)

---

## Scripts Utiles

### Exécuter tous les tests

```bash
# Tests unitaires
cd /Users/smpceo/Documents/v2_meeshy/packages/shared
npm run test

# Tests intégration
cd /Users/smpceo/Documents/v2_meeshy/services/gateway
npm run test:integration

# Tests E2E
cd /Users/smpceo/Documents/v2_meeshy/apps/web
npm run test:e2e

# Tests performance
cd /Users/smpceo/Documents/v2_meeshy/services/gateway
npm run test:performance
```

### Test manuel avec curl

```bash
# Variables
TOKEN="your_jwt_token_here"
GATEWAY_URL="http://localhost:3000"

# Test 1: Message avec nouveaux champs
curl -X POST "$GATEWAY_URL/api/conversations/test-conv/messages" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Test message",
    "isEncrypted": true,
    "encryptedContent": "encrypted_data",
    "encryptionMetadata": {"iv": "abc", "authTag": "def"}
  }' | jq '.data.message | {encryptedContent, encryptionMetadata}'

# Test 2: Épingler message
curl -X POST "$GATEWAY_URL/api/messages/msg-id/pin" \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.data.message | {pinnedAt, pinnedBy}'

# Test 3: Ajouter réaction
curl -X POST "$GATEWAY_URL/api/messages/msg-id/reactions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"emoji": "❤️"}' \
  | jq '.data.message | {reactionSummary, reactionCount}'

# Test 4: Mode annonce
curl -X PATCH "$GATEWAY_URL/api/conversations/conv-id" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"isAnnouncementChannel": true}' \
  | jq '.data.conversation | {isAnnouncementChannel, defaultWriteRole}'
```

---

**Plan créé par:** Claude Sonnet 4.5
**Date:** 2026-01-18
