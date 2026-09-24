import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { appQueryClient } from '@/lib/api/query-client';
import { loadAdminInterfaceCatalog, translateAdmin } from '@/lib/i18n-admin-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { pathOf, queryOf, routedTransport } from '@/test-support/admin-member';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { AdminUserActivityPanel } from './admin-user-activity';

/**
 * **L'ONGLET ACTIVITÉ** (#7845) — un contenu masqué se DIT masqué, et le refus
 * d'une section n'éteint pas les autres.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadAdminInterfaceCatalog('fr');
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


async function monter() {
  const { transport } = routedTransport((req) => {
    const chemin = pathOf(req);
    if (chemin.endsWith('/reported-messages')) {
      const offset = Number(queryOf(req).get('offset') ?? '0');
      const ligne = { id: offset === 0 ? 'r1' : 'r2', reportType: 'spam', reason: 'Pub', status: 'under_review', message: { id: 'm1', content: null } };
      return { ok: true, data: [ligne], pagination: { total: 40, offset, limit: 20, hasMore: offset === 0 } } as never;
    }
    if (chemin.endsWith('/reports')) return { ok: false, status: 403, error: 'Forbidden' };
    if (chemin.endsWith('/activity')) {
      return {
        ok: true,
        data: {
          shareLinks: [{ id: 'l1', name: 'Invitation atelier', currentUses: 3, maxUses: 10, isActive: true }],
          trackingLinks: [],
          affiliateTokens: [],
          contacts: { sent: [{ id: 'f1', status: 'pending', receiver: { id: 'u2', username: 'alice', displayName: 'Alice' } }], received: [] },
        },
      };
    }
    return undefined;
  });
  return mounter.mount(
    <QueryClientProvider client={appQueryClient}>
      <AdminUserActivityPanel userId="u-membre" language="fr" deps={{ source: 'gateway', transport }} />
    </QueryClientProvider>,
  );
}

describe('l’activité d’un membre', () => {
  test('un message signalé au contenu MASQUÉ le dit', async () => {
    const host = await monter();
    expect(host.querySelector('[data-admin-activity="r1"]')?.textContent ?? '').toContain(translateAdmin('fr', 'admin.activity.hiddenContent'));
  });

  test('le refus des signalements émis n’éteint ni les liens ni les demandes d’amis', async () => {
    const host = await monter();
    expect(host.querySelector('[data-collapsible-section="admin-reports-made"] [data-admin-absence]')).not.toBe(null);
    expect(host.querySelector('[data-admin-activity="l1"]')?.textContent ?? '').toContain('3 / 10');
    expect(host.querySelector('[data-admin-activity="f1"]')?.textContent ?? '').toContain('Alice');
  });

  test('les valeurs servies se DISENT — ni `under_review`, ni une flèche pour « envoyée »', async () => {
    const host = await monter();
    const signalement = host.querySelector('[data-admin-activity="r1"]')?.textContent ?? '';
    expect(signalement).toContain(translateAdmin('fr', 'admin.status.underReview'));
    expect(signalement).not.toContain('under_review');
    const demande = host.querySelector('[data-admin-activity="f1"]')?.textContent ?? '';
    expect(demande).toContain(translateAdmin('fr', 'admin.activity.sentTo', { name: 'Alice (@alice)' }));
    expect(demande).not.toContain('→');
  });

  test('la pagination revient en arrière : la première page reste atteignable', async () => {
    const host = await monter();
    const section = () => host.querySelector('[data-collapsible-section="admin-reported-messages"]') as HTMLElement;
    await mounter.click(section().querySelector('[data-admin-page="next"]') as HTMLElement | null);
    expect(section().querySelector('[data-admin-activity="r2"]')).not.toBe(null);
    await mounter.click(section().querySelector('[data-admin-page="previous"]') as HTMLElement | null);
    expect(section().querySelector('[data-admin-activity="r1"]')).not.toBe(null);
  });
});
