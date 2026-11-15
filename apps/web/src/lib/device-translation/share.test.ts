import { describe, expect, test } from 'bun:test';

import {
  SHARED_TRANSLATION_ERROR_CODES,
  shareTranslationBodySchema,
  type ShareTranslationBody,
} from '@meeshy/shared/types/shared-translation';
import { openSharedTranslation, sealSharedTranslation } from '@meeshy/shared/utils/shared-translation-seal';

import type { ApiResult, HttpRequest } from '@/lib/api/http';

import { createMemoryStore, type KeyValueStore } from './cache';
import type { DeliveredTranslation, OfferedMessage } from './scheduler';
import { createShareLedger, createTranslationSharer, type SealPort, type ShareLedger } from './share';
import { postSharedTranslation, type ShareOutcome } from './shared-translations-api';

const MESSAGE = '68b000000000000000000001';
const CONVERSATION = '68a000000000000000000001';

const origin = (over: Partial<OfferedMessage> = {}): OfferedMessage => ({
  id: MESSAGE,
  conversationId: CONVERSATION,
  content: 'habari yako',
  originalLanguage: 'sw',
  translatedLanguages: [],
  encrypted: false,
  shareable: true,
  sourceVersion: 'original',
  ...over,
});

const delivered = (over: Partial<DeliveredTranslation> = {}): DeliveredTranslation => ({
  messageId: MESSAGE,
  source: 'sw',
  target: 'fr',
  text: 'comment vas-tu',
  engine: 'device:opus-mt-q8',
  ...over,
});

/** Un sceau et une passerelle de témoin : ce qui est scellé, ce qui part, et ce que la passerelle répond. */
const harness = (outcomes: ShareOutcome[] = [], ledger?: ShareLedger) => {
  const sealed: Parameters<SealPort>[0][] = [];
  const posted: { readonly conversationId: string; readonly body: ShareTranslationBody }[] = [];
  const seal: SealPort = async (params) => {
    sealed.push(params);
    return { v: 1, alg: 'A256GCM', kdf: 'message-content', payload: 'QUJD'.repeat(12) };
  };
  const post = async (conversationId: string, body: ShareTranslationBody): Promise<ShareOutcome> => {
    posted.push({ conversationId, body });
    return outcomes.shift() ?? 'shared';
  };
  return { share: createTranslationSharer({ seal, post, ...(ledger === undefined ? {} : { ledger }) }), sealed, posted };
};

describe('createTranslationSharer — la traduction de l’appareil part scellée vers les autres membres (#9899)', () => {
  test('scelle avec le texte original du message, lie la conversation, le message et la langue, et poste l’enveloppe', async () => {
    const h = harness();
    await h.share(delivered(), origin());

    expect(h.sealed).toEqual([
      {
        binding: { conversationId: CONVERSATION, messageId: MESSAGE, targetLanguage: 'fr', sourceContent: 'habari yako' },
        key: { kdf: 'message-content' },
        inner: { v: 1, text: 'comment vas-tu', sourceLanguage: 'sw', engine: 'device:opus-mt-q8' },
      },
    ]);
    expect(h.posted).toEqual([
      {
        conversationId: CONVERSATION,
        body: {
          messageId: MESSAGE,
          targetLanguage: 'fr',
          sourceVersion: 'original',
          envelope: { v: 1, alg: 'A256GCM', kdf: 'message-content', payload: 'QUJD'.repeat(12) },
        },
      },
    ]);
  });

  test('avec le vrai sceau : un autre appareil ouvre l’enveloppe depuis le texte original, et lui seul', async () => {
    const posted: ShareTranslationBody[] = [];
    const share = createTranslationSharer({
      seal: sealSharedTranslation,
      post: async (_conversationId, body) => (posted.push(body), 'shared'),
    });
    await share(delivered(), origin());

    const [body] = posted;
    expect(body).toBeDefined();
    if (body === undefined) return;
    expect(shareTranslationBodySchema.safeParse(body).success).toBe(true);
    const binding = { conversationId: CONVERSATION, messageId: MESSAGE, targetLanguage: body.targetLanguage, sourceContent: 'habari yako' };
    expect(await openSharedTranslation({ binding, key: { kdf: 'message-content' }, envelope: body.envelope })).toEqual({
      v: 1,
      text: 'comment vas-tu',
      sourceLanguage: 'sw',
      engine: 'device:opus-mt-q8',
    });
    expect(await openSharedTranslation({ binding: { ...binding, sourceContent: 'habari yako, rafiki' }, key: { kdf: 'message-content' }, envelope: body.envelope })).toBeNull();
    expect(await openSharedTranslation({ binding: { ...binding, targetLanguage: 'en' }, key: { kdf: 'message-content' }, envelope: body.envelope })).toBeNull();
  });

  test('jamais pour un message chiffré de bout en bout', async () => {
    const h = harness();
    await h.share(delivered(), origin({ encrypted: true }));
    expect(h.sealed).toEqual([]);
    expect(h.posted).toEqual([]);
  });

  test('jamais pour un message que le serveur ne lit pas : un clair d’une conversation chiffrée de bout en bout se lit ici, il ne part pas', async () => {
    const h = harness();
    await h.share(delivered(), origin({ shareable: false }));
    expect(h.sealed).toEqual([]);
    expect(h.posted).toEqual([]);
  });

  test('jamais sans version lisible du texte traduit : l’appareil ne sait pas quel état du message il a traduit', async () => {
    const h = harness();
    await h.share(delivered(), origin({ sourceVersion: null }));
    expect(h.sealed).toEqual([]);
    expect(h.posted).toEqual([]);
  });

  test('la version du texte traduit voyage avec la traduction : celle du message modifié, pas « original »', async () => {
    const h = harness();
    await h.share(delivered(), origin({ sourceVersion: '2026-10-10T08:00:00.123Z' }));
    expect(h.posted.map((p) => p.body.sourceVersion)).toEqual(['2026-10-10T08:00:00.123Z']);
  });

  test('jamais sans conversation connue, ni pour une livraison qui n’est pas celle de ce message', async () => {
    const h = harness();
    await h.share(delivered(), origin({ conversationId: '' }));
    await h.share(delivered({ messageId: 'autre' }), origin());
    expect(h.sealed).toEqual([]);
    expect(h.posted).toEqual([]);
  });

  test('une traduction vide ne se partage pas', async () => {
    const h = harness();
    await h.share(delivered({ text: '   ' }), origin());
    expect(h.sealed).toEqual([]);
  });

  test('un partage fait n’est pas refait : la même traduction rejouée par le cache part une seule fois', async () => {
    const h = harness();
    await h.share(delivered(), origin());
    await h.share(delivered(), origin());
    expect(h.posted).toHaveLength(1);
  });

  test('une autre langue, ou un texte modifié, est un autre partage', async () => {
    const h = harness();
    await h.share(delivered(), origin());
    await h.share(delivered({ target: 'en', text: 'how are you' }), origin());
    await h.share(delivered({ text: 'comment allez-vous' }), origin({ content: 'habari yako, rafiki' }));
    expect(h.posted.map((p) => `${p.body.targetLanguage}`)).toEqual(['fr', 'en', 'fr']);
  });

  test('deux livraisons simultanées de la même traduction ne postent qu’une fois', async () => {
    const h = harness();
    await Promise.all([h.share(delivered(), origin()), h.share(delivered(), origin())]);
    expect(h.posted).toHaveLength(1);
  });

  test('une panne de la passerelle se retente à la livraison suivante', async () => {
    const h = harness(['failed', 'shared']);
    await h.share(delivered(), origin());
    await h.share(delivered(), origin());
    await h.share(delivered(), origin());
    expect(h.posted).toHaveLength(2);
  });

  test('un refus de la passerelle ne se retente pas', async () => {
    const h = harness(['refused']);
    await h.share(delivered(), origin());
    await h.share(delivered(), origin());
    expect(h.posted).toHaveLength(1);
  });

  test('un compte qui a coupé ses accusés de lecture cesse de partager pour la session : ni sceau ni envoi ensuite', async () => {
    const OTHER = '68b000000000000000000002';
    const h = harness(['declined']);
    await h.share(delivered(), origin());
    await h.share(delivered({ target: 'en', text: 'how are you' }), origin());
    await h.share(delivered({ messageId: OTHER }), origin({ id: OTHER }));

    expect(h.posted).toHaveLength(1);
    expect(h.sealed).toHaveLength(1);
  });

  test('un sceau qui échoue ne remonte pas, ne poste rien et ne se retente pas', async () => {
    let attempts = 0;
    const posted: unknown[] = [];
    const share = createTranslationSharer({
      seal: async () => {
        attempts += 1;
        throw new Error('traduction trop longue pour être partagée');
      },
      post: async (...args) => (posted.push(args), 'shared'),
    });
    await share(delivered(), origin());
    await share(delivered(), origin());
    expect(attempts).toBe(1);
    expect(posted).toEqual([]);
  });

  test('une passerelle qui lève ne remonte pas : l’affichage n’attend jamais le partage', async () => {
    const share = createTranslationSharer({
      seal: async () => ({ v: 1, alg: 'A256GCM', kdf: 'message-content', payload: 'QUJD'.repeat(12) }),
      post: async () => {
        throw new Error('réseau coupé');
      },
    });
    await share(delivered(), origin());
  });
});

/** La passerelle de témoin : le vrai port `postSharedTranslation`, une réponse HTTP par requête. */
const gatewaySharer = (results: ApiResult<unknown>[]) => {
  const requests: HttpRequest[] = [];
  const transport = {
    request: async (request: HttpRequest) => {
      requests.push(request);
      return results.shift() ?? { ok: true, data: {} };
    },
  } as unknown as Parameters<typeof postSharedTranslation>[0]['deps']['transport'];
  const share = createTranslationSharer({
    seal: async () => ({ v: 1, alg: 'A256GCM', kdf: 'message-content', payload: 'QUJD'.repeat(12) }),
    post: (conversationId, body) => postSharedTranslation({ deps: { source: 'gateway', transport }, conversationId, body }),
  });
  return { share, requests };
};

describe('ce que la passerelle répond à un partage — le texte a changé, ou le budget est épuisé (#9899)', () => {
  test('un message modifié depuis (409) : refus définitif de CE texte, jamais renvoyé ; sa nouvelle version, elle, se partage', async () => {
    const { share, requests } = gatewaySharer([
      { ok: false, status: 409, error: 'The message changed', code: SHARED_TRANSLATION_ERROR_CODES.staleSource },
    ]);
    await share(delivered(), origin({ sourceVersion: 'original' }));
    await share(delivered(), origin({ sourceVersion: 'original' }));
    expect(requests).toHaveLength(1);

    await share(delivered({ text: 'comment allez-vous' }), origin({ content: 'habari yako, rafiki', sourceVersion: '2026-10-10T08:00:00.123Z' }));
    expect(requests).toHaveLength(2);
  });

  test('un budget de partage épuisé (429) est une panne : la traduction reste sur l’appareil et se repartage plus tard', async () => {
    const { share, requests } = gatewaySharer([
      { ok: false, status: 429, error: 'Too many shared translations', code: SHARED_TRANSLATION_ERROR_CODES.budgetExceeded, retryAfter: 60 },
    ]);
    await share(delivered(), origin());
    await share(delivered(), origin());
    await share(delivered(), origin());
    expect(requests).toHaveLength(2);
  });
});

describe('le registre des partages — un partage fait ne se refait pas non plus à la session suivante (#9899)', () => {
  test('un partage posté s’inscrit au registre : une session neuve, mémoire vide, ne le reposte pas', async () => {
    const store = createMemoryStore();
    const first = harness([], createShareLedger(store));
    await first.share(delivered(), origin());
    expect(first.posted).toHaveLength(1);

    const second = harness([], createShareLedger(store));
    await second.share(delivered(), origin());
    expect(second.sealed).toEqual([]);
    expect(second.posted).toEqual([]);
  });

  test('une panne, un refus ou un compte qui décline ne s’inscrivent pas : la session suivante retente', async () => {
    const store = createMemoryStore();
    await harness(['failed'], createShareLedger(store)).share(delivered(), origin());
    await harness(['refused'], createShareLedger(store)).share(delivered(), origin());
    await harness(['declined'], createShareLedger(store)).share(delivered(), origin());

    const fourth = harness([], createShareLedger(store));
    await fourth.share(delivered(), origin());
    expect(fourth.posted).toHaveLength(1);
  });

  test('un texte modifié, ou une autre langue, n’est pas couvert par le registre', async () => {
    const store = createMemoryStore();
    await harness([], createShareLedger(store)).share(delivered(), origin());

    const next = harness([], createShareLedger(store));
    await next.share(delivered(), origin({ content: 'habari yako, rafiki' }));
    await next.share(delivered({ target: 'en', text: 'how are you' }), origin());
    expect(next.posted.map((p) => p.body.targetLanguage)).toEqual(['fr', 'en']);
  });

  test('un stockage indisponible ne bloque pas le partage', async () => {
    const broken: KeyValueStore = {
      get: async () => {
        throw new Error('IndexedDB indisponible');
      },
      set: async () => {
        throw new Error('IndexedDB indisponible');
      },
    };
    const h = harness([], createShareLedger(broken));
    await h.share(delivered(), origin());
    expect(h.posted).toHaveLength(1);
  });

  test('un registre qui lève lui-même ne remonte pas non plus', async () => {
    const h = harness([], {
      has: async () => {
        throw new Error('registre en panne');
      },
      add: async () => {
        throw new Error('registre en panne');
      },
    });
    await h.share(delivered(), origin());
    expect(h.posted).toHaveLength(1);
  });
});
