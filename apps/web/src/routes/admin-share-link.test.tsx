import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';
import { act } from 'react';
import { describe, expect, test } from 'bun:test';

import { AdminSectionScreen } from '@/components/admin/section-screen';
import { OBJECT_ID, servedShareLinkFiche } from '@/lib/admin/share-link-fixtures';
import type { AdminDeps } from '@/lib/api/admin';
import { adminShareLinkKey } from '@/lib/api/admin-share-links';
import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';
import { createRouter, navigate } from '@/lib/router';
import { adminIdentityFixture, expectNoRawIdentifiers } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';
import { resultatServi } from '@/test-support/served-pagination';

import { AdminShareLinkPanel } from './admin-share-link';

/**
 * **LA FICHE D'UN LIEN DE PARTAGE** (#8876, #6729) — la conversation, l'usage, ce
 * que les invités peuvent faire EN PHRASES, ce que le lien exige et restreint (pays
 * et langues nommés), les invités récents ; jamais une clé de jointure. Trois
 * gestes : fermer, rouvrir, et — au SEUL rang souverain — révéler le secret, dont le
 * résultat s'affiche UNE fois et n'entre dans aucune clé du cache.
 */

const { mount, mounter } = setupAdminKitTests();
const BIGBOSS = adminIdentityFixture({ role: 'BIGBOSS' });
const ADMIN = adminIdentityFixture({ role: 'ADMIN' });
const NOW = new Date('2026-09-30T12:00:00.000Z');
const LINK_ID = OBJECT_ID(1);
const SECRET = { linkId: 'mshy_AbCd1234', identifier: 'mshy_voisins-7k2' };
const REASON = 'Support : le propriétaire a perdu son lien';

type Call = { readonly method: string; readonly path: string; readonly body?: unknown };

type Fake = {
  readonly deps: AdminDeps;
  readonly calls: Call[];
  readonly state: { link: Record<string, unknown> };
};

type Options = {
  readonly link?: Record<string, unknown>;
  readonly fail?: Partial<Record<'DELETE' | 'PATCH' | 'POST', ApiResult<unknown>>>;
  readonly hold?: Partial<Record<'DELETE' | 'PATCH' | 'POST', Promise<void>>>;
  readonly read?: () => ApiResult<unknown>;
};

function fakeServer(options: Options = {}): Fake {
  const state = { link: options.link ?? servedShareLinkFiche() };
  const calls: Call[] = [];

  const transport = {
    request: async (request: HttpRequest): Promise<ApiResult<unknown>> => {
      calls.push({ method: request.method, path: request.path, ...(request.body === undefined ? {} : { body: request.body }) });
      if (request.method === 'GET') return options.read?.() ?? resultatServi(state.link);
      const method = request.method === 'DELETE' || request.method === 'PATCH' || request.method === 'POST' ? request.method : null;
      if (method === null) return { ok: true, data: {}, status: 200 };
      await options.hold?.[method];
      const refusal = options.fail?.[method];
      if (refusal !== undefined) return refusal;
      if (method === 'DELETE') state.link = { ...state.link, isActive: false };
      if (method === 'PATCH') state.link = { ...state.link, isActive: true };
      if (method === 'POST') return { ok: true, data: { id: LINK_ID, ...SECRET }, status: 200 };
      return { ok: true, data: { id: LINK_ID, isActive: state.link.isActive }, status: 200 };
    },
  } as unknown as HttpTransport;

  return { deps: { source: 'gateway', transport }, calls, state };
}

function Screen({ deps }: { readonly deps: AdminDeps }) {
  return (
    <AdminSectionScreen section="shareLinks" language="fr" title="Liens de partage">
      {(reach) => <AdminShareLinkPanel language="fr" shareLinkId={LINK_ID} reach={reach} deps={deps} now={() => NOW} />}
    </AdminSectionScreen>
  );
}

async function open(fake: Fake, identity = BIGBOSS) {
  const { Router } = createRouter(
    { adminShareLink: { pattern: '/admin/share-links/$link', screen: async () => ({ default: () => <Screen deps={fake.deps} /> }) } },
    () => <p>absent</p>,
  );
  navigate(`/admin/share-links/${LINK_ID}`, true);
  const host = await mount(<Router wrap={(children) => children} skeleton={null} />, identity);
  for (let attempt = 0; attempt < 30 && host.querySelector('[data-admin-share-link-fiche], [data-admin-error], [data-admin-empty], [data-admin-denied-inline]') === null; attempt += 1) {
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

describe('la fiche — nommée, métadonnées interprétées', () => {
  test('le titre, le créateur, l’état, l’usage : des mots, jamais un identifiant ni un ISO', async () => {
    const host = await open(fakeServer());

    const identity = host.querySelector('[data-admin-identity]')?.textContent ?? '';
    expect(identity).toContain('Soirée du vendredi');
    expect(identity).toContain('Le lien posté dans le groupe des voisins');
    expect(identity).toContain('Actif');
    expect(host.querySelector('[data-admin-stat="uses"]')?.textContent).toContain('12 sur 50');
    expect(host.querySelector('[data-admin-stat="visits"]')?.textContent).toContain('41');
    expect(host.querySelector('[data-admin-stat="guests"]')?.textContent).toContain('7');
    expect(host.querySelector('[data-admin-stat="concurrent"]')?.textContent).toContain('2, sans limite');
    expect(host.querySelector('[data-admin-stat="sessions"]')?.textContent).toContain('9 sur 30');
    expectNoRawIdentifiers(host);
  });

  test('un lien sans nom se dit « Lien sans nom » — jamais une clé', async () => {
    const host = await open(fakeServer({ link: servedShareLinkFiche({ name: null, description: null }) }));

    expect(host.querySelector('[data-admin-page-title]')?.textContent).toBe('Lien sans nom');
    expect(host.querySelector('[data-admin-identity] h2')?.textContent).toBe('Lien sans nom');
    expect(host.querySelector('[data-admin-identity]')?.textContent).toContain('Créé par Awa Diop');
    expectNoRawIdentifiers(host);
  });

  test('la conversation, le créateur et les invités sont des puces qui mènent à LEUR fiche', async () => {
    const host = await open(fakeServer());

    const hrefs = [...host.querySelectorAll('a')].map((link) => link.getAttribute('href'));
    expect(hrefs).toContain(`/admin/conversations/${OBJECT_ID(3)}`);
    expect(hrefs).toContain(`/admin/users/${OBJECT_ID(2)}`);
    expect(hrefs).toContain(`/admin/anonymous/${OBJECT_ID(21)}`);
    expect(section(host, 'conversation')).toContain('Les voisins');
    expect(section(host, 'conversation')).toContain('Groupe');
  });

  test('ce que les invités PEUVENT faire : quatre phrases, jamais true/false', async () => {
    const host = await open(fakeServer());

    const phrases = [...host.querySelectorAll('[data-admin-flags="permissions"] li')].map((item) => item.textContent);
    expect(phrases).toEqual([
      'Les invités peuvent écrire des messages',
      'Les invités ne peuvent pas envoyer de fichiers',
      'Les invités peuvent envoyer des images',
      'Les invités ne voient que ce qui est écrit après leur arrivée',
    ]);
  });

  test('ce que le lien EXIGE : quatre phrases', async () => {
    const host = await open(fakeServer({ link: servedShareLinkFiche({ requireAccount: true }) }));

    const phrases = [...host.querySelectorAll('[data-admin-flags="requirements"] li')].map((item) => item.textContent);
    expect(phrases).toEqual([
      'Un compte Meeshy est exigé pour entrer',
      'Les invités doivent choisir un pseudonyme',
      'Aucune adresse e-mail n’est exigée',
      'Aucune date de naissance n’est exigée',
    ]);
  });

  test('les restrictions sont des NOMS de pays et de langues — jamais FR, SN, fr, wo', async () => {
    const host = await open(fakeServer());

    const restrictions = host.querySelector('[data-admin-fiche-section="restrictions"]');
    expect(restrictions?.querySelector('[data-admin-meta="countries"]')?.textContent).toContain('France');
    expect(restrictions?.querySelector('[data-admin-meta="countries"]')?.textContent).toContain('Sénégal');
    expect(restrictions?.querySelector('[data-admin-meta="languages"]')?.textContent).toContain('Français');
    expect(restrictions?.querySelector('[data-admin-meta="languages"]')?.textContent).toContain('Wolof');
    expect(restrictions?.textContent).not.toMatch(/\bFR\b|\bSN\b/);
  });

  test('sans restriction, la fiche dit « Aucune restriction » — deux fois', async () => {
    const host = await open(fakeServer({ link: servedShareLinkFiche({ allowedCountries: [], allowedLanguages: [] }) }));

    const text = section(host, 'restrictions');
    expect(text.match(/Aucune restriction/g)).toHaveLength(2);
  });

  test('les invités récents : leur nom, leur présence, leur arrivée ; sans nom, « Invité sans nom »', async () => {
    const host = await open(fakeServer());

    expect(host.querySelector(`[data-admin-guest="${OBJECT_ID(21)}"]`)?.textContent).toContain('Invité Koffi');
    expect(host.querySelector(`[data-admin-guest="${OBJECT_ID(21)}"]`)?.textContent).toContain('Présent');
    expect(host.querySelector(`[data-admin-guest="${OBJECT_ID(22)}"]`)?.textContent).toContain('Invité sans nom');
    expect(host.querySelector(`[data-admin-guest="${OBJECT_ID(22)}"]`)?.textContent).toContain('Parti');
  });

  test('aucun invité : la fiche le dit', async () => {
    const host = await open(fakeServer({ link: servedShareLinkFiche({ recentGuests: [] }) }));

    expect(section(host, 'guests')).toContain('Personne n’est encore entré par ce lien.');
  });

  test('les métadonnées : état expliqué, expiration absolue ET relative, création, modification, identifiant technique', async () => {
    const host = await open(fakeServer({ link: servedShareLinkFiche({ isActive: false }) }));

    expect(host.querySelector('[data-admin-meta="state"]')?.textContent).toContain('Fermé');
    expect(host.querySelector('[data-admin-meta="state"]')?.textContent).toContain('plus personne n’entre par ce lien');
    expect(host.querySelector('[data-admin-meta="expires"] time')?.getAttribute('title')).toContain('2026');
    expect(host.querySelector('[data-admin-meta="expires"]')?.textContent).toContain('·');
    expect(host.querySelector('[data-admin-meta="created"]')).not.toBeNull();
    expect(host.querySelector('[data-admin-meta="updated"]')).not.toBeNull();
    expect(host.querySelector('[data-admin-meta="technicalId"] [data-admin-technical-id]')?.textContent).toBe(LINK_ID);
    expectNoRawIdentifiers(host);
  });

  test('un lien sans date limite dit « N’expire jamais »', async () => {
    const host = await open(fakeServer({ link: servedShareLinkFiche({ expiresAt: null }) }));

    expect(host.querySelector('[data-admin-meta="expires"]')?.textContent).toContain('N’expire jamais');
  });

  test('aucune clé de jointure dans l’écran, même si la charge en portait une par erreur', async () => {
    const host = await open(fakeServer({ link: servedShareLinkFiche({ ...SECRET, allowedIpRanges: ['203.0.113.0/24'] }) }));

    for (const leaked of [SECRET.linkId, SECRET.identifier, 'mshy_voisins', '203.0.113']) {
      expect(host.textContent).not.toContain(leaked);
      expect(host.innerHTML).not.toContain(leaked);
    }
    const cached = JSON.stringify(appQueryClient.getQueryData(adminShareLinkKey(LINK_ID)));
    for (const leaked of [SECRET.linkId, SECRET.identifier, '203.0.113']) expect(cached).not.toContain(leaked);
  });
});

describe('les états dessinés', () => {
  test('squelette tant que la fiche est en vol', async () => {
    const host = await open(fakeServer({ read: () => new Promise<never>(() => undefined) as unknown as ApiResult<unknown> }));

    expect(host.querySelector('[data-admin-share-link-loading]')).not.toBeNull();
  });

  test('404 : « ce lien n’existe plus », avec le retour à la liste — pas une panne', async () => {
    const host = await open(fakeServer({ read: () => ({ ok: false, status: 404, error: 'Lien de partage non trouvé' }) }));

    expect(host.querySelector('[data-admin-empty]')?.textContent).toContain('Ce lien n’existe plus');
    expect(host.querySelector('[data-admin-empty] [data-admin-link="back-to-list"]')?.getAttribute('href')).toBe('/admin/share-links');
    expect(host.querySelector('[data-admin-error]')).toBeNull();
  });

  test('403 : un bloc refusé', async () => {
    const host = await open(fakeServer({ read: () => ({ ok: false, status: 403, error: 'Forbidden' }) }));

    expect(host.querySelector('[data-admin-denied-inline]')).not.toBeNull();
  });

  test('erreur : « Réessayer » relit la passerelle', async () => {
    let calls = 0;
    const host = await open(fakeServer({ read: () => (++calls === 1 ? { ok: false, status: 500, error: 'boom' } : resultatServi(servedShareLinkFiche())) }));

    expect(host.querySelector('[data-admin-error]')).not.toBeNull();

    await mounter.click(host.querySelector<HTMLElement>('[data-admin-error] [data-admin-retry]'));

    expect(host.querySelector('[data-admin-share-link-fiche]')).not.toBeNull();
  });
});

describe('quels gestes, pour qui', () => {
  test('un lien ouvert se ferme ; le créateur de la plateforme peut en plus révéler le secret', async () => {
    const host = await open(fakeServer());

    expect(offered(host)).toEqual(['close-link', 'reveal-secret']);
    expect(action(host, 'close-link')?.textContent).toBe('Fermer le lien');
    expect(action(host, 'reveal-secret')?.textContent).toBe('Révéler le secret');
    expect(action(host, 'close-link')?.style.minHeight).toBe('44px');
  });

  test('un lien fermé se rouvre', async () => {
    const host = await open(fakeServer({ link: servedShareLinkFiche({ isActive: false }) }));

    expect(offered(host)).toEqual(['reopen-link', 'reveal-secret']);
    expect(action(host, 'reopen-link')?.textContent).toBe('Rouvrir le lien');
  });

  test('un administrateur ordinaire ferme, mais NE RÉVÈLE PAS : le geste n’est pas dessiné (la route exige le rang souverain)', async () => {
    const host = await open(fakeServer(), ADMIN);

    expect(offered(host)).toEqual(['close-link']);
    expect(host.querySelector('[data-admin-action="reveal-secret"]')).toBeNull();
  });

  test('hors ligne : les gestes sont désactivés, le cache reste lisible', async () => {
    const host = await open(fakeServer());
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    try {
      await act(async () => {
        window.dispatchEvent(new Event('offline'));
      });
      await mounter.settle();

      expect(host.querySelector('[data-admin-notice="warning"]')?.textContent).toContain('hors ligne');
      expect(offered(host).every((name) => action(host, name ?? '')?.disabled === true)).toBe(true);
      expect(host.querySelector('[data-admin-fiche="shareLink"]')).not.toBeNull();
    } finally {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
      await act(async () => {
        window.dispatchEvent(new Event('online'));
      });
    }
  });
});

describe('fermer le lien', () => {
  test('la confirmation n’envoie rien ; elle dit que les invités perdent l’accès', async () => {
    const fake = fakeServer();
    const host = await open(fake);

    await mounter.click(action(host, 'close-link'));

    expect(writes(fake)).toEqual([]);
    const body = host.querySelector('[data-admin-confirm]')?.textContent ?? '';
    expect(body).toContain('Les invités arrivés par ce lien perdent l’accès');
    expect(body).toContain('journal d’audit');
    expect(confirm(host)?.textContent).toBe('Fermer le lien');
  });

  test('confirmer : DELETE sur SON lien, annoncé, relu — le lien passe « Fermé » et propose « Rouvrir »', async () => {
    const fake = fakeServer();
    const host = await open(fake);
    const readsBefore = reads(fake).length;

    await mounter.click(action(host, 'close-link'));
    await mounter.click(confirm(host));

    expect(writes(fake)).toEqual([{ method: 'DELETE', path: adminEndpoints.shareLinksById(LINK_ID) }]);
    expect(announcement(host)).toBe('Lien fermé');
    expect(reads(fake).length).toBeGreaterThan(readsBefore);
    expect(badge(host)).toBe('Fermé');
    expect(offered(host)).toEqual(['reopen-link', 'reveal-secret']);
    expect(host.querySelector('[data-admin-confirm]')).toBeNull();
  });

  test('effet OPTIMISTE : l’état change avant la réponse, et REVIENT si la passerelle refuse', async () => {
    const release: { open: () => void } = { open: () => undefined };
    const gate = new Promise<void>((resolve) => {
      release.open = resolve;
    });
    const fake = fakeServer({ hold: { DELETE: gate }, fail: { DELETE: { ok: false, status: 500, error: 'boom' } } });
    const host = await open(fake);
    await mounter.click(action(host, 'close-link'));

    await act(async () => {
      confirm(host)?.click();
    });
    await mounter.settle();
    expect(appQueryClient.getQueryData(adminShareLinkKey(LINK_ID))).toMatchObject({ isActive: false });
    expect(badge(host)).toBe('Fermé');

    await act(async () => {
      release.open();
    });
    await mounter.settle();
    await mounter.settle();

    expect(appQueryClient.getQueryData(adminShareLinkKey(LINK_ID))).toMatchObject({ isActive: true });
    expect(badge(host)).toBe('Actif');
    expect(host.querySelector('[data-admin-confirm-error]')?.textContent).toBe('Le serveur n’a pas pu effectuer le geste.');
  });

  test('un refus de droit (403) se dit en mots, sans fermer la fiche', async () => {
    const fake = fakeServer({ fail: { DELETE: { ok: false, status: 403, error: 'Forbidden' } } });
    const host = await open(fake);
    await mounter.click(action(host, 'close-link'));
    await mounter.click(confirm(host));

    expect(host.querySelector('[data-admin-confirm-error]')?.textContent).toBe('Vous n’avez pas le droit d’effectuer ce geste.');
    expect(badge(host)).toBe('Actif');
    expect(host.querySelector('[data-admin-share-link-fiche]')).not.toBeNull();
  });
});

describe('rouvrir le lien', () => {
  test('confirmer : PATCH { active: true } — la confirmation dit que les invités retirés ne sont pas rétablis', async () => {
    const fake = fakeServer({ link: servedShareLinkFiche({ isActive: false }) });
    const host = await open(fake);

    await mounter.click(action(host, 'reopen-link'));
    expect(host.querySelector('[data-admin-confirm]')?.textContent).toContain('ne sont pas rétablis');
    await mounter.click(confirm(host));

    expect(writes(fake)).toEqual([{ method: 'PATCH', path: adminEndpoints.shareLinksById(LINK_ID), body: { active: true } }]);
    expect(announcement(host)).toBe('Lien rouvert');
    expect(badge(host)).toBe('Actif');
    expect(offered(host)).toEqual(['close-link', 'reveal-secret']);
  });
});

describe('révéler le secret — rang souverain, motif écrit, affiché UNE fois, jamais en cache', () => {
  const reveal = async (host: HTMLDivElement, reason = REASON) => {
    await mounter.click(action(host, 'reveal-secret'));
    mounter.type(host, '[data-admin-motive]', reason);
    await mounter.settle();
    await mounter.click(confirm(host));
  };

  test('la confirmation demande un motif d’au moins 10 caractères : en dessous, rien ne part', async () => {
    const fake = fakeServer();
    const host = await open(fake);
    await mounter.click(action(host, 'reveal-secret'));

    expect(host.querySelector('[data-admin-confirm]')?.textContent).toContain('Ce geste est réservé au créateur de la plateforme');
    expect(confirm(host)?.disabled).toBe(true);

    mounter.type(host, '[data-admin-motive]', 'trop bref');
    await mounter.settle();
    expect(confirm(host)?.disabled).toBe(true);

    mounter.type(host, '[data-admin-motive]', REASON);
    await mounter.settle();
    expect(confirm(host)?.disabled).toBe(false);
    expect(writes(fake)).toEqual([]);
  });

  test('POST avec le motif ; les deux clés s’affichent dans une feuille, avec copie', async () => {
    const fake = fakeServer();
    const host = await open(fake);

    await reveal(host);

    expect(writes(fake)).toEqual([{ method: 'POST', path: adminEndpoints.shareLinksByIdReveal(LINK_ID), body: { reason: REASON } }]);
    const sheet = host.querySelector('[data-admin-secret]');
    expect(sheet).not.toBeNull();
    expect(sheet?.textContent).toContain(SECRET.linkId);
    expect(sheet?.textContent).toContain(SECRET.identifier);
    expect(sheet?.textContent).toContain('Copiez-le maintenant');
    expect(sheet?.querySelectorAll('[data-admin-action="copy-secret"]')).toHaveLength(2);
    expect(host.querySelector('[data-admin-confirm]')).toBeNull();
  });

  test('l’annonce dit que le secret est révélé — sans le porter', async () => {
    const host = await open(fakeServer());

    await reveal(host);

    expect(announcement(host)).toBe('Secret révélé : il ne s’affichera pas une seconde fois');
    expect(announcement(host)).not.toContain(SECRET.linkId);
  });

  test('APRÈS la révélation, le cache TanStack ne porte aucune clé ni aucune valeur qui contienne le secret', async () => {
    const host = await open(fakeServer());

    await reveal(host);

    const queries = appQueryClient.getQueryCache().getAll();
    const serialized = JSON.stringify(queries.map((query) => ({ key: query.queryKey, data: query.state.data })));
    expect(serialized).not.toContain(SECRET.linkId);
    expect(serialized).not.toContain(SECRET.identifier);
    expect(appQueryClient.getMutationCache().getAll()).toHaveLength(0);
    expect(queries.every((query) => query.queryKey[0] === 'admin')).toBe(true);
  });

  test('fermer la feuille EFFACE le secret : il ne reste nulle part dans l’écran', async () => {
    const host = await open(fakeServer());
    await reveal(host);

    await mounter.click(host.querySelector<HTMLElement>('[data-admin-secret] [data-admin-action="close-secret"]'));

    expect(host.querySelector('[data-admin-secret]')).toBeNull();
    expect(host.textContent).not.toContain(SECRET.linkId);
    expect(host.innerHTML).not.toContain(SECRET.identifier);
  });

  test('les clés révélées sont des identifiants techniques : seule ancre où un identifiant s’écrit', async () => {
    const host = await open(fakeServer());
    await reveal(host);

    const codes = [...host.querySelectorAll('[data-admin-secret] [data-admin-technical-id]')].map((code) => code.textContent);
    expect(codes).toEqual([SECRET.linkId, SECRET.identifier]);
  });

  test('un refus (403) se dit dans la confirmation : aucune feuille de secret', async () => {
    const fake = fakeServer({ fail: { POST: { ok: false, status: 403, error: 'Forbidden' } } });
    const host = await open(fake);

    await reveal(host);

    expect(host.querySelector('[data-admin-confirm-error]')?.textContent).toBe('Vous n’avez pas le droit d’effectuer ce geste.');
    expect(host.querySelector('[data-admin-secret]')).toBeNull();
  });

  test('une charge sans clés lisibles est un échec : jamais une feuille vide', async () => {
    const fake = fakeServer();
    const original = fake.deps.transport.request.bind(fake.deps.transport);
    const deps: AdminDeps = {
      source: 'gateway',
      transport: {
        request: async (request: HttpRequest) => (request.method === 'POST' ? { ok: true as const, data: { id: LINK_ID }, status: 200 } : original(request)),
      } as unknown as HttpTransport,
    };
    const host = await open({ ...fake, deps });

    await reveal(host);

    expect(host.querySelector('[data-admin-secret]')).toBeNull();
    expect(host.querySelector('[data-admin-confirm-error]')).not.toBeNull();
  });
});

describe('qui voit la fiche', () => {
  test('sans canManageConversations, le refus unique et aucune requête', async () => {
    const fake = fakeServer();
    const { Router } = createRouter(
      { adminShareLink: { pattern: '/admin/share-links/$link', screen: async () => ({ default: () => <Screen deps={fake.deps} /> }) } },
      () => <p>absent</p>,
    );
    navigate(`/admin/share-links/${LINK_ID}`, true);
    const host = await mount(<Router wrap={(children) => children} skeleton={null} />, adminIdentityFixture({ role: 'ADMIN', permissions: { canManageConversations: false } }));
    await mounter.settle();
    await mounter.settle();

    expect(host.textContent).toContain('Espace réservé');
    expect(host.querySelector('[data-admin-share-link-fiche]')).toBeNull();
    expect(fake.calls).toEqual([]);
  });
});
