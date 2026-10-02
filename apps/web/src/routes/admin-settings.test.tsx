import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';
import { act } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { AdminSectionScreen } from '@/components/admin/section-screen';
import { readSidebarFolded } from '@/lib/admin/admin-space';
import { CAPABILITY_KEYS } from '@/lib/admin/settings-access';
import { visibleAdminSections } from '@/lib/admin/sections';
import type { AdminDeps } from '@/lib/api/admin';
import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { appQueryClient } from '@/lib/api/query-client';
import { createRouter, navigate } from '@/lib/router';
import { adminIdentityFixture, expectNoRawIdentifiers } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';

import { AdminSettingsPanel } from './admin-settings';

/**
 * **LES RÉGLAGES D'ADMINISTRATION** (#8876, #6732) — trois blocs, chacun avec un effet :
 * votre accès (capacités dites en mots), le recalcul des compteurs du tableau de bord
 * (POST + invalidation + annonce, absent sans `canManageNotifications`), et la bascule du
 * menu latéral replié.
 */

const { mount, mounter } = setupAdminKitTests({ languages: ['fr', 'en'] });
const BIGBOSS = adminIdentityFixture({ role: 'BIGBOSS' });
const FOLDED_KEY = 'meeshy.admin.sidebar.folded';

type Handler = (request: HttpRequest) => ApiResult<unknown> | Promise<ApiResult<unknown>>;

function scripted(reply: Handler = () => ({ ok: true, status: 200, data: undefined })): { readonly deps: AdminDeps; readonly requests: HttpRequest[] } {
  const requests: HttpRequest[] = [];
  const transport = {
    request: async (request: HttpRequest) => {
      requests.push(request);
      return reply(request);
    },
  } as unknown as HttpTransport;
  return { deps: { source: 'gateway', transport }, requests };
}

function Screen({ deps }: { readonly deps: AdminDeps }) {
  return (
    <AdminSectionScreen section="settings" language="fr" title="Réglages">
      {(reach) => <AdminSettingsPanel language="fr" reach={reach} deps={deps} />}
    </AdminSectionScreen>
  );
}

async function open(deps: AdminDeps, identity = BIGBOSS, url = '/admin/settings') {
  const { Router } = createRouter(
    {
      adminSettings: { pattern: '/admin/settings', screen: async () => ({ default: () => <Screen deps={deps} /> }) },
      admSettings: { pattern: '/adm/settings', screen: async () => ({ default: () => <Screen deps={deps} /> }) },
    },
    () => <p>absent</p>,
  );
  navigate(url, true);
  const host = await mount(<Router wrap={(children) => children} skeleton={null} />, identity);
  for (let attempt = 0; attempt < 30 && host.querySelector('[data-admin-settings]') === null && host.textContent?.includes('Espace réservé') !== true; attempt += 1) {
    await mounter.settle();
  }
  await mounter.settle();
  return host;
}

const clearStorage = () => {
  try {
    globalThis.localStorage?.removeItem(FOLDED_KEY);
  } catch {
    /* rien à nettoyer */
  }
};

beforeAll(async () => {
  await loadInterfaceCatalog('en');
});
beforeEach(clearStorage);
afterEach(clearStorage);

const capability = (host: ParentNode, key: string) => host.querySelector<HTMLElement>(`[data-admin-capability="${key}"]`);
const squashed = (text: string | null | undefined) => (text ?? '').replace(/ | /g, ' ');

describe('votre accès — le rôle et les dix capacités, dits en mots', () => {
  test('le rôle est nommé et expliqué : « Créateur », jamais BIGBOSS', async () => {
    const { deps } = scripted();
    const host = await open(deps);

    const role = host.querySelector('[data-admin-meta="role"]')?.textContent ?? '';
    expect(role).toContain('Créateur');
    expect(role).toContain('Tous les droits, y compris les gestes souverains.');
    expectNoRawIdentifiers(host);
  });

  test('les dix capacités servies sont toutes dites, dans l’ordre, chacune avec son libellé et son explication', async () => {
    const { deps } = scripted();
    const host = await open(deps);

    expect([...host.querySelectorAll('[data-admin-capability]')].map((row) => row.getAttribute('data-admin-capability'))).toEqual([...CAPABILITY_KEYS]);
    expect(capability(host, 'canManageUsers')?.textContent).toContain('Gérer les comptes');
    expect(capability(host, 'canManageUsers')?.textContent).toContain('Lire la fiche des membres');
    expect(capability(host, 'canViewAuditLogs')?.textContent).toContain('Lire le journal d’audit');
  });

  test('BIGBOSS : tout est « Accordée »', async () => {
    const { deps } = scripted();
    const host = await open(deps);

    const granted = [...host.querySelectorAll('[data-admin-capability]')].map((row) => row.getAttribute('data-admin-granted'));
    expect(granted).toEqual(CAPABILITY_KEYS.map(() => 'yes'));
    expect(capability(host, 'canManageUsers')?.textContent).toContain('Accordée');
  });

  test('ce qu’une capacité accordée OUVRE est lu dans le registre : les sections que le lecteur atteint vraiment', async () => {
    const { deps } = scripted();
    const host = await open(deps);
    const reached = visibleAdminSections(BIGBOSS.permissions, BIGBOSS.role);
    const labels = reached.filter((section) => section.permission === 'canManageUsers').map((section) => section.id);

    expect(labels).toContain('users');
    const opens = squashed(capability(host, 'canManageUsers')?.querySelector('[data-admin-capability-opens]')?.textContent);
    expect(opens.startsWith('Ouvre : ')).toBe(true);
    expect(opens).toContain('Comptes');
    expect(opens).toContain('Anonymes');
  });

  test('une capacité qu’aucune section ne demande le dit : « N’ouvre aucune section à elle seule. »', async () => {
    const { deps } = scripted();
    const host = await open(deps);

    expect(squashed(capability(host, 'canManageTranslations')?.querySelector('[data-admin-capability-opens]')?.textContent)).toBe(
      'N’ouvre aucune section à elle seule.',
    );
  });

  test('ADMIN : le journal d’audit est « Non accordée », et dit ce qu’il ouvrirait — pourquoi on ne le voit pas', async () => {
    const { deps } = scripted();
    const host = await open(deps, adminIdentityFixture({ role: 'ADMIN' }));

    const audit = capability(host, 'canViewAuditLogs');
    expect(audit?.getAttribute('data-admin-granted')).toBe('no');
    expect(audit?.textContent).toContain('Non accordée');
    expect(squashed(audit?.querySelector('[data-admin-capability-opens]')?.textContent)).toBe('Ouvrirait : Journal d’audit');
    expect(host.querySelector('[data-admin-meta="role"]')?.textContent).toContain('Administrateur');
  });

  test('MODERATOR entre dans les réglages : sa capacité d’entrée est accordée, pas celle des comptes', async () => {
    const { deps } = scripted();
    const host = await open(deps, adminIdentityFixture({ role: 'MODERATOR' }));

    expect(capability(host, 'canAccessAdmin')?.getAttribute('data-admin-granted')).toBe('yes');
    expect(capability(host, 'canModerateContent')?.getAttribute('data-admin-granted')).toBe('yes');
    expect(capability(host, 'canManageUsers')?.getAttribute('data-admin-granted')).toBe('no');
  });

  test('la langue d’interface est suivie : les libellés et les badges', async () => {
    const { deps } = scripted();
    const { Router } = createRouter(
      { adminSettings: { pattern: '/admin/settings', screen: async () => ({ default: () => <AdminSectionScreen section="settings" language="en" title="Settings">{(reach) => <AdminSettingsPanel language="en" reach={reach} deps={deps} />}</AdminSectionScreen> }) } },
      () => <p>absent</p>,
    );
    navigate('/admin/settings', true);
    const host = await mount(<Router wrap={(children) => children} skeleton={null} />, BIGBOSS);
    for (let attempt = 0; attempt < 30 && host.querySelector('[data-admin-settings]') === null; attempt += 1) await mounter.settle();

    expect(capability(host, 'canManageUsers')?.textContent).toContain('Manage accounts');
    expect(capability(host, 'canManageUsers')?.textContent).toContain('Granted');
  });
});

describe('les gestes du créateur — seulement au rang souverain', () => {
  test('BIGBOSS voit les six gestes que son rang ouvre', async () => {
    const { deps } = scripted();
    const host = await open(deps);

    expect([...host.querySelectorAll('[data-admin-sovereign-gesture]')].map((item) => item.getAttribute('data-admin-sovereign-gesture'))).toEqual([
      'readMessages',
      'listConversations',
      'revealLink',
      'consents',
      'agentModel',
      'agentReset',
    ]);
    expect(host.querySelector('[data-admin-sovereign-gestures]')?.textContent).toContain('Révéler l’adresse secrète d’un lien de partage');
    expect(host.querySelector('[data-admin-sovereign-gestures]')?.textContent).toContain('Changer le modèle de l’agent');
  });

  test('ADMIN n’a pas le rang souverain : le bloc n’est pas dessiné', async () => {
    const { deps } = scripted();
    const host = await open(deps, adminIdentityFixture({ role: 'ADMIN' }));

    expect(host.querySelector('[data-admin-fiche-section="settings-sovereign"]')).toBeNull();
    expect(host.querySelector('[data-admin-sovereign-gesture]')).toBeNull();
  });
});

describe('compteurs du tableau de bord — « Recalculer maintenant »', () => {
  const seedDashboard = () => {
    appQueryClient.setQueryData(['admin', 'dash', 'kpis'], { total: 3 });
    appQueryClient.setQueryData(['admin', 'dashboard'], { totalUsers: 12 });
    appQueryClient.setQueryData(['admin', 'users', 'offset=0'], { rows: [] });
  };
  const invalidated = (key: readonly unknown[]) => appQueryClient.getQueryState(key)?.isInvalidated === true;

  test('le bloc est là pour qui porte canManageNotifications', async () => {
    const { deps } = scripted();
    const host = await open(deps);

    expect(host.querySelector('[data-admin-fiche-section="settings-dashboard"]')).not.toBeNull();
    expect(host.querySelector('[data-admin-action="recompute-dashboard"]')?.textContent).toContain('Recalculer maintenant');
  });

  test('sans canManageNotifications, le bloc n’est pas dessiné et rien ne peut partir', async () => {
    const { deps, requests } = scripted();
    const host = await open(deps, adminIdentityFixture({ role: 'MODERATOR' }));

    expect(host.querySelector('[data-admin-fiche-section="settings-dashboard"]')).toBeNull();
    expect(host.querySelector('[data-admin-action="recompute-dashboard"]')).toBeNull();
    expect(requests).toEqual([]);
  });

  test('le geste POST sur l’adresse du catalogue, relit les deux familles du tableau de bord et l’annonce', async () => {
    seedDashboard();
    const { deps, requests } = scripted();
    const host = await open(deps);

    await mounter.click(host.querySelector<HTMLElement>('[data-admin-action="recompute-dashboard"]'));

    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe('POST');
    expect(requests[0]?.path).toBe(adminEndpoints.dashboardInvalidateCache);
    expect(invalidated(['admin', 'dash', 'kpis'])).toBe(true);
    expect(invalidated(['admin', 'dashboard'])).toBe(true);
    expect(invalidated(['admin', 'users', 'offset=0'])).toBe(false);
    expect(host.querySelector('[data-admin-announcement]')?.textContent).toBe('Compteurs recalculés');
    expect(host.querySelector('[data-admin-dashboard-done]')?.textContent).toBe('Compteurs recalculés');
  });

  test('pendant le recalcul, le bouton est désactivé et le dit ; il se libère ensuite', async () => {
    let release: (result: ApiResult<unknown>) => void = () => undefined;
    const pending = new Promise<ApiResult<unknown>>((resolve) => {
      release = resolve;
    });
    const { deps } = scripted(() => pending);
    const host = await open(deps);

    const button = () => host.querySelector<HTMLButtonElement>('[data-admin-action="recompute-dashboard"]');
    await act(async () => {
      button()?.click();
    });
    expect(button()?.disabled).toBe(true);
    expect(button()?.textContent).toContain('Recalcul en cours…');

    await act(async () => {
      release({ ok: true, status: 200, data: undefined });
    });
    await mounter.settle();
    expect(button()?.disabled).toBe(false);
    expect(button()?.textContent).toContain('Recalculer maintenant');
  });

  test('un refus de la passerelle se dit en mots, l’annonce en alerte, et rien n’est invalidé', async () => {
    seedDashboard();
    const { deps } = scripted(() => ({ ok: false, status: 403, error: 'Forbidden' }));
    const host = await open(deps);

    await mounter.click(host.querySelector<HTMLElement>('[data-admin-action="recompute-dashboard"]'));

    expect(host.querySelector('[data-admin-fiche-section="settings-dashboard"] [data-admin-notice="danger"]')?.textContent).toContain('Vous n’avez pas le droit d’effectuer ce geste.');
    expect(host.querySelector('[data-admin-announcement]')?.textContent).toContain('Vous n’avez pas le droit');
    expect(invalidated(['admin', 'dashboard'])).toBe(false);
    expect(host.querySelector('[data-admin-dashboard-done]')).toBeNull();
  });

  test('une coupure réseau se dit aussi, sans jargon', async () => {
    const { deps } = scripted(() => ({ ok: false, status: 0, error: '' }));
    const host = await open(deps);

    await mounter.click(host.querySelector<HTMLElement>('[data-admin-action="recompute-dashboard"]'));

    expect(host.querySelector('[data-admin-fiche-section="settings-dashboard"] [data-admin-notice="danger"]')?.textContent).toContain('Le réseau a échoué');
  });

  test('hors ligne, le bouton est désactivé et rien ne part', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    try {
      const { deps, requests } = scripted();
      const host = await open(deps);

      const button = host.querySelector<HTMLButtonElement>('[data-admin-action="recompute-dashboard"]');
      expect(button?.disabled).toBe(true);
      await mounter.click(button);
      expect(requests).toEqual([]);
    } finally {
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    }
  });
});

describe('espace d’administration — « Menu latéral replié par défaut »', () => {
  const toggle = (host: ParentNode) => host.querySelector<HTMLElement>('[data-admin-action="toggle-folded-sidebar"]');

  test('la bascule part de la préférence retenue par ce navigateur : déployée par défaut', async () => {
    const { deps } = scripted();
    const host = await open(deps);

    expect(toggle(host)?.getAttribute('role')).toBe('switch');
    expect(toggle(host)?.getAttribute('aria-checked')).toBe('false');
    expect(toggle(host)?.textContent).toContain('Menu latéral replié par défaut');
  });

  test('une préférence déjà retenue est relue', async () => {
    globalThis.localStorage.setItem(FOLDED_KEY, '1');
    const { deps } = scripted();
    const host = await open(deps);

    expect(toggle(host)?.getAttribute('aria-checked')).toBe('true');
  });

  test('basculer ÉCRIT la préférence — celle que le menu lira — et l’annonce ; rebasculer la défait', async () => {
    const { deps } = scripted();
    const host = await open(deps);

    await mounter.click(toggle(host));
    expect(toggle(host)?.getAttribute('aria-checked')).toBe('true');
    expect(readSidebarFolded()).toBe(true);
    expect(host.querySelector('[data-admin-announcement]')?.textContent).toBe('Le menu démarrera replié');

    await mounter.click(toggle(host));
    expect(toggle(host)?.getAttribute('aria-checked')).toBe('false');
    expect(readSidebarFolded()).toBe(false);
    expect(host.querySelector('[data-admin-announcement]')?.textContent).toBe('Le menu démarrera déployé');
  });

  test('l’explication dit que la préférence est propre au navigateur et s’applique à la prochaine ouverture', async () => {
    const { deps } = scripted();
    const host = await open(deps);

    const hint = host.querySelector('[data-admin-fiche-section="settings-space"] p')?.textContent ?? '';
    expect(hint).toContain('propre à ce navigateur');
    expect(hint).toContain('prochaine ouverture');
    expect(toggle(host)?.getAttribute('aria-describedby')).toBe(host.querySelector('[data-admin-fiche-section="settings-space"] p')?.id);
  });

  test('la bascule ne dépend d’aucune capacité : ANALYST-like sans canManageNotifications la voit', async () => {
    const { deps } = scripted();
    const host = await open(deps, adminIdentityFixture({ role: 'MODERATOR' }));

    expect(toggle(host)).not.toBeNull();
  });
});

describe('aucune « configuration de la plateforme »', () => {
  test('trois blocs seulement : accès, compteurs, espace — et aucune adresse de lecture de réglages', async () => {
    const { deps, requests } = scripted();
    const host = await open(deps);

    expect([...host.querySelectorAll('[data-admin-fiche-section]')].map((block) => block.getAttribute('data-admin-fiche-section'))).toEqual([
      'settings-access',
      'settings-sovereign',
      'settings-dashboard',
      'settings-space',
    ]);
    expect(requests).toEqual([]);
  });
});

describe('qui entre dans les réglages — canAccessAdmin', () => {
  test('sans canAccessAdmin (ANALYST), le refus unique', async () => {
    const { deps } = scripted();
    const host = await open(deps, adminIdentityFixture({ role: 'ANALYST' }));

    expect(host.querySelector('[data-admin-settings]')).toBeNull();
    expect(host.textContent).toContain('Espace réservé');
  });

  test('les réglages se lisent dans l’espace /adm comme dans /admin', async () => {
    const { deps } = scripted();
    const host = await open(deps, BIGBOSS, '/adm/settings');

    expect(host.querySelector('[data-admin-settings]')).not.toBeNull();
  });

  test('l’en-tête : titre, phrase, fil d’Ariane', async () => {
    const { deps } = scripted();
    const host = await open(deps);

    expect(host.querySelector('[data-admin-page-title]')?.textContent).toBe('Réglages');
    expect(host.querySelector('[data-admin-page-header] p')?.textContent).toContain('Votre accès');
    expect(host.querySelector('[data-admin-page-header] nav')?.textContent).toContain('Plateforme');
  });
});
