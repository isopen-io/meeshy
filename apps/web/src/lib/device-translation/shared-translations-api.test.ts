import { describe, expect, test } from 'bun:test';

import {
  SHARED_TRANSLATION_ALGORITHM,
  SHARED_TRANSLATION_ERROR_CODES,
  SHARED_TRANSLATION_KDFS,
  SHARED_TRANSLATION_LIMITS,
  shareTranslationBodySchema,
} from '@meeshy/shared/types/shared-translation';

import type { ApiResult, HttpRequest } from '@/lib/api/http';

import {
  SHARED_ENVELOPE_ALGORITHM,
  SHARED_ENVELOPE_KDFS,
  SHARED_TRANSLATION_READ_RECEIPTS_OFF,
  SHARED_TRANSLATION_REQUEST_LIMITS,
  fetchSharedTranslations,
  isSharedTranslation,
  postSharedTranslation,
} from './shared-translations-api';

const MSG_1 = '68b000000000000000000001';
const MSG_2 = '68b000000000000000000002';
const CONVERSATION = '68a000000000000000000001';

const share = (over: Record<string, unknown> = {}) => ({
  id: 'st-1',
  conversationId: CONVERSATION,
  messageId: MSG_1,
  targetLanguage: 'fr',
  envelope: { v: 1, alg: 'A256GCM', kdf: 'message-content', payload: 'A'.repeat(48) },
  sharedBy: 'u-peer',
  sharedAt: '2026-10-10T12:00:00.000Z',
  ...over,
});

const route = (conversationId: string): string => `/test/conversations/${conversationId}/shared-translations`;

const transportServing = (result: ApiResult<unknown> | (() => never)) => {
  const requests: HttpRequest[] = [];
  const transport = {
    request: async (request: HttpRequest) => {
      requests.push(request);
      if (typeof result === 'function') return result();
      return result;
    },
  } as unknown as { request<T>(request: HttpRequest): Promise<ApiResult<T>> };
  return { transport, requests };
};

const gateway = { source: 'gateway' } as const;

describe('fetchSharedTranslations — relire ce que les autres membres ont partagé (#9899)', () => {
  test('demande les messages et les langues du lecteur sur la route du catalogue', async () => {
    const { transport, requests } = transportServing({ ok: true, data: { sharedTranslations: [] } });
    await fetchSharedTranslations({ deps: { ...gateway, transport }, conversationId: CONVERSATION, messageIds: [MSG_1, MSG_2], languages: ['fr', 'en'], route });

    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect(request?.method).toBe('GET');
    const url = new URL(request?.path ?? '', 'https://gate.test');
    expect(url.pathname).toBe(route(CONVERSATION));
    expect(url.searchParams.get('messageIds')).toBe(`${MSG_1},${MSG_2}`);
    expect(url.searchParams.get('languages')).toBe('fr,en');
  });

  test('sans langue à demander, aucune requête ne part : la passerelle exige le prisme du lecteur, et en rendrait un refus', async () => {
    const { transport, requests } = transportServing({ ok: true, data: { sharedTranslations: [share()] } });
    const outcome = await fetchSharedTranslations({ deps: { ...gateway, transport }, conversationId: CONVERSATION, messageIds: [MSG_1], languages: [], route });
    expect(requests).toEqual([]);
    expect(outcome).toEqual({ status: 'ok', shares: [] });
  });

  test('la clé `languages` part toujours, dans l’ordre du prisme du lecteur', async () => {
    const { transport, requests } = transportServing({ ok: true, data: { sharedTranslations: [] } });
    await fetchSharedTranslations({ deps: { ...gateway, transport }, conversationId: CONVERSATION, messageIds: [MSG_1], languages: ['pt', 'fr', 'en'], route });
    expect(new URL(requests[0]?.path ?? '', 'https://gate.test').searchParams.get('languages')).toBe('pt,fr,en');
  });

  test('rend les traductions partagées bien formées, et laisse tomber les autres', async () => {
    const { transport } = transportServing({
      ok: true,
      data: { sharedTranslations: [share(), share({ id: 'st-2', envelope: null }), share({ id: 'st-3', messageId: MSG_2, targetLanguage: 'en' })] },
    });
    const outcome = await fetchSharedTranslations({ deps: { ...gateway, transport }, conversationId: CONVERSATION, messageIds: [MSG_1, MSG_2], languages: ['fr', 'en'], route });
    expect(outcome.status).toBe('ok');
    expect(outcome.status === 'ok' ? outcome.shares.map((entry) => entry.id) : []).toEqual(['st-1', 'st-3']);
  });

  test('aucun message à demander, aucune requête', async () => {
    const { transport, requests } = transportServing({ ok: true, data: { sharedTranslations: [] } });
    const outcome = await fetchSharedTranslations({ deps: { ...gateway, transport }, conversationId: CONVERSATION, messageIds: [], languages: ['fr'], route });
    expect(requests).toEqual([]);
    expect(outcome).toEqual({ status: 'ok', shares: [] });
  });

  test('un refus 4xx ne se retente pas ; une panne, le réseau ou une limite de débit, si', async () => {
    const outcomes = await Promise.all(
      [403, 404, 500, 503, 429, 0].map(async (status) => {
        const { transport } = transportServing({ ok: false, status, error: 'x' });
        return (await fetchSharedTranslations({ deps: { ...gateway, transport }, conversationId: CONVERSATION, messageIds: [MSG_1], languages: ['fr'], route })).status;
      }),
    );
    expect(outcomes).toEqual(['refused', 'refused', 'failed', 'failed', 'failed', 'failed']);
  });

  test('une réponse qui n’a pas la forme attendue est un refus, pas un fil rempli de rien', async () => {
    for (const data of [null, 'texte', { sharedTranslations: 'non' }, {}]) {
      const { transport } = transportServing({ ok: true, data });
      expect(
        (await fetchSharedTranslations({ deps: { ...gateway, transport }, conversationId: CONVERSATION, messageIds: [MSG_1], languages: ['fr'], route })).status,
      ).toBe('refused');
    }
  });

  test('un transport qui lève est une panne, jamais une exception pour le fil', async () => {
    const { transport } = transportServing(() => {
      throw new Error('réseau coupé');
    });
    const outcome = await fetchSharedTranslations({ deps: { ...gateway, transport }, conversationId: CONVERSATION, messageIds: [MSG_1], languages: ['fr'], route });
    expect(outcome.status).toBe('failed');
  });

  test('sur les fixtures, rien ne part et rien n’est partagé', async () => {
    const { transport, requests } = transportServing({ ok: true, data: { sharedTranslations: [share()] } });
    const outcome = await fetchSharedTranslations({ deps: { source: 'fixtures', transport }, conversationId: CONVERSATION, messageIds: [MSG_1], languages: ['fr'], route });
    expect(requests).toEqual([]);
    expect(outcome).toEqual({ status: 'ok', shares: [] });
  });
});

describe('postSharedTranslation — partager la traduction de l’appareil (#9899)', () => {
  const body = {
    messageId: MSG_1,
    targetLanguage: 'fr',
    sourceVersion: 'original',
    envelope: { v: 1, alg: 'A256GCM', kdf: 'message-content', payload: 'A'.repeat(48) },
  } as const;

  test('envoie le corps tel quel, sur la route du catalogue', async () => {
    const { transport, requests } = transportServing({ ok: true, data: { created: true, sharedTranslation: share() } });
    expect(await postSharedTranslation({ deps: { ...gateway, transport }, conversationId: CONVERSATION, body, route })).toBe('shared');
    expect(requests).toEqual([{ method: 'POST', path: route(CONVERSATION), body }]);
  });

  test('un autre membre l’avait déjà partagée : c’est un succès, la sienne fait foi', async () => {
    const { transport } = transportServing({ ok: true, data: { created: false, sharedTranslation: share() } });
    expect(await postSharedTranslation({ deps: { ...gateway, transport }, conversationId: CONVERSATION, body, route })).toBe('shared');
  });

  test('un refus 4xx ne se retente pas ; une panne, si', async () => {
    const statuses = await Promise.all(
      [400, 403, 404, 500, 429].map(async (status) => {
        const { transport } = transportServing({ ok: false, status, error: 'x' });
        return postSharedTranslation({ deps: { ...gateway, transport }, conversationId: CONVERSATION, body, route });
      }),
    );
    expect(statuses).toEqual(['refused', 'refused', 'refused', 'failed', 'failed']);
  });

  test('un message modifié depuis la traduction (409) : refus définitif de ce texte — le renvoyer ne le rendrait pas à jour', async () => {
    const { transport } = transportServing({ ok: false, status: 409, error: 'The message changed', code: SHARED_TRANSLATION_ERROR_CODES.staleSource });
    expect(await postSharedTranslation({ deps: { ...gateway, transport }, conversationId: CONVERSATION, body, route })).toBe('refused');
  });

  test('un budget de partage épuisé (429, Retry-After) : une panne, la traduction se repartage plus tard', async () => {
    const { transport } = transportServing({
      ok: false,
      status: 429,
      error: 'Too many shared translations',
      code: SHARED_TRANSLATION_ERROR_CODES.budgetExceeded,
      retryAfter: 60,
    });
    expect(await postSharedTranslation({ deps: { ...gateway, transport }, conversationId: CONVERSATION, body, route })).toBe('failed');
  });

  test('le corps envoyé est celui du contrat : la version du texte y est, et la passerelle l’accepte', async () => {
    const { transport, requests } = transportServing({ ok: true, data: { created: true, sharedTranslation: share() } });
    await postSharedTranslation({ deps: { ...gateway, transport }, conversationId: CONVERSATION, body, route });
    expect(shareTranslationBodySchema.safeParse(requests[0]?.body).success).toBe(true);
    expect(requests[0]?.body).toMatchObject({ sourceVersion: 'original' });
  });

  test('un compte qui a coupé ses accusés de lecture ne partage pas : la passerelle le dit, et c’est le COMPTE qui décline, pas cette traduction', async () => {
    const { transport } = transportServing({ ok: false, status: 403, error: 'Read receipts are off', code: SHARED_TRANSLATION_READ_RECEIPTS_OFF });
    expect(await postSharedTranslation({ deps: { ...gateway, transport }, conversationId: CONVERSATION, body, route })).toBe('declined');
  });

  test('un autre 403 reste le refus de cette traduction', async () => {
    const { transport } = transportServing({ ok: false, status: 403, error: 'Not a participant' });
    expect(await postSharedTranslation({ deps: { ...gateway, transport }, conversationId: CONVERSATION, body, route })).toBe('refused');
  });

  test('un transport qui lève est une panne', async () => {
    const { transport } = transportServing(() => {
      throw new Error('réseau coupé');
    });
    expect(await postSharedTranslation({ deps: { ...gateway, transport }, conversationId: CONVERSATION, body, route })).toBe('failed');
  });

  test('sur les fixtures, rien ne part', async () => {
    const { transport, requests } = transportServing({ ok: true, data: {} });
    expect(await postSharedTranslation({ deps: { source: 'fixtures', transport }, conversationId: CONVERSATION, body, route })).toBe('refused');
    expect(requests).toEqual([]);
  });
});

describe('isSharedTranslation — la garde de ce que la passerelle sert et relaie', () => {
  test('accepte la forme du contrat', () => {
    expect(isSharedTranslation(share())).toBe(true);
    expect(isSharedTranslation(share({ envelope: { v: 1, alg: 'A256GCM', kdf: 'message-secret', payload: 'QUJD'.repeat(12) } }))).toBe(true);
  });

  const refused: readonly (readonly [string, unknown])[] = [
    ['rien', null],
    ['une chaîne', 'x'],
    ['sans id', share({ id: '' })],
    ['sans message', share({ messageId: undefined })],
    ['sans conversation', share({ conversationId: 3 })],
    ['sans langue', share({ targetLanguage: '' })],
    ['sans auteur de partage', share({ sharedBy: undefined })],
    ['sans date', share({ sharedAt: undefined })],
    ['sans enveloppe', share({ envelope: undefined })],
    ['enveloppe d’une version inconnue', share({ envelope: { v: 2, alg: 'A256GCM', kdf: 'message-content', payload: 'A'.repeat(48) } })],
    ['enveloppe d’un autre algorithme', share({ envelope: { v: 1, alg: 'A128GCM', kdf: 'message-content', payload: 'A'.repeat(48) } })],
    ['enveloppe d’une dérivation inconnue', share({ envelope: { v: 1, alg: 'A256GCM', kdf: 'message-pin', payload: 'A'.repeat(48) } })],
    ['enveloppe sans charge', share({ envelope: { v: 1, alg: 'A256GCM', kdf: 'message-content', payload: '' } })],
  ];

  for (const [label, value] of refused) {
    test(`refuse ${label}`, () => {
      expect(isSharedTranslation(value)).toBe(false);
    });
  }
});

describe('les constantes locales relisent le contrat partagé', () => {
  test('les bornes d’une requête sont celles que la passerelle fait respecter', () => {
    expect(SHARED_TRANSLATION_REQUEST_LIMITS).toEqual({
      messageIds: SHARED_TRANSLATION_LIMITS.messageIdsMaxCount,
      languages: SHARED_TRANSLATION_LIMITS.languagesMaxCount,
    });
  });

  test('l’algorithme et les dérivations que la garde accepte sont ceux du contrat', () => {
    expect(SHARED_ENVELOPE_ALGORITHM).toBe(SHARED_TRANSLATION_ALGORITHM);
    expect([...SHARED_ENVELOPE_KDFS]).toEqual([...SHARED_TRANSLATION_KDFS]);
  });

  test('le code qui dit « ce compte ne partage pas » est celui que la passerelle pose', () => {
    expect(SHARED_TRANSLATION_READ_RECEIPTS_OFF).toBe(SHARED_TRANSLATION_ERROR_CODES.readReceiptsOff);
  });
});
