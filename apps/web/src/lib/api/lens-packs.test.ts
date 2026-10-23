import { describe, expect, test } from 'bun:test';

import type { ApiResult, HttpRequest, HttpTransport } from './http';
import {
  decodeLensPack,
  loadLensDocument,
  loadLensPending,
  loadLensSubmissions,
  reviewLens,
  submitLens,
  withdrawLens,
} from './lens-packs';

/**
 * W16 (#11322) — LE PORT DES LENS (S16, #11271, `services/gateway/src/routes/packs-lens.ts`) :
 * mes propositions et proposer, le document servi, la file de modération,
 * publier ou refuser en fixant la fenêtre et les communautés, retirer. La
 * boutique, le détail, l'installation et les installées passent par la vitrine
 * unique (`packs-shop.ts`, domaine `lens`). Aucun prix, aucun crédit, aucun
 * géo-créneau : points « ATTEND » de #11251.
 */
const lens = (extra: Record<string, unknown> = {}) => ({
  slug: 'aurore-boreale',
  name: 'Aurore boréale',
  description: 'Des voiles verts au-dessus du visage',
  author: 'studio-nord',
  status: 'pending',
  installed: false,
  cost: 'standard',
  coverUrl: null,
  reviewNote: null,
  ...extra,
});

const transportAnswering = (answer: (request: HttpRequest) => ApiResult<unknown>) => {
  const calls: HttpRequest[] = [];
  const transport = {
    request: async <T,>(request: HttpRequest) => {
      calls.push(request);
      return answer(request) as ApiResult<T>;
    },
  } as unknown as HttpTransport;
  return { calls, deps: { source: 'gateway' as const, transport } };
};

describe('decodeLensPack', () => {
  test('une lens servie se décode champ par champ ; une forme incomplète est écartée', () => {
    expect(decodeLensPack(lens({ availability: { startsAt: '2026-11-01T00:00:00.000Z' }, reviewNote: 'Trop sombre' }))).toEqual({
      slug: 'aurore-boreale',
      name: 'Aurore boréale',
      description: 'Des voiles verts au-dessus du visage',
      author: 'studio-nord',
      status: 'pending',
      installed: false,
      cost: 'standard',
      coverUrl: null,
      availability: { startsAt: '2026-11-01T00:00:00.000Z' },
      reviewNote: 'Trop sombre',
    });
    expect(decodeLensPack({ slug: 'x' })).toBeNull();
  });
});

describe('les routes des lens', () => {
  test('mes propositions : GET /packs/lens/submissions', async () => {
    const { calls, deps } = transportAnswering(() => ({ ok: true, data: [lens()] }));
    const result = await loadLensSubmissions(deps);
    expect(calls[0]).toMatchObject({ method: 'GET', path: '/api/v1/packs/lens/submissions' });
    expect(result.ok && result.data.map((pack) => pack.slug)).toEqual(['aurore-boreale']);
  });

  test('proposer : POST /packs/lens/submissions avec le document et ses fichiers', async () => {
    const { calls, deps } = transportAnswering(() => ({ ok: true, data: lens() }));
    const result = await submitLens(deps, { document: { schema: 1 }, assets: { '0123456789abcdef.png': 'AAAA' } });
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/api/v1/packs/lens/submissions', body: { document: { schema: 1 }, assets: { '0123456789abcdef.png': 'AAAA' } } });
    expect(result.ok).toBe(true);
  });

  test('le document servi : GET /packs/lens/:slug/document', async () => {
    const { calls, deps } = transportAnswering(() => ({ ok: true, data: { schema: 1, layers: [] } }));
    const result = await loadLensDocument(deps, 'aurore-boreale');
    expect(calls[0]).toMatchObject({ method: 'GET', path: '/api/v1/packs/lens/aurore-boreale/document' });
    expect(result.ok && result.data).toEqual({ schema: 1, layers: [] });
  });

  test('la file de modération : GET /packs/lens/pending', async () => {
    const { calls, deps } = transportAnswering(() => ({ ok: true, data: [lens()] }));
    await loadLensPending(deps);
    expect(calls[0]).toMatchObject({ method: 'GET', path: '/api/v1/packs/lens/pending' });
  });

  test('publier en fixant la fenêtre et les communautés ; refuser avec un mot', async () => {
    const { calls, deps } = transportAnswering(() => ({ ok: true, data: lens({ status: 'approved' }) }));
    await reviewLens(deps, 'aurore-boreale', {
      decision: 'approve',
      window: { startsAt: '2026-11-01T00:00:00.000Z', endsAt: '2026-11-30T00:00:00.000Z' },
      communities: ['0123456789abcdef01234567'],
    });
    await reviewLens(deps, 'aurore-boreale', { decision: 'reject', note: 'Trop sombre' });
    expect(calls[0]).toMatchObject({
      method: 'POST',
      path: '/api/v1/packs/lens/aurore-boreale/review',
      body: { decision: 'approve', window: { startsAt: '2026-11-01T00:00:00.000Z', endsAt: '2026-11-30T00:00:00.000Z' }, communities: ['0123456789abcdef01234567'] },
    });
    expect(calls[1]?.body).toEqual({ decision: 'reject', note: 'Trop sombre' });
  });

  test('retirer : POST /packs/lens/:slug/withdraw', async () => {
    const { calls, deps } = transportAnswering(() => ({ ok: true, data: lens({ status: 'withdrawn' }) }));
    await withdrawLens(deps, 'aurore-boreale', 'Signalée');
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/api/v1/packs/lens/aurore-boreale/withdraw', body: { note: 'Signalée' } });
  });
});
