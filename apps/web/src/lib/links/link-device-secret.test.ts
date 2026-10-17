import { describe, expect, test } from 'bun:test';
import { createHash, webcrypto } from 'node:crypto';

import { LINK_DEVICE_SECRET_KEY, createLinkDeviceSecrets, type LinkSecretStorage } from './link-device-secret';

/**
 * #10872 — le secret qui lie un lien de connexion au navigateur qui l'a
 * demandé : gardé dans le stockage DURABLE de l'origine (le lien s'ouvre dans
 * un nouvel onglet), seule son empreinte SHA-256 part à la passerelle.
 */

function memoryStorage(): LinkSecretStorage & { readonly raw: Map<string, string> } {
  const raw = new Map<string, string>();
  return {
    raw,
    getItem: (key) => raw.get(key) ?? null,
    setItem: (key, value) => {
      raw.set(key, value);
    },
    removeItem: (key) => {
      raw.delete(key);
    },
  };
}

const crypto = webcrypto as unknown as Crypto;

describe('createLinkDeviceSecrets', () => {
  test('la demande garde un secret de 32 octets et rend son empreinte SHA-256 hexadécimale', async () => {
    const storage = memoryStorage();
    const secrets = createLinkDeviceSecrets({ storage: () => storage, crypto: () => crypto });

    const hash = await secrets.issue();
    const secret = storage.raw.get(LINK_DEVICE_SECRET_KEY) ?? '';

    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hash).toBe(createHash('sha256').update(secret, 'utf8').digest('hex'));
    expect(secrets.presented()).toBe(secret);
  });

  test('chaque demande tire un secret NEUF', async () => {
    const storage = memoryStorage();
    const secrets = createLinkDeviceSecrets({ storage: () => storage, crypto: () => crypto });

    const first = await secrets.issue();
    const second = await secrets.issue();

    expect(first).not.toBe(second);
  });

  test('oublier retire le secret : plus rien à présenter', async () => {
    const storage = memoryStorage();
    const secrets = createLinkDeviceSecrets({ storage: () => storage, crypto: () => crypto });
    await secrets.issue();

    secrets.forget();

    expect(secrets.presented()).toBeNull();
  });

  test('stockage indisponible ou qui lève : aucune liaison, jamais d’exception', async () => {
    const throwing: LinkSecretStorage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    };
    const absent = createLinkDeviceSecrets({ storage: () => null, crypto: () => crypto });
    const broken = createLinkDeviceSecrets({ storage: () => throwing, crypto: () => crypto });

    expect(await absent.issue()).toBeNull();
    expect(await broken.issue()).toBeNull();
    expect(broken.presented()).toBeNull();
    expect(() => broken.forget()).not.toThrow();
  });

  test('une valeur stockée qui n’a pas la forme d’un secret n’est pas présentée', () => {
    const storage = memoryStorage();
    storage.setItem(LINK_DEVICE_SECRET_KEY, 'court');
    const secrets = createLinkDeviceSecrets({ storage: () => storage, crypto: () => crypto });

    expect(secrets.presented()).toBeNull();
  });
});
