import { afterAll, describe, expect, test } from 'bun:test';

import { SHARED_TRANSLATION_LIMITS, type SharedTranslationInner } from '@meeshy/shared/types/shared-translation';

import { openPort, openSealWorker, sealPort } from './seal-port';
import { createSealClient } from './seal-protocol';

const BINDING = { conversationId: '68a000000000000000000001', messageId: '68b000000000000000000001', targetLanguage: 'fr', sourceContent: 'habari yako' };
const INNER: SharedTranslationInner = { v: 1, text: 'comment vas-tu', sourceLanguage: 'sw', engine: 'device:opus-mt-q8' };
const KEY = { kdf: 'message-content' } as const;

const rejection = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('la promesse a été tenue');
};

describe('le Worker du scellement partagé, le vrai, dans son thread (#9899)', () => {
  const worker = openSealWorker();
  const client = createSealClient({ port: worker });
  afterAll(() => worker.terminate());

  test('ce que le Worker scelle, la page l’ouvre depuis le même texte', async () => {
    const envelope = await client.seal({ binding: BINDING, key: KEY, inner: INNER });
    expect(envelope).toMatchObject({ v: 1, alg: 'A256GCM', kdf: 'message-content' });
    expect(await client.open({ binding: BINDING, key: KEY, envelope })).toEqual(INNER);
  });

  test('un autre texte, ou une autre langue, n’ouvre pas l’enveloppe', async () => {
    const envelope = await client.seal({ binding: BINDING, key: KEY, inner: INNER });
    expect(await client.open({ binding: { ...BINDING, sourceContent: 'habari' }, key: KEY, envelope })).toBeNull();
    expect(await client.open({ binding: { ...BINDING, targetLanguage: 'en' }, key: KEY, envelope })).toBeNull();
  });

  test('une traduction que la passerelle ne prendrait pas ne se scelle pas', async () => {
    const sealed = await client.seal({ binding: BINDING, key: KEY, inner: { ...INNER, text: 'x'.repeat(SHARED_TRANSLATION_LIMITS.textMaxLength + 1) } }).then(
      () => 'scellée',
      () => 'refusée',
    );
    expect(sealed).toBe('refusée');
  });
});

describe('sealPort et openPort sans Worker (#9899)', () => {
  test('rien ne se scelle ni ne s’ouvre : les ports rejettent, la page n’en sait rien de plus', async () => {
    const original = globalThis.Worker;
    Reflect.deleteProperty(globalThis, 'Worker');
    try {
      expect(await rejection(sealPort({ binding: BINDING, key: KEY, inner: INNER }))).toContain('pas de Worker');
      expect(await rejection(openPort({ binding: BINDING, key: KEY, envelope: { v: 1, alg: 'A256GCM', kdf: 'message-content', payload: 'AAAA' } }))).toContain(
        'pas de Worker',
      );
    } finally {
      globalThis.Worker = original;
    }
  });
});
