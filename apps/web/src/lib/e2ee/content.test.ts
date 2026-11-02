import { describe, expect, test } from 'bun:test';

import { decodeContent, e2eeContent, encodeContent, E2EEContentError, padded, payloadKindOf } from './content';
import { endToEndSendBody } from './send';
import { thrown } from './test-support/errors';

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe('E2EEContent v1, à l\'octet de l\'iOS (E2EEContentTests.swift)', () => {
  test('JSON canonique : clés triées, aucun champ absent — la même chaîne que le témoin Swift', () => {
    const content = e2eeContent({ text: 'Bonjour', language: 'fr', replyTo: null, conversationId: 'c1', clientMessageId: 'cid_1', sentAt: 1_790_000_000_000 });
    expect(decode(encodeContent(content))).toBe('{"clientMessageId":"cid_1","conversationId":"c1","language":"fr","sentAt":1790000000000,"text":"Bonjour","v":1}');
  });

  test('une version future n\'est jamais lue à moitié ; les champs d\'un lot ultérieur sont ignorés', () => {
    const future = thrown(() => decodeContent(new TextEncoder().encode('{"v":2,"text":"x","sentAt":1}')));
    expect(future).toBeInstanceOf(E2EEContentError);
    expect(decodeContent(new TextEncoder().encode('{"v":1,"text":"x","sentAt":1,"conversationId":"c1","mentions":["u"]}')).text).toBe('x');
  });

  test('le remplissage par espaces garde un JSON lisible, et un signal (`s`) n\'est jamais un message', () => {
    const plain = encodeContent(e2eeContent({ text: 'x', conversationId: 'c', sentAt: 1 }));
    const filled = padded(plain, 1);
    expect(filled.length).toBe(256);
    expect(decodeContent(filled).text).toBe('x');
    expect(payloadKindOf(new TextEncoder().encode('{"s":1,"kind":"typing"}'))).toBe('signal');
  });
});

describe('le corps REST d\'un envoi libsignal, celui de SendMessageRequest.libsignal (iOS)', () => {
  test('aucun content ni langue ; marqueur, protocole, appareil émetteur et enveloppes', () => {
    const body = endToEndSendBody({
      clientMessageId: 'cid',
      replyToId: 'r1',
      regimeEpoch: 2,
      sealed: { senderDeviceId: 3, envelopes: [{ userId: 'b'.repeat(24), deviceId: 1, registrationId: 9, type: 3, body: 'AAAA' }], unapprovedOwnDevices: [] },
    });
    expect(body).toEqual({
      clientMessageId: 'cid',
      replyToId: 'r1',
      isEncrypted: true,
      encryptionMode: 'e2ee',
      encryptionProtocol: 'libsignal-v1',
      encryptedContent: 'libsignal-v1',
      encryptionMetadata: { protocol: 'libsignal-v1', senderDeviceId: 3, regimeEpoch: 2 },
      envelopes: [{ userId: 'b'.repeat(24), deviceId: 1, registrationId: 9, type: 3, body: 'AAAA' }],
    });
    expect('content' in body).toBe(false);
  });
});
