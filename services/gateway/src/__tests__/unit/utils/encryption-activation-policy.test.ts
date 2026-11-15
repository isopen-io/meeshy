/**
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import {
  ENCRYPTION_ACTIVATION_POLICY,
  mayActivateConversationEncryption,
} from '../../../utils/encryption-activation-policy';

describe('mayActivateConversationEncryption (#12517, #12588)', () => {
  it('est réservée aux rôles de plateforme ANALYST et au-dessus tant que l’E2EE n’est pas opérationnel', () => {
    expect(ENCRYPTION_ACTIVATION_POLICY).toBe('platform-analysts-and-above');
  });

  it.each([
    'ADMIN', 'BIGBOSS', 'admin', 'BigBoss',
    'MODERATOR', 'moderator', 'Moderator',
    'AUDIT', 'audit', 'Audit',
    'ANALYST', 'analyst', 'Analyst',
  ])('accorde l’activation au rôle de plateforme %s', (platformRole) => {
    expect(mayActivateConversationEncryption({ platformRole })).toBe(true);
  });

  it.each(['USER', 'user', 'AGENT', 'MEMBER', '', 'OWNER', 'ANALYSTS'])(
    'la refuse au rôle de plateforme « %s »',
    (platformRole) => {
      expect(mayActivateConversationEncryption({ platformRole })).toBe(false);
    },
  );

  it('la refuse quand le rôle de plateforme est absent', () => {
    expect(mayActivateConversationEncryption({ platformRole: null })).toBe(false);
    expect(mayActivateConversationEncryption({})).toBe(false);
  });
});
