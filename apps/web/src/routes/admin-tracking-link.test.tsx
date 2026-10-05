import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';
import { act } from 'react';
import { describe, expect, test } from 'bun:test';

import { AdminSectionScreen } from '@/components/admin/section-screen';
import { OBJECT_ID, servedTrackingClick, servedTrackingLinkFiche, servedTrackingStats } from '@/lib/admin/tracking-link-fixtures';
import type { AdminDeps } from '@/lib/api/admin';
import { adminTrackingLinkKey } from '@/lib/api/admin-tracking-links';
import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';
import { createRouter, navigate } from '@/lib/router';
import { adminIdentityFixture, expectNoRawIdentifiers } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';
import { resultatServi } from '@/test-support/served-pagination';

import { AdminTrackingLinkPanel } from './admin-tracking-link';

/**
 * **LA FICHE D'UN LIEN DE SUIVI** (#8876, #6729) — la destination et l'adresse courte
 * (en texte, avec copie), la campagne, la cible nommée, ce que les clics rapportent
 * (courbe aux jours réels, pays nommés, appareils, redirections) et les vingt derniers
 * clics SANS IP, agent utilisateur ni empreinte. Le geste « Désactiver / Réactiver »
 * n'est dessiné qu'au rang d'administration.
 */

const { mount, mounter } = setupAdminKitTests();
const BIGBOSS = adminIdentityFixture({ role: 'BIGBOSS' });
const ADMIN = adminIdentityFixture({ role: 'ADMIN' });
const AUDIT = adminIdentityFixture({ role: 'AUDIT' });
const NOW = new Date('2026-09-30T12:00:00.000Z');
const LINK_ID = OBJECT_ID(1);

type Call = { readonly method: string; readonly path: string; readonly body?: unknown };

type Fake = {
  readonly deps: AdminDeps;
  readonly calls: Call[];
  readonly state: { link: Record<string, unknown> };
};

type Options = {
  readonly link?: Record<string, unknown>;
  readonly fail?: ApiResult<unknown>;
  readonly hold?: Promise<void>;
  readonly read?: () => ApiResult<unknown>;
};

function fakeServer(options: Options = {}): Fake {
  const state = { link: options.link ?? servedTrackingLinkFiche() };
  const calls: Call[] = [];

  const transport = {
    request: async (request: HttpRequest): Promise<ApiResult<unknown>> => {
      calls.push({ method: request.method, path: request.path, ...(request.body === undefined ? {} : { body: request.body }) });
      if (request.method === 'GET') return options.read?.() ?? resultatServi(state.link);
      await options.hold;
      if (options.fail !== undefined) return options.fail;
      const body = typeof request.body === 'object' && request.body !== null && 'isActive' in request.body ? request.body : { isActive: state.link.isActive };
      state.link = { ...state.link, isActive: body.isActive };
      return { ok: true, data: { id: LINK_ID, isActive: body.isActive }, status: 200 };
    },
  } as unknown as HttpTransport;

  return { deps: { source: 'gateway', transport }, calls, state };
}

function Screen({ deps }: { readonly deps: AdminDeps }) {
  return (
    <AdminSectionScreen section="trackingLinks" language="fr" title="Liens de suivi">
      {(reach) => <AdminTrackingLinkPanel language="fr" linkId={LINK_ID} reach={reach} deps={deps} now={() => NOW} />}
    </AdminSectionScreen>
  );
}

async function open(fake: Fake, identity = BIGBOSS) {
  const { Router } = createRouter(
    { adminTrackingLink: { pattern: '/admin/tracking-links/$link', screen: async () => ({ default: () => <Screen deps={fake.deps} /> }) } },
    () => <p>absent</p>,
  );
  navigate(`/admin/tracking-links/${LINK_ID}`, true);
  const host = await mount(<Router wrap={(children) => children} skeleton={null} />, identity);
  for (let attempt = 0; attempt < 30 && host.querySelector('[data-admin-tracking-link-fiche], [data-admin-error], [data-admin-empty], [data-admin-denied-inline]') === null; attempt += 1) {
    await mounter.settle();
  }
  await mounter.settle();
  return host;
}

const action = (host: ParentNode, name: string) => host.querySelector<HTMLButtonElement>(`[data-admin-identity] [data-admin-action="${name}"]`);
const offered = (host: ParentNode) => [...host.querySelectorAll('[data-admin-identity] [data-admin-action]')].map((button) => button.getAttribute('data-admin-action'));
const confirm = (host: ParentNode) => host.querySelector<HTMLButtonElement>('[data-admin-confirm] [data-admin-action="confirm"]');
const writes = (fake: Fake) => fake.calls.filter((call) => call.method !== 'GET');
const reads = (fake: Fake) => fake.calls.filter((call) => call.method === 'GET');
const badge = (host: ParentNode) => host.querySelector('[data-admin-identity] [data-admin-raw]')?.textContent ?? '';
const section = (host: ParentNode, id: string) => host.querySelector(`[data-admin-fiche-section="${id}"]`)?.textContent ?? '';
const announcement = (host: ParentNode) => host.querySelector('[data-admin-announcement]')?.textContent ?? '';
const chart = (host: ParentNode, id: string) => host.querySelector(`[data-admin-chart="${id}"]`);

const withClipboard = async (writeText: (text: string) => Promise<void>, body: () => Promise<void>) => {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  try {
    await body();
  } finally {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
  }
};

describe('la fiche — nommée, métadonnées interprétées', () => {
  test('le titre, l’adresse courte, l’état, les quatre chiffres : des mots, jamais un identifiant ni un ISO', async () => {
    const host = await open(fakeServer());

    const identity = host.querySelector('[data-admin-identity]')?.textContent ?? '';
    expect(identity).toContain('Lancement de rentrée');
    expect(identity).toContain('https://m.meeshy.me/l/Ab3xYz');
    expect(identity).toContain('Actif');
    const strip = (id: string) => (host.querySelector(`[data-admin-stat="${id}"]`)?.textContent ?? '').replace(/ | /g, ' ');
    expect(strip('clicks')).toContain('1 204');
    expect(strip('unique')).toContain('980');
    expect(strip('confirmed')).toContain('900');
    expect(strip('lastClick')).toContain('il y a 20 minutes');
    expectNoRawIdentifiers(host);
  });

  test('un lien sans nom se nomme par sa campagne, puis « Lien de suivi sans nom »', async () => {
    const byCampaign = await open(fakeServer({ link: servedTrackingLinkFiche({ name: null }) }));
    expect(byCampaign.querySelector('[data-admin-page-title]')?.textContent).toBe('rentree-2026');
    mounter.unmountAll();
    appQueryClient.clear();

    const anonymous = await open(fakeServer({ link: servedTrackingLinkFiche({ name: null, campaign: null }) }));
    expect(anonymous.querySelector('[data-admin-page-title]')?.textContent).toBe('Lien de suivi sans nom');
  });

  test('la destination et l’adresse courte sont du TEXTE, jamais un lien à ouvrir', async () => {
    const host = await open(fakeServer());

    expect(host.querySelector('[data-admin-address="original"]')?.textContent).toBe('https://exemple.test/rentree?ref=meeshy');
    expect(host.querySelector('[data-admin-address="short"]')?.textContent).toBe('https://m.meeshy.me/l/Ab3xYz');
    expect(host.querySelector('[data-admin-fiche-section="destination"] a')).toBeNull();
    expect(section(host, 'destination')).toContain('Là où arrivent les visiteurs.');
  });

  test('« Copier » écrit l’adresse dans le presse-papiers et l’annonce', async () => {
    const copied: string[] = [];
    await withClipboard(
      async (text) => {
        copied.push(text);
      },
      async () => {
        const host = await open(fakeServer());

        await mounter.click(host.querySelector<HTMLElement>('[data-admin-action="copy-short"]'));
        await mounter.click(host.querySelector<HTMLElement>('[data-admin-action="copy-original"]'));

        expect(copied).toEqual(['https://m.meeshy.me/l/Ab3xYz', 'https://exemple.test/rentree?ref=meeshy']);
        expect(announcement(host)).toBe('Adresse copiée');
      },
    );
  });

  test('une copie impossible se dit aussi', async () => {
    await withClipboard(
      async () => {
        throw new Error('refusé');
      },
      async () => {
        const host = await open(fakeServer());

        await mounter.click(host.querySelector<HTMLElement>('[data-admin-action="copy-short"]'));

        expect(announcement(host)).toBe('Copie impossible');
      },
    );
  });

  test('la campagne : trois métadonnées ; une valeur absente dit « Non renseigné »', async () => {
    const host = await open(fakeServer({ link: servedTrackingLinkFiche({ medium: null }) }));

    expect(host.querySelector('[data-admin-meta="campaign"]')?.textContent).toContain('rentree-2026');
    expect(host.querySelector('[data-admin-meta="source"]')?.textContent).toContain('newsletter');
    expect(host.querySelector('[data-admin-meta="medium"]')?.textContent).toContain('Non renseigné');
  });

  test('la cible est NOMMÉE : le genre, la publication visée, la conversation d’où le lien a été posé', async () => {
    const host = await open(fakeServer({ link: servedTrackingLinkFiche({ conversation: { id: OBJECT_ID(5), title: 'Les voisins' } }) }));

    const target = section(host, 'target');
    expect(target).toContain('Publication');
    expect(target).toContain('Publication de Awa Diop');
    expect(target).toContain('Les voisins');
    expect([...host.querySelectorAll('[data-admin-fiche-section="target"] a')].map((link) => link.getAttribute('href'))).toContain(`/admin/conversations/${OBJECT_ID(5)}`);
  });

  test('un site externe dit qu’aucune entité de Meeshy n’est visée', async () => {
    const host = await open(fakeServer({ link: servedTrackingLinkFiche({ targetType: 'EXTERNAL', target: null }) }));

    expect(section(host, 'target')).toContain('Site externe');
    expect(section(host, 'target')).toContain('aucune entité de Meeshy n’est visée');
  });

  test('les métadonnées : état expliqué, expiration absolue ET relative, créateur en puce, dernier clic, identifiant technique', async () => {
    const host = await open(fakeServer({ link: servedTrackingLinkFiche({ isActive: false }) }));

    expect(host.querySelector('[data-admin-meta="state"]')?.textContent).toContain('Désactivé');
    expect(host.querySelector('[data-admin-meta="state"]')?.textContent).toContain('ne sont plus redirigés');
    expect(host.querySelector('[data-admin-meta="expires"] time')?.getAttribute('title')).toContain('2026');
    expect(host.querySelector('[data-admin-meta="expires"]')?.textContent).toContain('Passée cette date');
    expect(host.querySelector('[data-admin-meta="creator"] a')?.getAttribute('href')).toBe(`/admin/users/${OBJECT_ID(2)}`);
    expect(host.querySelector('[data-admin-meta="lastClick"] time')).not.toBeNull();
    expect(host.querySelector('[data-admin-meta="technicalId"] [data-admin-technical-id]')?.textContent).toBe(LINK_ID);
    expectNoRawIdentifiers(host);
  });

  test('un lien qui n’expire pas et n’a jamais été cliqué le dit en mots', async () => {
    const host = await open(fakeServer({ link: servedTrackingLinkFiche({ expiresAt: null, lastClickedAt: null, recentClicks: [] }) }));

    expect(host.querySelector('[data-admin-meta="expires"]')?.textContent).toContain('N’expire jamais');
    expect(host.querySelector('[data-admin-meta="lastClick"]')?.textContent).toContain('Aucun clic');
    expect(host.querySelector('[data-admin-stat="lastClick"]')?.textContent).toContain('Aucun clic');
  });
});

describe('ce que rapportent les clics', () => {
  test('huit graphiques, chacun avec son titre', async () => {
    const host = await open(fakeServer());

    const titles = [...host.querySelectorAll('[data-admin-fiche-section="stats"] figure')].map((figure) => figure.getAttribute('data-admin-chart'));
    expect(titles).toEqual(['tracking-days', 'tracking-countries', 'tracking-devices', 'tracking-browsers', 'tracking-systems', 'tracking-social', 'tracking-referrers', 'tracking-redirects']);
  });

  test('la courbe compte les jours SANS clic pour zéro et dit son pic, en jours UTC réels', async () => {
    const host = await open(fakeServer());

    const days = chart(host, 'tracking-days');
    expect(days?.querySelector('[data-admin-chart-summary]')?.textContent).toBe('Jour le plus chargé : mar. 29 sept., avec 40 clics');
    await mounter.click(days?.querySelector<HTMLElement>('[data-admin-action="chart-table"]') ?? null);
    const rows = [...(days?.querySelectorAll('[data-admin-chart-table] tbody tr') ?? [])].map((row) => row.textContent);
    expect(rows).toEqual(['dim. 27 sept.10', 'lun. 28 sept.0', 'mar. 29 sept.40', 'mer. 30 sept.25']);
  });

  test('les pays sont des NOMS, jamais FR ni SN ; un code inconnu devient « Pays inconnu »', async () => {
    const host = await open(fakeServer());

    const countries = chart(host, 'tracking-countries');
    expect(countries?.textContent).toContain('France');
    expect(countries?.textContent).toContain('Sénégal');
    expect(countries?.textContent).toContain('Pays inconnu');
    expect(countries?.textContent).not.toMatch(/\bFR\b|\bSN\b|ZZZ/);
    expect(countries?.querySelector('[data-admin-chart-summary]')?.textContent).toBe('Le plus fréquent : France (700)');
  });

  test('les appareils sont nommés : Mobile, Ordinateur, Tablette', async () => {
    const host = await open(fakeServer());

    const devices = chart(host, 'tracking-devices');
    await mounter.click(devices?.querySelector<HTMLElement>('[data-admin-action="chart-table"]') ?? null);
    const text = devices?.textContent ?? '';
    for (const expected of ['Mobile', 'Ordinateur', 'Tablette']) expect(text).toContain(expected);
    expect(text).not.toMatch(/\bmobile\b|\bdesktop\b|\btablet\b/);
    expect(devices?.querySelector('[data-admin-chart-summary]')?.textContent).toBe('Le plus fréquent : Mobile (800)');
  });

  test('les redirections sont NOMMÉES — réussie, en attente, échouée — jamais confirmed / pending / failed', async () => {
    const host = await open(fakeServer());

    const redirects = chart(host, 'tracking-redirects');
    await mounter.click(redirects?.querySelector<HTMLElement>('[data-admin-action="chart-table"]') ?? null);
    const text = redirects?.textContent ?? '';
    for (const expected of ['Redirection réussie', 'En attente de confirmation', 'Redirection échouée']) expect(text).toContain(expected);
    expect(text).not.toMatch(/\bconfirmed\b|\bpending\b|\bfailed\b/);
  });

  test('les sites d’origine et les sources sociales sont lus tels que servis', async () => {
    const host = await open(fakeServer());

    expect(chart(host, 'tracking-referrers')?.textContent).toContain('https://newsletter.exemple.test/');
    expect(chart(host, 'tracking-social')?.textContent).toContain('Whatsapp');
  });

  test('sans aucune donnée, chaque graphique dit « Aucune donnée sur la période » — jamais un graphique plat', async () => {
    const empty = servedTrackingStats({
      confirmedClicks: 0,
      clicksByDate: [],
      byCountry: [],
      byDevice: [],
      byBrowser: [],
      byOs: [],
      bySocialSource: [],
      topReferrers: [],
      byRedirectStatus: [],
    });
    const host = await open(fakeServer({ link: servedTrackingLinkFiche({ stats: empty, totalClicks: 0, uniqueClicks: 0 }) }));

    const empties = host.querySelectorAll('[data-admin-fiche-section="stats"] [data-admin-chart-empty]');
    expect(empties).toHaveLength(8);
  });
});

describe('les derniers clics — sans IP, sans agent utilisateur, sans empreinte', () => {
  test('chaque clic dit l’heure, le lieu, l’appareil, le navigateur, le système, la provenance, la redirection', async () => {
    const host = await open(fakeServer());

    const first = host.querySelector(`[data-admin-click="${OBJECT_ID(31)}"]`)?.textContent ?? '';
    for (const expected of ['Lyon, France', 'Mobile', 'Safari', 'iOS', 'https://newsletter.exemple.test/', 'Redirection réussie']) expect(first).toContain(expected);
    const second = host.querySelector(`[data-admin-click="${OBJECT_ID(32)}"]`)?.textContent ?? '';
    for (const expected of ['Pays inconnu', 'Ordinateur', 'Chrome', 'Windows', 'Accès direct', 'Redirection échouée']) expect(second).toContain(expected);
  });

  test('aucune IP, aucun agent utilisateur, aucune empreinte — même si la charge en portait', async () => {
    const host = await open(
      fakeServer({ link: servedTrackingLinkFiche({ recentClicks: [servedTrackingClick({ ipAddress: '203.0.113.7', userAgent: 'Mozilla/5.0 (iPhone)', deviceFingerprint: 'fp-9c1' })] }) }),
    );

    for (const leaked of ['203.0.113.7', 'Mozilla', 'fp-9c1']) {
      expect(host.textContent).not.toContain(leaked);
      expect(host.innerHTML).not.toContain(leaked);
    }
    expect(section(host, 'recent')).toContain('Ni adresse IP ni empreinte d’appareil');
  });

  test('aucun clic : la fiche le dit', async () => {
    const host = await open(fakeServer({ link: servedTrackingLinkFiche({ recentClicks: [] }) }));

    expect(section(host, 'recent')).toContain('Aucun clic enregistré pour ce lien.');
  });
});

describe('les états dessinés', () => {
  test('squelette tant que la fiche est en vol', async () => {
    const host = await open(fakeServer({ read: () => new Promise<never>(() => undefined) as unknown as ApiResult<unknown> }));

    expect(host.querySelector('[data-admin-tracking-link-loading]')).not.toBeNull();
  });

  test('404 : « ce lien de suivi n’existe plus », avec le retour à la liste — pas une panne', async () => {
    const host = await open(fakeServer({ read: () => ({ ok: false, status: 404, error: 'Lien de suivi introuvable' }) }));

    expect(host.querySelector('[data-admin-empty]')?.textContent).toContain('Ce lien de suivi n’existe plus');
    expect(host.querySelector('[data-admin-empty] [data-admin-link="back-to-list"]')?.getAttribute('href')).toBe('/admin/tracking-links');
    expect(host.querySelector('[data-admin-error]')).toBeNull();
  });

  test('403 : un bloc refusé', async () => {
    const host = await open(fakeServer({ read: () => ({ ok: false, status: 403, error: 'Forbidden' }) }));

    expect(host.querySelector('[data-admin-denied-inline]')).not.toBeNull();
  });

  test('erreur : « Réessayer » relit la passerelle', async () => {
    let calls = 0;
    const host = await open(fakeServer({ read: () => (++calls === 1 ? { ok: false, status: 500, error: 'boom' } : resultatServi(servedTrackingLinkFiche())) }));

    expect(host.querySelector('[data-admin-error]')).not.toBeNull();

    await mounter.click(host.querySelector<HTMLElement>('[data-admin-error] [data-admin-retry]'));

    expect(host.querySelector('[data-admin-tracking-link-fiche]')).not.toBeNull();
  });
});

describe('quel geste, pour qui', () => {
  test('un lien actif se désactive ; le créateur de la plateforme comme un administrateur', async () => {
    expect(offered(await open(fakeServer()))).toEqual(['deactivate-tracking']);
    mounter.unmountAll();
    appQueryClient.clear();
    const host = await open(fakeServer(), ADMIN);
    expect(offered(host)).toEqual(['deactivate-tracking']);
    expect(action(host, 'deactivate-tracking')?.textContent).toBe('Désactiver le lien');
    expect(action(host, 'deactivate-tracking')?.style.minHeight).toBe('44px');
  });

  test('un lien désactivé se réactive', async () => {
    const host = await open(fakeServer({ link: servedTrackingLinkFiche({ isActive: false }) }));

    expect(offered(host)).toEqual(['reactivate-tracking']);
    expect(action(host, 'reactivate-tracking')?.textContent).toBe('Réactiver le lien');
  });

  test('un auditeur VOIT la fiche mais n’a aucun geste : la route exige le rang d’administration', async () => {
    const host = await open(fakeServer(), AUDIT);

    expect(host.querySelector('[data-admin-fiche="trackingLink"]')).not.toBeNull();
    expect(offered(host)).toEqual([]);
  });

  test('hors ligne : le geste est désactivé, le cache reste lisible', async () => {
    const host = await open(fakeServer());
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    try {
      await act(async () => {
        window.dispatchEvent(new Event('offline'));
      });
      await mounter.settle();

      expect(host.querySelector('[data-admin-notice="warning"]')?.textContent).toContain('hors ligne');
      expect(action(host, 'deactivate-tracking')?.disabled).toBe(true);
      expect(host.querySelector('[data-admin-fiche="trackingLink"]')).not.toBeNull();
    } finally {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
      await act(async () => {
        window.dispatchEvent(new Event('online'));
      });
    }
  });
});

describe('désactiver, puis réactiver', () => {
  test('la confirmation n’envoie rien ; elle dit que les visiteurs ne sont plus redirigés et que les statistiques restent', async () => {
    const fake = fakeServer();
    const host = await open(fake);

    await mounter.click(action(host, 'deactivate-tracking'));

    expect(writes(fake)).toEqual([]);
    const body = host.querySelector('[data-admin-confirm]')?.textContent ?? '';
    expect(body).toContain('ne sont plus redirigés');
    expect(body).toContain('statistiques déjà collectées sont conservées');
    expect(body).toContain('journal d’audit');
    expect(confirm(host)?.textContent).toBe('Désactiver le lien');
  });

  test('sans motif : PATCH { isActive: false } — annoncé, relu, le lien passe « Désactivé » et propose « Réactiver »', async () => {
    const fake = fakeServer();
    const host = await open(fake);
    const readsBefore = reads(fake).length;

    await mounter.click(action(host, 'deactivate-tracking'));
    await mounter.click(confirm(host));

    expect(writes(fake)).toEqual([{ method: 'PATCH', path: adminEndpoints.trackingLinksByLinkId(LINK_ID), body: { isActive: false } }]);
    expect(announcement(host)).toBe('Lien de suivi désactivé');
    expect(reads(fake).length).toBeGreaterThan(readsBefore);
    expect(badge(host)).toBe('Désactivé');
    expect(offered(host)).toEqual(['reactivate-tracking']);
    expect(host.querySelector('[data-admin-confirm]')).toBeNull();
  });

  test('avec un motif : il part dans le corps ; un motif de 1 ou 2 caractères bloque la confirmation (la route exige 3 au moins)', async () => {
    const fake = fakeServer();
    const host = await open(fake);
    await mounter.click(action(host, 'deactivate-tracking'));

    mounter.type(host, '[data-admin-motive]', 'ab');
    await mounter.settle();
    expect(confirm(host)?.disabled).toBe(true);

    mounter.type(host, '[data-admin-motive]', 'Campagne terminée');
    await mounter.settle();
    expect(confirm(host)?.disabled).toBe(false);
    await mounter.click(confirm(host));

    expect(writes(fake)).toEqual([
      { method: 'PATCH', path: adminEndpoints.trackingLinksByLinkId(LINK_ID), body: { isActive: false, reason: 'Campagne terminée' } },
    ]);
  });

  test('réactiver : PATCH { isActive: true }, annoncé', async () => {
    const fake = fakeServer({ link: servedTrackingLinkFiche({ isActive: false }) });
    const host = await open(fake);

    await mounter.click(action(host, 'reactivate-tracking'));
    expect(host.querySelector('[data-admin-confirm]')?.textContent).toContain('redirige de nouveau les visiteurs');
    await mounter.click(confirm(host));

    expect(writes(fake)).toEqual([{ method: 'PATCH', path: adminEndpoints.trackingLinksByLinkId(LINK_ID), body: { isActive: true } }]);
    expect(announcement(host)).toBe('Lien de suivi réactivé');
    expect(badge(host)).toBe('Actif');
    expect(offered(host)).toEqual(['deactivate-tracking']);
  });

  test('effet OPTIMISTE : l’état change avant la réponse, et REVIENT si la passerelle refuse', async () => {
    const release: { open: () => void } = { open: () => undefined };
    const gate = new Promise<void>((resolve) => {
      release.open = resolve;
    });
    const fake = fakeServer({ hold: gate, fail: { ok: false, status: 500, error: 'boom' } });
    const host = await open(fake);
    await mounter.click(action(host, 'deactivate-tracking'));

    await act(async () => {
      confirm(host)?.click();
    });
    await mounter.settle();
    expect(appQueryClient.getQueryData(adminTrackingLinkKey(LINK_ID))).toMatchObject({ isActive: false });
    expect(badge(host)).toBe('Désactivé');

    await act(async () => {
      release.open();
    });
    await mounter.settle();
    await mounter.settle();

    expect(appQueryClient.getQueryData(adminTrackingLinkKey(LINK_ID))).toMatchObject({ isActive: true });
    expect(badge(host)).toBe('Actif');
    expect(host.querySelector('[data-admin-confirm-error]')?.textContent).toBe('Le serveur n’a pas pu effectuer le geste.');
  });

  test('un refus de droit (403) se dit en mots, sans casser la fiche', async () => {
    const fake = fakeServer({ fail: { ok: false, status: 403, error: 'Forbidden' } });
    const host = await open(fake);
    await mounter.click(action(host, 'deactivate-tracking'));
    await mounter.click(confirm(host));

    expect(host.querySelector('[data-admin-confirm-error]')?.textContent).toBe('Vous n’avez pas le droit d’effectuer ce geste.');
    expect(badge(host)).toBe('Actif');
    expect(host.querySelector('[data-admin-tracking-link-fiche]')).not.toBeNull();
  });
});

describe('qui voit la fiche', () => {
  test('sans canViewAnalytics, le refus unique et aucune requête', async () => {
    const fake = fakeServer();
    const { Router } = createRouter(
      { adminTrackingLink: { pattern: '/admin/tracking-links/$link', screen: async () => ({ default: () => <Screen deps={fake.deps} /> }) } },
      () => <p>absent</p>,
    );
    navigate(`/admin/tracking-links/${LINK_ID}`, true);
    const host = await mount(<Router wrap={(children) => children} skeleton={null} />, adminIdentityFixture({ role: 'ADMIN', permissions: { canViewAnalytics: false } }));
    await mounter.settle();
    await mounter.settle();

    expect(host.textContent).toContain('Espace réservé');
    expect(host.querySelector('[data-admin-tracking-link-fiche]')).toBeNull();
    expect(fake.calls).toEqual([]);
  });
});
