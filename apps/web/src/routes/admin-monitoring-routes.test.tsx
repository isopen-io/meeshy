import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';
import { act } from 'react';
import { describe, expect, test } from 'bun:test';

import { AdminSectionScreen } from '@/components/admin/section-screen';
import {
  BLIND_SPOTS,
  ROUTE,
  servedMonitoring,
  servedRouteUsage,
  servedUsageEntry,
  servedWatched,
} from '@/lib/admin/monitoring-fixtures';
import type { AdminDeps } from '@/lib/api/admin';
import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { createRouter, navigate } from '@/lib/router';
import { typeInto } from '@/test-support/act-mount';
import { adminIdentityFixture, expectNoRawIdentifiers } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';

import { AdminMonitoringPanel } from './admin-monitoring';

/**
 * **LA SUPERVISION — USAGE DES ROUTES** (#8876, #6734) — la mesure qui décide d'un
 * retrait : verdicts qui disent ce qu'un zéro vaut, plateformes et versions nommées,
 * angles morts traduits, filtres dans l'adresse, et les états dessinés.
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

const usage = (overrides: Record<string, unknown> = {}): ApiResult<unknown> => ({ ok: true, status: 200, data: servedRouteUsage(overrides) });

const routeReply = (path: string): Reply =>
  path === adminEndpoints.monitoring ? { ok: true, status: 200, data: servedMonitoring() } : usage();

function Screen({ deps }: { readonly deps: AdminDeps }) {
  return (
    <AdminSectionScreen section="monitoring" language="fr" title="Supervision">
      {() => <AdminMonitoringPanel language="fr" deps={deps} now={() => NOW} />}
    </AdminSectionScreen>
  );
}

async function open(deps: AdminDeps, url = '/admin/monitoring?tab=routes', identity = BIGBOSS) {
  const { Router } = createRouter(
    {
      adminMonitoring: { pattern: '/admin/monitoring', screen: async () => ({ default: () => <Screen deps={deps} /> }) },
      admMonitoring: { pattern: '/adm/monitoring', screen: async () => ({ default: () => <Screen deps={deps} /> }) },
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

const usagePaths = (paths: readonly string[]) => paths.filter((path) => path.startsWith(`${adminEndpoints.routeUsage}?`));
const normalized = (text: string) => text.replace(/[  ]/g, ' ');
const tableRows = (host: ParentNode, anchor: string) => [...host.querySelectorAll(`[data-admin-usage-table="${anchor}"] tbody [data-admin-row]`)];
const rowText = (row: Element | undefined) => normalized(row?.textContent ?? '');
const select = (host: ParentNode, id: string) => host.querySelector<HTMLSelectElement>(`[data-admin-filter="${id}"]`);

const DEFAULT_PATH = `${adminEndpoints.routeUsage}?scope=watched&limit=100`;

describe('l’usage des routes — ouverture', () => {
  test('l’onglet s’ouvre par l’adresse : seule SA lecture part — la santé n’est pas montée', async () => {
    const { deps, paths } = scripted(routeReply);
    const host = await open(deps);

    expect(host.querySelector('[data-admin-tab="routes"]')?.getAttribute('aria-selected')).toBe('true');
    expect(paths).toEqual([DEFAULT_PATH]);
    expect(host.querySelector('[data-admin-monitoring-health]') === null).toBe(true);
  });

  test('l’observation : depuis quand, pendant combien de temps, sur quelle fenêtre — en durées, jamais en millisecondes', async () => {
    const { deps } = scripted(routeReply);
    const host = await open(deps);

    const since = normalized(host.querySelector('[data-admin-stat="routes-observing-since"]')?.textContent ?? '');
    expect(since).toContain('29 sept. 2026');
    expect(since).toContain('hier');
    expect(normalized(host.querySelector('[data-admin-stat="routes-observed-for"]')?.textContent ?? '')).toContain('1 j 4 h');
    expect(normalized(host.querySelector('[data-admin-stat="routes-window"]')?.textContent ?? '')).toContain('1 j');
    expect(host.textContent).not.toContain('100800000');
  });

  test('aucun identifiant, aucun ISO, aucune énumération brute dans l’écran', async () => {
    const { deps } = scripted(routeReply);
    const host = await open(deps);

    expectNoRawIdentifiers(host);
  });
});

describe('les routes surveillées — un verdict qui dit ce qu’un zéro vaut', () => {
  test('quatre routes, quatre verdicts : jamais appelée, encore appelée, introuvable, non vérifiée', async () => {
    const { deps } = scripted(routeReply);
    const host = await open(deps);

    const rows = tableRows(host, 'watched');
    expect(rows).toHaveLength(4);
    expect(rowText(rows[0])).toContain('Jamais appelée');
    expect(rowText(rows[1])).toContain('Encore appelée');
    expect(rowText(rows[2])).toContain('Adresse introuvable');
    expect(rowText(rows[3])).toContain('Non vérifiée');
    expect(rows[2]?.querySelector('[data-admin-raw="unmounted"]') === null).toBe(false);
  });

  test('une adresse qui n’est plus montée dit que son zéro ne prouve rien — pas un faux vert', async () => {
    const { deps } = scripted(routeReply);
    const host = await open(deps);

    expect(rowText(tableRows(host, 'watched')[2])).toContain('son zéro ne prouve rien sur ses appelants');
  });

  test('chaque ligne dit la méthode, la route, le compte et le dernier appel relatif', async () => {
    const { deps } = scripted(routeReply);
    const host = await open(deps);

    const legacy = rowText(tableRows(host, 'watched')[1]);
    for (const expected of ['GET', ROUTE.used, '37', 'il y a 2 minutes']) expect(legacy).toContain(expected);
    expect(rowText(tableRows(host, 'watched')[0])).toContain('Jamais');
  });

  test('l’issue liée ouvre l’issue NUMÉROTÉE, dans un nouvel onglet', async () => {
    const { deps } = scripted(routeReply);
    const host = await open(deps);

    const link = host.querySelector('[data-admin-issue-link="4182"]');
    expect(link?.getAttribute('href')).toBe('https://github.com/isopen-io/meeshy/issues/4182');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link?.textContent).toContain('Issue n° 4182');
  });

  test('une route sans issue n’a pas de lien mort', async () => {
    const { deps } = scripted(() => usage({ watched: [servedWatched({ issue: 0 })] }));
    const host = await open(deps);

    expect(host.querySelector('[data-admin-issue-link]') === null).toBe(true);
  });

  test('aucune route surveillée : l’état vide se dit', async () => {
    const { deps } = scripted(() => usage({ watched: [] }));
    const host = await open(deps);

    expect(host.querySelector('[data-admin-monitoring-section="watched"] [data-admin-empty]')?.textContent).toContain('Aucune route surveillée ne correspond');
  });
});

describe('le détail par plateforme et version — des mots, pas des codes', () => {
  test('plateformes nommées, versions dites : Android sans version, script avec version illisible, total pour toutes', async () => {
    const { deps } = scripted(routeReply);
    const host = await open(deps);

    const rows = tableRows(host, 'entries');
    expect(rows).toHaveLength(3);
    expect(rowText(rows[0])).toContain('Toutes plateformes');
    expect(rowText(rows[0])).toContain('Toutes versions');
    expect(rowText(rows[1])).toContain('Android');
    expect(rowText(rows[1])).toContain('Non communiquée');
    expect(rowText(rows[2])).toContain('Script ou outil en ligne de commande');
    expect(rowText(rows[2])).toContain('Illisible');
  });

  test('une version lisible s’écrit telle quelle ; iOS se nomme', async () => {
    const { deps } = scripted(() => usage({ entries: [servedUsageEntry()] }));
    const host = await open(deps);

    expect(rowText(tableRows(host, 'entries')[0])).toContain('iPhone / iPad');
    expect(rowText(tableRows(host, 'entries')[0])).toContain('2.4.0');
  });

  test('aucun appel pour le filtre : l’état vide se dit', async () => {
    const { deps } = scripted(() => usage({ entries: [], entriesTotal: 0 }));
    const host = await open(deps);

    expect(host.querySelector('[data-admin-monitoring-section="entries"] [data-admin-empty]')?.textContent).toContain('Aucun appel observé pour ce filtre');
  });
});

describe('les angles morts — traduits, jamais le code servi', () => {
  test('les six limites de la mesure sont dites en français, avec leur phrase', async () => {
    const { deps } = scripted(routeReply);
    const host = await open(deps);

    const spots = [...host.querySelectorAll('[data-admin-blind-spot]')];
    expect(spots).toHaveLength(BLIND_SPOTS.length);
    expect(spots[0]?.textContent).toContain('Web et Android n’envoient pas leur version');
    expect(spots[0]?.textContent).toContain('Seul iOS annonce sa version');
    expect(spots[3]?.textContent).toContain('Temps réel non mesuré');
    expect(host.textContent).not.toContain('web-et-android-ne-posent-aucun-en-tete-de-version');
    expect(host.textContent).not.toContain('agregat-en-memoire');
  });
});

describe('les avis — avant tout chiffre', () => {
  test('une mesure non installée : « les zéros ne prouvent rien »', async () => {
    const { deps } = scripted(() => usage({ instrumented: false }));
    const host = await open(deps);

    expect(host.querySelector('[data-admin-notice="warning"]')?.textContent).toContain('La mesure n’est pas installée sur cette instance');
  });

  test('une mesure saturée : le nombre d’échantillons non ventilés, et les totaux restent exacts', async () => {
    const { deps } = scripted(() => usage({ saturated: true, droppedSamples: 1234 }));
    const host = await open(deps);

    const notice = normalized(host.querySelector('[data-admin-notice="warning"]')?.textContent ?? '');
    expect(notice).toContain('1 234 échantillons');
    expect(notice).toContain('Les totaux des routes surveillées restent exacts');
  });

  test('un détail tronqué : combien de lignes sur combien', async () => {
    const { deps } = scripted(() => usage({ entriesTruncated: true, entriesTotal: 1200 }));
    const host = await open(deps);

    expect(normalized(host.querySelector('[data-admin-notice="info"]')?.textContent ?? '')).toContain('3 lignes affichées sur 1 200');
  });

  test('une mesure saine : aucun avis', async () => {
    const { deps } = scripted(routeReply);
    const host = await open(deps);

    expect(host.querySelector('[data-admin-notice]') === null).toBe(true);
  });
});

describe('l’état vit dans l’adresse — sans perdre l’onglet', () => {
  test('une adresse complète pose la portée, la recherche et la taille, dans les contrôles et dans la requête', async () => {
    const { deps, paths } = scripted(routeReply);
    const host = await open(deps, '/admin/monitoring?tab=routes&scope=all&route=auth&limit=250');

    expect(usagePaths(paths)).toEqual([`${adminEndpoints.routeUsage}?scope=all&limit=250&route=auth`]);
    expect(select(host, 'scope')?.value).toBe('all');
    expect(select(host, 'limit')?.value).toBe('250');
    expect(host.querySelector<HTMLInputElement>('[data-admin-search]')?.value).toBe('auth');
  });

  test('une valeur inconnue retombe sur le défaut', async () => {
    const { deps, paths } = scripted(routeReply);
    await open(deps, '/admin/monitoring?tab=routes&scope=tout&limit=7');

    expect(usagePaths(paths)).toEqual([DEFAULT_PATH]);
  });

  test('changer la portée et la taille écrit l’adresse, garde l’onglet et relit la passerelle', async () => {
    const { deps, paths } = scripted(routeReply);
    const host = await open(deps);

    typeInto(select(host, 'scope'), 'all');
    await mounter.settle();
    typeInto(select(host, 'limit'), '500');
    await mounter.settle();

    expect(window.location.search).toBe('?tab=routes&scope=all&limit=500');
    expect(usagePaths(paths).at(-1)).toBe(`${adminEndpoints.routeUsage}?scope=all&limit=500`);
    expect(host.querySelector('[data-admin-tab="routes"]')?.getAttribute('aria-selected')).toBe('true');
  });

  test('la recherche d’une route attend la fin de la frappe, puis filtre la requête ET les routes surveillées', async () => {
    const { deps, paths } = scripted(routeReply);
    const host = await open(deps);

    typeInto(host.querySelector('[data-admin-search]'), 'users');
    expect(usagePaths(paths)).toHaveLength(1);
    await wait(320);
    await mounter.settle();

    expect(window.location.search).toBe('?tab=routes&route=users');
    expect(usagePaths(paths).at(-1)).toBe(`${adminEndpoints.routeUsage}?scope=watched&limit=100&route=users`);
    expect(tableRows(host, 'watched')).toHaveLength(1);
    expect(rowText(tableRows(host, 'watched')[0])).toContain(ROUTE.used);
  });

  test('une recherche qui ne retient aucune route surveillée le dit', async () => {
    const { deps } = scripted(routeReply);
    const host = await open(deps, '/admin/monitoring?tab=routes&route=zzz');

    expect(host.querySelector('[data-admin-monitoring-section="watched"] [data-admin-empty]')).not.toBeNull();
  });

  test('« Réinitialiser » n’existe que si quelque chose s’écarte du défaut, vide la recherche et garde l’onglet', async () => {
    const { deps } = scripted(routeReply);
    const host = await open(deps);
    expect(host.querySelector('[data-admin-list-reset]') === null).toBe(true);

    typeInto(select(host, 'scope'), 'all');
    await mounter.settle();
    expect(host.querySelector('[data-admin-list-reset]') === null).toBe(false);

    await mounter.click(host.querySelector('[data-admin-list-reset]'));
    await mounter.settle();

    expect(window.location.search).toBe('?tab=routes');
    expect(select(host, 'scope')?.value).toBe('watched');
    expect(host.querySelector<HTMLInputElement>('[data-admin-search]')?.value).toBe('');
    expect(host.querySelector('[data-admin-list-reset]') === null).toBe(true);
  });
});

describe('les onglets — chacun sa lecture, dans l’adresse', () => {
  test('passer à l’usage des routes écrit `?tab=routes` ; revenir à la santé le retire', async () => {
    const { deps, paths } = scripted(routeReply);
    const host = await open(deps, '/admin/monitoring');
    expect(paths).toEqual([adminEndpoints.monitoring]);

    await mounter.click(host.querySelector('[data-admin-tab="routes"]'));
    await mounter.settle();
    expect(window.location.search).toBe('?tab=routes');
    expect(usagePaths(paths)).toEqual([DEFAULT_PATH]);

    await mounter.click(host.querySelector('[data-admin-tab="health"]'));
    await mounter.settle();
    expect(window.location.search).toBe('');
    expect(host.querySelector('[data-admin-monitoring-panel]')?.getAttribute('data-admin-monitoring-panel')).toBe('health');
  });

  test('un onglet inconnu retombe sur la santé', async () => {
    const { deps, paths } = scripted(routeReply);
    await open(deps, '/admin/monitoring?tab=secret');

    expect(paths).toEqual([adminEndpoints.monitoring]);
  });
});

describe('les états dessinés', () => {
  test('en vol et sans cache : un squelette', async () => {
    const { deps } = scripted(() => new Promise<ApiResult<unknown>>(() => undefined));
    const host = await open(deps);

    expect(host.querySelector('[data-admin-monitoring-skeleton]') === null).toBe(false);
    expect(host.querySelector('[data-admin-route-usage]') === null).toBe(true);
  });

  test('une erreur se dit et se RÉESSAIE', async () => {
    let failing = true;
    const { deps, paths } = scripted(() => (failing ? { ok: false, status: 500, error: 'panne' } : usage()));
    const host = await open(deps);

    expect(host.querySelector('[data-admin-error]') === null).toBe(false);
    failing = false;
    await mounter.click(host.querySelector('[data-admin-error] [data-admin-retry]'));
    await mounter.settle();

    expect(usagePaths(paths)).toHaveLength(2);
    expect(host.querySelector('[data-admin-route-usage]') === null).toBe(false);
  });

  test('une charge illisible est une erreur, pas un tableau vide', async () => {
    const { deps } = scripted(() => ({ ok: true, status: 200, data: [] }));
    const host = await open(deps);

    expect(host.querySelector('[data-admin-error]') === null).toBe(false);
    expect(host.querySelector('[data-admin-route-usage]') === null).toBe(true);
  });

  test('un refus (403) se dit comme un refus', async () => {
    const { deps } = scripted(() => ({ ok: false, status: 403, error: 'interdit' }));
    const host = await open(deps);

    expect(host.querySelector('[data-admin-denied-inline]') === null).toBe(false);
    expect(host.querySelector('[data-admin-error]') === null).toBe(true);
  });

  test('« Actualiser » relit la passerelle', async () => {
    const { deps, paths } = scripted(routeReply);
    const host = await open(deps);

    await mounter.click(host.querySelector('[data-admin-action="refresh"]'));
    await mounter.settle();

    expect(usagePaths(paths)).toHaveLength(2);
  });
});

describe('la porte — la même que la santé : permission ET rang', () => {
  test('un AUDIT n’a pas le rang : le refus unique, aucune requête — y compris par l’adresse de l’onglet', async () => {
    const { deps, paths } = scripted(routeReply);
    const host = await open(deps, '/admin/monitoring?tab=routes', adminIdentityFixture({ role: 'AUDIT' }));

    expect(host.textContent).toContain('Espace réservé');
    expect(paths).toEqual([]);
  });

  test('un ADMIN l’ouvre', async () => {
    const { deps, paths } = scripted(routeReply);
    await open(deps, '/adm/monitoring?tab=routes', adminIdentityFixture({ role: 'ADMIN' }));

    expect(usagePaths(paths)).toEqual([DEFAULT_PATH]);
  });
});
