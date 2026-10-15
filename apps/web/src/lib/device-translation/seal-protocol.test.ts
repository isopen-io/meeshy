import { describe, expect, test } from 'bun:test';

import { SHARED_TRANSLATION_LIMITS, type SharedTranslationInner } from '@meeshy/shared/types/shared-translation';
import { openSharedTranslation, sealSharedTranslation } from '@meeshy/shared/utils/shared-translation-seal';

import { createSealClient, createSealHost, type SealingModule, type SealReply, type SealRequest, type SealWorkerPort } from './seal-protocol';

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

/** Le Worker et sa page, reliés sans thread : ce qui part d'un côté arrive de l'autre. */
const linked = (sealing: SealingModule) => {
  let toPage: (reply: SealReply) => void = () => {};
  const host = createSealHost({ sealing, post: (reply) => toPage(reply) });
  const port: SealWorkerPort = {
    postMessage: (request: SealRequest) => void host.receive(request),
    addEventListener: (type: string, listener: (event: never) => void) => {
      if (type === 'message') toPage = (reply) => (listener as (event: { readonly data: SealReply }) => void)({ data: reply });
    },
  };
  return createSealClient({ port });
};

describe('le protocole page ↔ Worker du scellement partagé (#9899)', () => {
  test('ce que le Worker scelle, la page l’ouvre depuis le même texte : le contrat partagé passe tel quel', async () => {
    const client = linked({ sealSharedTranslation, openSharedTranslation });
    const envelope = await client.seal({ binding: BINDING, key: KEY, inner: INNER });
    expect(envelope).toMatchObject({ v: 1, alg: 'A256GCM', kdf: 'message-content' });
    expect(await client.open({ binding: BINDING, key: KEY, envelope })).toEqual(INNER);
  });

  test('un autre texte, ou une autre langue, n’ouvre pas l’enveloppe : le Worker répond null, il ne rejette pas', async () => {
    const client = linked({ sealSharedTranslation, openSharedTranslation });
    const envelope = await client.seal({ binding: BINDING, key: KEY, inner: INNER });
    expect(await client.open({ binding: { ...BINDING, sourceContent: 'habari' }, key: KEY, envelope })).toBeNull();
    expect(await client.open({ binding: { ...BINDING, targetLanguage: 'en' }, key: KEY, envelope })).toBeNull();
  });

  test('une traduction que la passerelle ne prendrait pas se refuse, avec la cause du Worker', async () => {
    const client = linked({ sealSharedTranslation, openSharedTranslation });
    const message = await rejection(client.seal({ binding: BINDING, key: KEY, inner: { ...INNER, text: 'x'.repeat(SHARED_TRANSLATION_LIMITS.textMaxLength + 1) } }));
    expect(message).not.toBe('');
  });

  test('une panne imprévue à l’ouverture revient en rejet avec sa cause : elle ne se confond pas avec « ne s’ouvre pas »', async () => {
    const client = linked({
      sealSharedTranslation,
      openSharedTranslation: async () => {
        throw new Error('clé illisible');
      },
    });
    const envelope = { v: 1, alg: 'A256GCM', kdf: 'message-content', payload: 'AAAA' } as const;
    expect(await rejection(client.open({ binding: BINDING, key: KEY, envelope }))).toBe('clé illisible');
  });

  test('deux demandes simultanées reçoivent chacune leur réponse, même rendues dans l’autre ordre', async () => {
    const releases: Array<() => void> = [];
    const slow: SealingModule = {
      sealSharedTranslation: async (params) => {
        await new Promise<void>((resolve) => releases.push(resolve));
        return { v: 1, alg: 'A256GCM', kdf: 'message-content', payload: params.inner.text };
      },
      openSharedTranslation: async () => null,
    };
    const client = linked(slow);
    const first = client.seal({ binding: BINDING, key: KEY, inner: { ...INNER, text: 'premier' } });
    const second = client.seal({ binding: BINDING, key: KEY, inner: { ...INNER, text: 'second' } });
    releases[1]?.();
    releases[0]?.();
    expect([(await first).payload, (await second).payload]).toEqual(['premier', 'second']);
  });
});

/** Un Worker mort ou muet : la page n’attend pas indéfiniment et ne réessaie pas dans le vide. */
const stuckPort = () => {
  const listeners = new Map<string, (event: never) => void>();
  const port: SealWorkerPort = {
    postMessage: () => undefined,
    addEventListener: (type: string, listener: (event: never) => void) => void listeners.set(type, listener),
  };
  return { port, fire: (type: string) => (listeners.get(type) as (event: unknown) => void)({}) };
};

describe('un Worker du scellement qui ne répond pas (#9899)', () => {
  test('une erreur du Worker rejette les demandes en attente, puis les suivantes sans les poster', async () => {
    const { port, fire } = stuckPort();
    let posted = 0;
    const client = createSealClient({ port: { ...port, postMessage: () => void (posted += 1) } });
    const waiting = client.seal({ binding: BINDING, key: KEY, inner: INNER });
    fire('error');
    expect(await rejection(waiting)).not.toBe('');
    expect(await rejection(client.open({ binding: BINDING, key: KEY, envelope: { v: 1, alg: 'A256GCM', kdf: 'message-content', payload: 'AAAA' } }))).not.toBe('');
    expect(posted).toBe(1);
  });

  test('un Worker muet rend la main : la demande échoue au bout du délai, elle ne pend pas', async () => {
    const { port } = stuckPort();
    const client = createSealClient({ port, timeoutMs: 15 });
    expect(await rejection(client.seal({ binding: BINDING, key: KEY, inner: INNER }))).toContain('délai');
  });
});
