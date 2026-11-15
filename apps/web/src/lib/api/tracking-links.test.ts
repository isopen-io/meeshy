import { describe, expect, test } from 'bun:test';

import { scriptedGateway, scriptedTransport } from '@/test-support/scripted-transport';

import { FIXTURE_TRACKING_TOKEN } from './fixtures-email-links';
import { recordTrackingClick, resolveLinkSharer, resolveTrackingLink } from './tracking-links';

/**
 * LE PORT DES LIENS SUIVIS (#6714) — deux routes PUBLIQUES de la passerelle
 * (`routes/tracking-links/tracking.ts`, `creation.ts`), celles que la page
 * legacy appelait. Le port ne lit que ce que la page décide avec : la cible,
 * la nature du lien et son état.
 */

const CLICK = 'POST /api/v1/tracking-links/abc123/click';
const RESOLVE = 'GET /api/v1/tracking-links/abc123/resolve';

describe('recordTrackingClick — POST /tracking-links/:token/click', () => {
  test('le clic part avec son contexte, et la cible revient', async () => {
    const { deps, calls } = scriptedGateway({
      [CLICK]: { ok: true, data: { originalUrl: 'https://example.com/', clickId: 'c1', trackingLink: { id: 'l1' } } },
    });

    const result = await recordTrackingClick(deps, 'abc123', { socialSource: 'Direct', language: 'fr' });

    expect(result).toEqual({ ok: true, data: { originalUrl: 'https://example.com/' } });
    expect(calls()).toEqual([
      { method: 'POST', path: '/api/v1/tracking-links/abc123/click', body: { socialSource: 'Direct', language: 'fr' } },
    ]);
  });

  test('un refus de la passerelle passe tel quel', async () => {
    const refusal = { ok: false as const, status: 410, error: 'Ce lien a expiré', code: 'LINK_EXPIRED' };
    const { deps } = scriptedGateway({ [CLICK]: refusal });
    expect(await recordTrackingClick(deps, 'abc123', {})).toEqual(refusal);
  });

  test('une réponse sans cible lisible rend null — jamais une cible devinée', async () => {
    for (const data of [{ clickId: 'c1' }, { originalUrl: 42 }, null]) {
      const { deps } = scriptedGateway({ [CLICK]: { ok: true, data } });
      expect(await recordTrackingClick(deps, 'abc123', {})).toEqual({ ok: true, data: { originalUrl: null } });
    }
  });
});

describe('resolveTrackingLink — GET /tracking-links/:token/resolve', () => {
  test('lit la nature, la cible et l’état — rien d’autre', async () => {
    const { deps, calls } = scriptedGateway({
      [RESOLVE]: {
        ok: true,
        data: {
          kind: 'tracking',
          targetType: 'POST',
          targetId: 'p1',
          originalUrl: 'https://meeshy.me/post/p1',
          isActive: false,
          expiresAt: '2026-09-01T00:00:00.000Z',
        },
      },
    });

    expect(await resolveTrackingLink(deps, 'abc123')).toEqual({
      ok: true,
      data: { kind: 'tracking', originalUrl: 'https://meeshy.me/post/p1', isActive: false, content: { type: 'POST', id: 'p1' } },
    });
    expect(calls()).toEqual([{ method: 'GET', path: '/api/v1/tracking-links/abc123/resolve' }]);
  });

  test('une invitation de conversation n’a pas de cible', async () => {
    const { deps } = scriptedGateway({
      [RESOLVE]: { ok: true, data: { kind: 'conversation', targetType: 'CONVERSATION', targetId: 'c1', originalUrl: null, isActive: true } },
    });
    expect(await resolveTrackingLink(deps, 'abc123')).toEqual({ ok: true, data: { kind: 'conversation', originalUrl: null, isActive: true, content: null } });
  });

  test('une cible externe ou d’un type inconnu n’est pas un contenu (#9149)', async () => {
    for (const target of [{ targetType: 'EXTERNAL', targetId: null }, { targetType: 'PROFILE', targetId: 'u1' }, { targetType: 'REEL' }]) {
      const { deps } = scriptedGateway({ [RESOLVE]: { ok: true, data: { kind: 'tracking', originalUrl: 'https://example.com/', isActive: true, ...target } } });
      const result = await resolveTrackingLink(deps, 'abc123');
      expect(result.ok ? result.data.content : 'échec').toBeNull();
    }
  });

  test('une résolution illisible est un ÉCHEC, jamais un lien actif', async () => {
    const { deps } = scriptedGateway({ [RESOLVE]: { ok: true, data: { kind: 'autre', isActive: true } } });
    const result = await resolveTrackingLink(deps, 'abc123');
    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.code).toBe('UNREADABLE');
  });
});

describe('resolveLinkSharer — qui a partagé ce contenu (#9149)', () => {
  test('lit le nom affiché, le pseudo et l’avatar — rien d’autre', async () => {
    const { deps } = scriptedGateway({
      [RESOLVE]: {
        ok: true,
        data: {
          kind: 'tracking',
          targetType: 'REEL',
          targetId: 'r1',
          isActive: true,
          sharer: { displayName: 'Alice', username: 'alice', avatar: 'https://cdn/a.jpg', email: 'x@y.z' },
        },
      },
    });
    expect(await resolveLinkSharer(deps, 'abc123')).toEqual({ ok: true, data: { displayName: 'Alice', username: 'alice', avatar: 'https://cdn/a.jpg' } });
  });

  test('aucun partageur nommé, ou illisible : null', async () => {
    for (const sharer of [null, undefined, { displayName: 'A' }, 'alice']) {
      const { deps } = scriptedGateway({ [RESOLVE]: { ok: true, data: { kind: 'tracking', isActive: true, sharer } } });
      expect(await resolveLinkSharer(deps, 'abc123')).toEqual({ ok: true, data: null });
    }
  });

  test('un refus passe tel quel', async () => {
    const refusal = { ok: false as const, status: 404, error: 'Lien introuvable' };
    const { deps } = scriptedGateway({ [RESOLVE]: refusal });
    expect(await resolveLinkSharer(deps, 'abc123')).toEqual(refusal);
  });
});

describe('les fixtures ne touchent jamais le réseau', () => {
  test('le lien de démonstration mène à une adresse web ; tout autre jeton est inconnu', async () => {
    const { transport, calls } = scriptedTransport({});
    const deps = { source: 'fixtures' as const, transport };

    expect(await recordTrackingClick(deps, FIXTURE_TRACKING_TOKEN, {})).toEqual({ ok: true, data: { originalUrl: 'https://meeshy.me/' } });
    expect((await recordTrackingClick(deps, 'inconnu', {})).ok).toBe(false);
    expect((await resolveTrackingLink(deps, FIXTURE_TRACKING_TOKEN)).ok).toBe(true);
    expect((await resolveTrackingLink(deps, 'inconnu')).ok).toBe(false);
    expect(calls()).toEqual([]);
  });
});
