import { describe, expect, test } from 'bun:test';
import { ADMIN_READ_ONLY_PREFERENCES } from './admin-user-member';

describe('ADMIN_READ_ONLY_PREFERENCES — ce qu’un administrateur ne règle jamais au nom d’un membre', () => {
  test('« Recevoir des Bring » est en lecture seule (#13936) : seul le membre rouvre un son qui passe Ne pas déranger', () => {
    expect(ADMIN_READ_ONLY_PREFERENCES.notification).toContain('bringEnabled');
  });

  test('la famille chiffrement le reste', () => {
    expect(ADMIN_READ_ONLY_PREFERENCES.privacy).toEqual(['encryptionPreference', 'autoEncryptNewConversations', 'warnOnUnencrypted']);
  });
});
