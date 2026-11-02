import { describe, expect, it } from 'bun:test';
import { ADMIN_READ_ONLY_PREFERENCES } from './admin-user-member';

describe('ADMIN_READ_ONLY_PREFERENCES — ce qu’un administrateur ne règle jamais au nom d’un membre', () => {
  it('« Recevoir des Bring » est en lecture seule (#13936) : seul le membre rouvre un son qui passe Ne pas déranger', () => {
    expect(ADMIN_READ_ONLY_PREFERENCES.notification).toContain('bringEnabled');
  });

  it('la famille chiffrement le reste', () => {
    expect(ADMIN_READ_ONLY_PREFERENCES.privacy).toEqual(['encryptionPreference', 'autoEncryptNewConversations', 'warnOnUnencrypted']);
  });
});
