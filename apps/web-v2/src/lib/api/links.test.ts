import { describe, expect, test } from 'bun:test';

import type { ApiResult, HttpTransport } from './http';
import {
  createShareLink,
  createShareLinkFromDraft,
  defaultShareLinkDraft,
  loadMyShareLinks,
  setShareLinkActive,
  shareLinkUrl,
  validateShareLinkDraft,
} from './links';

function fakeTransport(result: ApiResult<unknown>): HttpTransport & { lastRequest?: unknown } {
  const transport = (async () => result) as unknown as HttpTransport & { lastRequest?: unknown };
  transport.request = (async (req) => {
    transport.lastRequest = req;
    return result;
  }) as HttpTransport['request'];
  return transport;
}

describe('createShareLink — POST /api/v1/links (§ 3.3)', () => {
  test('en fixtures, rend un succès sans réseau', async () => {
    const result = await createShareLink({ source: 'fixtures', transport: fakeTransport({ ok: false, status: 0, error: 'jamais appelé' }) }, 'c-1');
    expect(result.ok).toBe(true);
  });

  test('en gateway, appelle POST /api/v1/links avec allowViewHistory EXPLICITE à false', async () => {
    const transport = fakeTransport({ ok: true, data: { linkId: 'mshy_1', conversationId: 'c-1', shareLink: { id: 'l1', linkId: 'mshy_1', isActive: true } } });
    await createShareLink({ source: 'gateway', transport }, 'c-1');
    const req = transport.lastRequest as { readonly method: string; readonly path: string; readonly body: Record<string, unknown> };
    expect(req.method).toBe('POST');
    expect(req.path).toBe('/api/v1/links');
    expect(req.body.conversationId).toBe('c-1');
    expect(req.body.allowViewHistory).toBe(false);
  });

  test('un refus (410/403) reste un échec, jamais un lien fabriqué', async () => {
    const transport = fakeTransport({ ok: false, status: 403, error: 'Cannot create share links for direct conversations' });
    const result = await createShareLink({ source: 'gateway', transport }, 'c-direct');
    expect(result.ok).toBe(false);
  });
});

describe('shareLinkUrl', () => {
  test('compose ${origin}/chat/${linkId}', () => {
    expect(shareLinkUrl('https://staging.meeshy.me', 'mshy_abc')).toBe('https://staging.meeshy.me/chat/mshy_abc');
  });
});

type Recorded = { readonly method: string; readonly path: string; readonly body?: unknown };

const recording = (result: ApiResult<unknown>) => {
  const transport = fakeTransport(result);
  return { transport, last: () => transport.lastRequest as Recorded };
};

const wireLink = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  id: 'l1',
  linkId: 'mshy_l1',
  identifier: 'equipe',
  name: 'Invitation',
  isActive: true,
  currentUses: 3,
  maxUses: 50,
  expiresAt: null,
  createdAt: '2026-09-10T09:00:00.000Z',
  conversationTitle: 'Équipe déploiement',
  inactiveReason: null,
  ...overrides,
});

describe('loadMyShareLinks — GET /api/v1/links (les SIENS, `createdBy` côté passerelle)', () => {
  test('la première page demande le résumé et le lit dans `meta`', async () => {
    const { transport, last } = recording({
      ok: true,
      data: [wireLink()],
      pagination: { total: 1, offset: 0, limit: 50, hasMore: false },
      meta: { summary: { totalLinks: 4, activeLinks: 2, totalUses: 131 } },
    });
    const result = await loadMyShareLinks({ source: 'gateway', transport, offset: 0 });
    expect([last().method, last().path]).toEqual(['GET', '/api/v1/links?offset=0&limit=50&include=summary']);
    expect(result.ok && result.data.summary).toEqual({ totalLinks: 4, activeLinks: 2, totalUses: 131 });
    expect(result.ok && result.data.nextOffset).toBeNull();
  });

  test('une page suivante ne redemande pas le résumé, et `hasMore` donne l’offset suivant', async () => {
    const { transport, last } = recording({ ok: true, data: [wireLink()], pagination: { total: 51, offset: 50, limit: 50, hasMore: true } });
    const result = await loadMyShareLinks({ source: 'gateway', transport, offset: 50 });
    expect(last().path).toBe('/api/v1/links?offset=50&limit=50');
    expect(result.ok && result.data.summary).toBeNull();
    expect(result.ok && result.data.nextOffset).toBe(51);
  });

  test('la projection ne garde que ce qui se peint : créateur, conversation et politique ne passent pas', async () => {
    const raw = wireLink({
      creator: { id: 'u1', username: 'moi', avatar: 'https://cdn/moi.png' },
      conversation: { id: 'c-1', title: 'Équipe', type: 'group' },
      allowedIpRanges: ['10.0.0.0/8'],
      requireEmail: true,
    });
    const result = await loadMyShareLinks({ source: 'gateway', transport: fakeTransport({ ok: true, data: [raw] }), offset: 0 });
    const decoded = result.ok ? result.data.links[0] : undefined;
    expect(Object.keys(decoded ?? {}).sort()).toEqual(
      ['conversationTitle', 'createdAt', 'currentUses', 'expiresAt', 'id', 'identifier', 'inactiveReason', 'isActive', 'linkId', 'maxUses', 'name'].sort(),
    );
  });

  test('une ligne illisible est écartée, jamais complétée', async () => {
    const result = await loadMyShareLinks({ source: 'gateway', transport: fakeTransport({ ok: true, data: [{ id: 'x' }, wireLink()] }), offset: 0 });
    expect(result.ok && result.data.links.map((row) => row.id)).toEqual(['l1']);
  });

  test('un lien inactif sans cause lisible se dit « retiré » ; un lien actif n’a pas de cause', async () => {
    const result = await loadMyShareLinks({
      source: 'gateway',
      transport: fakeTransport({ ok: true, data: [wireLink({ id: 'a', isActive: false, inactiveReason: 'INCONNUE' }), wireLink({ id: 'b', inactiveReason: 'REVOKED' })] }),
      offset: 0,
    });
    expect(result.ok && result.data.links.map((row) => row.inactiveReason)).toEqual(['REVOKED', null]);
  });

  test('un refus reste un échec', async () => {
    const result = await loadMyShareLinks({ source: 'gateway', transport: fakeTransport({ ok: false, status: 401, error: 'Non authentifié' }), offset: 0 });
    expect(result.ok).toBe(false);
  });
});

describe('setShareLinkActive — PATCH /api/v1/links/:linkId', () => {
  test('n’envoie que `isActive`, à l’identifiant encodé', async () => {
    const { transport, last } = recording({ ok: true, data: { isActive: false } });
    await setShareLinkActive({ source: 'gateway', transport }, 'mshy_a/b', false);
    expect(last()).toEqual({ method: 'PATCH', path: '/api/v1/links/mshy_a%2Fb', body: { isActive: false } });
  });

  test('ne rend que `isActive` : le créateur et la conversation de la réponse ne passent pas', async () => {
    const result = await setShareLinkActive(
      { source: 'gateway', transport: fakeTransport({ ok: true, data: { isActive: true, creator: { id: 'u1' }, conversation: { id: 'c-1' } } }) },
      'mshy_l1',
      true,
    );
    expect(result).toEqual({ ok: true, data: { isActive: true } });
  });
});

const NOW = new Date('2026-09-14T08:00:00.000Z');

describe('validateShareLinkDraft — miroir `CreateShareLinkView.create`', () => {
  test('sans conversation, rien ne part et le champ se nomme', () => {
    expect(validateShareLinkDraft(defaultShareLinkDraft(null), NOW)).toEqual({ ok: false, field: 'conversationId' });
  });

  test('les défauts sont ceux d’iOS, et aucun `identifier` ne part : la passerelle ne le lit pas', () => {
    const verdict = validateShareLinkDraft(defaultShareLinkDraft('c-1'), NOW);
    expect(verdict).toEqual({
      ok: true,
      body: {
        conversationId: 'c-1',
        allowAnonymousMessages: true,
        allowAnonymousFiles: false,
        allowAnonymousImages: true,
        allowViewHistory: false,
        requireAccount: false,
        requireNickname: true,
        requireEmail: false,
        requireBirthday: false,
      },
    });
  });

  test('« compte requis » : pseudo, e-mail et naissance ne partent jamais vrais', () => {
    const verdict = validateShareLinkDraft({ ...defaultShareLinkDraft('c-1'), requireAccount: true, requireNickname: true, requireEmail: true, requireBirthday: true }, NOW);
    expect(verdict.ok && [verdict.body.requireAccount, verdict.body.requireNickname, verdict.body.requireEmail, verdict.body.requireBirthday]).toEqual([true, false, false, false]);
  });

  test('nom et description sont rognés ; vides, ils ne partent pas', () => {
    const verdict = validateShareLinkDraft({ ...defaultShareLinkDraft('c-1'), name: '  Newsletter ', description: '   ' }, NOW);
    expect(verdict.ok && verdict.body.name).toBe('Newsletter');
    expect(verdict.ok && 'description' in verdict.body).toBe(false);
  });

  test('la limite d’utilisations ne part qu’activée, et entière entre 1 et 10 000', () => {
    const base = defaultShareLinkDraft('c-1');
    const off = validateShareLinkDraft({ ...base, limitUses: false, maxUses: 0 }, NOW);
    expect(off.ok && 'maxUses' in off.body).toBe(false);
    expect(validateShareLinkDraft({ ...base, limitUses: true, maxUses: 0 }, NOW)).toEqual({ ok: false, field: 'maxUses' });
    expect(validateShareLinkDraft({ ...base, limitUses: true, maxUses: 10_001 }, NOW)).toEqual({ ok: false, field: 'maxUses' });
    expect(validateShareLinkDraft({ ...base, limitUses: true, maxUses: 2.5 }, NOW)).toEqual({ ok: false, field: 'maxUses' });
    const on = validateShareLinkDraft({ ...base, limitUses: true, maxUses: 100 }, NOW);
    expect(on.ok && on.body.maxUses).toBe(100);
  });

  test('l’expiration part en ISO depuis l’instant du geste ; « jamais » ne part pas', () => {
    const base = defaultShareLinkDraft('c-1');
    const never = validateShareLinkDraft(base, NOW);
    expect(never.ok && 'expiresAt' in never.body).toBe(false);
    const day = validateShareLinkDraft({ ...base, expiration: 'h24' }, NOW);
    expect(day.ok && day.body.expiresAt).toBe('2026-09-15T08:00:00.000Z');
    const quarter = validateShareLinkDraft({ ...base, expiration: 'm3' }, NOW);
    expect(quarter.ok && quarter.body.expiresAt).toBe('2026-12-14T08:00:00.000Z');
  });
});

describe('createShareLinkFromDraft — POST /api/v1/links', () => {
  test('un brouillon invalide ne part pas', async () => {
    const { transport } = recording({ ok: true, data: {} });
    const result = await createShareLinkFromDraft({ source: 'gateway', transport }, defaultShareLinkDraft(null), NOW);
    expect(result.ok).toBe(false);
    expect(transport.lastRequest).toBeUndefined();
  });

  test('en gateway, le corps validé part tel quel', async () => {
    const { transport, last } = recording({ ok: true, data: { linkId: 'mshy_1', conversationId: 'c-1', shareLink: { id: 'l1', linkId: 'mshy_1', isActive: true } } });
    await createShareLinkFromDraft({ source: 'gateway', transport }, { ...defaultShareLinkDraft('c-1'), allowViewHistory: true }, NOW);
    expect(last().method).toBe('POST');
    expect(last().path).toBe('/api/v1/links');
    expect((last().body as Record<string, unknown>).allowViewHistory).toBe(true);
  });
});
