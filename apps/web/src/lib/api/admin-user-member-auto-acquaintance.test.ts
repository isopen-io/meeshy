import { describe, expect, test } from 'bun:test';
import { ADMIN_READ_ONLY_PREFERENCES } from './admin-user-member';

describe('ADMIN_READ_ONLY_PREFERENCES — « Créer des Connaissances automatiquement » (#14406, audit #14464 C1)', () => {
  test('est en lecture seule : un administrateur ne lève ni une opposition ni le défaut protecteur d’un mineur', () => {
    expect(ADMIN_READ_ONLY_PREFERENCES.privacy).toContain('autoAcquaintance');
  });

  test('la famille chiffrement le reste', () => {
    for (const key of ['encryptionPreference', 'autoEncryptNewConversations', 'warnOnUnencrypted']) {
      expect(ADMIN_READ_ONLY_PREFERENCES.privacy).toContain(key);
    }
  });
});
