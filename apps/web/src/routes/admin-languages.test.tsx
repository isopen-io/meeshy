import { act } from 'react';
import { describe, expect, test } from 'bun:test';

import { PAYLOADS, pendingGateway, statsGateway } from '@/lib/admin/analytics-fixtures';
import { adminDayLabel } from '@/lib/admin/interpret/time';
import type { AdminDeps } from '@/lib/api/admin';
import { languagesKeys } from '@/lib/api/admin-languages';
import { appQueryClient } from '@/lib/api/query-client';
import { createRouter, navigate } from '@/lib/router';
import { adminIdentityFixture, expectNoRawIdentifiers } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';

import { AdminLanguagesPanel } from './admin-languages';

const { mount, mounter } = setupAdminKitTests({ languages: ['fr', 'en'] });

/** Le contenu de TOUS les messages et de toutes les traductions (#6919) : les statistiques ne l'appellent jamais. */
const FORBIDDEN_PATHS: readonly string[] = ['/api/v1/admin/messages', '/api/v1/admin/translations'];

const BIGBOSS = adminIdentityFixture({ role: 'BIGBOSS' });
const STILL_LOADING = '[data-admin-stat-state="loading"], [data-admin-chart-skeleton]';

const routerFor = (deps: AdminDeps, language: 'fr' | 'en') =>
  createRouter(
    { probe: { pattern: '/probe', screen: async () => ({ default: () => <AdminLanguagesPanel language={language} deps={deps} /> }) } },
    () => <p>absent</p>,
  ).Router;

async function openPanel(url: string, deps: AdminDeps, language: 'fr' | 'en' = 'fr', options: { readonly settled?: boolean } = {}): Promise<HTMLDivElement> {
  navigate(url, true);
  const Router = routerFor(deps, language);
  const host = await mount(<Router wrap={(children) => children} skeleton={null} />, BIGBOSS);
  for (let attempt = 0; attempt < 20 && host.querySelector('[data-admin-languages]') === null; attempt += 1) await mounter.settle();
  for (let attempt = 0; attempt < 20 && options.settled !== false && host.querySelector(STILL_LOADING) !== null; attempt += 1) await mounter.settle();
  await mounter.settle();
  return host;
}

const stat = (host: Element, anchor: string): string => host.querySelector(`[data-admin-stat="${anchor}"]`)?.textContent ?? '';
const chart = (host: Element, id: string) => host.querySelector(`[data-admin-chart="${id}"]`);
const chip = (host: Element, value: string) => host.querySelector<HTMLButtonElement>(`[data-admin-chip="${value}"]`);
const percent = (ratio: number) => new Intl.NumberFormat('fr', { style: 'percent' }).format(ratio);
const fr = new Intl.NumberFormat('fr');

const tableRows = (host: Element, id: string): readonly (readonly string[])[] =>
  [...(host.querySelector(`[data-admin-static-table="${id}"] table`)?.querySelectorAll('tbody tr') ?? [])].map((row) => [...row.children].map((cell) => cell.textContent ?? ''));

const showTable = async (host: Element, id: string): Promise<readonly (readonly string[])[]> => {
  await act(async () => chart(host, id)?.querySelector<HTMLButtonElement>('[data-admin-action="chart-table"]')?.click());
  return [...(chart(host, id)?.querySelectorAll('tbody tr') ?? [])].map((row) => [...row.children].map((cell) => cell.textContent ?? ''));
};

describe('Langues et traductions — les langues écrites', () => {
  test('rend les totaux servis, la langue la plus écrite NOMMÉE, et ce que chaque total signifie', async () => {
    const host = await openPanel('/probe', statsGateway().deps);

    expect(host.querySelector('h1')?.textContent).toBe('Langues et traductions');
    expect(stat(host, 'messages-analysed')).toContain(fr.format(1000));
    expect(stat(host, 'messages-analysed')).toContain('Somme des 3 langues affichées');
    expect(stat(host, 'languages-written')).toContain('3');
    expect(stat(host, 'languages-written')).toContain('Toutes les langues écrites sur la période');
    expect(stat(host, 'top-language')).toContain('Français');
    expect(stat(host, 'top-language')).toContain(`${percent(0.7)} des messages affichés`);
  });

  test('quand la liste atteint la limite, le total dit qu’elle est tronquée', async () => {
    const many = Array.from({ length: 10 }, (_, index) => ({ language: ['fr', 'en', 'es', 'de', 'it', 'pt', 'ar', 'ja', 'ko', 'ru'][index], messageCount: 10 - index, userCount: 1, percentage: 10 }));
    const { deps } = statsGateway({ '/api/v1/admin/languages/stats': { ok: true, data: { ...(PAYLOADS['/api/v1/admin/languages/stats'] as object), topLanguages: many, totalLanguages: 10 } } });
    const host = await openPanel('/probe', deps);

    expect(stat(host, 'languages-written')).toContain('Limité aux 10 langues les plus écrites');
  });

  test('les langues sont NOMMÉES dans la langue d’interface — jamais un code', async () => {
    const fr_ = await openPanel('/probe', statsGateway().deps);
    expect(tableRows(fr_, 'languages').map((row) => row[0])).toEqual(['Français', 'Anglais', 'Espagnol']);
    mounter.unmountAll();

    const en = await openPanel('/probe', statsGateway().deps, 'en');
    expect(tableRows(en, 'languages').map((row) => row[0])).toEqual(['French', 'English', 'Spanish']);
  });

  test('le détail par langue : messages, auteurs, part servie en 0–100', async () => {
    const host = await openPanel('/probe', statsGateway().deps);

    expect(tableRows(host, 'languages')[0]?.slice(0, 4)).toEqual(['Français', '700', '40', percent(0.7)]);
    expect(tableRows(host, 'languages')[1]?.slice(0, 4)).toEqual(['Anglais', '250', '25', percent(0.25)]);
  });

  test('la croissance se lit au signe ET au glyphe ; +100 % est expliqué (langue nouvelle ou volume doublé)', async () => {
    const host = await openPanel('/probe', statsGateway().deps);

    const growth = (index: number) => host.querySelectorAll('[data-admin-static-table="languages"] table tbody tr')[index]?.lastElementChild;
    expect(growth(0)?.textContent).toMatch(/\+\s?12/);
    expect(growth(1)?.textContent).toMatch(/\+\s?100/);
    expect(growth(2)?.textContent).toMatch(/[-−]\s?8/);
    expect(growth(2)?.querySelector('svg')).not.toBeNull();
    expect(host.querySelector('[data-admin-stats-section="language-detail"]')?.textContent).toContain('langue nouvelle');
    expect(host.querySelector('[data-admin-stats-section="language-detail"]')?.textContent).toContain('volume doublé');
  });

  test('une croissance absente se dit « — », pas « 0 % »', async () => {
    const { deps } = statsGateway({ '/api/v1/admin/languages/stats': { ok: true, data: { ...(PAYLOADS['/api/v1/admin/languages/stats'] as object), growth: {} } } });
    const host = await openPanel('/probe', deps);

    expect(tableRows(host, 'languages')[0]?.[4]).toBe('—');
  });

  test('la répartition par langue est un graphique nommé, avec sa synthèse et son tableau', async () => {
    const host = await openPanel('/probe', statsGateway().deps);

    expect(chart(host, 'language-share')?.querySelector('figcaption')?.textContent).toContain(`Français : ${percent(0.7)} des messages`);
    expect((await showTable(host, 'language-share')).map((row) => row[0])).toEqual(['Français', 'Anglais', 'Espagnol']);
  });

  test('les comptes par langue d’interface sont nommés et triés', async () => {
    const host = await openPanel('/probe', statsGateway().deps);

    expect((await showTable(host, 'language-users')).map((row) => row.slice(0, 2))).toEqual([
      ['Français', '40'],
      ['Anglais', '25'],
      ['Portugais', '3'],
    ]);
  });
});

describe('les DEUX échelles de confiance', () => {
  test('les paires de la période sont servies en PART (0–1) : 0,93 se lit « 93 % » ; zéro se lit « Non mesurée »', async () => {
    const host = await openPanel('/probe', statsGateway().deps);

    expect(tableRows(host, 'pairs')).toEqual([
      ['français → anglais', '250', percent(0.93)],
      ['anglais → français', '120', 'Non mesurée'],
    ]);
  });

  test('la précision est servie en POURCENTAGE (0–100) : 93 se lit « 93 % », pas « 9 300 % » ; la qualité se lit en mot', async () => {
    const host = await openPanel('/probe', statsGateway().deps);

    expect(tableRows(host, 'accuracy')).toEqual([
      ['français → anglais', '250', percent(0.93), 'Excellente'],
      ['anglais → français', '120', 'Non mesurée', 'Non mesurée'],
      ['espagnol → français', '10', percent(0.62), 'Moyenne'],
    ]);
    expect(host.textContent).not.toContain('9 300');
  });

  test('la même confiance servie dans les deux échelles se lit pareil', async () => {
    const same = statsGateway({
      '/api/v1/admin/languages/stats': { ok: true, data: { ...(PAYLOADS['/api/v1/admin/languages/stats'] as object), languagePairs: [{ from: 'fr', to: 'en', translationCount: 5, avgConfidence: 0.87 }] } },
      '/api/v1/admin/languages/translation-accuracy': { ok: true, data: [{ from: 'fr', to: 'en', avgConfidence: 87, translationCount: 5, quality: 'good' }] },
    });
    const host = await openPanel('/probe', same.deps);

    expect(tableRows(host, 'pairs')[0]?.[2]).toBe(tableRows(host, 'accuracy')[0]?.[2]);
  });

  test('la précision dit sur quelle période elle porte : toutes', async () => {
    const host = await openPanel('/probe', statsGateway().deps);
    expect(host.querySelector('[data-admin-stats-section="language-accuracy"]')?.textContent).toContain('toutes périodes confondues');
  });
});

describe('la chronologie — les langues principales, puis « Autres »', () => {
  test('garde les trois langues de plus fort total et somme le reste ; les jours sont de vraies dates', async () => {
    const host = await openPanel('/probe', statsGateway().deps);

    const table = chart(host, 'language-timeline');
    await act(async () => table?.querySelector<HTMLButtonElement>('[data-admin-action="chart-table"]')?.click());
    expect([...(table?.querySelectorAll('thead th') ?? [])].map((cell) => cell.textContent)).toEqual(['Libellé', 'Français', 'Anglais', 'Espagnol', 'Autres langues']);
    const rows = [...(table?.querySelectorAll('tbody tr') ?? [])].map((row) => [...row.children].map((cell) => cell.textContent ?? ''));
    expect(rows[0]).toEqual([adminDayLabel('2026-09-28', 'fr'), '10', '5', '2', '2']);
    expect(rows[2]).toEqual([adminDayLabel('2026-09-30', 'fr'), '9', '4', '0', '1']);
    expect(table?.querySelector('figcaption')?.textContent).toContain('Français domine : 27 messages sur la période');
  });

  test('ses clés sont dynamiques : une langue que personne n’a prévue se nomme quand même', async () => {
    const { deps } = statsGateway({ '/api/v1/admin/languages/timeline': { ok: true, data: [{ date: '2026-09-29', ar: 4 }, { date: '2026-09-30', ar: 6 }] } });
    const host = await openPanel('/probe', deps);

    expect(chart(host, 'language-timeline')?.querySelector('figcaption')?.textContent).toContain('Arabe domine : 10 messages');
  });
});

describe('la période vit dans l’adresse', () => {
  test('par défaut : 30 jours pour les langues ET pour la chronologie ; aucun contenu de message ni de traduction (#6919)', async () => {
    const gateway = statsGateway();
    await openPanel('/probe', gateway.deps);

    expect(new Set(gateway.paths())).toEqual(
      new Set([
        '/api/v1/admin/languages/stats?period=30d&limit=10',
        '/api/v1/admin/languages/timeline?period=30d',
        '/api/v1/admin/languages/translation-accuracy?limit=10',
      ]),
    );
    for (const forbidden of FORBIDDEN_PATHS) expect(gateway.paths().map((path) => path.split('?')[0])).not.toContain(forbidden);
  });

  test('« 7 jours » écrit ?period=7d en place et relit les langues ET la chronologie', async () => {
    const gateway = statsGateway();
    const host = await openPanel('/probe', gateway.deps);
    const avant = window.history.length;

    await mounter.click(chip(host, '7d'));

    expect(window.location.search).toBe('?period=7d');
    expect(window.history.length).toBe(avant);
    expect(gateway.paths()).toContain('/api/v1/admin/languages/stats?period=7d&limit=10');
    expect(gateway.paths()).toContain('/api/v1/admin/languages/timeline?period=7d');
  });

  test('90 jours : la chronologie n’existe que sur 7 et 30 jours — la fenêtre réelle (30 jours) est écrite', async () => {
    const gateway = statsGateway();
    const host = await openPanel('/probe?period=90d', gateway.deps);

    expect(gateway.paths()).toContain('/api/v1/admin/languages/stats?period=90d&limit=10');
    expect(gateway.paths()).toContain('/api/v1/admin/languages/timeline?period=30d');
    expect(host.querySelector('[data-admin-stats-section="language-overview"]')?.textContent).toContain('Période : 90 derniers jours');
    expect(host.querySelector('[data-admin-stats-section="language-timeline"]')?.textContent).toContain('Période : 30 derniers jours');
  });

  test('une période inconnue de l’adresse retombe sur 30 jours', async () => {
    const gateway = statsGateway();
    await openPanel('/probe?period=hier', gateway.deps);
    expect(gateway.paths()).toContain('/api/v1/admin/languages/stats?period=30d&limit=10');
  });
});

describe('les états', () => {
  test('squelette quand rien n’est en cache', async () => {
    const host = await openPanel('/probe', pendingGateway(), 'fr', { settled: false });

    expect(host.querySelector('[data-admin-stat-state="loading"]')).not.toBeNull();
    expect(chart(host, 'language-timeline')?.querySelector('[data-admin-chart-skeleton]')).not.toBeNull();
  });

  test('cache-first : des données en cache s’affichent sans squelette', async () => {
    appQueryClient.setQueryData(languagesKeys.stats('30d', 10), {
      languages: [{ code: 'fr', messageCount: 5, userCount: 1, percentage: 100, growth: null }],
      pairs: [],
      usersByLanguage: [],
      totalMessages: 5,
      totalLanguages: 1,
    });
    const host = await openPanel('/probe', pendingGateway(), 'fr', { settled: false });

    expect(stat(host, 'top-language')).toContain('Français');
    expect(host.querySelector('[data-admin-stat="top-language"]')?.getAttribute('data-admin-stat-state')).toBeNull();
  });

  test('aucune langue sur la période : un état vide qui le dit, les comptes par langue continuent de servir', async () => {
    const { deps } = statsGateway({
      '/api/v1/admin/languages/stats': { ok: true, data: { ...(PAYLOADS['/api/v1/admin/languages/stats'] as object), topLanguages: [], languagePairs: [], totalMessages: 0, totalLanguages: 0 } },
    });
    const host = await openPanel('/probe', deps);

    expect(host.querySelector('[data-admin-empty]')?.textContent).toContain('Aucune langue écrite sur cette période');
    expect(chart(host, 'language-users')?.querySelector('[data-admin-chart-body]')).not.toBeNull();
    expect(host.querySelector('[data-admin-stats-section="language-pairs"]')?.textContent).toContain('Aucune traduction sur cette période.');
  });

  test('erreur des langues : une erreur par groupe, « Réessayer » relance ; la précision continue de servir', async () => {
    let served = false;
    const gateway = statsGateway({
      '/api/v1/admin/languages/stats': () => {
        if (served) return { ok: true, data: PAYLOADS['/api/v1/admin/languages/stats'] };
        served = true;
        return { ok: false, status: 500, error: 'boom' };
      },
    });
    const host = await openPanel('/probe', gateway.deps);

    const overview = host.querySelector('[data-admin-stats-section="language-overview"]');
    expect(overview?.querySelectorAll('[data-admin-error]')).toHaveLength(1);
    expect(tableRows(host, 'accuracy')).toHaveLength(3);

    await mounter.click(overview?.querySelector<HTMLButtonElement>('[data-admin-retry]') ?? null);
    expect(stat(host, 'top-language')).toContain('Français');
  });

  test('une charge refusée (403) est un refus en place', async () => {
    const { deps } = statsGateway({ '/api/v1/admin/languages/translation-accuracy': { ok: false, status: 403, error: 'Forbidden' } });
    const host = await openPanel('/probe', deps);

    expect(host.querySelector('[data-admin-stats-section="language-accuracy"] [data-admin-denied-inline]')).not.toBeNull();
    expect(stat(host, 'top-language')).toContain('Français');
  });

  test('aucune traduction mesurée : le dit', async () => {
    const { deps } = statsGateway({ '/api/v1/admin/languages/translation-accuracy': { ok: true, data: [] } });
    const host = await openPanel('/probe', deps);

    expect(host.querySelector('[data-admin-stats-section="language-accuracy"]')?.textContent).toContain('Aucune traduction mesurée.');
  });

  test('aucun code de langue brut, aucun identifiant, aucune énumération brute', async () => {
    const host = await openPanel('/probe', statsGateway().deps);

    expectNoRawIdentifiers(host);
    expect(host.textContent).not.toContain('unknown');
    expect(host.textContent).not.toContain('excellent');
  });

  test('chaque graphique a sa synthèse et « Voir les données »', async () => {
    const host = await openPanel('/probe', statsGateway().deps);

    for (const id of ['language-share', 'language-users', 'language-timeline']) {
      expect(chart(host, id)?.querySelector('figcaption')?.textContent?.length).toBeGreaterThan(5);
      expect(chart(host, id)?.querySelector('[data-admin-action="chart-table"]')).not.toBeNull();
    }
  });

  test('les clés de requête restent sous admin : jamais persistées', async () => {
    await openPanel('/probe', statsGateway().deps);
    const heads = appQueryClient.getQueryCache().getAll().map((query) => `${query.queryKey[0]}/${query.queryKey[1]}`);
    expect(heads.filter((head) => head !== 'admin/lang' && head !== 'admin/permissions')).toEqual([]);
  });
});
