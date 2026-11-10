/**
 * La coquille « ami WhatsApp » (#17116) en usage : un appareil Meeshy et
 * l'ami simulé, tous deux sur le pont WASM libsignal, échangent par la porte
 * « pair externe » (ici sa doublure HTTP en mémoire). Ce qui part vers le
 * serveur — bundle publié, enveloppes — ne porte jamais le clair ni une clé
 * privée.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openLibsignalBridge } from '@/lib/e2ee/libsignal-bridge';
import { LIBSIGNAL_WASM_FILE } from '@/lib/licences/libsignal-engine';

import { createCoquilleDevice } from './coquille-device';
import { createPorteClient, type ExternalParty, type MeeshyParty } from './porte-client';
import { createFakePorte } from './test-support/fake-porte';

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const bridge = await openLibsignalBridge(readFileSync(join(WEB_ROOT, LIBSIGNAL_WASM_FILE)));

const TEAM = 'a1'.repeat(12);
const meeshy: MeeshyParty = { side: 'meeshy', userId: TEAM, deviceId: 7 };
const friend: ExternalParty = { side: 'external', network: 'whatsapp', handle: '+447700900123', deviceId: 1 };

const setup = () => {
  const porte = createFakePorte({ accounts: { recette: { password: 'secret-de-test', userId: TEAM, role: 'MODERATOR' } } });
  const client = createPorteClient({ baseUrl: 'https://gate.staging.test', token: porte.tokenOf('recette'), fetch: porte.fetch });
  return { porte, client };
};

describe('la coquille ami WhatsApp', () => {
  test('reçoit le message d’un appareil Meeshy, le déchiffre et répond chiffré', async () => {
    const { porte, client } = setup();
    const me = await createCoquilleDevice({ bridge, porte: client, party: meeshy });
    const coquille = await createCoquilleDevice({ bridge, porte: client, party: friend });
    await me.publish();
    await coquille.publish();

    await me.send(friend, 'Salut depuis Meeshy 👋');
    const [received] = await coquille.receive();
    await coquille.send(meeshy, 'Reçu, depuis WhatsApp');
    const [answer] = await me.receive();
    await me.send(friend, 'Parfait');
    const [second] = await coquille.receive();

    expect(received).toMatchObject({ from: meeshy, text: 'Salut depuis Meeshy 👋' });
    expect(answer).toMatchObject({ from: friend, text: 'Reçu, depuis WhatsApp' });
    expect(second).toMatchObject({ text: 'Parfait' });
    expect(porte.pendingCount()).toBe(0);
    expect(porte.wire()).not.toContain('Salut depuis Meeshy');
    expect(porte.wire()).not.toContain('Reçu, depuis WhatsApp');
  });

  test('ne publie que des clés publiques', async () => {
    const { porte, client } = setup();
    const coquille = await createCoquilleDevice({ bridge, porte: client, party: friend });

    await coquille.publish();

    const [published] = porte.publications();
    expect(published).toBeDefined();
    expect(Object.keys(published ?? {}).sort()).toEqual(['identityKey', 'kyberLastResort', 'kyberPreKeys', 'oneTimePreKeys', 'party', 'registrationId', 'signedPreKey']);
    expect(JSON.stringify(published)).not.toMatch(/record|private|identityKeyPair/i);
  });

  test('dit qu’une enveloppe est illisible au lieu de la taire, et ne la laisse pas bloquer la file', async () => {
    const { porte, client } = setup();
    const coquille = await createCoquilleDevice({ bridge, porte: client, party: friend });
    await coquille.publish();
    porte.inject({ from: meeshy, to: friend, type: 2, body: 'RERERERERERERERERERERERERERERERE' });

    const [unreadable] = await coquille.receive();

    expect(unreadable).toMatchObject({ from: meeshy, text: null });
    expect(porte.pendingCount()).toBe(0);
  });
});
