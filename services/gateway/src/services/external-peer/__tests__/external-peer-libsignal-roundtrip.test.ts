/**
 * L'ALLER-RETOUR libsignal à travers le faux WhatsApp (#17115) : un appareil
 * Meeshy et un appareil « WhatsApp », tous deux libsignal RÉELS (processus Node
 * à part, `libsignal-device.mjs`), échangent par la seule porte « pair externe ».
 * La passerelle ne voit que des clés publiques et des chiffrés ; les vecteurs
 * croisés de #17113, relayés par le faux, s'ouvrent encore à l'octet près.
 *
 * @jest-environment node
 */
import { describe, it, expect, afterAll } from '@jest/globals';
import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { LibsignalDevices, realLibsignalMessages } from '../../e2ee/__tests__/libsignal-devices';
import { admitExternalPeer } from '../external-peer-gate';
import { createFakeWhatsAppPeer, memoryPeerStore } from '../fake-whatsapp-peer';
import type { ExternalParty, MeeshyParty, PeerDeviceBundle } from '../external-peer-contract';

const FIXTURE = join(__dirname, '../../../../../../packages/shared/fixtures/libsignal/cross-platform.vectors.json');
const BENCH = join(__dirname, '../../e2ee/__tests__/libsignal-vectors.mjs');

type PublicDevice = {
  registrationId: number;
  identityKey: string;
  signedPreKey: { keyId: number; publicKey: string; signature: string };
  kyberLastResort: { keyId: number; publicKey: string; signature: string };
  oneTimePreKeys: { keyId: number; publicKey: string }[];
  kyberPreKeys: { keyId: number; publicKey: string; signature: string }[];
};
type Sealed = { type: 2 | 3; body: string };

const USER_ID = 'b'.repeat(24);
const HANDLE = '+447700900123';
const meeshyDevice: MeeshyParty = { side: 'meeshy', userId: USER_ID, deviceId: 1 };
const friendDevice: ExternalParty = { side: 'external', network: 'whatsapp', handle: HANDLE, deviceId: 1 };
const meeshyAddress = { name: USER_ID, deviceId: 1 };
const friendAddress = { name: HANDLE, deviceId: 1 };

const devices = new LibsignalDevices();
afterAll(() => devices.close());

const silentLogger = { warn: () => undefined };
const openPeer = () => admitExternalPeer(createFakeWhatsAppPeer({ store: memoryPeerStore() }), { libsignal: () => realLibsignalMessages, logger: silentLogger });

const publish = async (peer: ReturnType<typeof openPeer>, party: MeeshyParty | ExternalParty, device: PublicDevice): Promise<void> =>
  peer.publishPreKeyBundle({
    party,
    registrationId: device.registrationId,
    identityKey: device.identityKey,
    signedPreKey: device.signedPreKey,
    kyberLastResort: device.kyberLastResort,
    oneTimePreKeys: device.oneTimePreKeys,
    kyberPreKeys: device.kyberPreKeys,
  });

describe('pair externe — un aller-retour libsignal réel par le faux WhatsApp', () => {
  it('Meeshy ouvre la session depuis le bundle servi par le faux, l’ami lit, répond, et Meeshy lit la réponse', async () => {
    const peer = openPeer();
    const meeshyKeys = await devices.request<PublicDevice>('create', { name: 'pe-meeshy', userId: USER_ID });
    const friendKeys = await devices.request<PublicDevice>('create', { name: 'pe-friend', userId: USER_ID });
    await publish(peer, meeshyDevice, meeshyKeys);
    await publish(peer, friendDevice, friendKeys);

    const [bundle] = await peer.fetchPreKeyBundles({ side: 'external', network: 'whatsapp', handle: HANDLE });
    const first = await devices.request<Sealed>('encrypt', {
      from: 'pe-meeshy', fromAddress: meeshyAddress, toAddress: friendAddress, bundle: { ...bundle } satisfies PeerDeviceBundle, plaintext: 'Salut, c’est Meeshy 👋',
    });
    await peer.deliverEnvelope({ from: meeshyDevice, to: friendDevice, type: first.type, body: first.body });

    const [delivered] = await peer.receiveEnvelopes(friendDevice);
    const opened = await devices.request<{ plaintext: string }>('decrypt', {
      to: 'pe-friend', toAddress: friendAddress, fromAddress: meeshyAddress, type: delivered.type, body: delivered.body,
    });
    await peer.acknowledge({ recipient: friendDevice, envelopeIds: [delivered.envelopeId] });

    const reply = await devices.request<Sealed>('encrypt', {
      from: 'pe-friend', fromAddress: friendAddress, toAddress: meeshyAddress, plaintext: 'Reçu depuis WhatsApp',
    });
    await peer.deliverEnvelope({ from: friendDevice, to: meeshyDevice, type: reply.type, body: reply.body });
    const [answer] = await peer.receiveEnvelopes(meeshyDevice);
    const read = await devices.request<{ plaintext: string }>('decrypt', {
      to: 'pe-meeshy', toAddress: meeshyAddress, fromAddress: friendAddress, type: answer.type, body: answer.body,
    });

    expect(first.type).toBe(3);
    expect(bundle.preKey).not.toBeNull();
    expect(bundle.kyberPreKey.lastResort).toBe(false);
    expect(opened.plaintext).toBe('Salut, c’est Meeshy 👋');
    expect(await peer.receiveEnvelopes(friendDevice)).toEqual([]);
    expect(answer.from).toEqual(friendDevice);
    expect(reply.type).toBe(2);
    expect(read.plaintext).toBe('Reçu depuis WhatsApp');
  });

  it('les vecteurs croisés de #17113, relayés par le faux, s’ouvrent encore à l’octet près', async () => {
    const peer = openPeer();
    const vectors = JSON.parse(readFileSync(FIXTURE, 'utf8')) as {
      freshSession: { messages: { type: 2 | 3; body: string; plaintext: string }[] };
    };

    await vectors.freshSession.messages.reduce(async (done, message) => {
      await done;
      await peer.deliverEnvelope({ from: friendDevice, to: meeshyDevice, type: message.type, body: message.body });
    }, Promise.resolve());
    const received = await peer.receiveEnvelopes(meeshyDevice);

    const directory = mkdtempSync(join(tmpdir(), 'pair-externe-'));
    try {
      const file = join(directory, 'relayed.vectors.json');
      const messages = vectors.freshSession.messages.map((message, index) => ({ ...message, body: received[index].body }));
      writeFileSync(file, JSON.stringify({ ...vectors, freshSession: { ...vectors.freshSession, messages } }));
      const report = JSON.parse(execFileSync(process.execPath, [BENCH, file]).toString()) as { fresh: string[] };

      expect(received.map((envelope) => envelope.body)).toEqual(vectors.freshSession.messages.map((message) => message.body));
      expect(report.fresh).toEqual(vectors.freshSession.messages.map((message) => message.plaintext));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
