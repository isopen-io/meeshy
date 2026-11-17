import { describe, expect, test } from 'bun:test';

import {
  E2EE_VAULT_DB_PREFIX,
  E2EE_VAULT_DB_VERSION,
  E2EE_VAULT_LOCK_PREFIX,
  E2EEVaultUnavailable,
  e2eeVaultDatabaseName,
  e2eeVaultLockName,
  openE2EEVaultDatabase,
  vaultLockManager,
  withE2EEVaultLock,
  type VaultDatabaseConnection,
  type VaultDatabaseFactory,
  type VaultLockManager,
} from './vault-guard';

/**
 * **UN SEUL CONTEXTE À LA FOIS FAIT AVANCER LES CLÉS D'UN COMPTE, ET DEUX
 * VERSIONS DU CODE NE PARTAGENT JAMAIS LE COFFRE** (#18990).
 *
 * Le pont libsignal est sans état : deux onglets (ou un onglet et le service
 * worker) qui partent du même instantané de session réutilisent la clé de
 * message et l'IV, perdent le second message, ou font bifurquer le ratchet
 * (audit WEB-02, sondes A2/A3). Et, propre au web, un onglet garde l'ANCIEN
 * bundle après un déploiement pendant qu'un autre exécute le nouveau, sur la
 * MÊME IndexedDB (contre-analyse WEBX-07) : un nom de verrou changé leur
 * ferait perdre tout verrou commun, une forme d'enregistrement changée ferait
 * lire à l'un ce que l'autre écrit.
 *
 * Ce lot livre la primitive AVANT le coffre (#17293), qui l'emploiera. Un
 * témoin de verrou sous bun ne prouve que le PROTOCOLE : l'exclusion réelle
 * entre deux pages se prouve dans Chromium (#19013).
 */

/** Un `LockManager` partagé par plusieurs « onglets » : une file FIFO par nom, comme Web Locks. */
const sharedLocks = (): VaultLockManager => {
  const tails = new Map<string, Promise<unknown>>();
  return {
    request: (name, _options, callback) => {
      const previous = tails.get(name) ?? Promise.resolve();
      const run = previous.then(callback, callback);
      tails.set(name, run.catch(() => undefined));
      return run;
    },
  };
};

const tick = () => new Promise((resolve) => setTimeout(resolve, 1));

describe('le verrou du coffre — un nom FIGÉ, une exclusion entre contextes', () => {
  test('le nom est un contrat entre deux versions du code : `meeshy-e2ee:<userId>`', () => {
    expect(E2EE_VAULT_LOCK_PREFIX).toBe('meeshy-e2ee:');
    expect(e2eeVaultLockName('64b000000000000000000001')).toBe('meeshy-e2ee:64b000000000000000000001');
  });

  test('deux « onglets » ne tiennent jamais le verrou du même compte ensemble', async () => {
    const locks = sharedLocks();
    const journal: string[] = [];
    const hold = (tab: string) =>
      withE2EEVaultLock(locks, 'u1', async () => {
        journal.push(`${tab}:entre`);
        await tick();
        journal.push(`${tab}:sort`);
        return tab;
      });

    const results = await Promise.all([hold('onglet-1'), hold('onglet-2'), hold('service-worker')]);

    expect(results).toEqual(['onglet-1', 'onglet-2', 'service-worker']);
    expect(journal).toEqual(['onglet-1:entre', 'onglet-1:sort', 'onglet-2:entre', 'onglet-2:sort', 'service-worker:entre', 'service-worker:sort']);
  });

  test('un échec sous le verrou le RELÂCHE : l’opération suivante passe', async () => {
    const locks = sharedLocks();

    await expect(withE2EEVaultLock(locks, 'u1', () => Promise.reject(new Error('stockage refusé')))).rejects.toThrow('stockage refusé');
    await expect(withE2EEVaultLock(locks, 'u1', () => Promise.resolve('suivante'))).resolves.toBe('suivante');
  });

  test('deux comptes du même navigateur ne s’attendent pas', async () => {
    const locks = sharedLocks();
    const journal: string[] = [];
    let release: () => void = () => undefined;
    const blocking = withE2EEVaultLock(locks, 'compte-a', () => new Promise<void>((resolve) => (release = resolve)));

    await withE2EEVaultLock(locks, 'compte-b', async () => void journal.push('compte-b servi pendant que compte-a tient le sien'));
    release();
    await blocking;

    expect(journal).toEqual(['compte-b servi pendant que compte-a tient le sien']);
  });

  test('sans Web Locks, le navigateur REFUSE de tenir des clés — jamais une exclusion de façade', () => {
    expect(() => vaultLockManager({})).toThrow(E2EEVaultUnavailable);
    expect(() => vaultLockManager({ locks: undefined })).toThrow(expect.objectContaining({ reason: 'NO_WEB_LOCKS' }));
    const locks = sharedLocks();
    expect(vaultLockManager({ locks })).toBe(locks);
  });
});

type Upgrade = { readonly oldVersion: number; readonly newVersion: number };

/**
 * Un `IDBFactory` réduit à l'ouverture versionnée : la version sur disque,
 * `onupgradeneeded`, `versionchange` sur les connexions ouvertes quand une
 * version plus récente s'ouvre, et `VersionError` quand le code est plus
 * ANCIEN que la base. C'est tout ce que la primitive emploie.
 */
const versionedFactory = () => {
  const onDisk = new Map<string, number>();
  const open = new Map<string, Set<FakeConnection>>();

  class FakeConnection implements VaultDatabaseConnection {
    closed = false;
    onversionchange: (() => void) | null = null;
    constructor(readonly name: string, readonly version: number) {}
    close(): void {
      this.closed = true;
      open.get(this.name)?.delete(this);
    }
  }

  const factory: VaultDatabaseFactory = {
    open: (name, version) => {
      const request: {
        result: VaultDatabaseConnection | null;
        error: DOMException | null;
        onsuccess: (() => void) | null;
        onerror: (() => void) | null;
        onupgradeneeded: ((event: Upgrade) => void) | null;
        onblocked: (() => void) | null;
      } = { result: null, error: null, onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null };
      queueMicrotask(() => {
        const current = onDisk.get(name) ?? 0;
        if (version < current) {
          request.error = new DOMException('The requested version is less than the existing version', 'VersionError');
          request.onerror?.();
          return;
        }
        const connection = new FakeConnection(name, version);
        if (version > current) {
          for (const opened of open.get(name) ?? []) opened.onversionchange?.();
          onDisk.set(name, version);
          request.result = connection;
          request.onupgradeneeded?.({ oldVersion: current, newVersion: version });
        }
        open.set(name, new Set([...(open.get(name) ?? []), connection]));
        request.result = connection;
        request.onsuccess?.();
      });
      return request;
    },
  };
  return { factory, onDisk };
};

describe('la base du coffre — une version qui monte à chaque changement de forme', () => {
  test('une base par compte, au nom figé : `meeshy-e2ee-<userId>`', () => {
    expect(E2EE_VAULT_DB_PREFIX).toBe('meeshy-e2ee-');
    expect(e2eeVaultDatabaseName('64b000000000000000000001')).toBe('meeshy-e2ee-64b000000000000000000001');
    expect(Number.isInteger(E2EE_VAULT_DB_VERSION) && E2EE_VAULT_DB_VERSION >= 1).toBe(true);
  });

  test('la première ouverture crée la forme courante, la suivante ne la refait pas', async () => {
    const { factory, onDisk } = versionedFactory();
    const upgrades: Upgrade[] = [];

    await openE2EEVaultDatabase({ factory, userId: 'u1', upgrade: (_db, change) => void upgrades.push(change), onSuperseded: () => undefined });
    await openE2EEVaultDatabase({ factory, userId: 'u1', upgrade: (_db, change) => void upgrades.push(change), onSuperseded: () => undefined });

    expect(upgrades).toEqual([{ oldVersion: 0, newVersion: E2EE_VAULT_DB_VERSION }]);
    expect(onDisk.get(e2eeVaultDatabaseName('u1'))).toBe(E2EE_VAULT_DB_VERSION);
  });

  test('un code plus récent qui ouvre la base FERME la connexion de l’ancien, qui suspend son e2ee', async () => {
    const { factory } = versionedFactory();
    const suspended: string[] = [];
    const older = await openE2EEVaultDatabase({ factory, userId: 'u1', upgrade: () => undefined, onSuperseded: () => void suspended.push('ancien onglet') });

    const newer = factory.open(e2eeVaultDatabaseName('u1'), E2EE_VAULT_DB_VERSION + 1);
    await new Promise<void>((resolve) => (newer.onsuccess = () => resolve()));

    expect(suspended).toEqual(['ancien onglet']);
    expect((older as { readonly closed?: boolean }).closed).toBe(true);
  });

  test('une base écrite par un code PLUS RÉCENT est refusée, jamais réécrite', async () => {
    const { factory, onDisk } = versionedFactory();
    onDisk.set(e2eeVaultDatabaseName('u1'), E2EE_VAULT_DB_VERSION + 1);
    let upgraded = false;

    const opening = openE2EEVaultDatabase({ factory, userId: 'u1', upgrade: () => void (upgraded = true), onSuperseded: () => undefined });

    await expect(opening).rejects.toThrow(expect.objectContaining({ reason: 'NEWER_VAULT' }));
    expect(upgraded).toBe(false);
    expect(onDisk.get(e2eeVaultDatabaseName('u1'))).toBe(E2EE_VAULT_DB_VERSION + 1);
  });

  test('sans IndexedDB, le navigateur refuse de tenir des clés', async () => {
    await expect(
      openE2EEVaultDatabase({ factory: undefined, userId: 'u1', upgrade: () => undefined, onSuperseded: () => undefined }),
    ).rejects.toThrow(expect.objectContaining({ reason: 'NO_INDEXED_DB' }));
  });
});
