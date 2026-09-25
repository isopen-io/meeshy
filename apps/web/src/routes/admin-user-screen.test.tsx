import { QueryClientProvider } from '@tanstack/react-query';
import { act, useState } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { AdminUserDetail } from '@/lib/api/admin-user-detail';
import type { HttpRequest } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';
import { loadAdminInterfaceCatalog, translateAdmin } from '@/lib/i18n-admin-catalog';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { adminMember, pathOf, routedTransport } from '@/test-support/admin-member';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { AdminUserWorkspace } from './admin-user';
import type { AdminUserTab } from '@/lib/admin/user-tabs';

/**
 * **LA FICHE D'UN MEMBRE, EN DEUX COLONNES ET NEUF ONGLETS** (#7845, #7873).
 *
 * Ce qui se mesure ici : la disposition déclarée, le motif ARIA des onglets et
 * leur parcours clavier, et surtout **qu'un onglet ne monte QUE sa section** —
 * le témoin compte les requêtes parties : une fiche qui monterait tout d'un
 * coup lirait préférences, sessions et conversations pour un administrateur
 * venu vérifier une adresse e-mail.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadAdminInterfaceCatalog('fr');
  await loadInterfaceCatalog('fr');
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

function transport() {
  return routedTransport((req: HttpRequest) => {
    const chemin = pathOf(req);
    const pagines = ['/media', '/conversations', '/sessions', '/security-events', '/communities', '/reports', '/reported-messages'];
    if (pagines.some((fin) => chemin.endsWith(fin))) {
      return { ok: true, data: [], pagination: { total: 0, offset: 0, limit: 20, hasMore: false } } as never;
    }
    if (chemin.endsWith('/stats')) return { ok: true, data: { counts: { messagesSent: 5 }, languages: [] } };
    if (chemin.endsWith('/preferences')) return { ok: true, data: { userId: 'u-membre', categories: {} } };
    if (chemin.endsWith('/bans')) return { ok: true, data: [] };
    if (chemin.endsWith('/activity')) return { ok: true, data: { shareLinks: [], trackingLinks: [], affiliateTokens: [], contacts: { sent: [], received: [] } } };
    if (chemin.endsWith('/voice-profile')) return { ok: true, data: { voiceProfile: null, consents: {} } };
    return undefined;
  });
}

/** L'hôte TIENT l'onglet, comme l'écran le tient dans l'adresse. */
function Hote({ membre, deps }: { readonly membre: AdminUserDetail; readonly deps: { readonly source: 'gateway'; readonly transport: ReturnType<typeof transport>['transport'] } }) {
  const [tab, setTab] = useState<AdminUserTab>('profile');
  return <AdminUserWorkspace membre={membre} language="fr" tab={tab} onTab={setTab} deps={deps} />;
}

async function monter(membre = adminMember()) {
  const t = transport();
  const host = await mounter.mount(
    <QueryClientProvider client={appQueryClient}>
      <Hote membre={membre} deps={{ source: 'gateway', transport: t.transport }} />
    </QueryClientProvider>,
  );
  return { host, calls: t.calls };
}

const lus = (calls: () => readonly HttpRequest[], fin: string) => calls().filter((c) => pathOf(c).endsWith(fin)).length;
const onglet = (host: HTMLElement, tab: AdminUserTab) => host.querySelector(`[data-admin-user-tab="${tab}"]`) as HTMLElement | null;

describe('la disposition', () => {
  test('deux colonnes déclarées : l’identité à part, les onglets à côté', async () => {
    const { host } = await monter();
    const racine = host.querySelector('[data-admin-user-layout="split"]');
    expect(racine?.className ?? '').toContain('xl:grid-cols-');
    expect(racine?.className ?? '').not.toContain('lg:grid-cols-');
    expect(racine?.querySelector('[data-admin-user-aside] [data-admin-user-hero]')).not.toBe(null);
    expect(racine?.querySelector('[data-admin-user-aside] [data-admin-carousel]')).not.toBe(null);
    expect(racine?.querySelector('[data-admin-user-aside] [data-admin-stats]')).not.toBe(null);
    expect(racine?.querySelector('[data-admin-user-aside] [data-admin-user-tabs]')).toBe(null);
  });

  test('sous `xl`, les onglets viennent juste après l’identité et les gestes — pas à mille pixels', async () => {
    const { host } = await monter();
    const rang = (id: string) => {
      const classes = host.querySelector(`[data-admin-user-order="${id}"]`)?.className ?? '';
      return Number(/(?:^|\s)order-(\d+)/.exec(classes)?.[1] ?? 'NaN');
    };
    expect(host.querySelector('[data-admin-user-aside]')?.className ?? '').toMatch(/(^|\s)contents(\s|$)/);
    expect(rang('hero')).toBeLessThan(rang('tabs'));
    expect(rang('actions')).toBeLessThan(rang('tabs'));
    expect(rang('tabs')).toBeLessThan(rang('carousel'));
    expect(rang('tabs')).toBeLessThan(rang('stats'));
  });

  test('le profil lit la date de naissance À PART, sous une clé qui ne touche pas le disque', async () => {
    const { calls } = await monter();
    expect(calls().filter((c) => pathOf(c) === '/api/v1/admin/users/u-membre')).toHaveLength(1);
    const cles = appQueryClient.getQueryCache().getAll().map((q) => q.queryKey);
    expect(cles.some((k) => k[0] === 'admin-souverain' && k.includes('private'))).toBe(true);
  });

  test('le profil est l’onglet par défaut, et il montre les métadonnées', async () => {
    const { host } = await monter(adminMember({ consents: { voiceProfile: null, voiceData: null, dataProcessing: '2026-03-03T10:00:00.000Z', analytics: null, voiceCloning: null } }));
    expect(host.querySelector('[data-admin-user-profile]')).not.toBe(null);
    expect(host.querySelector('[data-admin-user-field="names"] dd')?.textContent).toBe('Léa Martin');
    expect(host.querySelector('[data-admin-user-field="systemLanguage"] dd')?.textContent).toBe('de');
    const consentement = host.querySelector('[data-admin-user-field="consent-dataProcessing"] dd')?.textContent ?? '';
    expect(consentement).not.toBe('—');
    expect(consentement).not.toContain('T10:00');
  });

  test('aucun horodatage ISO brut sur la fiche', async () => {
    const { host } = await monter();
    expect(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(host.textContent ?? '')).toBe(false);
  });
});

describe('les onglets', () => {
  test('le motif ARIA : une liste d’onglets, un sélectionné, un panneau qui le nomme', async () => {
    const { host } = await monter();
    const liste = host.querySelector('[role="tablist"]');
    expect([...(liste?.querySelectorAll('[role="tab"]') ?? [])].map((t) => t.getAttribute('data-admin-user-tab'))).toEqual([
      'profile',
      'conversations',
      'media',
      'contacts',
      'communities',
      'voice',
      'preferences',
      'security',
      'reports',
    ]);
    expect(liste?.getAttribute('aria-label')).toBe(translateAdmin('fr', 'admin.tab.label'));
    expect(onglet(host, 'profile')?.getAttribute('aria-selected')).toBe('true');
    expect(onglet(host, 'profile')?.tabIndex).toBe(0);
    expect(onglet(host, 'media')?.tabIndex).toBe(-1);
    const panneau = host.querySelector('[role="tabpanel"]');
    expect(panneau?.getAttribute('aria-labelledby')).toBe(onglet(host, 'profile')?.id ?? 'absent');
  });

  test('les flèches du clavier passent d’un onglet à l’autre, et bouclent', async () => {
    const { host } = await monter();
    const liste = host.querySelector('[role="tablist"]') as HTMLElement;
    const presser = async (key: string) => {
      await act(async () => {
        liste.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      });
      await mounter.settle();
    };
    await presser('ArrowRight');
    expect(onglet(host, 'conversations')?.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(onglet(host, 'conversations'));
    await presser('End');
    expect(onglet(host, 'reports')?.getAttribute('aria-selected')).toBe('true');
    await presser('ArrowRight');
    expect(onglet(host, 'profile')?.getAttribute('aria-selected')).toBe('true');
    await presser('ArrowLeft');
    expect(onglet(host, 'reports')?.getAttribute('aria-selected')).toBe('true');
  });

  test('un onglet ne monte QUE sa section — rien n’est lu avant d’être ouvert', async () => {
    const { host, calls } = await monter();
    expect(lus(calls, '/preferences')).toBe(0);
    expect(lus(calls, '/conversations')).toBe(0);
    expect(lus(calls, '/sessions')).toBe(0);

    await mounter.click(onglet(host, 'preferences'));
    expect(lus(calls, '/preferences')).toBe(1);
    expect(lus(calls, '/conversations')).toBe(0);
    expect(host.querySelector('[data-admin-user-profile]')).toBe(null);

    await mounter.click(onglet(host, 'conversations'));
    expect(lus(calls, '/conversations')).toBe(1);
    expect(lus(calls, '/sessions')).toBe(0);

    await mounter.click(onglet(host, 'security'));
    expect(lus(calls, '/sessions')).toBe(1);
  });

  test('chaque onglet du dossier lit SA route, et seulement à son ouverture', async () => {
    const { host, calls } = await monter();
    const routes = ['/activity', '/communities', '/voice-profile', '/reported-messages', '/reports'] as const;
    expect(routes.map((fin) => lus(calls, fin))).toEqual([0, 0, 0, 0, 0]);

    await mounter.click(onglet(host, 'contacts'));
    expect(host.querySelector('[data-admin-contacts-panel]')).not.toBe(null);
    expect(routes.map((fin) => lus(calls, fin))).toEqual([1, 0, 0, 0, 0]);

    await mounter.click(onglet(host, 'communities'));
    expect(host.querySelector('[data-admin-communities]')).not.toBe(null);
    expect(lus(calls, '/communities')).toBe(1);

    await mounter.click(onglet(host, 'voice'));
    expect(host.querySelector('[data-admin-voice]')).not.toBe(null);
    expect(lus(calls, '/voice-profile')).toBe(1);

    await mounter.click(onglet(host, 'reports'));
    expect(host.querySelector('[data-admin-reports-panel]')).not.toBe(null);
    expect([lus(calls, '/reported-messages'), lus(calls, '/reports')]).toEqual([1, 1]);
  });

  test('les communautés d’un membre vivent sous une clé qui ne touche pas le disque', async () => {
    const { host } = await monter();
    await mounter.click(onglet(host, 'communities'));
    const cles = appQueryClient.getQueryCache().getAll().map((q) => q.queryKey);
    const de = (morceau: string) => cles.filter((k) => k.includes(morceau));
    expect(de('communities').every((k) => k[0] === 'admin-souverain')).toBe(true);
    expect(de('communities').length).toBeGreaterThan(0);
  });

  test('l’onglet Médias ne relit pas la page que le carrousel a déjà lue', async () => {
    const { host, calls } = await monter();
    expect(lus(calls, '/media')).toBe(1);
    await mounter.click(onglet(host, 'media'));
    expect(lus(calls, '/media')).toBe(1);
  });
});

describe('l’état du compte se voit sur la carte', () => {
  test('SUPPRIMÉ quand la passerelle l’affirme', async () => {
    const { host } = await monter(adminMember({ isActive: false, deletedAt: '2026-09-01T00:00:00.000Z' }));
    expect(host.querySelector('[data-admin-user-chip="state"]')?.textContent).toBe(translateAdmin('fr', 'admin.user.deleted'));
  });

  test('DÉSACTIVÉ sinon — jamais « supprimé » sur la seule foi de isActive', async () => {
    const { host } = await monter(adminMember({ isActive: false }));
    expect(host.querySelector('[data-admin-user-chip="state"]')?.textContent).toBe(translateAdmin('fr', 'admin.users.inactive'));
  });

  test('la DATE de désactivation se lit sur le compte, en clair', async () => {
    const { host } = await monter(adminMember({ isActive: false, deactivatedAt: '2026-09-02T08:30:00.000Z' }));
    const ligne = host.querySelector('[data-admin-user-field="deactivated"]');
    expect(ligne).not.toBe(null);
    expect(ligne?.querySelector('dt')?.textContent).toBe(translateAdmin('fr', 'admin.user.deactivated'));
    expect(ligne?.querySelector('dd')?.textContent ?? '').not.toContain('T08:30');
    expect(ligne?.querySelector('dd')?.textContent ?? '').not.toBe('—');
  });

  test('un compte jamais désactivé n’a pas de ligne de désactivation', async () => {
    const { host } = await monter();
    expect(host.querySelector('[data-admin-user-field="deactivated"]')).toBe(null);
  });

  test('un compte actif ne porte aucune puce d’état', async () => {
    const { host } = await monter();
    expect(host.querySelector('[data-admin-user-chip="state"]')).toBe(null);
  });

  test('la complétude du profil est une barre BORNÉE, annoncée avec sa valeur', async () => {
    const { host } = await monter(adminMember({ profileCompletionRate: 72 }));
    const barre = host.querySelector('[role="progressbar"]');
    expect(barre?.getAttribute('aria-valuenow')).toBe('72');
    expect(barre?.getAttribute('aria-valuemax')).toBe('100');
  });

  test('complétude non servie : AUCUNE barre, jamais un zéro', async () => {
    const { host } = await monter();
    expect(host.querySelector('[role="progressbar"]')).toBe(null);
  });
});

describe('les gestes de la fiche restent là', () => {
  test('modifier, sécurité, mot de passe, bannir', async () => {
    const { host } = await monter();
    const libelles = [...(host.querySelector('[data-admin-user-actions]')?.querySelectorAll('button') ?? [])].map((b) => b.textContent);
    expect(libelles).toEqual([
      translateAdmin('fr', 'admin.edit.open'),
      translateAdmin('fr', 'admin.account.open'),
      translateAdmin('fr', 'admin.password.title'),
      translateAdmin('fr', 'admin.ban.open'),
    ]);
  });
});
