/**
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import {
  ENCRYPTION_ACTIVATION_POLICY,
  mayActivateConversationEncryption,
} from '../../../utils/encryption-activation-policy';

describe('mayActivateConversationEncryption (#12517)', () => {
  it('est réservée aux administrateurs de la plateforme tant que l’E2EE n’est pas opérationnel', () => {
    expect(ENCRYPTION_ACTIVATION_POLICY).toBe('platform-admins-only');
  });

  it.each(['ADMIN', 'BIGBOSS', 'admin', 'BigBoss'])('accorde l’activation au rôle de plateforme %s', (platformRole) => {
    expect(mayActivateConversationEncryption({ platformRole })).toBe(true);
  });

  it.each(['USER', 'MODERATOR', 'AUDIT', 'ANALYST', 'MEMBER', '', 'OWNER'])('la refuse au rôle de plateforme « %s »', (platformRole) => {
    expect(mayActivateConversationEncryption({ platformRole })).toBe(false);
  });

  it('la refuse quand le rôle de plateforme est absent', () => {
    expect(mayActivateConversationEncryption({ platformRole: null })).toBe(false);
    expect(mayActivateConversationEncryption({})).toBe(false);
  });
});
