/**
 * Tests pour les corrections Phase 2 des schémas Fastify
 * Validation des champs haute priorité (réactions, pinning, traductions)
 */

import { describe, it, expect } from 'vitest';
import { messageSchema, conversationSchema, messageTranslationSchema } from '../api-schemas';

describe('Phase 2 - Corrections Haute Priorité Schémas', () => {
  describe('messageSchema - Champs Pinning', () => {
    it('devrait avoir pinnedAt dans le schéma properties', () => {
      expect(messageSchema.properties).toHaveProperty('pinnedAt');
      expect(messageSchema.properties.pinnedAt).toMatchObject({
        type: 'string',
        format: 'date-time',
        nullable: true,
        description: 'Date when message was pinned (null = not pinned)'
      });
    });

    it('devrait avoir pinnedBy dans le schéma properties', () => {
      expect(messageSchema.properties).toHaveProperty('pinnedBy');
      expect(messageSchema.properties.pinnedBy).toMatchObject({
        type: 'string',
        nullable: true,
        description: 'User ID who pinned the message'
      });
    });
  });

  describe('messageSchema - Champs Réactions', () => {
    it('devrait avoir reactionSummary dans le schéma properties', () => {
      expect(messageSchema.properties).toHaveProperty('reactionSummary');
      expect(messageSchema.properties.reactionSummary).toMatchObject({
        type: 'object',
        nullable: true,
        description: 'Reaction counts by emoji (e.g., {"❤️": 5, "👍": 3})',
        additionalProperties: { type: 'number' }
      });
    });

    it('devrait avoir reactionCount dans le schéma properties', () => {
      expect(messageSchema.properties).toHaveProperty('reactionCount');
      expect(messageSchema.properties.reactionCount).toMatchObject({
        type: 'number',
        description: 'Total number of reactions on this message',
        default: 0
      });
    });

    it('reactionSummary devrait accepter additionalProperties de type number', () => {
      const { reactionSummary } = messageSchema.properties;
      expect(reactionSummary.additionalProperties).toEqual({ type: 'number' });
    });
  });

  describe('messageSchema - Champs Mentions', () => {
    it('devrait avoir validatedMentions dans le schéma properties', () => {
      expect(messageSchema.properties).toHaveProperty('validatedMentions');
      expect(messageSchema.properties.validatedMentions).toMatchObject({
        type: 'array',
        items: { type: 'string' },
        nullable: true,
        description: 'Array of validated user IDs mentioned in message'
      });
    });

    it('validatedMentions devrait être un tableau de strings', () => {
      const { validatedMentions } = messageSchema.properties;
      expect(validatedMentions.type).toBe('array');
      expect(validatedMentions.items).toEqual({ type: 'string' });
    });
  });

  describe('conversationSchema - Champs Permissions', () => {
    it('devrait avoir isArchived dans le schéma properties', () => {
      expect(conversationSchema.properties).toHaveProperty('isArchived');
      expect(conversationSchema.properties.isArchived).toMatchObject({
        type: 'boolean',
        nullable: true,
        deprecated: true
      });
    });

    it('devrait avoir defaultWriteRole dans le schéma properties', () => {
      expect(conversationSchema.properties).toHaveProperty('defaultWriteRole');
      expect(conversationSchema.properties.defaultWriteRole).toMatchObject({
        type: 'string',
        enum: ['everyone', 'member', 'moderator', 'admin', 'creator'],
        nullable: true,
        description: 'Minimum role required to send messages'
      });
    });

    it('devrait avoir slowModeSeconds dans le schéma properties', () => {
      expect(conversationSchema.properties).toHaveProperty('slowModeSeconds');
      expect(conversationSchema.properties.slowModeSeconds).toMatchObject({
        type: 'number',
        nullable: true,
        description: 'Minimum seconds between messages per user (0 = disabled)',
        default: 0
      });
    });

    it('defaultWriteRole devrait avoir 5 rôles valides', () => {
      const { defaultWriteRole } = conversationSchema.properties;
      expect(defaultWriteRole.enum).toHaveLength(5);
      expect(defaultWriteRole.enum).toContain('everyone');
      expect(defaultWriteRole.enum).toContain('creator');
    });
  });

  describe('conversationSchema - Champs Configuration', () => {
    it('devrait avoir encryptionProtocol dans le schéma properties', () => {
      expect(conversationSchema.properties).toHaveProperty('encryptionProtocol');
      expect(conversationSchema.properties.encryptionProtocol).toMatchObject({
        type: 'string',
        nullable: true,
        description: 'Encryption protocol used (aes-256-gcm, signal_v3)'
      });
    });

    it('devrait avoir autoTranslateEnabled dans le schéma properties', () => {
      expect(conversationSchema.properties).toHaveProperty('autoTranslateEnabled');
      expect(conversationSchema.properties.autoTranslateEnabled).toMatchObject({
        type: 'boolean',
        nullable: true,
        description: 'Auto-translation enabled (disabled for E2EE conversations)'
      });
    });
  });

  describe('messageTranslationSchema - Champs Timestamp', () => {
    it('devrait avoir updatedAt dans le schéma properties', () => {
      expect(messageTranslationSchema.properties).toHaveProperty('updatedAt');
      expect(messageTranslationSchema.properties.updatedAt).toMatchObject({
        type: 'string',
        format: 'date-time',
        nullable: true,
        description: 'Translation last update timestamp'
      });
    });
  });

  describe('messageTranslationSchema - Champs Encryption', () => {
    it('devrait avoir isEncrypted dans le schéma properties', () => {
      expect(messageTranslationSchema.properties).toHaveProperty('isEncrypted');
      expect(messageTranslationSchema.properties.isEncrypted).toMatchObject({
        type: 'boolean',
        nullable: true,
        description: 'Whether translation is encrypted (server/hybrid modes)'
      });
    });

    it('devrait avoir encryptionKeyId dans le schéma properties', () => {
      expect(messageTranslationSchema.properties).toHaveProperty('encryptionKeyId');
      expect(messageTranslationSchema.properties.encryptionKeyId).toMatchObject({
        type: 'string',
        nullable: true,
        description: 'Encryption key ID used for this translation'
      });
    });

    it('devrait avoir encryptionIv dans le schéma properties', () => {
      expect(messageTranslationSchema.properties).toHaveProperty('encryptionIv');
      expect(messageTranslationSchema.properties.encryptionIv).toMatchObject({
        type: 'string',
        nullable: true,
        description: 'Initialization vector for decryption'
      });
    });

    it('devrait avoir encryptionAuthTag dans le schéma properties', () => {
      expect(messageTranslationSchema.properties).toHaveProperty('encryptionAuthTag');
      expect(messageTranslationSchema.properties.encryptionAuthTag).toMatchObject({
        type: 'string',
        nullable: true,
        description: 'Authentication tag for integrity verification'
      });
    });
  });

  describe('Validation complète Phase 2', () => {
    it('tous les champs Phase 2 doivent être présents dans messageSchema', () => {
      const requiredFields = [
        'pinnedAt',
        'pinnedBy',
        'reactionSummary',
        'reactionCount',
        'validatedMentions'
      ];

      requiredFields.forEach(field => {
        expect(messageSchema.properties).toHaveProperty(field);
      });
    });

    it('tous les champs Phase 2 doivent être présents dans conversationSchema', () => {
      const requiredFields = [
        'isArchived',
        'defaultWriteRole',
        'slowModeSeconds',
        'encryptionProtocol',
        'autoTranslateEnabled'
      ];

      requiredFields.forEach(field => {
        expect(conversationSchema.properties).toHaveProperty(field);
      });
    });

    it('tous les champs Phase 2 doivent être présents dans messageTranslationSchema', () => {
      const requiredFields = [
        'updatedAt',
        'isEncrypted',
        'encryptionKeyId',
        'encryptionIv',
        'encryptionAuthTag'
      ];

      requiredFields.forEach(field => {
        expect(messageTranslationSchema.properties).toHaveProperty(field);
      });
    });

    it('tous les champs Phase 2 doivent être nullable ou avoir une valeur par défaut', () => {
      // messageSchema
      expect(messageSchema.properties.pinnedAt.nullable).toBe(true);
      expect(messageSchema.properties.pinnedBy.nullable).toBe(true);
      expect(messageSchema.properties.reactionSummary.nullable).toBe(true);
      expect(messageSchema.properties.reactionCount.default).toBeDefined();
      expect(messageSchema.properties.validatedMentions.nullable).toBe(true);

      // conversationSchema
      expect(conversationSchema.properties.isArchived.nullable).toBe(true);
      expect(conversationSchema.properties.defaultWriteRole.nullable).toBe(true);
      expect(conversationSchema.properties.slowModeSeconds.nullable).toBe(true);
      expect(conversationSchema.properties.encryptionProtocol.nullable).toBe(true);
      expect(conversationSchema.properties.autoTranslateEnabled.nullable).toBe(true);

      // messageTranslationSchema
      expect(messageTranslationSchema.properties.updatedAt.nullable).toBe(true);
      expect(messageTranslationSchema.properties.isEncrypted.nullable).toBe(true);
      expect(messageTranslationSchema.properties.encryptionKeyId.nullable).toBe(true);
      expect(messageTranslationSchema.properties.encryptionIv.nullable).toBe(true);
      expect(messageTranslationSchema.properties.encryptionAuthTag.nullable).toBe(true);
    });
  });

  describe('Documentation et descriptions Phase 2', () => {
    it('tous les champs Phase 2 doivent avoir des descriptions', () => {
      // messageSchema
      expect(messageSchema.properties.pinnedAt.description).toBeTruthy();
      expect(messageSchema.properties.pinnedBy.description).toBeTruthy();
      expect(messageSchema.properties.reactionSummary.description).toBeTruthy();
      expect(messageSchema.properties.reactionCount.description).toBeTruthy();
      expect(messageSchema.properties.validatedMentions.description).toBeTruthy();

      // conversationSchema
      expect(conversationSchema.properties.defaultWriteRole.description).toBeTruthy();
      expect(conversationSchema.properties.slowModeSeconds.description).toBeTruthy();
      expect(conversationSchema.properties.encryptionProtocol.description).toBeTruthy();
      expect(conversationSchema.properties.autoTranslateEnabled.description).toBeTruthy();

      // messageTranslationSchema
      expect(messageTranslationSchema.properties.updatedAt.description).toBeTruthy();
      expect(messageTranslationSchema.properties.isEncrypted.description).toBeTruthy();
      expect(messageTranslationSchema.properties.encryptionKeyId.description).toBeTruthy();
      expect(messageTranslationSchema.properties.encryptionIv.description).toBeTruthy();
      expect(messageTranslationSchema.properties.encryptionAuthTag.description).toBeTruthy();
    });

    it('les descriptions doivent être claires et complètes', () => {
      expect(messageSchema.properties.pinnedAt.description).toContain('pinned');
      expect(messageSchema.properties.reactionSummary.description).toContain('emoji');
      expect(messageSchema.properties.validatedMentions.description).toContain('mentioned');
      expect(conversationSchema.properties.slowModeSeconds.description).toContain('seconds');
      expect(conversationSchema.properties.autoTranslateEnabled.description).toContain('E2EE');
      expect(messageTranslationSchema.properties.isEncrypted.description).toContain('encrypted');
    });
  });

  describe('Compatibilité Phase 1 + Phase 2', () => {
    it('les champs Phase 1 doivent toujours être présents après Phase 2', () => {
      // Champs Phase 1 messageSchema
      expect(messageSchema.properties).toHaveProperty('encryptedContent');
      expect(messageSchema.properties).toHaveProperty('encryptionMetadata');
      expect(messageSchema.properties).toHaveProperty('maxViewOnceCount');

      // Champs Phase 1 conversationSchema
      expect(conversationSchema.properties).toHaveProperty('serverEncryptionKeyId');
      expect(conversationSchema.properties).toHaveProperty('isAnnouncementChannel');
    });

    it('les propriétés deprecated doivent être marquées correctement', () => {
      expect(conversationSchema.properties.isArchived.deprecated).toBe(true);
    });
  });
});
