import { describe, expect, test } from 'bun:test';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';
import type { SharedTranslation, SharedTranslationInner } from '@meeshy/shared/types/shared-translation';
import type { TranslationEvent } from '@meeshy/shared/types/socketio-events/translation';

import type { Message } from '@/lib/api/types';
import type { SocketClient } from '@/lib/net/socket';

import { createSharedTranslationReceiver } from './shared-translations';
import type { SharedTranslationsOutcome } from './shared-translations-api';
import { createSharedTranslationSession } from './shared-translations-session';

const CONVERSATION = '68a000000000000000000001';
const MESSAGE = '68b000000000000000000001';
const INNER: SharedTranslationInner = { v: 1, text: 'comment vas-tu', sourceLanguage: 'sw', engine: 'device:opus-mt-q8' };

const message = (over: Partial<Message> = {}): Message =>
  ({
    id: MESSAGE,
    conversationId: CONVERSATION,
    senderId: 'u-other',
    content: 'habari yako',
    originalLanguage: 'sw',
    translations: [],
    isViewOnce: false,
    viewOnceCount: 0,
    isBlurred: false,
    isEncrypted: false,
    ...over,
  }) as unknown as Message;

const shared = (over: Partial<SharedTranslation> = {}): SharedTranslation => ({
  id: 'st-1',
  conversationId: CONVERSATION,
  messageId: MESSAGE,
  targetLanguage: 'fr',
  envelope: { v: 1, alg: 'A256GCM', kdf: 'message-content', payload: 'QUJD'.repeat(12) },
  sharedBy: 'u-peer',
  sharedAt: '2026-10-10T12:00:00.000Z',
  ...over,
});

const fakeSocket = () => {
  const handlers = new Map<string, Set<(payload: unknown) => void>>();
  const socket: SocketClient = {
    connected: true,
    connect: () => undefined,
    disconnect: () => undefined,
    on: (event, handler) => void handlers.set(event, (handlers.get(event) ?? new Set()).add(handler as (payload: unknown) => void)),
    off: (event, handler) => void handlers.get(event)?.delete(handler as (payload: unknown) => void),
    emit: () => undefined,
  };
  return {
    socket,
    deliver: (event: string, payload: unknown) => handlers.get(event)?.forEach((handler) => handler(payload)),
    listeners: (event: string) => handlers.get(event)?.size ?? 0,
  };
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const harness = (serve: () => SharedTranslationsOutcome = () => ({ status: 'ok', shares: [] })) => {
  const requested: (readonly string[])[] = [];
  const applied: TranslationEvent[] = [];
  const wire = fakeSocket();
  const receiver = createSharedTranslationReceiver({
    fetch: async (call) => {
      requested.push(call.messageIds);
      return serve();
    },
    open: async () => INNER,
    apply: (event) => void applied.push(event),
  });
  const session = createSharedTranslationSession({ receiver, watchSocket: async (watcher) => watcher(wire.socket) });
  return { session, requested, applied, wire };
};

const thread = (messages: readonly Message[], viewerId = 'u-me', conversationEncryptionMode: string | null = null) => ({
  conversationId: CONVERSATION,
  messages,
  viewerId,
  readerLanguages: ['fr', 'en'],
  conversationEncryptionMode,
});

describe('createSharedTranslationSession.offer — le fil n’offre que ce que la loi de sortie laisse partir (#9899)', () => {
  test('un message reçu, en clair, est demandé ; les miens, les protégés et les chiffrés de bout en bout ne le sont pas', async () => {
    const h = harness();
    h.session.offer(
      thread([
        message({ id: 'ordinary' }),
        message({ id: 'mine', senderId: 'u-me' }),
        message({ id: 'once', isViewOnce: true }),
        message({ id: 'blur', isBlurred: true }),
        message({ id: 'e2ee', isEncrypted: true, encryptionMode: 'e2ee' }),
      ]),
    );
    await settle();
    expect(h.requested).toEqual([['ordinary']]);
  });

  test('sans lecteur identifié, rien n’est demandé', async () => {
    const h = harness();
    h.session.offer(thread([message()], ''));
    await settle();
    expect(h.requested).toEqual([]);
  });

  test('le serveur lit le message ou non : seul un clair qu’il lit déjà est demandé, quelle que soit la conversation', async () => {
    const asked = async (messages: readonly Message[], mode: string | null) => {
      const h = harness();
      h.session.offer(thread(messages, 'u-me', mode));
      await settle();
      return h.requested;
    };

    expect(await asked([message({ id: 'plain' })], null)).toEqual([['plain']]);
    expect(await asked([message({ id: 'plain' })], 'server')).toEqual([['plain']]);
    expect(await asked([message({ id: 'sealed-by-server', isEncrypted: true, encryptionMode: 'server' })], 'hybrid')).toEqual([['sealed-by-server']]);

    expect(await asked([message({ id: 'plain-in-e2ee' })], 'e2ee')).toEqual([]);
    expect(await asked([message({ id: 'plain-in-unknown' })], 'un-mode-inconnu')).toEqual([]);
    expect(await asked([message({ id: 'plain-e2ee-message', isEncrypted: false, encryptionMode: 'e2ee' })], null)).toEqual([]);
    expect(await asked([message({ id: 'no-mode', isEncrypted: true })], null)).toEqual([]);
  });
});

describe('createSharedTranslationSession.watch — tant que le fil est ouvert, les partages arrivent en direct (#9899)', () => {
  test('écoute message:translation-shared, applique à un message du fil, et cesse de l’écouter à la fermeture', async () => {
    const h = harness();
    h.session.offer(thread([message()]));
    const stop = h.session.watch(CONVERSATION);
    await settle();
    expect(h.wire.listeners(SERVER_EVENTS.MESSAGE_TRANSLATION_SHARED)).toBe(1);

    h.wire.deliver(SERVER_EVENTS.MESSAGE_TRANSLATION_SHARED, shared());
    await settle();
    expect(h.applied.map((event) => event.translations[0]?.id)).toEqual(['shared:st-1']);

    stop();
    expect(h.wire.listeners(SERVER_EVENTS.MESSAGE_TRANSLATION_SHARED)).toBe(0);
  });

  test('un fil fermé avant que la socket ne réponde ne s’accroche pas', async () => {
    const h = harness();
    const stop = h.session.watch(CONVERSATION);
    stop();
    await settle();
    expect(h.wire.listeners(SERVER_EVENTS.MESSAGE_TRANSLATION_SHARED)).toBe(0);
  });

  test('un fil quitté n’est plus à l’écoute : ses partages en direct sont ignorés', async () => {
    const h = harness();
    h.session.offer(thread([message()]));
    const stop = h.session.watch(CONVERSATION);
    await settle();
    stop();
    h.wire.deliver(SERVER_EVENTS.MESSAGE_TRANSLATION_SHARED, shared());
    await settle();
    expect(h.applied).toEqual([]);
  });

  test('une socket qui ne s’ouvre pas ne remonte pas', async () => {
    const receiver = createSharedTranslationReceiver({ fetch: async () => ({ status: 'ok', shares: [] }), open: async () => INNER, apply: () => undefined });
    const session = createSharedTranslationSession({
      receiver,
      watchSocket: async () => {
        throw new Error('realtime indisponible');
      },
    });
    const stop = session.watch(CONVERSATION);
    await settle();
    stop();
  });
});
