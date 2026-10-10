import { describe, expect, test } from 'bun:test';

import type { SharedTranslation, SharedTranslationInner } from '@meeshy/shared/types/shared-translation';
import type { TranslationEvent } from '@meeshy/shared/types/socketio-events/translation';
import { openSharedTranslation, sealSharedTranslation } from '@meeshy/shared/utils/shared-translation-seal';

import type { OfferedMessage } from './scheduler';
import {
  SHARED_TRANSLATION_COOLDOWN_MS,
  createSharedTranslationReceiver,
  sharedTranslationLanguages,
  type OpenPort,
} from './shared-translations';
import type { SharedTranslationsOutcome } from './shared-translations-api';

const CONVERSATION = '68a000000000000000000001';
const OTHER_CONVERSATION = '68a000000000000000000002';

const messageId = (n: number): string => `68b${String(n).padStart(21, '0')}`;

const offered = (n: number, over: Partial<OfferedMessage> = {}): OfferedMessage => ({
  id: messageId(n),
  conversationId: CONVERSATION,
  content: `habari ${n}`,
  originalLanguage: 'sw',
  translatedLanguages: [],
  encrypted: false,
  ...over,
});

const shared = (n: number, over: Partial<SharedTranslation> = {}): SharedTranslation => ({
  id: `st-${n}`,
  conversationId: CONVERSATION,
  messageId: messageId(n),
  targetLanguage: 'fr',
  envelope: { v: 1, alg: 'A256GCM', kdf: 'message-content', payload: 'QUJD'.repeat(12) },
  sharedBy: 'u-peer',
  sharedAt: '2026-10-10T12:00:00.000Z',
  ...over,
});

const INNER: SharedTranslationInner = { v: 1, text: 'comment vas-tu', sourceLanguage: 'sw', engine: 'device:opus-mt-q8' };

type FetchCall = { readonly conversationId: string; readonly messageIds: readonly string[]; readonly languages: readonly string[] };
type OpenCall = Parameters<OpenPort>[0];

const nothingShared = (): SharedTranslationsOutcome => ({ status: 'ok', shares: [] });
const servingShares =
  (...shares: SharedTranslation[]) =>
  (): SharedTranslationsOutcome => ({ status: 'ok', shares });

const harness = (
  options: {
    readonly serve?: (call: FetchCall) => SharedTranslationsOutcome;
    readonly open?: OpenPort;
    readonly clock?: { now: number };
  } = {},
) => {
  const fetched: FetchCall[] = [];
  const opened: OpenCall[] = [];
  const applied: TranslationEvent[] = [];
  const clock = options.clock ?? { now: 0 };
  const receiver = createSharedTranslationReceiver({
    fetch: async (call) => {
      fetched.push(call);
      return (options.serve ?? nothingShared)(call);
    },
    open: async (params) => {
      opened.push(params);
      return options.open === undefined ? INNER : options.open(params);
    },
    apply: (event) => void applied.push(event),
    now: () => clock.now,
  });
  return { receiver, fetched, opened, applied, clock };
};

const thread = (messages: readonly OfferedMessage[], readerLanguages: readonly string[] = ['fr', 'en']) => ({
  conversationId: CONVERSATION,
  messages,
  readerLanguages,
});

describe('sharedTranslationLanguages — les langues du lecteur, telles que la passerelle les stocke (#9899)', () => {
  test('normalisées, sans doublon ni vide, dans l’ordre du prisme', () => {
    expect(sharedTranslationLanguages(['fr', 'FR', 'en-US', '  ', 'pt-BR', 'en'])).toEqual(['fr', 'en', 'pt']);
  });

  test('bornées à ce que la passerelle accepte', () => {
    const many = ['fr', 'en', 'es', 'pt', 'de', 'it', 'ar', 'sw', 'ewo', 'fil'];
    expect(sharedTranslationLanguages(many)).toEqual(many.slice(0, 8));
  });
});

describe('createSharedTranslationReceiver.offer — le fil ouvert relit ce que les autres membres ont partagé (#9899)', () => {
  test('demande, dans les langues du lecteur, les messages dont le rang 1 n’est pas servi — les plus récents d’abord', async () => {
    const h = harness();
    await h.receiver.offer(
      thread([
        offered(1),
        offered(2),
        offered(3, { translatedLanguages: ['fr'] }),
        offered(4, { originalLanguage: 'fr' }),
        offered(5, { originalLanguage: null }),
        offered(6, { encrypted: true }),
        offered(7, { content: '   ' }),
      ]),
    );
    expect(h.fetched).toEqual([{ conversationId: CONVERSATION, messageIds: [messageId(2), messageId(1)], languages: ['fr', 'en'] }]);
  });

  test('ouvre chaque partage avec la clé du texte du message, et l’applique sous l’identité du partage', async () => {
    const h = harness({ serve: servingShares(shared(1)) });
    await h.receiver.offer(thread([offered(1)]));

    expect(h.opened).toEqual([
      {
        binding: { conversationId: CONVERSATION, messageId: messageId(1), targetLanguage: 'fr', sourceContent: 'habari 1' },
        key: { kdf: 'message-content' },
        envelope: shared(1).envelope,
      },
    ]);
    expect(h.applied).toEqual([
      {
        messageId: messageId(1),
        translations: [
          {
            id: 'shared:st-1',
            messageId: messageId(1),
            sourceLanguage: 'sw',
            targetLanguage: 'fr',
            translatedContent: 'comment vas-tu',
            translationModel: 'device:opus-mt-q8',
            cacheKey: 'shared:st-1',
            cached: true,
          },
        ],
      },
    ]);
  });

  test('rien à demander, aucune requête', async () => {
    const h = harness();
    await h.receiver.offer(thread([offered(1, { translatedLanguages: ['fr'] }), offered(2, { originalLanguage: 'fr' })]));
    await h.receiver.offer(thread([offered(3)], []));
    expect(h.fetched).toEqual([]);
  });

  test('au plus cent messages par requête, l’une après l’autre', async () => {
    let active = 0;
    let widest = 0;
    const sizes: number[] = [];
    const receiver = createSharedTranslationReceiver({
      fetch: async (call) => {
        active += 1;
        widest = Math.max(widest, active);
        sizes.push(call.messageIds.length);
        await new Promise((resolve) => setTimeout(resolve, 0));
        active -= 1;
        return nothingShared();
      },
      open: async () => INNER,
      apply: () => undefined,
    });
    await receiver.offer(thread(Array.from({ length: 250 }, (_, index) => offered(index + 1))));
    expect(sizes).toEqual([100, 100, 50]);
    expect(widest).toBe(1);
  });

  test('ce qui a été demandé ne se redemande pas ; un message modifié, ou d’autres langues, si', async () => {
    const h = harness();
    await h.receiver.offer(thread([offered(1)]));
    await h.receiver.offer(thread([offered(1)]));
    expect(h.fetched).toHaveLength(1);

    await h.receiver.offer(thread([offered(1, { content: 'habari yako, rafiki' })]));
    expect(h.fetched).toHaveLength(2);

    await h.receiver.offer(thread([offered(1)], ['fr', 'en', 'es']));
    expect(h.fetched).toHaveLength(3);
  });

  test('deux offres simultanées ne demandent qu’une fois', async () => {
    const h = harness();
    await Promise.all([h.receiver.offer(thread([offered(1)])), h.receiver.offer(thread([offered(1)]))]);
    expect(h.fetched).toHaveLength(1);
  });

  test('une traduction déjà ouverte se repeint quand le fil rechargé depuis le serveur l’a perdue, sans nouvelle requête', async () => {
    const h = harness({ serve: servingShares(shared(1)) });
    await h.receiver.offer(thread([offered(1)]));
    await h.receiver.offer(thread([offered(1)]));

    expect(h.fetched).toHaveLength(1);
    expect(h.opened).toHaveLength(1);
    expect(h.applied.map((event) => event.translations[0]?.id)).toEqual(['shared:st-1', 'shared:st-1']);
  });

  test('un fil qui porte la traduction n’est pas repeint', async () => {
    const h = harness({ serve: servingShares(shared(1)) });
    await h.receiver.offer(thread([offered(1)]));
    await h.receiver.offer(thread([offered(1, { translatedLanguages: ['fr'] })]));
    expect(h.applied).toHaveLength(1);
  });

  test('un message modifié ne reprend pas l’ancienne traduction', async () => {
    const h = harness({ serve: servingShares(shared(1)) });
    await h.receiver.offer(thread([offered(1)]));
    await h.receiver.offer(thread([offered(1, { content: 'habari yako, rafiki' })]));
    expect(h.fetched).toHaveLength(2);
  });
});

describe('createSharedTranslationReceiver — ce qui s’applique, et ce qui ne s’applique pas (#9899)', () => {
  test('une langue hors du prisme du lecteur n’est ni ouverte ni appliquée', async () => {
    const h = harness({ serve: servingShares(shared(1, { targetLanguage: 'de' })) });
    await h.receiver.offer(thread([offered(1)]));
    expect(h.opened).toEqual([]);
    expect(h.applied).toEqual([]);
  });

  test('une langue que le message porte déjà n’est ni ouverte ni appliquée ; une autre l’est', async () => {
    const h = harness({
      serve: servingShares(shared(1, { id: 'st-en', targetLanguage: 'en' }), shared(1, { id: 'st-fr', targetLanguage: 'fr' })),
    });
    await h.receiver.offer(thread([offered(1, { translatedLanguages: ['en'] })]));
    expect(h.applied.map((event) => event.translations[0]?.id)).toEqual(['shared:st-fr']);
  });

  test('une dérivation par le secret du message ne s’ouvre pas ici : il n’y a pas de secret', async () => {
    const h = harness({ serve: servingShares(shared(1, { envelope: { v: 1, alg: 'A256GCM', kdf: 'message-secret', payload: 'QUJD'.repeat(12) } })) });
    await h.receiver.offer(thread([offered(1)]));
    expect(h.opened).toEqual([]);
    expect(h.applied).toEqual([]);
  });

  test('une enveloppe qui ne s’ouvre pas n’est pas appliquée', async () => {
    const h = harness({ serve: servingShares(shared(1)), open: async () => null });
    await h.receiver.offer(thread([offered(1)]));
    expect(h.applied).toEqual([]);
  });

  test('un partage qui ne désigne aucun message demandé, ou une autre conversation, est ignoré', async () => {
    const h = harness({ serve: servingShares(shared(99), shared(1, { id: 'st-ailleurs', conversationId: OTHER_CONVERSATION })) });
    await h.receiver.offer(thread([offered(1)]));
    expect(h.opened).toEqual([]);
    expect(h.applied).toEqual([]);
  });

  test('avec le vrai scellement : le texte du message ouvre l’enveloppe, un autre texte non', async () => {
    const binding = { conversationId: CONVERSATION, messageId: messageId(1), targetLanguage: 'fr' };
    const envelopeFor = (sourceContent: string) =>
      sealSharedTranslation({ binding: { ...binding, sourceContent }, key: { kdf: 'message-content' }, inner: INNER });

    const genuine = harness({ serve: servingShares(shared(1, { envelope: await envelopeFor('habari 1') })), open: openSharedTranslation });
    await genuine.receiver.offer(thread([offered(1)]));
    expect(genuine.applied.map((event) => event.translations[0]?.translatedContent)).toEqual(['comment vas-tu']);

    const forged = harness({ serve: servingShares(shared(1, { envelope: await envelopeFor('un autre texte') })), open: openSharedTranslation });
    await forged.receiver.offer(thread([offered(1)]));
    expect(forged.applied).toEqual([]);
  });
});

describe('createSharedTranslationReceiver — pannes et refus (#9899)', () => {
  test('un refus définitif ne se redemande pas pour cette conversation, mais n’arrête pas les autres', async () => {
    const h = harness({ serve: () => ({ status: 'refused' }) });
    await h.receiver.offer(thread([offered(1)]));
    await h.receiver.offer(thread([offered(1), offered(2)]));
    expect(h.fetched).toHaveLength(1);

    await h.receiver.offer({
      conversationId: OTHER_CONVERSATION,
      messages: [offered(3, { conversationId: OTHER_CONVERSATION })],
      readerLanguages: ['fr'],
    });
    expect(h.fetched).toHaveLength(2);
  });

  test('une panne se retente après un délai, pas à chaque changement du fil', async () => {
    let failing = true;
    const h = harness({ serve: () => (failing ? { status: 'failed' } : nothingShared()) });

    await h.receiver.offer(thread([offered(1)]));
    h.clock.now = SHARED_TRANSLATION_COOLDOWN_MS - 1;
    await h.receiver.offer(thread([offered(1)]));
    expect(h.fetched).toHaveLength(1);

    failing = false;
    h.clock.now = SHARED_TRANSLATION_COOLDOWN_MS;
    await h.receiver.offer(thread([offered(1)]));
    expect(h.fetched).toHaveLength(2);
  });

  test('une requête qui échoue arrête les suivantes, et seules les messages non servis se redemandent', async () => {
    let failing = true;
    const h = harness({ serve: (call) => (failing && call.messageIds.includes(messageId(100)) ? { status: 'failed' } : nothingShared()) });
    const messages = Array.from({ length: 250 }, (_, index) => offered(index + 1));

    await h.receiver.offer(thread(messages));
    expect(h.fetched.map((call) => call.messageIds.length)).toEqual([100, 100]);

    failing = false;
    h.clock.now = SHARED_TRANSLATION_COOLDOWN_MS;
    await h.receiver.offer(thread(messages));
    expect(h.fetched.slice(2).map((call) => call.messageIds.length)).toEqual([100, 50]);
  });

  test('aucune panne ne remonte jusqu’au fil', async () => {
    const throwing = async (): Promise<never> => {
      throw new Error('panne');
    };
    const fetchFails = createSharedTranslationReceiver({ fetch: throwing, open: async () => INNER, apply: () => undefined });
    await fetchFails.offer(thread([offered(1)]));

    const openFails = createSharedTranslationReceiver({ fetch: async () => ({ status: 'ok', shares: [shared(1)] }), open: throwing, apply: () => undefined });
    await openFails.offer(thread([offered(1)]));

    const applyFails = createSharedTranslationReceiver({
      fetch: async () => ({ status: 'ok', shares: [shared(1)] }),
      open: async () => INNER,
      apply: () => {
        throw new Error('panne');
      },
    });
    await applyFails.offer(thread([offered(1)]));
    await applyFails.receive(shared(1));
  });
});

describe('createSharedTranslationReceiver.receive — un membre vient de partager (temps réel) (#9899)', () => {
  test('applique la traduction partagée à un message du fil ouvert', async () => {
    const h = harness();
    await h.receiver.offer(thread([offered(1)]));
    await h.receiver.receive(shared(1));

    expect(h.opened.map((call) => call.binding)).toEqual([{ conversationId: CONVERSATION, messageId: messageId(1), targetLanguage: 'fr', sourceContent: 'habari 1' }]);
    expect(h.applied.map((event) => event.translations[0]?.id)).toEqual(['shared:st-1']);
  });

  test('ignore ce qui n’est pas une traduction partagée, un fil non ouvert, un message absent du fil', async () => {
    const h = harness();
    await h.receiver.offer(thread([offered(1)]));
    await h.receiver.receive(null);
    await h.receiver.receive({ id: 'x' });
    await h.receiver.receive(shared(1, { conversationId: OTHER_CONVERSATION }));
    await h.receiver.receive(shared(2));
    expect(h.opened).toEqual([]);
    expect(h.applied).toEqual([]);
  });

  test('une même traduction reçue deux fois ne s’applique qu’une fois', async () => {
    const h = harness();
    await h.receiver.offer(thread([offered(1)]));
    await h.receiver.receive(shared(1));
    await h.receiver.receive(shared(1));
    expect(h.applied).toHaveLength(1);
  });

  test('ne touche pas une langue que le fil sert déjà, ni une langue hors du prisme', async () => {
    const h = harness();
    await h.receiver.offer(thread([offered(1, { translatedLanguages: ['fr'] })]));
    await h.receiver.receive(shared(1));
    await h.receiver.receive(shared(1, { id: 'st-de', targetLanguage: 'de' }));
    expect(h.applied).toEqual([]);
  });

  test('la dernière offre fait foi : le fil quitté n’est plus à l’écoute', async () => {
    const h = harness();
    await h.receiver.offer(thread([offered(1)]));
    h.receiver.forget(CONVERSATION);
    await h.receiver.receive(shared(1));
    expect(h.applied).toEqual([]);
  });
});
