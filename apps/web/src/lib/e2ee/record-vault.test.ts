import { describe, expect, test } from 'bun:test';
import { rejected } from './test-support/errors';
import { createRecordVault, defaultRecordLock, memorySealedBackend, RecordVaultCorrupted } from './record-vault';

const text = (value: string) => new TextEncoder().encode(value);
const vaultOn = (backend = memorySealedBackend()) => ({ backend, vault: createRecordVault({ backend, lock: defaultRecordLock('test') }) });
const contains = (haystack: Uint8Array, needle: Uint8Array) =>
  haystack.some((_, start) => needle.every((byte, offset) => haystack[start + offset] === byte));

describe('les enregistrements E2EE sont scellés et rangés d\'un seul tenant', () => {
  test('une valeur rangée se relit, et le support ne porte jamais son clair', async () => {
    const { backend, vault } = vaultOn();
    const secret = text('sentinelle-claire-7f3a');
    await vault.transact(({ stage }) => stage([{ kind: 'plaintext', key: 'm1', value: secret }]));
    expect(await vault.read('plaintext', 'm1')).toEqual(secret);
    const rows = [...backend.rows.values()];
    expect(rows).toHaveLength(1);
    expect(rows.some((row) => contains(row.sealed, secret))).toBe(false);
  });

  test('une transaction qui échoue ne range rien', async () => {
    const { backend, vault } = vaultOn();
    const failing = vault.transact(({ stage }) => {
      stage([{ kind: 'session', key: 'u.1', value: text('etat') }]);
      throw new Error('refus');
    });
    expect(((await rejected(failing)) as Error).message).toBe('refus');
    expect(backend.rows.size).toBe(0);
    expect(await vault.read('session', 'u.1')).toBeUndefined();
  });

  test('les écritures de la transaction se relisent avant leur rangement, et un effacement efface', async () => {
    const { vault } = vaultOn();
    await vault.transact(({ stage }) => stage([{ kind: 'preKey', key: '7', value: text('k') }]));
    const seen = await vault.transact(({ read, stage }) => {
      stage([{ kind: 'preKey', key: '7', value: null }]);
      return read('preKey', '7');
    });
    expect(seen).toBeUndefined();
    expect(await vault.read('preKey', '7')).toBeUndefined();
  });

  test('une ligne déplacée vers une autre case ne s\'ouvre pas', async () => {
    const { backend, vault } = vaultOn();
    await vault.transact(({ stage }) => stage([{ kind: 'session', key: 'a.1', value: text('A') }, { kind: 'session', key: 'b.1', value: text('B') }]));
    const a = backend.rows.get('session\u0000a.1')!;
    backend.rows.set('session\u0000b.1', { ...a, id: 'session\u0000b.1' });
    await backend.commit([], 99);
    expect(await rejected(vault.read('session', 'b.1'))).toBeInstanceOf(RecordVaultCorrupted);
  });

  test('deux onglets sur la même base voient chacun ce que l\'autre a rangé', async () => {
    const backend = memorySealedBackend();
    const first = vaultOn(backend).vault;
    const second = vaultOn(backend).vault;
    await first.transact(({ stage }) => stage([{ kind: 'session', key: 'u.1', value: text('v1') }]));
    await second.transact(({ stage }) => stage([{ kind: 'session', key: 'u.1', value: text('v2') }]));
    expect(await first.read('session', 'u.1')).toEqual(text('v2'));
  });

  test('la clé de scellement ne s\'exporte pas', async () => {
    const backend = memorySealedBackend();
    const key = await backend.sealKey();
    expect(key.extractable).toBe(false);
    expect(await rejected(crypto.subtle.exportKey('raw', key))).toBeInstanceOf(Error);
  });
});
