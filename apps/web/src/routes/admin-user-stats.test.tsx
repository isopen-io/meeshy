import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { appQueryClient } from '@/lib/api/query-client';
import { loadAdminInterfaceCatalog, translateAdmin } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { createActMounter } from '@/test-support/act-mount';
import { pathOf, routedTransport } from '@/test-support/admin-member';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { AdminUserStatsPanel } from './admin-user-stats';

/**
 * **LES TUILES DE STATISTIQUES** (#7845 C) — un nombre se lit dans la LANGUE de
 * la page. « 12345 » brut est la valeur servie, donc un témoin qui comparerait
 * au chiffre servi passerait sur un écran qui ne formate rien : on compare deux
 * langues dont le groupement DIFFÈRE.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadAdminInterfaceCatalog('fr');
  await loadAdminInterfaceCatalog('en');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => {
  mounter.unmountAll();
  appQueryClient.clear();
});

const STATS = {
  userId: 'u-membre',
  computedAt: '2026-09-24T10:00:00.000Z',
  counts: {
    messagesSent: 12345,
    conversations: 42,
    messageReactions: 3,
    postReactions: 4,
    commentReactions: 5,
    friendRequestsSent: 6,
    reportsOnMessages: 8,
    bansTotal: 2,
  },
  languages: ['fr', 'en'],
};

async function monter(language: InterfaceLanguage, reponse: unknown = { ok: true, data: STATS }) {
  const { transport } = routedTransport((req) => (pathOf(req).endsWith('/stats') ? (reponse as never) : undefined));
  return mounter.mount(
    <QueryClientProvider client={appQueryClient}>
      <AdminUserStatsPanel userId="u-membre" language={language} deps={{ source: 'gateway', transport }} />
    </QueryClientProvider>,
  );
}

const tuile = (host: HTMLElement, id: string) => host.querySelector(`[data-admin-stat="${id}"]`);

describe('une tuile se lit dans la langue de la page', () => {
  test('français : groupement par espace', async () => {
    const host = await monter('fr');
    const valeur = tuile(host, 'messagesSent')?.querySelector('dd')?.textContent ?? '';
    expect(valeur).toBe(new Intl.NumberFormat('fr').format(12345));
    expect(valeur).not.toBe('12345');
  });

  test('anglais : groupement par virgule', async () => {
    const host = await monter('en');
    expect(tuile(host, 'messagesSent')?.querySelector('dd')?.textContent).toBe('12,345');
  });

  test('le libellé est le TERME de la définition, le chiffre sa définition', async () => {
    const host = await monter('fr');
    const carte = tuile(host, 'messagesSent');
    expect(carte?.closest('dl')).not.toBe(null);
    expect(carte?.querySelector('dt')?.textContent).toBe(translateAdmin('fr', 'admin.stats.messages'));
  });

  test('le reste se DÉPLIE, et les réactions aux messages, publications ET commentaires y font UNE tuile', async () => {
    const host = await monter('fr');
    expect(tuile(host, 'reactions')).toBe(null);
    await mounter.click(host.querySelector('[data-collapsible-toggle="admin-stats-more"]') as HTMLElement | null);
    expect(tuile(host, 'reactions')?.querySelector('dd')?.textContent).toBe('12');
    expect(tuile(host, 'friendRequestsSent')?.querySelector('dd')?.textContent).toBe('6');
    expect(tuile(host, 'reportsOnMessages')?.querySelector('dd')?.textContent).toBe('8');
    expect(tuile(host, 'reportsOnMessages')?.querySelector('dt')?.textContent).toBe(
      translateAdmin('fr', 'admin.stats.reportsOnMessages'),
    );
  });

  test('un signalement RETENU par la passerelle se lit « — » et se dit « non communiqué », jamais 0', async () => {
    const host = await monter('fr', {
      ok: true,
      data: { ...STATS, counts: { ...STATS.counts, reportsReceived: null, reportsMade: null, reportsOnMessages: null } },
    });
    await mounter.click(host.querySelector('[data-collapsible-toggle="admin-stats-more"]') as HTMLElement | null);
    for (const id of ['reportsReceived', 'reportsMade', 'reportsOnMessages']) {
      const carte = tuile(host, id);
      expect(carte?.querySelector('dd')?.textContent).toBe('—');
      expect(carte?.querySelector('dd')?.getAttribute('aria-label')).toBe(translateAdmin('fr', 'admin.stats.withheld'));
    }
  });

  test('un compteur non servi vaut zéro, jamais une case vide', async () => {
    const host = await monter('fr');
    expect(tuile(host, 'friends')?.querySelector('dd')?.textContent).toBe('0');
  });
});

describe('une panne n’est pas un zéro', () => {
  test('un refus dit « indisponible », sans tuile à zéro', async () => {
    const host = await monter('fr', { ok: false, status: 500, error: 'boom' });
    expect(tuile(host, 'messagesSent')).toBe(null);
    expect(host.textContent ?? '').toContain(translateAdmin('fr', 'admin.stats.unavailable'));
  });
});
