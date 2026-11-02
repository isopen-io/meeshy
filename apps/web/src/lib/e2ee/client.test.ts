import { describe, expect, test } from 'bun:test';
import { E2EE_ERROR_CODES } from '@meeshy/shared/types/e2ee-directory';

import { openE2EEClient } from './client';
import { e2eeContent } from './content';
import { E2EEDirectoryError, decodeMismatch } from './directory';
import { createRecordVault, defaultRecordLock, memorySealedBackend } from './record-vault';
import { E2EEDevicesMismatchError, E2EERecipientHasNoDevice, type SealedMessage } from './sealer';
import { fakeE2EEServer } from './test-support/fake-server';
import { transparentEngine } from './test-support/transparent-engine';
import { rejected } from './test-support/errors';

const ALICE = 'a'.repeat(24);
const BOB = 'b'.repeat(24);
const CONVERSATION = 'c'.repeat(24);

function browser(server: ReturnType<typeof fakeE2EEServer>, userId: string) {
  const backend = memorySealedBackend();
  const vault = createRecordVault({ backend, lock: defaultRecordLock(`t-${userId}-${Math.random()}`) });
  const directory = server.clientFor(userId, { deviceId: null });
  return { backend, vault, directory, open: () => openE2EEClient({ engine: transparentEngine(), vault, directory, userId, label: 'Web' }) };
}

/** Le transport d'un envoi : la passerelle de banc relaie, ou rend son 409 Sesame. */
const deliverer = (server: ReturnType<typeof fakeE2EEServer>, senderUserId: string, peerUserId: string) => async (sealed: SealedMessage) => {
  try {
    return server.relay({ senderUserId, peerUserId, conversationId: CONVERSATION, sealed });
  } catch (error) {
    const mismatch = error instanceof E2EEDirectoryError && error.code === E2EE_ERROR_CODES.DEVICES_MISMATCH ? decodeMismatch(Reflect.get(error, 'mismatch')) : null;
    if (mismatch) throw new E2EEDevicesMismatchError(mismatch);
    throw error;
  }
};

const contains = (haystack: Uint8Array, needle: Uint8Array) => haystack.some((_, start) => needle.every((byte, offset) => haystack[start + offset] === byte));

/**
 * La TUYAUTERIE à deux navigateurs, sur un moteur de banc SANS cryptographie
 * (`transparent-engine.ts`) : enrôlement, Sesame, accusés, rangement scellé,
 * attribution. La confidentialité au fil exige un vrai moteur et n'est pas
 * prouvée ici ; celle du DISQUE l'est (la base scellée est réelle, AES-GCM).
 */
describe('deux navigateurs échangent par la tuyauterie E2EE', () => {
  test('Alice écrit, Bob lit au rattrapage, l\'enveloppe s\'efface, et aucun octet clair n\'atteint le disque d\'aucun des deux', async () => {
    const server = fakeE2EEServer();
    const alice = browser(server, ALICE);
    const bob = browser(server, BOB);
    const aliceClient = await alice.open();
    const bobClient = await bob.open();
    expect(aliceClient.device.deviceId).toBe(1);

    const sentinel = `sentinelle-${crypto.randomUUID()}`;
    const content = e2eeContent({ text: sentinel, language: 'fr', conversationId: CONVERSATION, clientMessageId: 'cid-1', sentAt: Date.now() });
    const messageId = await aliceClient.sealer.sealAndDeliver(content, BOB, deliverer(server, ALICE, BOB));
    await aliceClient.rememberSent(messageId, content);

    const outcomes = await bobClient.opener.catchUp();
    expect(outcomes).toHaveLength(1);
    const [outcome] = outcomes;
    expect(outcome?.kind).toBe('opened');
    if (outcome?.kind !== 'opened') return;
    expect(outcome.entry.content.text).toBe(sentinel);
    expect(outcome.entry.senderUserId).toBe(ALICE);
    expect(server.envelopes).toHaveLength(0);

    const needle = new TextEncoder().encode(sentinel);
    for (const side of [alice, bob]) {
      for (const row of side.backend.rows.values()) expect(contains(row.sealed, needle)).toBe(false);
    }
    expect((await bobClient.opener.entry(messageId))?.state).toBe('readable');
    expect((await aliceClient.opener.entry(messageId))?.state).toBe('readable');
  });

  test('la réponse de Bob repart sur la session ouverte, et se lit chez Alice', async () => {
    const server = fakeE2EEServer();
    const aliceClient = await browser(server, ALICE).open();
    const bobClient = await browser(server, BOB).open();
    await aliceClient.sealer.sealAndDeliver(e2eeContent({ text: 'Salut', conversationId: CONVERSATION, sentAt: 1 }), BOB, deliverer(server, ALICE, BOB));
    await bobClient.opener.catchUp();
    const reply = await bobClient.sealer.seal(e2eeContent({ text: 'Bonjour', conversationId: CONVERSATION, sentAt: 2 }), ALICE);
    expect(reply.envelopes.map((envelope) => envelope.type)).toEqual([2]);
    server.relay({ senderUserId: BOB, peerUserId: ALICE, conversationId: CONVERSATION, sealed: reply });
    const [opened] = await aliceClient.opener.catchUp();
    expect(opened?.kind === 'opened' && opened.entry.content.text).toBe('Bonjour');
  });

  test('un appareil de Bob apparu entre la lecture et l\'envoi : 409, puis renvoi qui le couvre', async () => {
    const server = fakeE2EEServer();
    const aliceClient = await browser(server, ALICE).open();
    await browser(server, BOB).open();
    const lateBob = browser(server, BOB);
    let first = true;
    const deliver = deliverer(server, ALICE, BOB);
    const messageId = await aliceClient.sealer.sealAndDeliver(e2eeContent({ text: 'x', conversationId: CONVERSATION, sentAt: 1 }), BOB, async (sealed) => {
      if (first) {
        first = false;
        await lateBob.open();
      }
      return deliver(sealed);
    });
    expect(typeof messageId).toBe('string');
    expect(server.envelopes.map((envelope) => envelope.recipientDeviceId).sort()).toEqual([1, 2]);
  });

  test('un correspondant sans appareil chiffré ne reçoit rien, et rien ne part en clair', async () => {
    const server = fakeE2EEServer();
    const aliceClient = await browser(server, ALICE).open();
    expect(await rejected(aliceClient.sealer.seal(e2eeContent({ text: 'x', conversationId: CONVERSATION, sentAt: 1 }), BOB))).toBeInstanceOf(E2EERecipientHasNoDevice);
  });

  test('un contenu que la passerelle range dans une AUTRE conversation est jugé illisible, jamais affiché', async () => {
    const server = fakeE2EEServer();
    const aliceClient = await browser(server, ALICE).open();
    const bobClient = await browser(server, BOB).open();
    const sealed = await aliceClient.sealer.seal(e2eeContent({ text: 'secret', conversationId: CONVERSATION, sentAt: 1 }), BOB);
    server.relay({ senderUserId: ALICE, peerUserId: BOB, conversationId: 'd'.repeat(24), sealed });
    const [outcome] = await bobClient.opener.catchUp();
    expect(outcome?.kind).toBe('undecryptable');
    expect(server.envelopes).toHaveLength(0);
  });

  test('une enveloppe vue deux fois (socket puis rattrapage) ne se redéchiffre pas', async () => {
    const server = fakeE2EEServer();
    const aliceClient = await browser(server, ALICE).open();
    const bobClient = await browser(server, BOB).open();
    await aliceClient.sealer.sealAndDeliver(e2eeContent({ text: 'une fois', conversationId: CONVERSATION, sentAt: 1 }), BOB, deliverer(server, ALICE, BOB));
    const envelope = server.envelopes[0]!;
    const first = await bobClient.opener.open(envelope);
    const second = await bobClient.opener.open(envelope);
    expect(first.kind).toBe('opened');
    expect(second).toEqual(first);
  });

  test('un navigateur rouvert garde son appareil et ne republie que ce qui manque', async () => {
    const server = fakeE2EEServer();
    const alice = browser(server, ALICE);
    const first = await alice.open();
    const again = await alice.open();
    expect(again.device).toEqual(first.device);
    expect(server.devices).toHaveLength(1);
    expect(server.devices[0]!.oneTime).toHaveLength(100);
  });
});
