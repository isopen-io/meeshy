import { describe, expect, test } from 'bun:test';

import {
  approveSeasonProposal,
  exportSeasonAppEvents,
  loadSeasonProposals,
  loadAdminSeasons,
  proposeSeason,
  rejectSeasonProposal,
  saveAdminSeason,
  seasonRefusalOf,
  type SeasonProposal,
} from './admin-game-seasons';
import type { ApiResult, HttpRequest, HttpTransport } from './http';

/**
 * LE CALENDRIER DES SAISONS, CÔTÉ ADMINISTRATION (#10232, #10233) — `/admin/game/seasons*`, gardé par `canManageGame`.
 * Le client lit chaque charge champ par champ (rien d'autre que le contrat n'entre dans le cache), et rend les refus
 * 409 / 422 / 502 / 503 sous leur code, que l'écran traduit.
 */
const COPY = Object.fromEntries(
  ['fr', 'en', 'es', 'de', 'it', 'pt-BR', 'ar'].map((l) => [l, { title: `Titre ${l}`, tagline: `Accroche ${l}`, description: `Description ${l}` }]),
);

const ROW = {
  number: 2,
  startDay: '2027-03-01',
  endDay: '2027-04-25',
  status: 'scheduled',
  tense: 'upcoming',
  explicit: true,
  editable: true,
  themeKey: 'language:ja',
  stepPoints: 120,
  copy: COPY,
};

const EVENT = {
  key: 'season-2',
  reference_name: 'Meeshy Saison 2',
  badge: 'NEW_SEASON',
  purpose: 'KEEP_ACTIVE_USERS_INFORMED',
  priority: 'NORMAL',
  purchase_requirement: 'NO_COST_ASSOCIATED',
  deep_link: 'https://meeshy.me/me/progression/saison/2',
  primary_locale: 'fr-FR',
  territories: 'all',
  publish_start: '2027-02-22T09:00:00+01:00',
  event_start: '2027-03-01T00:00:00+01:00',
  event_end: '2027-03-28T20:00:00+01:00',
  localizations: { 'fr-FR': { name: 'Saison 2', short_description: 'Courte', long_description: 'Longue' } },
};

const PROPOSAL = {
  id: 'p1',
  number: 2,
  status: 'pending',
  startDay: '2027-03-01',
  themeKey: 'language:ja',
  stepPoints: 120,
  copy: COPY,
  appEvent: EVENT,
  appEventFaults: ['trop long'],
  brief: 'plus doux',
  createdBy: 'u1',
  createdAt: '2026-10-11T10:00:00.000Z',
  reviewedBy: null,
  reviewedAt: null,
  model: 'claude',
};

function spy(respond: (request: HttpRequest) => ApiResult<unknown>) {
  const requests: HttpRequest[] = [];
  const transport = (async () => ({ ok: false, status: 0, error: 'jamais' })) as unknown as HttpTransport;
  transport.request = (async (request: HttpRequest) => {
    requests.push(request);
    return respond(request);
  }) as HttpTransport['request'];
  return { deps: { source: 'gateway' as const, transport }, requests };
}

describe('loadAdminSeasons', () => {
  test('GET /admin/game/seasons?from=&count= et rend révision, instant du serveur et lignes', async () => {
    const { deps, requests } = spy(() => ({ ok: true, data: { revision: 5, now: { dayKey: '2027-02-01', minuteOfDay: 600 }, seasons: [ROW] } }));
    const result = await loadAdminSeasons({ ...deps, from: 1, count: 6 });
    expect(requests[0]).toMatchObject({ method: 'GET', path: '/api/v1/admin/game/seasons?from=1&count=6' });
    expect(result).toEqual({ ok: true, data: { revision: 5, now: { dayKey: '2027-02-01', minuteOfDay: 600 }, seasons: [ROW] } });
  });

  test('une ligne illisible est écartée, une charge sans révision est refusée', async () => {
    const mixed = spy(() => ({ ok: true, data: { revision: 5, now: { dayKey: '2027-02-01', minuteOfDay: 600 }, seasons: [ROW, { number: 'x' }, { ...ROW, tense: 'someday' }] } }));
    const kept = await loadAdminSeasons({ ...mixed.deps });
    expect(kept.ok && kept.data.seasons.map((s) => s.number)).toEqual([2]);

    const broken = spy(() => ({ ok: true, data: { seasons: [ROW] } }));
    expect(await loadAdminSeasons({ ...broken.deps })).toMatchObject({ ok: false, code: 'MALFORMED_PAYLOAD' });
  });

  test('une saison en pause n’a pas de date de fin, sans copie : null', async () => {
    const { deps } = spy(() => ({ ok: true, data: { revision: 5, now: { dayKey: '2027-02-01', minuteOfDay: 600 }, seasons: [{ ...ROW, endDay: null, status: 'paused', copy: null }] } }));
    const result = await loadAdminSeasons({ ...deps });
    expect(result.ok && [result.data.seasons[0]?.endDay, result.data.seasons[0]?.copy]).toEqual([null, null]);
  });
});

describe('saveAdminSeason', () => {
  test('PUT /admin/game/seasons/:number avec expectedRevision et les seuls champs changés', async () => {
    const { deps, requests } = spy(() => ({ ok: true, data: { revision: 6, season: ROW } }));
    const result = await saveAdminSeason({ ...deps, number: 2, body: { expectedRevision: 5, startDay: '2027-03-08', stepPoints: 130 } });
    expect(requests[0]).toMatchObject({ method: 'PUT', path: '/api/v1/admin/game/seasons/2', body: { expectedRevision: 5, startDay: '2027-03-08', stepPoints: 130 } });
    expect(result).toEqual({ ok: true, data: { revision: 6, season: ROW } });
  });

  test('un conflit de révision et un refus de la loi gardent leur code', async () => {
    const conflict = spy(() => ({ ok: false, status: 409, error: 'revision-conflict' }));
    const refused = spy(() => ({ ok: false, status: 422, error: 'not-monday' }));
    expect(await saveAdminSeason({ ...conflict.deps, number: 2, body: { expectedRevision: 1 } })).toMatchObject({ ok: false, status: 409, error: 'revision-conflict' });
    expect(await saveAdminSeason({ ...refused.deps, number: 2, body: { expectedRevision: 1 } })).toMatchObject({ ok: false, status: 422, error: 'not-monday' });
  });
});

describe('les propositions de l’IA', () => {
  test('POST …/:number/proposals avec la consigne, rend la proposition EN ATTENTE', async () => {
    const { deps, requests } = spy(() => ({ ok: true, data: PROPOSAL }));
    const result = await proposeSeason({ ...deps, number: 2, brief: 'plus doux' });
    expect(requests[0]).toMatchObject({ method: 'POST', path: '/api/v1/admin/game/seasons/2/proposals', body: { brief: 'plus doux' } });
    expect(result.ok && result.data.status).toBe('pending');
    expect(result.ok && result.data.appEvent?.key).toBe('season-2');
    expect(result.ok && result.data.appEventFaults).toEqual(['trop long']);
  });

  test('sans consigne : un corps vide, pas de brief inventé', async () => {
    const { deps, requests } = spy(() => ({ ok: true, data: PROPOSAL }));
    await proposeSeason({ ...deps, number: 2, brief: '   ' });
    expect(requests[0]?.body).toEqual({});
  });

  test('l’agent indisponible (503) et la proposition invalide (502) gardent leur code', async () => {
    expect(await proposeSeason({ ...spy(() => ({ ok: false, status: 503, error: 'agent-unavailable' })).deps, number: 2 })).toMatchObject({ status: 503, error: 'agent-unavailable' });
    expect(await proposeSeason({ ...spy(() => ({ ok: false, status: 502, error: 'proposal-invalid' })).deps, number: 2 })).toMatchObject({ status: 502, error: 'proposal-invalid' });
  });

  test('GET …/proposals?status= rend les propositions, une illisible est écartée', async () => {
    const { deps, requests } = spy(() => ({ ok: true, data: { items: [PROPOSAL, { id: 5 }] } }));
    const result = await loadSeasonProposals({ ...deps, status: 'pending' });
    expect(requests[0]).toMatchObject({ method: 'GET', path: '/api/v1/admin/game/seasons/proposals?status=pending' });
    expect(result.ok && result.data.map((p: SeasonProposal) => p.id)).toEqual(['p1']);
  });

  test('approve : POST …/proposals/:id/approve avec la révision et les corrections de l’humain', async () => {
    const { deps, requests } = spy(() => ({ ok: true, data: { revision: 7, season: ROW, proposal: { ...PROPOSAL, status: 'approved' } } }));
    const result = await approveSeasonProposal({ ...deps, id: 'p1', body: { expectedRevision: 6, stepPoints: 130 } });
    expect(requests[0]).toMatchObject({ method: 'POST', path: '/api/v1/admin/game/seasons/proposals/p1/approve', body: { expectedRevision: 6, stepPoints: 130 } });
    expect(result.ok && [result.data.revision, result.data.proposal.status, result.data.season.number]).toEqual([7, 'approved', 2]);
  });

  test('approve refusé (409 proposal-not-pending, 422) garde son code', async () => {
    expect(await approveSeasonProposal({ ...spy(() => ({ ok: false, status: 409, error: 'proposal-not-pending' })).deps, id: 'p1', body: { expectedRevision: 1 } })).toMatchObject({ status: 409, error: 'proposal-not-pending' });
  });

  test('reject : POST …/reject avec la raison, rend la proposition rejetée', async () => {
    const { deps, requests } = spy(() => ({ ok: true, data: { proposal: { ...PROPOSAL, status: 'rejected' } } }));
    const result = await rejectSeasonProposal({ ...deps, id: 'p1', reason: 'hors sujet' });
    expect(requests[0]).toMatchObject({ method: 'POST', path: '/api/v1/admin/game/seasons/proposals/p1/reject', body: { reason: 'hors sujet' } });
    expect(result.ok && result.data.status).toBe('rejected');
  });
});

describe('exportSeasonAppEvents', () => {
  test('GET …/app-events?count=3 rend les événements, leurs défauts et le YAML', async () => {
    const { deps, requests } = spy(() => ({ ok: true, data: { events: [EVENT], faults: { 'season-2': ['trop long'] }, yaml: 'store:\n  app_events: []\n' } }));
    const result = await exportSeasonAppEvents({ ...deps, count: 3 });
    expect(requests[0]).toMatchObject({ method: 'GET', path: '/api/v1/admin/game/seasons/app-events?count=3' });
    expect(result.ok && [result.data.events.length, result.data.faults, result.data.yaml]).toEqual([1, { 'season-2': ['trop long'] }, 'store:\n  app_events: []\n']);
  });

  test('un YAML absent est refusé : on ne fabrique pas un export vide', async () => {
    const { deps } = spy(() => ({ ok: true, data: { events: [], faults: {} } }));
    expect(await exportSeasonAppEvents({ ...deps, count: 3 })).toMatchObject({ ok: false, code: 'MALFORMED_PAYLOAD' });
  });
});

describe('seasonRefusalOf', () => {
  test('nomme les refus connus et rend null pour un code inconnu', () => {
    expect(seasonRefusalOf({ error: 'not-monday' })).toBe('not-monday');
    expect(seasonRefusalOf({ error: 'revision-conflict' })).toBe('revision-conflict');
    expect(seasonRefusalOf({ error: 'agent-unavailable' })).toBe('agent-unavailable');
    expect(seasonRefusalOf({ error: 'boom' })).toBeNull();
  });
});
