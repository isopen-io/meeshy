import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { E2EE_VAULT_DB_PREFIX, E2EE_VAULT_HELD_KEY } from '@/lib/e2ee/vault/vault-guard';

import { createThirdPartyRuntimeGate, e2eeVaultMayExist, type VaultPresenceHost } from './third-party-runtime-gate';

/**
 * **LE MOTEUR DE TRADUCTION TIERS NE DÉMARRE JAMAIS DANS UN NAVIGATEUR QUI
 * TIENT DES CLÉS CHIFFRÉES** (#18989, décision par défaut #18999).
 *
 * Le Worker de traduction importe transformers.js depuis jsDelivr, sans
 * intégrité possible, dans un Worker de MÊME origine : il ouvre l'IndexedDB
 * de l'origine. Mesuré dans Chromium (contre-analyse du 2026-11-17) : un tel
 * Worker relit une `CryptoKey` non extractible du coffre et DÉCHIFFRE ce
 * qu'elle scelle. Tant que le moteur n'est pas hébergé et vérifié par
 * condensat (#10015), il est ABSENT de tout navigateur qui tient un coffre —
 * et l'existence d'un coffre qui ne peut pas être exclue compte comme un coffre.
 */
const storage = (entries: Readonly<Record<string, string>>) => ({ getItem: (key: string) => entries[key] ?? null });
const databases = (names: readonly string[]) => ({ databases: () => Promise.resolve(names.map((name) => ({ name }))) });

describe('e2eeVaultMayExist — un coffre qui ne peut pas être exclu compte comme un coffre', () => {
  test('aucune base `meeshy-e2ee-*` et aucune marque : aucun coffre', async () => {
    const host: VaultPresenceHost = { localStorage: storage({}), indexedDB: databases(['meeshy-device', 'meeshy-push']) };

    expect(await e2eeVaultMayExist(host)).toBe(false);
  });

  test('une base de coffre, d’un compte quelconque : un coffre', async () => {
    const host: VaultPresenceHost = { localStorage: storage({}), indexedDB: databases(['meeshy-device', `${E2EE_VAULT_DB_PREFIX}64b000000000000000000001`]) };

    expect(await e2eeVaultMayExist(host)).toBe(true);
  });

  test('la marque que le coffre pose AVANT sa première clé suffit, même sans énumération des bases', async () => {
    expect(await e2eeVaultMayExist({ localStorage: storage({ [E2EE_VAULT_HELD_KEY]: '1' }) })).toBe(true);
    expect(await e2eeVaultMayExist({ localStorage: storage({ [E2EE_VAULT_HELD_KEY]: '1' }), indexedDB: databases([]) })).toBe(true);
  });

  test('un stockage qui refuse la lecture, ou une énumération qui échoue : le coffre n’est pas exclu', async () => {
    const throwing = { getItem: () => { throw new DOMException('refusé', 'SecurityError'); } };
    expect(await e2eeVaultMayExist({ localStorage: throwing, indexedDB: databases([]) })).toBe(true);
    expect(await e2eeVaultMayExist({ localStorage: storage({}), indexedDB: { databases: () => Promise.reject(new Error('refusé')) } })).toBe(true);
    expect(await e2eeVaultMayExist({ indexedDB: databases([]) })).toBe(true);
  });

  test('sans énumération des bases (navigateur ancien), la marque absente exclut le coffre — elle le précède toujours', async () => {
    expect(await e2eeVaultMayExist({ localStorage: storage({}) })).toBe(false);
  });
});

describe('createThirdPartyRuntimeGate — le moteur tiers démarre seulement là où aucun coffre ne vit', () => {
  test('sans coffre, il démarre', async () => {
    const gate = createThirdPartyRuntimeGate({ vaultMayExist: () => Promise.resolve(false) });

    expect(await gate.mayStart()).toBe(true);
  });

  test('avec un coffre, il ne démarre pas — et la sonde ne se relit pas à chaque fenêtre', async () => {
    let probes = 0;
    const gate = createThirdPartyRuntimeGate({ vaultMayExist: () => Promise.resolve(++probes > 0) });

    expect(await gate.mayStart()).toBe(false);
    expect(await gate.mayStart()).toBe(false);
    expect(probes).toBe(1);
  });

  test('le coffre qui naît dans la page ARRÊTE le moteur déjà lancé, et plus aucun ne démarre', async () => {
    const gate = createThirdPartyRuntimeGate({ vaultMayExist: () => Promise.resolve(false) });
    const stopped: string[] = [];
    gate.register(() => void stopped.push('worker de traduction'));

    gate.closeBeforeVault();

    expect(stopped).toEqual(['worker de traduction']);
    expect(await gate.mayStart()).toBe(false);
  });

  test('un moteur qui s’inscrit APRÈS la fermeture est arrêté sur-le-champ', () => {
    const gate = createThirdPartyRuntimeGate({ vaultMayExist: () => Promise.resolve(false) });
    gate.closeBeforeVault();
    const stopped: string[] = [];

    gate.register(() => void stopped.push('arrivé trop tard'));

    expect(stopped).toEqual(['arrivé trop tard']);
  });
});

describe('runtime.ts — le Worker tiers passe par la porte', () => {
  const runtime = readFileSync(new URL('./runtime.ts', import.meta.url), 'utf8');

  test('la porte est interrogée AVANT la création du Worker, et le Worker s’y inscrit', () => {
    const asked = runtime.indexOf('thirdPartyRuntimeGate.mayStart()');
    const created = runtime.indexOf("new Worker(new URL('./device-translation-worker.ts'");
    expect(asked).toBeGreaterThan(-1);
    expect(created).toBeGreaterThan(-1);
    expect(runtime).toContain('thirdPartyRuntimeGate.register(');
  });
});
