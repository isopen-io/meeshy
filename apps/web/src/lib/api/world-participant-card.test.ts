import { describe, expect, test } from 'bun:test';

import * as worldEndpoints from '@meeshy/shared/api/endpoints/world';
import { WORLD_PARTICIPANT_CARD_ERRORS, worldParticipantCardSchema, type WorldParticipantCard } from '@meeshy/shared/types/world-participant-card';

import { apiResponseMayBeCached } from '../net/api-runtime-cache';
import { persistableQuery } from './query-client';
import type { ApiResult, HttpRequest, HttpTransport } from './http';
import {
  decodeWorldParticipantCard,
  isWorldParticipantCardRefusal,
  loadWorldParticipantCard,
  worldParticipantCardQueryKey,
} from './world-participant-card';

/**
 * LE PORT DE LA FICHE D'UN PARTICIPANT DE WORLD WIDE (#10102, partie web) —
 * `GET /api/v1/world/participants/:participantId`, lu par l'équipe (rôle
 * au-delà de USER) seulement.
 *
 * Trois choses se mesurent ici : le décodeur est la JUMELLE exacte du schéma
 * partagé (il accepte et refuse ce qu'il accepte et refuse), l'adresse vient du
 * catalogue généré, et la fiche — des données personnelles servies en
 * `private, no-store` — ne touche JAMAIS le disque : ni le cache de requêtes
 * persisté, ni le seau `api` du service worker.
 */

function fakeTransport(result: ApiResult<unknown>) {
  const requests: HttpRequest[] = [];
  const transport = (async () => result) as unknown as HttpTransport;
  transport.request = (async (req: HttpRequest) => {
    requests.push(req);
    return result;
  }) as HttpTransport['request'];
  return { transport, requests };
}

const guestCard = (overrides: Partial<WorldParticipantCard> = {}): WorldParticipantCard => ({
  participantId: '66f0a1b2c3d4e5f6a7b8c9d0',
  participantType: 'anonymous',
  displayName: 'Awa',
  username: null,
  conversationRole: 'member',
  accountRole: null,
  languages: { conversation: 'wo', system: null, regional: null, customDestination: null, deviceLocale: null },
  country: 'SN',
  client: { browser: 'Safari', browserVersion: '17', os: 'iOS', osVersion: '17', deviceType: 'mobile', platform: null, appVersion: null },
  joinedAt: '2026-10-11T08:00:00.000Z',
  shareLink: { identifier: 'mshy_world', linkId: '66f0a1b2c3d4e5f6a7b8c9d1', name: 'World Wide' },
  status: 'active',
  accountDetailsWithheld: false,
  ...overrides,
});

const accountCard = (): WorldParticipantCard =>
  guestCard({
    participantType: 'user',
    displayName: 'Nour Haddad',
    username: 'nour',
    accountRole: 'USER',
    languages: { conversation: 'ar', system: 'ar', regional: 'fr', customDestination: null, deviceLocale: 'fr-FR' },
    client: { browser: 'Chrome', browserVersion: '129', os: 'Windows', osVersion: '10', deviceType: null, platform: 'web', appVersion: '2.0.4' },
    shareLink: null,
  });

describe('decodeWorldParticipantCard — jumelle zod/mini de worldParticipantCardSchema', () => {
  const samples: readonly unknown[] = [
    guestCard(),
    accountCard(),
    guestCard({ client: null, country: null }),
    guestCard({ participantType: 'bot', status: 'banned' }),
    guestCard({ accountDetailsWithheld: true, accountRole: null }),
    guestCard({ status: 'left' }),
    { ...guestCard(), participantType: 'ghost' },
    { ...guestCard(), status: 'gone' },
    { ...guestCard(), participantId: '' },
    { ...guestCard(), accountDetailsWithheld: undefined },
    { ...guestCard(), languages: { conversation: 'fr' } },
    { ...guestCard(), client: { browser: 'Safari' } },
    { ...guestCard(), shareLink: { identifier: null, name: null } },
    { ...guestCard(), joinedAt: 12 },
    null,
    'fiche',
  ];

  test('accepte et refuse exactement ce que le schéma partagé accepte et refuse', () => {
    for (const sample of samples) {
      const shared = worldParticipantCardSchema.safeParse(sample);
      expect(decodeWorldParticipantCard(sample)).toEqual(shared.success ? shared.data : null);
    }
  });

  test('une clé que le contrat ne déclare pas ne traverse pas le décodeur', () => {
    const decoded = decodeWorldParticipantCard({ ...guestCard(), ipAddress: '203.0.113.7', userAgent: 'Mozilla/5.0' });
    expect(decoded).not.toBeNull();
    expect(Object.keys(decoded ?? {})).not.toContain('ipAddress');
    expect(Object.keys(decoded ?? {})).not.toContain('userAgent');
  });
});

describe('loadWorldParticipantCard — GET /api/v1/world/participants/:participantId', () => {
  test('compose l’adresse par le catalogue généré, avec la créance de la session', async () => {
    const { transport, requests } = fakeTransport({ ok: true, data: guestCard() });
    const result = await loadWorldParticipantCard({ source: 'gateway', transport, participantId: '66f0a1b2c3d4e5f6a7b8c9d0' });
    expect(requests.map((r) => [r.method, r.path, 'credential' in r])).toEqual([
      ['GET', worldEndpoints.participantsByParticipantId('66f0a1b2c3d4e5f6a7b8c9d0'), false],
    ]);
    expect(result).toEqual({ ok: true, data: guestCard() });
  });

  test('un refus traverse avec son code, et se reconnaît comme un refus', async () => {
    const { transport } = fakeTransport({ ok: false, status: 403, error: 'refusé', code: WORLD_PARTICIPANT_CARD_ERRORS.forbidden });
    const result = await loadWorldParticipantCard({ source: 'gateway', transport, participantId: '66f0a1b2c3d4e5f6a7b8c9d0' });
    expect(result.ok).toBe(false);
    expect(!result.ok && isWorldParticipantCardRefusal(result)).toBe(true);
  });

  test('une absence (404) ou une panne n’est pas un refus', () => {
    expect(isWorldParticipantCardRefusal({ ok: false, status: 404, error: 'absent', code: WORLD_PARTICIPANT_CARD_ERRORS.notFound })).toBe(false);
    expect(isWorldParticipantCardRefusal({ ok: false, status: 503, error: 'trace', code: WORLD_PARTICIPANT_CARD_ERRORS.auditUnavailable })).toBe(false);
    expect(isWorldParticipantCardRefusal({ ok: false, status: 0, error: 'réseau' })).toBe(false);
  });

  test('une charge illisible est un échec nommé', async () => {
    const { transport } = fakeTransport({ ok: true, data: { participantId: 'x' } });
    const result = await loadWorldParticipantCard({ source: 'gateway', transport, participantId: 'x' });
    expect(!result.ok && result.code).toBe('UNREADABLE_WORLD_PARTICIPANT_CARD');
  });

  test('sous une construction de démonstration, aucune requête et aucune fiche inventée', async () => {
    const { transport, requests } = fakeTransport({ ok: true, data: guestCard() });
    const result = await loadWorldParticipantCard({ source: 'fixtures', transport, participantId: 'x' });
    expect(requests).toEqual([]);
    expect(result.ok).toBe(false);
  });
});

describe('la fiche ne touche jamais le disque', () => {
  test('sa clé de requête n’est pas persistée par le cache de requêtes', () => {
    expect(persistableQuery({ state: { status: 'success' }, queryKey: worldParticipantCardQueryKey('66f0a1b2c3d4e5f6a7b8c9d0') })).toBe(false);
  });

  test('sa réponse n’entre pas dans le seau `api` du service worker', () => {
    expect(apiResponseMayBeCached(worldEndpoints.participantsByParticipantId('66f0a1b2c3d4e5f6a7b8c9d0'))).toBe(false);
    expect(apiResponseMayBeCached(worldEndpoints.root)).toBe(true);
  });
});
