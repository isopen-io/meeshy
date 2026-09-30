import { describe, expect, test } from 'bun:test';

import { dashboardReplies, routeOf, SERVED, type DashRoute } from '@/lib/admin/dashboard-fixtures';
import { ADMIN_DASHBOARD_QUERY_KEY, decodeAdminDashboard } from '@/lib/api/admin-dashboard';
import type { HttpTransport } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';
import { AdminDashboardPanel } from '@/routes/admin-dashboard';
import { adminIdentityFixture, type AdminIdentityFixture } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';
import { routedTransport, type RoutedReply } from '@/test-support/routed-transport';

/**
 * **LE TABLEAU DE BORD, PAR BLOC : PORTES, PANNES, REFUS, SQUELETTES** (#8876,
 * § 4) — chaque bloc est gardé par la capacité de SA route et MASQUÉ sans elle
 * (ni titre vide, ni requête qui rendrait 403) ; chaque bloc a son squelette,
 * son erreur avec « Réessayer », son refus, et n'empêche jamais les autres de
 * se rendre.
 *
 * La matrice se pose par `adminIdentityFixture` : la forme SERVIE par rôle, avec
 * les dix clés, jamais un drapeau inventé par le témoin.
 */

const { mount, mounter } = setupAdminKitTests();

const NOW = new Date('2026-09-30T12:00:00.000Z');
const BIGBOSS = adminIdentityFixture({ role: 'BIGBOSS' });

const ANALYTICS_ROUTES: readonly DashRoute[] = ['realtime', 'kpis', 'volume', 'hourly', 'distribution', 'languages', 'types', 'rankConversations', 'rankMembers'];

const flat = (text: string | null | undefined): string => (text ?? '').replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();

async function dashboard(options: { readonly identity?: AdminIdentityFixture | null; readonly replies?: readonly RoutedReply[] } = {}) {
  const { transport, calls } = routedTransport(...(options.replies ?? []), dashboardReplies());
  const host = await mount(
    <AdminDashboardPanel language="fr" deps={{ source: 'gateway', transport }} now={() => NOW} />,
    options.identity === null ? undefined : (options.identity ?? BIGBOSS),
  );
  for (let turn = 0; turn < 12 && host.querySelector('[data-admin-stat-state="loading"], [data-admin-chart-skeleton], [data-admin-block-skeleton]') !== null; turn += 1) {
    await mounter.settle();
  }
  return { host, calls };
}

const zones = (host: ParentNode): readonly (string | null)[] => [...host.querySelectorAll('[data-admin-zone]')].map((zone) => zone.getAttribute('data-admin-zone'));
const blocks = (host: ParentNode): readonly (string | null)[] => [...host.querySelectorAll('[data-admin-block]')].map((block) => block.getAttribute('data-admin-block'));
const asked = (calls: () => readonly { readonly path: string }[]): readonly (DashRoute | null)[] =>
  calls().map((call) => routeOf({ method: 'GET', path: call.path }));

describe('chaque bloc est gardé par la capacité de SA route', () => {
  test('sans `canViewAnalytics` : ni « En ce moment », ni santé de l’usage, ni tendances, ni classements, ni supervision — et AUCUNE de leurs requêtes', async () => {
    const { host, calls } = await dashboard({ identity: adminIdentityFixture({ role: 'BIGBOSS', permissions: { canViewAnalytics: false } }) });

    expect(zones(host)).toEqual(['platform', 'todo', 'people', 'system']);
    expect(host.querySelector('[data-admin-chart]')).toBeNull();
    expect(blocks(host)).not.toContain('monitoring');
    const routes = asked(calls);
    for (const route of [...ANALYTICS_ROUTES, 'monitoring'] as const) expect(routes).not.toContain(route);
    expect(routes).toContain('dashboard');
  });

  test('sans `canModerateContent` : la file de modération disparaît, et ses requêtes avec', async () => {
    const { host, calls } = await dashboard({ identity: adminIdentityFixture({ role: 'BIGBOSS', permissions: { canModerateContent: false } }) });

    expect(blocks(host)).not.toContain('moderation');
    expect(blocks(host)).toContain('broadcasts');
    expect(asked(calls)).not.toContain('reportsStats');
    expect(asked(calls)).not.toContain('reportsRecent');
  });

  test('sans `canManageNotifications` : les diffusions disparaissent, et leur requête avec', async () => {
    const { host, calls } = await dashboard({ identity: adminIdentityFixture({ role: 'BIGBOSS', permissions: { canManageNotifications: false } }) });

    expect(blocks(host)).not.toContain('broadcasts');
    expect(blocks(host)).toContain('moderation');
    expect(asked(calls)).not.toContain('broadcasts');
  });

  test('sans `canManageUsers` : plus de derniers inscrits (et leur lecture écrit un audit : elle ne part pas) ; les classements restent', async () => {
    const { host, calls } = await dashboard({ identity: adminIdentityFixture({ role: 'BIGBOSS', permissions: { canManageUsers: false } }) });

    expect(blocks(host)).not.toContain('members');
    expect(host.querySelector('[data-admin-chart="rank-members"]')).not.toBeNull();
    expect(asked(calls)).not.toContain('users');
  });

  test('sans `canManageAgent` : l’agent disparaît ; la santé reste', async () => {
    const { host, calls } = await dashboard({ identity: adminIdentityFixture({ role: 'BIGBOSS', permissions: { canManageAgent: false } }) });

    expect(blocks(host)).not.toContain('system-agent');
    expect(blocks(host)).toContain('system-health');
    expect(asked(calls)).not.toContain('agent');
  });

  test('la supervision exige AUSSI le rang d’administration : AUDIT lit les statistiques, pas la santé de la plateforme', async () => {
    const { host, calls } = await dashboard({ identity: adminIdentityFixture({ role: 'AUDIT' }) });

    expect(zones(host)).toEqual(['now', 'platform', 'usage', 'trends', 'people']);
    expect(blocks(host)).not.toContain('system-health');
    expect(asked(calls)).not.toContain('monitoring');
    expect(asked(calls)).toContain('rankMembers');
  });

  test('un MODÉRATEUR : la plateforme et la file de modération, rien d’autre', async () => {
    const { host, calls } = await dashboard({ identity: adminIdentityFixture({ role: 'MODERATOR' }) });

    expect(zones(host)).toEqual(['platform', 'todo']);
    expect(blocks(host)).toContain('moderation');
    expect(blocks(host)).not.toContain('broadcasts');
    expect(asked(calls).filter((route) => route !== 'dashboard' && route !== 'reportsStats' && route !== 'reportsRecent')).toEqual([]);
  });

  test('une zone sans bloc visible disparaît : `canAccessAdmin` seule ne laisse que la plateforme', async () => {
    const identity = adminIdentityFixture({
      role: 'USER',
      permissions: { canAccessAdmin: true },
    });
    const { host } = await dashboard({ identity });
    expect(zones(host)).toEqual(['platform']);
  });

  test('sans `canAccessAdmin` : rien du tout, et aucune requête — le hub refuse avant', async () => {
    const { host, calls } = await dashboard({ identity: adminIdentityFixture({ role: 'USER' }) });
    expect(host.querySelector('[data-admin-dashboard]')).toBeNull();
    expect(calls()).toEqual([]);
  });

  test('la matrice pas encore là (fail-closed) : rien, et aucune requête', async () => {
    const { host, calls } = await dashboard({ identity: null });
    expect(host.querySelector('[data-admin-dashboard]')).toBeNull();
    expect(calls()).toEqual([]);
  });
});

describe('un bloc en panne offre « Réessayer » et ne retient jamais les autres', () => {
  test('les KPIs en erreur : leur zone dit l’erreur, tout le reste se rend ; « Réessayer » relit et rend les cartes', async () => {
    let down = true;
    const flaky: RoutedReply = (request) => (routeOf(request) === 'kpis' && down ? { ok: false, status: 500, error: 'boom' } : undefined);
    const { host, calls } = await dashboard({ replies: [flaky] });

    const kpis = host.querySelector('[data-admin-block="kpis"]');
    expect(kpis?.getAttribute('data-admin-block-state')).toBe('error');
    expect(kpis?.querySelector('[data-admin-error]')).not.toBeNull();
    expect(host.querySelector('[data-admin-stat="platform-users"]')?.textContent).toContain('1 200'.replace(' ', ' '));
    expect(host.querySelector('[data-admin-chart="volume"] [data-admin-chart-summary]')).not.toBeNull();
    expect(host.querySelector('[data-admin-stat="moderation-pending"]')).not.toBeNull();

    down = false;
    await mounter.click(kpis?.querySelector<HTMLElement>('[data-admin-retry]') ?? null);
    expect(host.querySelector('[data-admin-block="kpis"]')?.getAttribute('data-admin-block-state')).toBe('ready');
    expect(flat(host.querySelector('[data-admin-stat="usage-engagement"]')?.textContent)).toContain('42 %');
    expect(asked(calls).filter((route) => route === 'kpis')).toHaveLength(2);
  });

  test('une charge illisible dessine l’erreur du graphique — jamais un graphique plat qui ferait croire à zéro', async () => {
    const { host } = await dashboard({ replies: [dashboardReplies({ volume: { ok: true, data: { pas: 'une série' } } })] });

    const chart = host.querySelector('[data-admin-chart="volume"]');
    expect(chart?.querySelector('[data-admin-error]')).not.toBeNull();
    expect(chart?.querySelector('[data-admin-chart-svg]')).toBeNull();
  });

  test('un bloc de liste en erreur dit LEQUEL, sans quoi l’erreur ne dit pas ce qui manque', async () => {
    const { host } = await dashboard({ replies: [dashboardReplies({ users: { ok: false, status: 500, error: 'boom' } })] });

    const members = host.querySelector('[data-admin-block="members"]');
    expect(flat(members?.querySelector('[data-admin-error]')?.textContent)).toContain('Derniers inscrits — Impossible de charger ces données pour le moment.');
    expect(members?.querySelector('[data-admin-retry]')).not.toBeNull();
  });

  test('tout en panne : les sept zones restent, chacune avec son erreur — seize « Réessayer », une par lecture', async () => {
    const down: Partial<Record<DashRoute, { readonly ok: false; readonly status: number; readonly error: string }>> = {};
    for (const route of Object.keys(SERVED)) down[route as DashRoute] = { ok: false, status: 500, error: 'boom' };
    const { host } = await dashboard({ replies: [dashboardReplies(down)] });

    expect(zones(host)).toHaveLength(7);
    expect(host.querySelectorAll('[data-admin-retry]')).toHaveLength(16);
  });
});

describe('un refus (403) n’est pas une panne', () => {
  test('les classements refusés : la ligne de refus à la place du graphique, SANS « Réessayer » ; le reste se rend', async () => {
    const refused = { ok: false, status: 403, error: 'Forbidden' } as const;
    const { host } = await dashboard({ replies: [dashboardReplies({ rankConversations: refused, rankMembers: refused })] });

    const people = host.querySelector('[data-admin-zone="people"]');
    expect(people?.querySelectorAll('[data-admin-denied-inline]')).toHaveLength(2);
    expect(people?.querySelector('[data-admin-chart]')).toBeNull();
    expect(people?.querySelector('[data-admin-retry]')).toBeNull();
    expect(host.querySelector('[data-admin-block="members"]')).not.toBeNull();
    expect(host.querySelector('[data-admin-stat="platform-users"]')).not.toBeNull();
  });

  test('un compteur refusé : la ligne de refus à la place de ses cartes', async () => {
    const { host } = await dashboard({ replies: [dashboardReplies({ realtime: { ok: false, status: 403, error: 'Forbidden' } })] });
    const now = host.querySelector('[data-admin-zone="now"]');
    expect(now?.querySelector('[data-admin-denied-inline]')).not.toBeNull();
    expect(now?.querySelector('[data-admin-stat]')).toBeNull();
  });
});

describe('squelette, cache d’abord, vide', () => {
  const hanging = (): { readonly transport: HttpTransport } => {
    const { transport } = routedTransport();
    transport.request = (() => new Promise(() => undefined)) as HttpTransport['request'];
    return { transport };
  };

  test('rien en cache : des squelettes de même forme — cartes, graphiques, listes — jamais un écran vide', async () => {
    const { transport } = hanging();
    const host = await mount(<AdminDashboardPanel language="fr" deps={{ source: 'gateway', transport }} now={() => NOW} />, BIGBOSS);

    expect(zones(host)).toHaveLength(7);
    expect(host.querySelectorAll('[data-admin-stat-state="loading"]').length).toBeGreaterThanOrEqual(24);
    expect(host.querySelectorAll('[data-admin-chart-skeleton]').length).toBe(7);
    expect(host.querySelectorAll('[data-admin-block-skeleton]').length).toBe(3);
    expect(host.querySelector('[data-admin-error]')).toBeNull();
  });

  test('un cache non vide s’affiche TOUT DE SUITE — pas de squelette sur la plateforme, même si le réseau ne répond jamais', async () => {
    const { transport } = hanging();
    appQueryClient.setQueryData(ADMIN_DASHBOARD_QUERY_KEY, decodeAdminDashboard(SERVED.dashboard));
    const host = await mount(<AdminDashboardPanel language="fr" deps={{ source: 'gateway', transport }} now={() => NOW} />, BIGBOSS);

    expect(host.querySelector('[data-admin-block="platform"]')?.getAttribute('data-admin-block-state')).toBe('ready');
    expect(flat(host.querySelector('[data-admin-stat="platform-users"]')?.textContent)).toContain('1 200');
    expect(host.querySelector('[data-admin-block="kpis"]')?.getAttribute('data-admin-block-state')).toBe('loading');
  });

  test('les états vides se disent en mots', async () => {
    const empty = dashboardReplies({
      reportsRecent: { ok: true, data: [] },
      broadcasts: { ok: true, data: { broadcasts: [], pagination: { total: 0 } } },
      users: { ok: true, data: { users: [] } },
      hourly: { ok: true, data: [] },
      languages: { ok: true, data: [] },
      rankConversations: { ok: true, data: { rankings: [] } },
    });
    const { host } = await dashboard({ replies: [empty] });

    const lines = [...host.querySelectorAll('[data-admin-block-empty]')].map((line) => flat(line.textContent));
    expect(lines).toEqual([
      'Aucun signalement ces dernières 24 heures.',
      'Aucune diffusion en cours d’envoi.',
      'Aucun compte pour le moment.',
    ]);
    for (const id of ['hourly', 'languages', 'rank-conversations']) {
      expect(host.querySelector(`[data-admin-chart="${id}"] [data-admin-chart-empty]`)?.textContent).toBe('Aucune donnée sur la période');
    }
  });

  test('plus de diffusions en cours que les cinq affichées : le reste se dit', async () => {
    const { host } = await dashboard({
      replies: [dashboardReplies({ broadcasts: { ok: true, data: { ...SERVED.broadcasts, pagination: { total: 4 } } } })],
    });
    expect(flat(host.querySelector('[data-admin-block="broadcasts"]')?.textContent)).toContain('Et 3 de plus en cours d’envoi');
  });
});

describe('le temps réel se relit chaque minute — seulement si l’onglet est regardé', () => {
  test('la relecture périodique du temps réel est une fonction de visibilité ; les autres blocs n’en ont pas', async () => {
    await dashboard();
    const intervalOf = (segment: string) =>
      appQueryClient.getQueryCache().find({ queryKey: ['admin', 'dash', segment] })?.observers[0]?.options.refetchInterval;

    expect(typeof intervalOf('realtime')).toBe('function');
    expect(typeof intervalOf('broadcasts-sending')).toBe('function');
    for (const segment of ['platform', 'kpis', 'volume', 'members', 'monitoring']) expect(intervalOf(segment)).toBeUndefined();
  });

  test('toutes les clés du tableau de bord sont sous `admin`/`dash` : jamais persistées, invalidées d’un coup', async () => {
    await dashboard();
    const keys = appQueryClient.getQueryCache().findAll({ queryKey: ['admin', 'dash'] });
    expect(keys).toHaveLength(16);
  });
});
