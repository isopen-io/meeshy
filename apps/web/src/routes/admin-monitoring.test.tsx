import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';
import { environmentManager } from '@tanstack/react-query';
import { act } from 'react';
import { describe, expect, test } from 'bun:test';

import { AdminSectionScreen } from '@/components/admin/section-screen';
import { servedMonitoring } from '@/lib/admin/monitoring-fixtures';
import type { AdminDeps } from '@/lib/api/admin';
import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { createRouter, navigate } from '@/lib/router';
import { adminIdentityFixture, expectNoRawIdentifiers } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';

import { AdminMonitoringPanel } from './admin-monitoring';

/**
 * **LA SUPERVISION — SANTÉ** (#8876, #6734) — six blocs lus en mots, un coupe-circuit
 * ouvert en danger avec son mot, « inconnu » qui n'est pas « zéro », une relecture
 * automatique qui ne court que tant que l'écran est visible, et la porte du rang.
 */

const { mount, mounter } = setupAdminKitTests();
const BIGBOSS = adminIdentityFixture({ role: 'BIGBOSS' });
const NOW = new Date('2026-09-30T12:00:00.000Z');

type Reply = ApiResult<unknown> | Promise<ApiResult<unknown>>;

function scripted(reply: (path: string) => Reply): { readonly deps: AdminDeps; readonly paths: string[] } {
  const paths: string[] = [];
  const transport = {
    request: async (request: HttpRequest) => {
      paths.push(request.path);
      return reply(request.path);
    },
  } as unknown as HttpTransport;
  return { deps: { source: 'gateway', transport }, paths };
}

const healthy = (overrides: Record<string, unknown> = {}): ApiResult<unknown> => ({ ok: true, status: 200, data: servedMonitoring(overrides) });

const CLOSED = [{ name: 'translator-zmq', state: 'CLOSED', failures: 0, successes: 4_120, totalRequests: 4_120, lastFailureAt: null }];

function Screen({ deps, refreshMs }: { readonly deps: AdminDeps; readonly refreshMs?: number }) {
  return (
    <AdminSectionScreen section="monitoring" language="fr" title="Supervision">
      {() => <AdminMonitoringPanel language="fr" deps={deps} now={() => NOW} {...(refreshMs === undefined ? {} : { refreshMs })} />}
    </AdminSectionScreen>
  );
}

async function open(deps: AdminDeps, url = '/admin/monitoring', identity = BIGBOSS, refreshMs?: number) {
  const { Router } = createRouter(
    {
      adminMonitoring: { pattern: '/admin/monitoring', screen: async () => ({ default: () => <Screen deps={deps} {...(refreshMs === undefined ? {} : { refreshMs })} /> }) },
      admMonitoring: { pattern: '/adm/monitoring', screen: async () => ({ default: () => <Screen deps={deps} {...(refreshMs === undefined ? {} : { refreshMs })} /> }) },
    },
    () => <p>absent</p>,
  );
  navigate(url, true);
  const host = await mount(<Router wrap={(children) => children} skeleton={null} />, identity);
  for (let attempt = 0; attempt < 30 && host.querySelector('[data-admin-monitoring]') === null && host.textContent?.includes('Espace réservé') !== true; attempt += 1) {
    await mounter.settle();
  }
  await mounter.settle();
  await mounter.settle();
  return host;
}

const wait = (ms: number) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

/** Attend qu'une condition soit vraie, par pas de 20 ms, au plus 3 s — un témoin de cadence ne doit pas dépendre de la charge de la machine. */
async function until(condition: () => boolean): Promise<boolean> {
  for (let attempt = 0; attempt < 150 && !condition(); attempt += 1) await wait(20);
  return condition();
}

const healthPaths = (paths: readonly string[]) => paths.filter((path) => path === adminEndpoints.monitoring);
const normalized = (text: string) => text.replace(/[\u00a0\u202f]/g, ' ');
const stat = (host: ParentNode, anchor: string) => normalized(host.querySelector(`[data-admin-stat="${anchor}"]`)?.textContent ?? '');
const service = (host: ParentNode, anchor: string) => normalized(host.querySelector(`[data-admin-service="${anchor}"]`)?.textContent ?? '');
const breaker = (host: ParentNode, name: string) => host.querySelector(`[data-admin-breaker="${name}"]`);

function setVisibility(state: 'visible' | 'hidden') {
  act(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

describe('la santé — ouverture et blocs', () => {
  test('l’onglet Santé s’ouvre par défaut, une seule lecture part, le titre et le sous-titre sont dits', async () => {
    const { deps, paths } = scripted(() => healthy());
    const host = await open(deps);

    expect(host.querySelector('h1')?.textContent).toBe('Supervision');
    expect(host.querySelector('[data-admin-tab="health"]')?.getAttribute('aria-selected')).toBe('true');
    expect(host.querySelector('[data-admin-monitoring-panel]')?.getAttribute('data-admin-monitoring-panel')).toBe('health');
    expect(paths).toEqual([adminEndpoints.monitoring]);
  });

  test('la passerelle : temps de fonctionnement en durée, mémoire en octets — jamais des chiffres bruts', async () => {
    const { deps } = scripted(() => healthy());
    const host = await open(deps);

    expect(stat(host, 'gateway-uptime')).toContain('3 j 4 h');
    expect(stat(host, 'gateway-heap')).toContain('150 Mo');
    expect(stat(host, 'gateway-heap')).toContain('sur 200 Mo alloués au processus');
    expect(stat(host, 'gateway-rss')).toContain('350 Mo');
    expect(host.textContent).not.toContain('157286400');
  });

  test('la base et Redis : l’état en MOT, le temps de réponse en durée', async () => {
    const { deps } = scripted(() => healthy());
    const host = await open(deps);

    expect(service(host, 'database')).toContain('Base de données');
    expect(service(host, 'database')).toContain('Opérationnel');
    expect(service(host, 'database')).toContain('12 ms');
    expect(service(host, 'redis')).toContain('Opérationnel');
    expect(service(host, 'redis')).toContain('3 ms');
  });

  test('une base tombée : « Hors service », aucune latence (« — », jamais 0 ms), « Aucune réponse », en danger', async () => {
    const { deps } = scripted(() => healthy({ database: { status: 'down', latencyMs: null }, circuitBreakers: CLOSED }));
    const host = await open(deps);

    expect(service(host, 'database')).toContain('Hors service');
    expect(service(host, 'database')).toContain('—');
    expect(service(host, 'database')).toContain('Aucune réponse');
    expect(service(host, 'database')).not.toContain('0 ms');
    expect(host.querySelector('[data-admin-notice="danger"]')?.textContent).toContain('La base de données ne répond pas.');
  });

  test('le temps réel : connexions, comptes connectés, messages traités, traductions, erreurs', async () => {
    const { deps } = scripted(() => healthy());
    const host = await open(deps);

    expect(stat(host, 'realtime-connections')).toContain('152');
    expect(stat(host, 'realtime-users')).toContain('97');
    expect(stat(host, 'realtime-messages')).toContain('48 210');
    expect(stat(host, 'realtime-translations')).toContain('31 004');
    expect(stat(host, 'realtime-errors')).toContain('2');
  });

  test('la traduction : durées, octets et pourcentage — le taux de cache est lu sur 0–100, pas sur 0–1', async () => {
    const { deps } = scripted(() => healthy());
    const host = await open(deps);

    expect(stat(host, 'translator-sent')).toContain('31 100');
    expect(stat(host, 'translator-pool-full')).toContain('4');
    expect(stat(host, 'translator-avg-time')).toContain('850 ms');
    expect(stat(host, 'translator-cache-hit')).toContain('62,5 %');
    expect(stat(host, 'translator-memory')).toContain('150 Mo');
    expect(stat(host, 'translator-uptime')).toContain('3 j 3 h');
  });

  test('un traducteur injoignable se DIT — pas un bloc de zéros — et devient une alerte', async () => {
    const { deps } = scripted(() => healthy({ translator: null, circuitBreakers: CLOSED }));
    const host = await open(deps);

    expect(host.querySelector('[data-admin-monitoring-section="translator"]')?.textContent).toContain('Service de traduction injoignable');
    expect(host.querySelector('[data-admin-stat="translator-sent"]')).toBeNull();
    expect(host.querySelector('[data-admin-notice="warning"]')?.textContent).toContain('Le service de traduction est injoignable.');
  });

  test('la présence : trois chiffres, le taux lu sur 0–100', async () => {
    const { deps } = scripted(() => healthy());
    const host = await open(deps);

    expect(stat(host, 'presence-total')).toContain('1 200');
    expect(stat(host, 'presence-throttled')).toContain('30');
    expect(stat(host, 'presence-rate')).toContain('2,5 %');
  });

  test('sans service de présence vivant (`null`), PAS de bloc : « inconnu » n’est pas « zéro »', async () => {
    const { deps } = scripted(() => healthy({ presenceUpdates: null }));
    const host = await open(deps);

    expect(host.querySelector('[data-admin-monitoring-section="presence"]') === null).toBe(true);
  });

  test('aucun identifiant, aucun ISO, aucune énumération brute dans l’écran', async () => {
    const { deps } = scripted(() => healthy());
    const host = await open(deps);

    expectNoRawIdentifiers(host);
  });
});

describe('les coupe-circuits — le mot d’abord', () => {
  test('un coupe-circuit OUVERT est « Coupé », en danger, avec ce que cela change', async () => {
    const { deps } = scripted(() => healthy());
    const host = await open(deps);

    const open_ = breaker(host, 'push-provider');
    expect(open_?.getAttribute('data-admin-breaker-state')).toBe('OPEN');
    expect(open_?.textContent).toContain('Coupé');
    expect(open_?.textContent).toContain('Les appels sont refusés le temps que le service se rétablisse');
    expect(open_?.querySelector('[data-admin-raw="OPEN"]')).not.toBeNull();
    expect(normalized(open_?.textContent ?? '')).toContain('5');
    expect(normalized(open_?.textContent ?? '')).toContain('310');
    expect(open_?.textContent).toContain('il y a 5 minutes');
  });

  test('fermé : « Normal », « Aucun échec » ; en essai : « En essai »', async () => {
    const { deps } = scripted(() => healthy());
    const host = await open(deps);

    expect(breaker(host, 'translator-zmq')?.textContent).toContain('Normal');
    expect(breaker(host, 'translator-zmq')?.textContent).toContain('Aucun échec');
    expect(breaker(host, 'mailer')?.textContent).toContain('En essai');
  });

  test('l’alerte de synthèse compte les ouverts (danger) et les essais (alerte)', async () => {
    const { deps } = scripted(() => healthy());
    const host = await open(deps);

    expect(host.querySelector('[data-admin-notice="danger"]')?.textContent).toContain('Coupe-circuits ouverts : 1.');
    expect(host.querySelector('[data-admin-notice="warning"]')?.textContent).toContain('Coupe-circuits en essai : 1.');
    expect(host.querySelector('[data-admin-notice="success"]')).toBeNull();
  });

  test('tout va bien : une seule ligne verte, aucune alerte', async () => {
    const { deps } = scripted(() => healthy({ circuitBreakers: CLOSED }));
    const host = await open(deps);

    expect(host.querySelector('[data-admin-health-issues] [data-admin-notice="success"]')?.textContent).toContain('Tous les services répondent normalement.');
    expect(host.querySelector('[data-admin-notice="danger"]')).toBeNull();
    expect(host.querySelector('[data-admin-notice="warning"]')).toBeNull();
  });

  test('aucun coupe-circuit : l’état vide se dit', async () => {
    const { deps } = scripted(() => healthy({ circuitBreakers: [] }));
    const host = await open(deps);

    expect(host.querySelector('[data-admin-monitoring-section="breakers"] [data-admin-empty]')?.textContent).toContain('Aucun coupe-circuit enregistré');
  });
});

describe('la relecture — à la demande, et toute seule tant que l’écran est visible', () => {
  test('« Actualiser » relit la passerelle, et le dit pendant qu’il travaille', async () => {
    let release: (result: ApiResult<unknown>) => void = () => undefined;
    let calls = 0;
    const { deps, paths } = scripted(() => {
      calls += 1;
      return calls === 1 ? healthy() : new Promise<ApiResult<unknown>>((resolve) => (release = resolve));
    });
    const host = await open(deps);
    const button = () => host.querySelector<HTMLButtonElement>('[data-admin-action="refresh"]');

    expect(button()?.textContent).toContain('Actualiser');
    await mounter.click(button());

    expect(healthPaths(paths)).toHaveLength(2);
    expect(button()?.disabled).toBe(true);
    expect(button()?.textContent).toContain('Actualisation…');
    expect(host.querySelector('[data-admin-stat="gateway-uptime"]')).not.toBeNull();

    release(healthy());
    await mounter.settle();
    expect(button()?.disabled).toBe(false);
  });

  test('visible : l’écran se relit tout seul à la cadence ; masqué : plus une requête ; de nouveau visible : il reprend', async () => {
    /* `@tanstack/query-core` juge « serveur » au CHARGEMENT du module (`typeof window`), avant que le DOM de
       témoin n'existe : sans ce réglage, aucune relecture périodique ne part jamais sous `bun test`. */
    environmentManager.setIsServer(() => false);
    try {
      const { deps, paths } = scripted(() => healthy());
      await open(deps, '/admin/monitoring', BIGBOSS, 40);
      const opened = healthPaths(paths).length;
      expect(opened).toBeGreaterThan(0);

      expect(await until(() => healthPaths(paths).length > opened)).toBe(true);

      setVisibility('hidden');
      await wait(30);
      const atHide = healthPaths(paths).length;
      await wait(200);
      expect(healthPaths(paths).length).toBe(atHide);

      setVisibility('visible');
      expect(await until(() => healthPaths(paths).length > atHide)).toBe(true);
    } finally {
      Reflect.deleteProperty(document, 'visibilityState');
      environmentManager.setIsServer(() => true);
    }
  });

  test('sans cadence injectée, la relecture est de trente secondes : aucune requête de plus dans le témoin', async () => {
    const { deps, paths } = scripted(() => healthy());
    await open(deps);
    await wait(80);

    expect(healthPaths(paths)).toHaveLength(1);
  });

  test('le cache d’abord : la dernière mesure s’affiche à l’instant, sans squelette', async () => {
    const { deps } = scripted(() => new Promise<ApiResult<unknown>>(() => undefined));
    const host = await open(deps);

    expect(host.querySelector('[data-admin-monitoring-skeleton]')).not.toBeNull();
    expect(host.querySelector('[data-admin-stat="gateway-uptime"]')).toBeNull();
  });
});

describe('les états dessinés', () => {
  test('une erreur se dit et se RÉESSAIE', async () => {
    let failing = true;
    const { deps, paths } = scripted(() => (failing ? { ok: false, status: 500, error: 'panne' } : healthy()));
    const host = await open(deps);

    expect(host.querySelector('[data-admin-error]')).not.toBeNull();
    failing = false;
    await mounter.click(host.querySelector('[data-admin-error] [data-admin-retry]'));
    await mounter.settle();

    expect(healthPaths(paths)).toHaveLength(2);
    expect(host.querySelector('[data-admin-error]')).toBeNull();
    expect(host.querySelector('[data-admin-stat="gateway-uptime"]')).not.toBeNull();
  });

  test('une charge illisible est une erreur — jamais un écran de zéros', async () => {
    const { deps } = scripted(() => ({ ok: true, status: 200, data: null }));
    const host = await open(deps);

    expect(host.querySelector('[data-admin-error]')).not.toBeNull();
    expect(host.querySelector('[data-admin-stat]')).toBeNull();
  });

  test('un refus (403) du bloc se dit comme un refus, pas comme une panne', async () => {
    const { deps } = scripted(() => ({ ok: false, status: 403, error: 'interdit' }));
    const host = await open(deps);

    expect(host.querySelector('[data-admin-denied-inline]')).not.toBeNull();
    expect(host.querySelector('[data-admin-error]')).toBeNull();
  });

  test('une relecture qui échoue garde la dernière mesure et le dit', async () => {
    let failing = false;
    const { deps } = scripted(() => (failing ? { ok: false, status: 500, error: 'panne' } : healthy()));
    const host = await open(deps);

    failing = true;
    await mounter.click(host.querySelector('[data-admin-action="refresh"]'));
    await mounter.settle();

    expect(host.querySelector('[data-admin-stat="gateway-uptime"]')).not.toBeNull();
    expect(host.textContent).toContain('La mise à jour a échoué');
  });
});

describe('la porte — fail-closed : la permission ET le rang', () => {
  test('un AUDIT passe `canViewAnalytics` mais n’a pas le rang : le refus unique, aucune requête', async () => {
    const { deps, paths } = scripted(() => healthy());
    const host = await open(deps, '/admin/monitoring', adminIdentityFixture({ role: 'AUDIT' }));

    expect(host.textContent).toContain('Espace réservé');
    expect(host.querySelector('[data-admin-monitoring]')).toBeNull();
    expect(paths).toEqual([]);
  });

  test('un MODERATOR ne voit pas la supervision non plus', async () => {
    const { deps, paths } = scripted(() => healthy());
    const host = await open(deps, '/admin/monitoring', adminIdentityFixture({ role: 'MODERATOR' }));

    expect(host.textContent).toContain('Espace réservé');
    expect(paths).toEqual([]);
  });

  test('un ADMIN, qui a le rang, l’ouvre — dans l’espace /adm aussi', async () => {
    const { deps } = scripted(() => healthy());
    const host = await open(deps, '/adm/monitoring', adminIdentityFixture({ role: 'ADMIN' }));

    expect(host.querySelector('[data-admin-monitoring]')).not.toBeNull();
  });

  test('sans la capacité `canViewAnalytics`, même le rang ne suffit pas', async () => {
    const { deps, paths } = scripted(() => healthy());
    const host = await open(deps, '/admin/monitoring', adminIdentityFixture({ role: 'ADMIN', permissions: { canViewAnalytics: false } }));

    expect(host.textContent).toContain('Espace réservé');
    expect(paths).toEqual([]);
  });
});
