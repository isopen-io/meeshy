/**
 * Tests pour les corrections Phase 1 des schémas Fastify
 * Validation des champs critiques E2EE et sécurité
 */

import { describe, it, expect } from 'vitest';
import { messageSchema, conversationSchema } from '../api-schemas';

describe('Phase 1 - Corrections Critiques Schémas', () => {
  describe('messageSchema - Champs E2EE', () => {
    it('devrait avoir encryptedContent dans le schéma properties', () => {
      expect(messageSchema.properties).toHaveProperty('encryptedContent');
      expect(messageSchema.properties.encryptedContent).toMatchObject({
        type: 'string',
        nullable: true,
        description: 'Base64 encoded ciphertext for E2EE messages'
      });
    });

    it('devrait avoir encryptionMetadata dans le schéma properties', () => {
      expect(messageSchema.properties).toHaveProperty('encryptionMetadata');
      expect(messageSchema.properties.encryptionMetadata).toMatchObject({
        type: 'object',
        nullable: true,
        description: 'Encryption metadata (IV, auth tag, key version)',
        additionalProperties: true
      });
    });

    it('devrait avoir les propriétés E2EE correctement typées', () => {
      const { encryptedContent, encryptionMetadata } = messageSchema.properties;

      expect(encryptedContent.type).toBe('string');
      expect(encryptedContent.nullable).toBe(true);

      expect(encryptionMetadata.type).toBe('object');
      expect(encryptionMetadata.nullable).toBe(true);
      expect(encryptionMetadata.additionalProperties).toBe(true);
    });
  });

  describe('messageSchema - Champs View-Once', () => {
    it('devrait avoir maxViewOnceCount dans le schéma properties', () => {
      expect(messageSchema.properties).toHaveProperty('maxViewOnceCount');
      expect(messageSchema.properties.maxViewOnceCount).toMatchObject({
        type: 'number',
        nullable: true,
        description: 'Maximum unique viewers allowed for view-once messages'
      });
    });

    it('devrait avoir maxViewOnceCount correctement typé', () => {
      const { maxViewOnceCount } = messageSchema.properties;

      expect(maxViewOnceCount.type).toBe('number');
      expect(maxViewOnceCount.nullable).toBe(true);
    });
  });

  describe('messageSchema - Champs Delivery', () => {
    it('devrait avoir receivedByAllAt dans le schéma properties', () => {
      expect(messageSchema.properties).toHaveProperty('receivedByAllAt');
      expect(messageSchema.properties.receivedByAllAt).toMatchObject({
        type: 'string',
        format: 'date-time',
        nullable: true,
        description: 'Received by all recipients timestamp'
      });
    });

    it('devrait avoir receivedByAllAt correctement typé', () => {
      const { receivedByAllAt } = messageSchema.properties;

      expect(receivedByAllAt.type).toBe('string');
      expect(receivedByAllAt.format).toBe('date-time');
      expect(receivedByAllAt.nullable).toBe(true);
    });
  });

  describe('conversationSchema - Champs Encryption', () => {
    it('devrait avoir serverEncryptionKeyId dans le schéma properties', () => {
      expect(conversationSchema.properties).toHaveProperty('serverEncryptionKeyId');
      expect(conversationSchema.properties.serverEncryptionKeyId).toMatchObject({
        type: 'string',
        nullable: true,
        description: 'Server-side encryption key ID for key rotation'
      });
    });

    it('devrait avoir serverEncryptionKeyId correctement typé', () => {
      const { serverEncryptionKeyId } = conversationSchema.properties;

      expect(serverEncryptionKeyId.type).toBe('string');
      expect(serverEncryptionKeyId.nullable).toBe(true);
    });
  });

  describe('conversationSchema - Champs Permissions', () => {
    it('devrait avoir isAnnouncementChannel dans le schéma properties', () => {
      expect(conversationSchema.properties).toHaveProperty('isAnnouncementChannel');
      expect(conversationSchema.properties.isAnnouncementChannel).toMatchObject({
        type: 'boolean',
        nullable: true,
        description: 'Announcement-only mode (only creator/admins can write)',
        default: false
      });
    });

    it('devrait avoir isAnnouncementChannel avec default: false', () => {
      const { isAnnouncementChannel } = conversationSchema.properties;

      expect(isAnnouncementChannel.type).toBe('boolean');
      expect(isAnnouncementChannel.nullable).toBe(true);
      expect(isAnnouncementChannel.default).toBe(false);
    });
  });

  describe('Validation complète Phase 1', () => {
    it('tous les champs Phase 1 doivent être présents dans messageSchema', () => {
      const requiredFields = [
        'encryptedContent',
        'encryptionMetadata',
        'maxViewOnceCount',
        'receivedByAllAt'
      ];

      requiredFields.forEach(field => {
        expect(messageSchema.properties).toHaveProperty(field);
      });
    });

    it('tous les champs Phase 1 doivent être présents dans conversationSchema', () => {
      const requiredFields = [
        'serverEncryptionKeyId',
        'isAnnouncementChannel'
      ];

      requiredFields.forEach(field => {
        expect(conversationSchema.properties).toHaveProperty(field);
      });
    });

    it('tous les champs Phase 1 doivent être nullable ou avoir une valeur par défaut', () => {
      // messageSchema
      expect(messageSchema.properties.encryptedContent.nullable).toBe(true);
      expect(messageSchema.properties.encryptionMetadata.nullable).toBe(true);
      expect(messageSchema.properties.maxViewOnceCount.nullable).toBe(true);
      expect(messageSchema.properties.receivedByAllAt.nullable).toBe(true);

      // conversationSchema
      expect(conversationSchema.properties.serverEncryptionKeyId.nullable).toBe(true);
      expect(conversationSchema.properties.isAnnouncementChannel.nullable).toBe(true);
      expect(conversationSchema.properties.isAnnouncementChannel.default).toBeDefined();
    });
  });

  describe('Documentation et descriptions', () => {
    it('tous les champs Phase 1 doivent avoir des descriptions', () => {
      expect(messageSchema.properties.encryptedContent.description).toBeTruthy();
      expect(messageSchema.properties.encryptionMetadata.description).toBeTruthy();
      expect(messageSchema.properties.maxViewOnceCount.description).toBeTruthy();
      expect(messageSchema.properties.receivedByAllAt.description).toBeTruthy();
      expect(conversationSchema.properties.serverEncryptionKeyId.description).toBeTruthy();
      expect(conversationSchema.properties.isAnnouncementChannel.description).toBeTruthy();
    });

    it('les descriptions doivent être claires et complètes', () => {
      expect(messageSchema.properties.encryptedContent.description).toContain('E2EE');
      expect(messageSchema.properties.encryptionMetadata.description).toContain('IV');
      expect(messageSchema.properties.maxViewOnceCount.description).toContain('view-once');
      expect(conversationSchema.properties.serverEncryptionKeyId.description).toContain('key rotation');
      expect(conversationSchema.properties.isAnnouncementChannel.description).toContain('Announcement');
    });
  });
});
