import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';

import { weekdayIndex } from '@meeshy/shared/utils/game/league';
import { SEASON_COPY_LOCALES } from '@meeshy/shared/utils/game/season-schedule';

import { ADMIN_PERMISSIONS_QUERY_KEY } from '@/lib/api/admin';
import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';
import { loadAdminInterfaceCatalog, translateAdmin } from '@/lib/i18n-admin-catalog';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { adminIdentityFixture } from '@/test-support/admin-assertions';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { AdminGameSeasonsPanel } from './admin-game-seasons-parts';

/**
 * JEU — SAISONS (#10232, #10233) — l'écran d'administration du calendrier des saisons : la liste (passée, en cours, à
 * venir, en pause), l'édition d'une saison à venir (un lundi, une pause, un thème, des points, des textes en sept
 * langues), la proposition de l'IA (EN ATTENTE, validée ou rejetée par un humain), l'export `store.app_events`.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/adm/game-seasons' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await Promise.all([loadAdminInterfaceCatalog('fr'), loadInterfaceCatalog('fr'), import('@/lib/media/deliver-file')]);
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await new Promise((resolve) => setTimeout(resolve, 0));
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => {
  mounter.unmountAll();
  appQueryClient.clear();
});

const t = (key: Parameters<typeof translateAdmin>[1], params?: Record<string, string>) =>
  (params === undefined ? translateAdmin('fr', key as never) : (translateAdmin as (l: string, k: string, p: Record<string, string>) => string)('fr', key, params));

const COPY = Object.fromEntries(SEASON_COPY_LOCALES.map((l) => [l, { title: `Titre ${l}`, tagline: `Accroche ${l}`, description: `Description ${l}` }]));
const row = (patch: Record<string, unknown>) => ({
  number: 4,
  startDay: '2027-06-28',
  endDay: '2027-08-22',
  status: 'scheduled',
  tense: 'upcoming',
  explicit: true,
  editable: true,
  themeKey: 'language:sw',
  stepPoints: 100,
  copy: null,
  ...patch,
});
const SEASONS = [
  row({ number: 1, startDay: '2026-12-21', endDay: '2027-02-14', tense: 'past', editable: false, themeKey: 'language:fr' }),
  row({ number: 2, startDay: '2027-03-01', endDay: '2027-04-25', tense: 'past', editable: false, themeKey: 'language:es' }),
  row({ number: 3, startDay: '2027-05-03', endDay: '2027-06-27', tense: 'current', editable: false, themeKey: 'language:ar' }),
  row({ number: 4 }),
  row({ number: 5, startDay: '2027-08-23', endDay: null, status: 'paused', themeKey: 'language:ja' }),
];
const LIST = { revision: 5, now: { dayKey: '2027-05-03', minuteOfDay: 600 }, seasons: SEASONS };

const EVENT = {
  key: 'season-4',
  reference_name: 'Meeshy Saison 4',
  badge: 'NEW_SEASON',
  purpose: 'KEEP_ACTIVE_USERS_INFORMED',
  priority: 'NORMAL',
  purchase_requirement: 'NO_COST_ASSOCIATED',
  deep_link: 'https://meeshy.me/me/progression/saison/4',
  primary_locale: 'fr-FR',
  territories: 'all',
  publish_start: '2027-06-21T09:00:00+02:00',
  event_start: '2027-06-28T00:00:00+02:00',
  event_end: '2027-07-25T20:00:00+02:00',
  localizations: { 'fr-FR': { name: 'Saison 4', short_description: 'Courte', long_description: 'Longue' } },
};
const PROPOSAL = {
  id: 'p1',
  number: 4,
  status: 'pending',
  startDay: '2027-07-05',
  themeKey: 'language:ja',
  stepPoints: 120,
  copy: COPY,
  appEvent: EVENT,
  appEventFaults: ['la description longue dépasse 120 signes'],
  brief: 'plus doux',
  createdBy: 'u1',
  createdAt: '2027-05-03T10:00:00.000Z',
  reviewedBy: null,
  reviewedAt: null,
  model: 'claude-test',
};

type Reply = ApiResult<unknown> | ((request: HttpRequest) => ApiResult<unknown>);
function gateway(replies: Readonly<Record<string, Reply>>) {
  const requests: HttpRequest[] = [];
  const transport = (async () => ({ ok: false, status: 0, error: 'jamais appelé' })) as unknown as HttpTransport;
  transport.request = (async (request: HttpRequest): Promise<ApiResult<unknown>> => {
    requests.push(request);
    const path = request.path.replace('/api/v1', '').split('?')[0];
    const reply = replies[`${request.method} ${path}`];
    if (reply === undefined) return { ok: false, status: 404, error: `non prévu : ${request.method} ${path}` };
    return typeof reply === 'function' ? reply(request) : reply;
  }) as HttpTransport['request'];
  return { deps: { source: 'gateway' as const, transport }, requests };
}
const BASE: Record<string, Reply> = {
  'GET /admin/game/seasons': { ok: true, data: LIST },
  'GET /admin/game/seasons/proposals': { ok: true, data: { items: [] } },
};
const calls = (spy: { requests: HttpRequest[] }, method: string, suffix: string) =>
  spy.requests.filter((request) => request.method === method && request.path.replace('/api/v1/admin/game/seasons', '').split('?')[0] === suffix);

async function mountPanel(spy: ReturnType<typeof gateway>) {
  appQueryClient.setQueryData(ADMIN_PERMISSIONS_QUERY_KEY, adminIdentityFixture({ role: 'ADMIN' }));
  return mounter.mount(
    <QueryClientProvider client={appQueryClient}>
      <AdminGameSeasonsPanel language="fr" deps={spy.deps} />
    </QueryClientProvider>,
  );
}

const choose = async (host: ParentNode, selector: string, value: string): Promise<void> => {
  const select = host.querySelector(selector);
  if (!(select instanceof HTMLSelectElement)) throw new Error(`liste absente : ${selector}`);
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await mounter.settle();
};

const openEditor = async (host: HTMLElement, number = 4): Promise<void> => {
  await mounter.click(host.querySelector(`[data-gameseasons-edit="${number}"]`));
};

describe('la liste des saisons', () => {
  test('chaque saison dit son état en MOTS : terminée, en cours, à venir, en pause', async () => {
    const host = await mountPanel(gateway(BASE));
    const state = (n: number) => host.querySelector(`tr[data-gameseasons-row="${n}"]`)?.textContent ?? '';
    expect(state(1)).toContain(t('admin.gameSeasons.tense.past'));
    expect(state(3)).toContain(t('admin.gameSeasons.tense.current'));
    expect(state(4)).toContain(t('admin.gameSeasons.tense.upcoming'));
    expect(state(5)).toContain(t('admin.gameSeasons.status.paused'));
    expect(state(5)).toContain(t('admin.gameSeasons.noDates'));
    expect(host.querySelector('[data-gameseasons-revision="5"]')).not.toBeNull();
  });

  test('seule une saison à venir (ou en pause) s’édite : les autres sont figées, sans bouton', async () => {
    const host = await mountPanel(gateway(BASE));
    for (const n of [1, 2, 3]) {
      expect(host.querySelector(`[data-gameseasons-edit="${n}"]`)).toBeNull();
      expect(host.querySelector(`tr[data-gameseasons-row="${n}"] [data-gameseasons-locked="${n}"]`)).not.toBeNull();
      expect(host.querySelector(`tr[data-gameseasons-row="${n}"]`)?.getAttribute('aria-disabled')).toBe('true');
    }
    for (const n of [4, 5]) expect(host.querySelector(`[data-gameseasons-edit="${n}"]`)).not.toBeNull();
  });

  test('un échec de lecture est l’état d’erreur du kit, avec « Réessayer »', async () => {
    const host = await mountPanel(gateway({ 'GET /admin/game/seasons': { ok: false, status: 500, error: 'boom' }, 'GET /admin/game/seasons/proposals': { ok: true, data: { items: [] } } }));
    expect(host.querySelector('[data-gameseasons-load-failed] [data-admin-error]')?.textContent).toContain(t('admin.gameSeasons.loadFailed'));
    expect(host.querySelector('[data-gameseasons-load-failed] [data-admin-retry]')).not.toBeNull();
  });
});

describe('modifier une saison à venir', () => {
  test('le sélecteur de date ne propose que des LUNDIS, tous après la semaine en cours', async () => {
    const host = await mountPanel(gateway(BASE));
    await openEditor(host);
    const options = [...(host.querySelector('[data-gameseasons-field="startDay"]') as HTMLSelectElement).options].map((o) => o.value);
    expect(options.length).toBeGreaterThan(20);
    expect(options.every((day) => weekdayIndex(day) === 0)).toBe(true);
    expect(options.every((day) => day > '2027-05-03')).toBe(true);
  });

  test('seuls les champs changés partent, avec la révision lue', async () => {
    const spy = gateway({ ...BASE, 'PUT /admin/game/seasons/4': { ok: true, data: { revision: 6, season: row({ stepPoints: 130 }) } } });
    const host = await mountPanel(spy);
    await openEditor(host);
    await choose(host, '[data-gameseasons-field="stepPoints"]', '130');
    await mounter.click(host.querySelector('[data-gameseasons-save]'));

    const [put] = calls(spy, 'PUT', '/4');
    expect(put?.body).toEqual({ expectedRevision: 5, stepPoints: 130 });
    expect(host.querySelector('[data-gameseasons-status]')?.textContent).toContain(t('admin.gameSeasons.saved', { number: '4', revision: '6' }));
  });

  test('mettre en pause : le statut part, la date non', async () => {
    const spy = gateway({ ...BASE, 'PUT /admin/game/seasons/4': { ok: true, data: { revision: 6, season: row({ status: 'paused', endDay: null }) } } });
    const host = await mountPanel(spy);
    await openEditor(host);
    await choose(host, '[data-gameseasons-field="status"]', 'paused');
    expect((host.querySelector('[data-gameseasons-field="startDay"]') as HTMLSelectElement).disabled).toBe(true);
    await mounter.click(host.querySelector('[data-gameseasons-save]'));
    expect(calls(spy, 'PUT', '/4')[0]?.body).toEqual({ expectedRevision: 5, status: 'paused' });
  });

  test('reprendre une saison en pause', async () => {
    const spy = gateway({ ...BASE, 'PUT /admin/game/seasons/5': { ok: true, data: { revision: 6, season: row({ number: 5 }) } } });
    const host = await mountPanel(spy);
    await openEditor(host, 5);
    await choose(host, '[data-gameseasons-field="status"]', 'scheduled');
    await choose(host, '[data-gameseasons-field="startDay"]', '2027-08-23');
    await mounter.click(host.querySelector('[data-gameseasons-save]'));
    expect(calls(spy, 'PUT', '/5')[0]?.body).toEqual({ expectedRevision: 5, status: 'scheduled' });
  });

  test('rien n’a changé : aucune requête, et on le dit', async () => {
    const spy = gateway(BASE);
    const host = await mountPanel(spy);
    await openEditor(host);
    await mounter.click(host.querySelector('[data-gameseasons-save]'));
    expect(calls(spy, 'PUT', '/4')).toHaveLength(0);
    expect(host.querySelector('[data-gameseasons-notice]')?.textContent).toBe(t('admin.gameSeasons.nothingToSave'));
  });

  test('un refus 422 de la loi se lit en clair', async () => {
    const spy = gateway({ ...BASE, 'PUT /admin/game/seasons/4': { ok: false, status: 422, error: 'overlaps-previous' } });
    const host = await mountPanel(spy);
    await openEditor(host);
    await choose(host, '[data-gameseasons-field="stepPoints"]', '130');
    await mounter.click(host.querySelector('[data-gameseasons-save]'));
    expect(host.querySelector('[data-gameseasons-error]')?.textContent).toBe(t('admin.gameSeasons.refusal.overlaps-previous'));
  });

  test('un conflit 409 dit que la révision a bougé et offre de recharger', async () => {
    const spy = gateway({ ...BASE, 'PUT /admin/game/seasons/4': { ok: false, status: 409, error: 'revision-conflict' } });
    const host = await mountPanel(spy);
    await openEditor(host);
    await choose(host, '[data-gameseasons-field="stepPoints"]', '130');
    await mounter.click(host.querySelector('[data-gameseasons-save]'));
    expect(host.querySelector('[data-gameseasons-error]')?.textContent).toBe(t('admin.gameSeasons.refusal.revision-conflict'));

    const before = calls(spy, 'GET', '').length;
    await mounter.click(host.querySelector('[data-gameseasons-reload]'));
    expect(calls(spy, 'GET', '').length).toBeGreaterThan(before);
    expect(host.querySelector('[data-gameseasons-reload]')).toBeNull();
  });

  test('un serveur injoignable ne se cache pas', async () => {
    const spy = gateway({ ...BASE, 'PUT /admin/game/seasons/4': { ok: false, status: 0, error: 'Failed to fetch' } });
    const host = await mountPanel(spy);
    await openEditor(host);
    await choose(host, '[data-gameseasons-field="stepPoints"]', '130');
    await mounter.click(host.querySelector('[data-gameseasons-save]'));
    expect(host.querySelector('[data-gameseasons-error]')?.textContent).toBe(t('admin.gameSeasons.refusal.network'));
  });
});

describe('les textes en sept langues', () => {
  test('chaque langue a ses trois champs et ses compteurs 30 / 50 / 120 ; l’arabe se lit de droite à gauche', async () => {
    const host = await mountPanel(gateway(BASE));
    await openEditor(host);
    for (const locale of SEASON_COPY_LOCALES) {
      for (const field of ['title', 'tagline', 'description']) expect(host.querySelector(`[data-gameseasons-copy="${locale}:${field}"]`)).not.toBeNull();
    }
    expect(host.querySelector('[data-gameseasons-counter="fr:title"]')?.textContent).toBe('0 / 30');
    expect(host.querySelector('[data-gameseasons-counter="fr:tagline"]')?.textContent).toBe('0 / 50');
    expect(host.querySelector('[data-gameseasons-counter="fr:description"]')?.textContent).toBe('0 / 120');
    expect(host.querySelector('[data-gameseasons-copy="ar:title"]')?.getAttribute('dir')).toBe('rtl');
    expect(host.querySelector('[data-gameseasons-copy="ar:description"]')?.getAttribute('dir')).toBe('rtl');
    expect(host.querySelector('[data-gameseasons-copy="fr:title"]')?.getAttribute('dir')).toBe('ltr');
  });

  test('le compteur suit la frappe et passe en alerte au-delà de la limite ; l’envoi est refusé AVANT la requête', async () => {
    const spy = gateway(BASE);
    const host = await mountPanel(spy);
    await openEditor(host);
    mounter.type(host, '[data-gameseasons-copy="fr:title"]', 'x'.repeat(31));
    expect(host.querySelector('[data-gameseasons-counter="fr:title"]')?.textContent).toBe('31 / 30');
    await mounter.click(host.querySelector('[data-gameseasons-save]'));
    expect(calls(spy, 'PUT', '/4')).toHaveLength(0);
    expect(host.querySelector('[data-gameseasons-error]')?.textContent).toBe(t('admin.gameSeasons.fixIssues'));
    expect(host.querySelector('[data-gameseasons-copy-issue="fr:title"]')?.textContent).toBe(t('admin.gameSeasons.issue.tooLong'));
    expect(host.querySelector('[data-gameseasons-copy-issue="en:title"]')?.textContent).toBe(t('admin.gameSeasons.issue.empty'));
  });

  test('sept langues complètes : les textes partent dans le PUT, rognés', async () => {
    const spy = gateway({ ...BASE, 'PUT /admin/game/seasons/4': { ok: true, data: { revision: 6, season: row({ copy: COPY }) } } });
    const host = await mountPanel(spy);
    await openEditor(host);
    for (const locale of SEASON_COPY_LOCALES) {
      mounter.type(host, `[data-gameseasons-copy="${locale}:title"]`, ` Titre ${locale} `);
      mounter.type(host, `[data-gameseasons-copy="${locale}:tagline"]`, `Accroche ${locale}`);
      mounter.type(host, `[data-gameseasons-copy="${locale}:description"]`, `Description ${locale}`);
    }
    await mounter.click(host.querySelector('[data-gameseasons-save]'));
    expect(calls(spy, 'PUT', '/4')[0]?.body).toEqual({ expectedRevision: 5, copy: COPY });
  });
});

describe('proposer avec l’IA', () => {
  const PROPOSE = (reply: Reply): Record<string, Reply> => ({ ...BASE, 'POST /admin/game/seasons/4/proposals': reply });

  test('la consigne part, la proposition arrive EN ATTENTE : rien n’est appliqué à la saison', async () => {
    let proposals: unknown[] = [];
    const spy = gateway({
      ...PROPOSE({ ok: true, data: PROPOSAL }),
      'GET /admin/game/seasons/proposals': () => ({ ok: true, data: { items: proposals } }),
    });
    const host = await mountPanel(spy);
    await openEditor(host);
    mounter.type(host, '[data-gameseasons-ai-brief]', 'plus doux');
    proposals = [PROPOSAL];
    await mounter.click(host.querySelector('[data-gameseasons-ai-ask]'));

    expect(calls(spy, 'POST', '/4/proposals')[0]?.body).toEqual({ brief: 'plus doux' });
    expect(host.querySelector('[data-gameseasons-ai-status]')?.textContent).toBe(t('admin.gameSeasons.ai.done'));
    const card = host.querySelector('[data-gameseasons-proposal="p1"]');
    expect(card?.getAttribute('data-gameseasons-proposal-status')).toBe('pending');
    expect(card?.textContent).toContain(t('admin.gameSeasons.proposal.badge.pending'));
    expect(card?.querySelector('[data-gameseasons-not-applied]')?.textContent).toBe(t('admin.gameSeasons.proposal.notApplied'));
    expect(calls(spy, 'PUT', '/4')).toHaveLength(0);
    expect(calls(spy, 'POST', '/proposals/p1/approve')).toHaveLength(0);
  });

  test('l’agent indisponible (503) et la proposition invalide (502) se lisent', async () => {
    for (const [status, error] of [[503, 'agent-unavailable'], [502, 'proposal-invalid']] as const) {
      const host = await mountPanel(gateway(PROPOSE({ ok: false, status, error })));
      await openEditor(host);
      await mounter.click(host.querySelector('[data-gameseasons-ai-ask]'));
      expect(host.querySelector('[data-gameseasons-ai-status]')?.textContent).toBe(t(`admin.gameSeasons.refusal.${error}`));
      mounter.unmountAll();
      appQueryClient.clear();
    }
  });
});

describe('la proposition en attente', () => {
  const WITH_PROPOSAL: Record<string, Reply> = { ...BASE, 'GET /admin/game/seasons/proposals': { ok: true, data: { items: [PROPOSAL] } } };

  test('elle montre ses textes, ses points, l’aperçu de l’événement App Store et ses défauts', async () => {
    const host = await mountPanel(gateway(WITH_PROPOSAL));
    const card = host.querySelector('[data-gameseasons-proposal="p1"]');
    expect((card?.querySelector('[data-gameseasons-field="stepPoints"]') as HTMLSelectElement).value).toBe('120');
    expect((card?.querySelector('[data-gameseasons-field="themeKey"]') as HTMLSelectElement).value).toBe('language:ja');
    expect((card?.querySelector('[data-gameseasons-copy="fr:title"]') as HTMLInputElement).value).toBe('Titre fr');
    expect((card?.querySelector('[data-gameseasons-copy="ar:title"]') as HTMLInputElement).value).toBe('Titre ar');
    expect(card?.querySelector('[data-gameseasons-event]')?.textContent).toContain('season-4');
    expect(card?.querySelector('[data-gameseasons-event-faults]')?.textContent).toContain('dépasse 120 signes');
    expect(card?.textContent).toContain('claude-test');
    expect(card?.textContent).toContain('plus doux');
  });

  test('Valider : la révision lue part, sans correction quand l’humain n’a rien changé', async () => {
    const spy = gateway({
      ...WITH_PROPOSAL,
      'POST /admin/game/seasons/proposals/p1/approve': { ok: true, data: { revision: 6, season: row({ stepPoints: 120 }), proposal: { ...PROPOSAL, status: 'approved' } } },
    });
    const host = await mountPanel(spy);
    await mounter.click(host.querySelector('[data-gameseasons-approve="p1"]'));
    expect(calls(spy, 'POST', '/proposals/p1/approve')[0]?.body).toEqual({ expectedRevision: 5 });
    expect(host.querySelector('[data-gameseasons-proposal-done]')?.textContent).toBe(t('admin.gameSeasons.proposal.approved', { number: '4', revision: '6' }));
  });

  test('l’humain corrige avant de valider : seules ses corrections partent', async () => {
    const spy = gateway({
      ...WITH_PROPOSAL,
      'POST /admin/game/seasons/proposals/p1/approve': { ok: true, data: { revision: 6, season: row({}), proposal: { ...PROPOSAL, status: 'approved' } } },
    });
    const host = await mountPanel(spy);
    await choose(host, '[data-gameseasons-proposal="p1"] [data-gameseasons-field="stepPoints"]', '140');
    mounter.type(host, '[data-gameseasons-proposal="p1"] [data-gameseasons-copy="fr:title"]', 'Titre corrigé');
    await mounter.click(host.querySelector('[data-gameseasons-approve="p1"]'));
    const body = calls(spy, 'POST', '/proposals/p1/approve')[0]?.body as { copy: Record<string, { title: string }>; stepPoints: number };
    expect(body.stepPoints).toBe(140);
    expect(body.copy.fr?.title).toBe('Titre corrigé');
    expect(body.copy.en?.title).toBe('Titre en');
    expect(Object.keys(body).sort()).toEqual(['copy', 'expectedRevision', 'stepPoints']);
  });

  test('une correction hors la loi est refusée avant la requête', async () => {
    const spy = gateway(WITH_PROPOSAL);
    const host = await mountPanel(spy);
    mounter.type(host, '[data-gameseasons-proposal="p1"] [data-gameseasons-copy="fr:title"]', 'x'.repeat(40));
    await mounter.click(host.querySelector('[data-gameseasons-approve="p1"]'));
    expect(calls(spy, 'POST', '/proposals/p1/approve')).toHaveLength(0);
    expect(host.querySelector('[data-gameseasons-proposal="p1"] [data-gameseasons-error]')?.textContent).toBe(t('admin.gameSeasons.fixIssues'));
  });

  test('Valider refusé (409 déjà traitée, 422 la loi) se lit en clair, la proposition reste là', async () => {
    const spy = gateway({ ...WITH_PROPOSAL, 'POST /admin/game/seasons/proposals/p1/approve': { ok: false, status: 409, error: 'proposal-not-pending' } });
    const host = await mountPanel(spy);
    await mounter.click(host.querySelector('[data-gameseasons-approve="p1"]'));
    expect(host.querySelector('[data-gameseasons-proposal="p1"] [data-gameseasons-error]')?.textContent).toBe(t('admin.gameSeasons.refusal.proposal-not-pending'));
    expect(host.querySelector('[data-gameseasons-approve="p1"]')).not.toBeNull();
  });

  test('Rejeter : la raison part, et rien n’est appliqué à la saison', async () => {
    const spy = gateway({
      ...WITH_PROPOSAL,
      'POST /admin/game/seasons/proposals/p1/reject': { ok: true, data: { proposal: { ...PROPOSAL, status: 'rejected' } } },
    });
    const host = await mountPanel(spy);
    mounter.type(host, '[data-gameseasons-reject-reason="p1"]', 'hors sujet');
    await mounter.click(host.querySelector('[data-gameseasons-reject="p1"]'));
    expect(calls(spy, 'POST', '/proposals/p1/reject')[0]?.body).toEqual({ reason: 'hors sujet' });
    expect(host.querySelector('[data-gameseasons-proposal-done]')?.textContent).toBe(t('admin.gameSeasons.proposal.rejected'));
    expect(calls(spy, 'PUT', '/4')).toHaveLength(0);
    expect(calls(spy, 'POST', '/proposals/p1/approve')).toHaveLength(0);
  });

  test('un défaut tiré de la loi (aucun événement exportable) se lit en clair, pas en code', async () => {
    const host = await mountPanel(gateway({ ...BASE, 'GET /admin/game/seasons/proposals': { ok: true, data: { items: [{ ...PROPOSAL, appEvent: null, appEventFaults: ['overlaps-previous'] }] } } }));
    expect(host.querySelector('[data-gameseasons-event-none]')).not.toBeNull();
    expect(host.querySelector('[data-gameseasons-event-faults]')?.textContent).toContain(t('admin.gameSeasons.refusal.overlaps-previous'));
  });

  test('une proposition traitée est lisible mais sans geste', async () => {
    const host = await mountPanel(gateway({ ...BASE, 'GET /admin/game/seasons/proposals': { ok: true, data: { items: [{ ...PROPOSAL, status: 'approved', reviewedAt: '2027-05-04T10:00:00.000Z' }] } } }));
    await choose(host, '[data-gameseasons-proposals-filter]', 'approved');
    const card = host.querySelector('[data-gameseasons-proposal="p1"]');
    expect(card?.getAttribute('data-gameseasons-proposal-status')).toBe('approved');
    expect(card?.querySelector('[data-gameseasons-approve]')).toBeNull();
    expect(card?.querySelector('[data-gameseasons-reject]')).toBeNull();
  });

  test('aucune proposition : l’état vide', async () => {
    const host = await mountPanel(gateway(BASE));
    expect(host.querySelector('[data-gameseasons-proposals-empty]')).not.toBeNull();
  });
});

describe('l’export store.app_events', () => {
  const YAML = 'store:\n  app_events:\n    - key: season-4\n';
  const EXPORT: Record<string, Reply> = { ...BASE, 'GET /admin/game/seasons/app-events': { ok: true, data: { revision: 5, events: [EVENT], faults: { 'season-4': ['trop long'] }, yaml: YAML } } };

  test('affiche le YAML, les défauts par événement, et lit trois événements', async () => {
    const spy = gateway(EXPORT);
    const host = await mountPanel(spy);
    await mounter.click(host.querySelector('[data-gameseasons-export]'));
    expect(spy.requests.find((request) => request.path.includes('app-events'))?.path).toBe('/api/v1/admin/game/seasons/app-events?count=3');
    expect(host.querySelector('[data-gameseasons-yaml]')?.textContent).toBe(YAML);
    expect(host.querySelector('[data-gameseasons-yaml]')?.getAttribute('dir')).toBe('ltr');
    expect(host.querySelector('[data-gameseasons-export-faults]')?.textContent).toContain('season-4');
  });

  test('copier met le YAML dans le presse-papiers', async () => {
    const written: string[] = [];
    const original = Object.getOwnPropertyDescriptor(globalThis.navigator, 'clipboard');
    Object.defineProperty(globalThis.navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => void written.push(text) } });
    try {
      const host = await mountPanel(gateway(EXPORT));
      await mounter.click(host.querySelector('[data-gameseasons-export]'));
      await mounter.click(host.querySelector('[data-gameseasons-yaml-copy]'));
      expect(written).toEqual([YAML]);
      expect(host.querySelector('[data-gameseasons-export-note]')?.textContent).toBe(t('admin.gameSeasons.export.copied'));
    } finally {
      if (original !== undefined) Object.defineProperty(globalThis.navigator, 'clipboard', original);
      else Reflect.deleteProperty(globalThis.navigator, 'clipboard');
    }
  });

  test('un presse-papiers refusé se dit, il ne ment pas', async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis.navigator, 'clipboard');
    Object.defineProperty(globalThis.navigator, 'clipboard', { configurable: true, value: { writeText: async () => Promise.reject(new Error('denied')) } });
    try {
      const host = await mountPanel(gateway(EXPORT));
      await mounter.click(host.querySelector('[data-gameseasons-export]'));
      await mounter.click(host.querySelector('[data-gameseasons-yaml-copy]'));
      expect(host.querySelector('[data-gameseasons-export-note]')?.textContent).toBe(t('admin.gameSeasons.export.copyFailed'));
    } finally {
      if (original !== undefined) Object.defineProperty(globalThis.navigator, 'clipboard', original);
      else Reflect.deleteProperty(globalThis.navigator, 'clipboard');
    }
  });

  test('télécharger crée un fichier app-events.yaml', async () => {
    const downloads: string[] = [];
    const realCreate = URL.createObjectURL;
    const realRevoke = URL.revokeObjectURL;
    const realClick = HTMLAnchorElement.prototype.click;
    URL.createObjectURL = () => 'blob:test';
    URL.revokeObjectURL = () => undefined;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      downloads.push(this.download);
    };
    try {
      const host = await mountPanel(gateway(EXPORT));
      await mounter.click(host.querySelector('[data-gameseasons-export]'));
      await mounter.click(host.querySelector('[data-gameseasons-yaml-download]'));
      expect(downloads).toEqual(['andp-app-events-r5.yaml']);
      expect(host.querySelector('[data-gameseasons-export-note]')?.textContent).toBe(t('admin.gameSeasons.export.downloaded'));
    } finally {
      URL.createObjectURL = realCreate;
      URL.revokeObjectURL = realRevoke;
      HTMLAnchorElement.prototype.click = realClick;
    }
  });

  test('un export refusé se dit', async () => {
    const host = await mountPanel(gateway({ ...BASE, 'GET /admin/game/seasons/app-events': { ok: false, status: 500, error: 'boom' } }));
    await mounter.click(host.querySelector('[data-gameseasons-export]'));
    expect(host.querySelector('[data-gameseasons-export-error]')?.textContent).toBe(t('admin.gameSeasons.export.failed'));
    expect(host.querySelector('[data-gameseasons-yaml]')).toBeNull();
  });
});
