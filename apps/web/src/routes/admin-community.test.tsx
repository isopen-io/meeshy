import { act } from 'react';
import { describe, expect, test } from 'bun:test';

import type { AdminDeps } from '@/lib/api/admin';
import type { ApiResult, HttpRequest } from '@/lib/api/http';
import { createRouter, navigate } from '@/lib/router';
import { adminIdentityFixture, expectNoRawIdentifiers } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';
import { resultatServi } from '@/test-support/served-pagination';

import { adminCommunityQueryKey, decodeAdminCommunityFiche } from '@/lib/api/admin-communities-detail';
import { appQueryClient } from '@/lib/api/query-client';
import { mountAdminAt } from '@/test-support/admin-router';

import AdminCommunityScreen, { AdminCommunityPanel } from './admin-community';

/**
 * LA FICHE D'UNE COMMUNAUTÉ (#8876) — identité, chiffres, équipe, conversations,
 * membres, métadonnées interprétées, et les gestes (désactiver, réactiver, rendre
 * privée ou publique) : confirmés, motivés, optimistes, annoncés, relus.
 */
const { mount, mounter } = setupAdminKitTests({ languages: ['fr', 'en'] });
const BIGBOSS = adminIdentityFixture({ role: 'BIGBOSS' });
const ID = (n: number) => `64f1c2a9e8b7d6c5b4a3928${n}`;
const NOW = new Date('2026-09-30T12:00:00.000Z');
const person = (n: number, name: string) => ({ id: ID(n), username: name.toLowerCase(), displayName: name, avatar: null });

const fiche = (overrides: Record<string, unknown> = {}) => ({
  id: ID(3),
  identifier: 'mshy_club-jazz',
  name: 'Club de jazz',
  description: 'Les amateurs de jazz de Douala',
  avatar: null,
  banner: 'https://cdn.meeshy.me/c/jazz-banner.jpg',
  isPrivate: true,
  isActive: true,
  deletedAt: null,
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-09-29T10:00:00.000Z',
  creator: person(1, 'Awa Diop'),
  activeMemberCount: 42,
  leftMemberCount: 7,
  conversationCount: 2,
  postCount: 15,
  conversations: [
    { id: ID(5), title: 'Répétitions', type: 'group', isActive: true, lastMessageAt: '2026-09-29T20:00:00.000Z', memberCount: 12 },
    { id: ID(6), title: null, type: 'public', isActive: false, lastMessageAt: null, memberCount: 3 },
  ],
  staff: [
    { user: person(1, 'Awa Diop'), role: 'admin', joinedAt: '2026-08-01T10:00:00.000Z' },
    { user: person(2, 'Jean Mbarga'), role: 'moderator', joinedAt: '2026-08-05T10:00:00.000Z' },
  ],
  ...overrides,
});

const member = (n: number, name: string, overrides: Record<string, unknown> = {}) => ({
  id: ID(n),
  role: 'member',
  joinedAt: '2026-09-01T10:00:00.000Z',
  isActive: true,
  leftAt: null,
  user: person(n + 1, name),
  ...overrides,
});

type Gateway = {
  current: Readonly<Record<string, unknown>>;
  readonly calls: HttpRequest[];
  patch?: (req: HttpRequest) => ApiResult<unknown> | Promise<ApiResult<unknown>>;
  get?: () => ApiResult<unknown> | Promise<ApiResult<unknown>>;
  members?: () => ApiResult<unknown>;
};

function gatewayOf(initial = fiche(), overrides: Partial<Pick<Gateway, 'patch' | 'get' | 'members'>> = {}) {
  const gateway: Gateway = { current: initial, calls: [], ...overrides };
  const reply = async (req: HttpRequest): Promise<ApiResult<unknown>> => {
    gateway.calls.push(req);
    const path = req.path.split('?')[0] ?? '';
    if (req.method === 'PATCH') {
      if (gateway.patch !== undefined) return gateway.patch(req);
      const body = req.body as { isActive?: boolean; isPrivate?: boolean };
      gateway.current = {
        ...gateway.current,
        ...(body.isActive === undefined ? {} : { isActive: body.isActive, deletedAt: body.isActive ? null : '2026-09-30T12:00:00.000Z' }),
        ...(body.isPrivate === undefined ? {} : { isPrivate: body.isPrivate }),
      };
      return resultatServi({ success: true, data: gateway.current });
    }
    if (path.endsWith('/members')) {
      return gateway.members?.() ?? resultatServi({ success: true, data: [member(8, 'Nadia Fotso'), member(10, 'Paul Eto', { isActive: false, leftAt: '2026-09-10T10:00:00.000Z', role: 'moderator' })], pagination: { total: 42, offset: 0, limit: 20, hasMore: true } });
    }
    return gateway.get?.() ?? resultatServi({ success: true, data: gateway.current });
  };
  const transport: AdminDeps['transport'] = Object.assign(async () => ({ ok: false as const, status: 0, error: 'jamais appelé' }), {
    request: async <T,>(req: HttpRequest): Promise<ApiResult<T>> => (await reply(req)) as ApiResult<T>,
  });
  return { gateway, deps: { source: 'gateway', transport } satisfies AdminDeps };
}

async function ouvrir(gatewayOptions: Parameters<typeof gatewayOf> = [], url = `/admin/communities/${ID(3)}`, identity = BIGBOSS) {
  const { gateway, deps } = gatewayOf(...gatewayOptions);
  const { Router } = createRouter(
    { adminCommunity: { pattern: '/admin/communities/$community', screen: async () => ({ default: () => <AdminCommunityPanel language="fr" communityId={ID(3)} deps={deps} now={NOW} /> }) } },
    () => <p>absent</p>,
  );
  navigate(url, true);
  const host = await mount(<Router wrap={(children) => children} skeleton={null} />, identity);
  for (let attempt = 0; attempt < 30 && host.querySelector('[data-admin-screen]') === null; attempt += 1) await mounter.settle();
  await mounter.settle();
  return { host, gateway };
}

const click = async (element: Element | null) => {
  await act(async () => (element as HTMLElement | null)?.click());
  await mounter.settle();
};
const text = (host: ParentNode, selector: string) => host.querySelector(selector)?.textContent ?? '';
const gesture = (host: ParentNode, name: string) => host.querySelector<HTMLButtonElement>(`[data-admin-action="${name}"]`);
const confirmer = (host: ParentNode) => host.querySelector<HTMLButtonElement>('[data-admin-action="confirm"]');
const gestures = (gateway: Gateway) => gateway.calls.filter((call) => call.method === 'PATCH');

describe('AdminCommunityPanel — identité, chiffres, description', () => {
  test('le VRAI nom en titre de page et de carte, l’identifiant public en secondaire, la bannière', async () => {
    const { host } = await ouvrir();
    expect(text(host, '[data-admin-page-title]')).toBe('Club de jazz');
    expect(text(host, '[data-admin-identity] h2')).toBe('Club de jazz');
    expect(text(host, '[data-admin-identity]')).toContain('mshy_club-jazz');
    expect(host.querySelector('img')?.getAttribute('alt')).toBe('Bannière de la communauté');
  });

  test('le fil d’Ariane : Échanges › Communautés (lien) › le nom', async () => {
    const { host } = await ouvrir();
    const items = [...host.querySelectorAll('nav[aria-label] li')].map((item) => item.textContent?.trim());
    expect(items).toEqual(['Échanges', 'Communautés', 'Club de jazz']);
    expect(host.querySelector('nav[aria-label] a')?.getAttribute('href')).toBe('/admin/communities');
  });

  test('l’état se dit en badges : « Privée » et « Active »', async () => {
    const { host } = await ouvrir();
    const badges = text(host, '[data-admin-identity]');
    expect(badges).toContain('Privée');
    expect(badges).toContain('Active');
  });

  test('le bandeau de chiffres : membres actifs, départs, conversations, publications', async () => {
    const { host } = await ouvrir();
    expect(text(host, '[data-admin-stat="members"]')).toContain('Membres actifs');
    expect(text(host, '[data-admin-stat="members"]')).toContain('42');
    expect(text(host, '[data-admin-stat="left"]')).toContain('Départs');
    expect(text(host, '[data-admin-stat="left"]')).toContain('7');
    expect(text(host, '[data-admin-stat="conversations"]')).toContain('2');
    expect(text(host, '[data-admin-stat="posts"]')).toContain('15');
  });

  test('les membres actifs ouvrent l’onglet des membres, les départs le filtrent sur « Partis »', async () => {
    const { host } = await ouvrir();
    expect(host.querySelector('[data-admin-stat="members"] a')?.getAttribute('href')).toBe(`/admin/communities/${ID(3)}?tab=members`);
    expect(host.querySelector('[data-admin-stat="left"] a')?.getAttribute('href')).toBe(`/admin/communities/${ID(3)}?tab=members&isActive=false`);
  });

  test('la description est lue ; sans description, l’écran le dit', async () => {
    const { host } = await ouvrir();
    expect(text(host, '[data-admin-fiche-section="description"]')).toContain('Les amateurs de jazz de Douala');
  });

  test('sans description, l’écran le dit', async () => {
    const { host } = await ouvrir([fiche({ description: null })]);
    expect(text(host, '[data-admin-fiche-section="description"]')).toContain('n’a pas de description');
  });
});

describe('AdminCommunityPanel — équipe, conversations, métadonnées', () => {
  test('l’équipe est nommée, avec le rôle en mot et un lien vers chaque fiche membre', async () => {
    const { host } = await ouvrir();
    const jean = host.querySelector(`[data-admin-staff="${ID(2)}"]`);
    expect(jean?.textContent).toContain('Jean Mbarga');
    expect(jean?.textContent).toContain('Modérateur');
    expect(jean?.querySelector('a')?.getAttribute('href')).toBe(`/admin/users/${ID(2)}`);
    expect(text(host, `[data-admin-staff="${ID(1)}"]`)).toContain('Administrateur');
  });

  test('les conversations sont nommées, typées, comptées — et ouvrent leur fiche (rang admin)', async () => {
    const { host } = await ouvrir();
    const repetitions = host.querySelector(`[data-admin-conversation="${ID(5)}"]`);
    expect(repetitions?.textContent).toContain('Répétitions');
    expect(repetitions?.textContent).toContain('Groupe · Membres : 12');
    expect(repetitions?.querySelector('a')?.getAttribute('href')).toBe(`/admin/conversations/${ID(5)}`);
    const sansTitre = host.querySelector(`[data-admin-conversation="${ID(6)}"]`);
    expect(sansTitre?.textContent).toContain('Conversation sans titre');
    expect(sansTitre?.textContent).toContain('Publique · Membres : 3 · Inactive');
  });

  test('sans le rang d’administration, l’inventaire des conversations n’est PAS dessiné — le chiffre seul, et il le dit', async () => {
    const { host } = await ouvrir([], `/admin/communities/${ID(3)}`, adminIdentityFixture({ role: 'MODERATOR' }));

    expect(host.querySelector('[data-admin-conversation]')).toBeNull();
    expect(host.textContent).not.toContain('Répétitions');
    expect(text(host, '[data-admin-conversations-restricted]')).toContain('2 conversation(s)');
    expect(text(host, '[data-admin-conversations-restricted]')).toContain('réservée au rang d’administration');
  });

  test('« Conversations » du bandeau mène à CELLES de la communauté (communityId) — et reste du texte sans la section', async () => {
    const { host } = await ouvrir();
    const tile = host.querySelector('[data-admin-stat="conversations"]');
    expect(tile?.querySelector('a')?.getAttribute('href')).toBe(`/admin/conversations?communityId=${ID(3)}`);

    await click(tile?.querySelector('a') ?? null);
    expect(window.location.pathname).toBe('/admin/conversations');
    expect(window.location.search).toBe(`?communityId=${ID(3)}`);

    const moderator = await ouvrir([], `/admin/communities/${ID(3)}`, adminIdentityFixture({ role: 'MODERATOR' }));
    expect(moderator.host.querySelector('[data-admin-stat="conversations"] a')).toBeNull();
    expect(text(moderator.host, '[data-admin-stat="conversations"]')).toContain('2');
  });

  test('la phrase « … sur N » est elle aussi un lien vers la liste filtrée quand il y a plus que ce qui est montré', async () => {
    const { host } = await ouvrir([fiche({ conversationCount: 31 })]);
    const more = host.querySelector('[data-admin-link="all-conversations"]');

    expect(more?.getAttribute('href')).toBe(`/admin/conversations?communityId=${ID(3)}`);
    expect(more?.textContent).toContain('sur 31');
  });

  test('les métadonnées sont interprétées : visibilité et état expliqués, dates absolue ET relative', async () => {
    const { host } = await ouvrir();
    expect(text(host, '[data-admin-meta="visibility"]')).toContain('Privée');
    expect(text(host, '[data-admin-meta="visibility"]')).toContain('invitation');
    expect(text(host, '[data-admin-meta="identifier"]')).toContain('mshy_club-jazz');
    expect(text(host, '[data-admin-meta="creator"]')).toContain('Awa Diop');
    expect(text(host, '[data-admin-meta="created"]')).toContain('il y a 2 mois');
    expect(host.querySelector('[data-admin-meta="deactivated"]')).toBeNull();
  });

  test('l’identifiant technique est la SEULE place d’un ObjectId, et aucune donnée brute ne se lit ailleurs', async () => {
    const { host } = await ouvrir();
    expect(text(host, '[data-admin-technical-id]')).toBe(ID(3));
    expectNoRawIdentifiers(host);
  });

  test('une communauté désactivée dit sa date de désactivation et ce que l’état change', async () => {
    const { host } = await ouvrir([fiche({ isActive: false, deletedAt: '2026-09-20T08:00:00.000Z' })]);
    expect(text(host, '[data-admin-identity]')).toContain('Désactivée');
    expect(text(host, '[data-admin-meta="state"]')).toContain('conversations');
    expect(text(host, '[data-admin-meta="deactivated"]')).toContain('20 sept. 2026');
    expect(text(host, '[data-admin-meta="deactivated"]')).toContain('la semaine dernière');
    expectNoRawIdentifiers(host);
  });

  test('plus de 20 conversations : l’écran dit qu’il n’en montre que les plus récentes', async () => {
    const { host } = await ouvrir([fiche({ conversationCount: 31 })]);
    expect(text(host, '[data-admin-fiche-section="conversations"]')).toContain('Les 20 conversations les plus récemment actives, sur 31.');
  });
});

describe('AdminCommunityPanel — l’onglet des membres', () => {
  test('« Aperçu » par défaut ; « Membres » porte le nombre de membres actifs', async () => {
    const { host } = await ouvrir();
    expect(host.querySelector('[data-admin-tab="overview"]')?.getAttribute('aria-selected')).toBe('true');
    expect(text(host, '[data-admin-tab="members"]')).toContain('42');
    expect(host.querySelector('[data-admin-list]')).toBeNull();
  });

  test('ouvrir l’onglet écrit `?tab=members` et charge les membres de CETTE communauté', async () => {
    const { host, gateway } = await ouvrir();
    await click(host.querySelector('[data-admin-tab="members"]'));
    expect(window.location.search).toBe('?tab=members');
    expect(gateway.calls.some((call) => call.path.startsWith(`/api/v1/admin/communities/${ID(3)}/members`))).toBe(true);
    expect(host.querySelector('[data-admin-list="communities"]')).not.toBeNull();
  });

  test('chaque membre est nommé, avec son rôle, son état, son arrivée — et ouvre sa fiche', async () => {
    const { host } = await ouvrir([], `/admin/communities/${ID(3)}?tab=members`);
    const nadia = host.querySelector(`[data-admin-row="${ID(8)}"]`);
    expect(nadia?.textContent).toContain('Nadia Fotso');
    expect(nadia?.textContent).toContain('@nadia fotso');
    expect(nadia?.textContent).toContain('Membre');
    expect(nadia?.textContent).toContain('Présent');
    expect(nadia?.querySelector('a')?.getAttribute('href')).toBe(`/admin/users/${ID(9)}`);
    const paul = host.querySelector(`[data-admin-row="${ID(10)}"]`);
    expect(paul?.textContent).toContain('Modérateur');
    expect(paul?.textContent).toContain('Parti');
    expect(paul?.textContent).toContain('il y a 2 semaines');
    expectNoRawIdentifiers(host);
  });

  test('les filtres de rôle et de présence réécrivent l’adresse en gardant l’onglet', async () => {
    const { host, gateway } = await ouvrir([], `/admin/communities/${ID(3)}?tab=members`);
    const role = host.querySelector('[data-admin-filter="role"]') as HTMLSelectElement;
    expect([...role.options].map((option) => option.textContent)).toEqual(['Tous', 'Administrateur', 'Modérateur', 'Membre']);
    act(() => {
      role.value = 'moderator';
      role.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await mounter.settle();
    expect(window.location.search).toBe('?tab=members&role=moderator');
    const last = gateway.calls[gateway.calls.length - 1];
    expect(new URL(`http://x${last?.path ?? ''}`).searchParams.get('role')).toBe('moderator');
  });

  test('le filtre de présence se nomme « Présents / Partis »', async () => {
    const { host } = await ouvrir([], `/admin/communities/${ID(3)}?tab=members`);
    const presence = host.querySelector('[data-admin-filter="isActive"]') as HTMLSelectElement;
    expect([...presence.options].map((option) => option.textContent)).toEqual(['Tous', 'Présents', 'Partis']);
  });

  test('revenir à « Aperçu » retire `tab` ET les réglages de la liste des membres de l’adresse', async () => {
    const { host } = await ouvrir([], `/admin/communities/${ID(3)}?tab=members&role=admin&q=jean`);
    await click(host.querySelector('[data-admin-tab="overview"]'));
    expect(window.location.search).toBe('');
    expect(host.querySelector('[data-admin-tab="overview"]')?.getAttribute('aria-selected')).toBe('true');
  });
});

describe('AdminCommunityPanel — les gestes', () => {
  test('active et privée : « Désactiver » et « Rendre publique » — pas « Réactiver », pas « Rendre privée »', async () => {
    const { host } = await ouvrir();
    expect(gesture(host, 'deactivate')?.textContent).toBe('Désactiver la communauté');
    expect(gesture(host, 'makePublic')?.textContent).toBe('Rendre publique');
    expect(gesture(host, 'reactivate')).toBeNull();
    expect(gesture(host, 'makePrivate')).toBeNull();
  });

  test('un MODÉRATEUR peut désactiver mais pas changer la confidentialité : « Rendre publique » n’est pas dessiné (403 à la passerelle)', async () => {
    const { host } = await ouvrir([], `/admin/communities/${ID(3)}`, adminIdentityFixture({ role: 'MODERATOR' }));

    expect(gesture(host, 'deactivate')).not.toBeNull();
    expect(gesture(host, 'makePublic')).toBeNull();
    expect(gesture(host, 'makePrivate')).toBeNull();
  });

  test('un ADMIN, lui, voit les deux gestes', async () => {
    const { host } = await ouvrir([], `/admin/communities/${ID(3)}`, adminIdentityFixture({ role: 'ADMIN' }));

    expect(gesture(host, 'deactivate')).not.toBeNull();
    expect(gesture(host, 'makePublic')).not.toBeNull();
  });

  test('désactivée et publique : « Réactiver » et « Rendre privée »', async () => {
    const { host } = await ouvrir([fiche({ isActive: false, isPrivate: false, deletedAt: '2026-09-20T08:00:00.000Z' })]);
    expect(gesture(host, 'reactivate')?.textContent).toBe('Réactiver la communauté');
    expect(gesture(host, 'makePrivate')?.textContent).toBe('Rendre privée');
    expect(gesture(host, 'deactivate')).toBeNull();
  });

  test('désactiver ouvre une feuille qui DIT l’effet, demande un motif de 10 caractères, et rien ne part avant', async () => {
    const { host, gateway } = await ouvrir();
    await click(gesture(host, 'deactivate'));
    const sheet = host.querySelector('[data-admin-confirm]');
    expect(host.querySelector('dialog h2')?.textContent).toBe('Désactiver cette communauté ?');
    expect(sheet?.textContent).toContain('plus personne ne peut la rejoindre');
    expect(sheet?.textContent).toContain('conversations');
    expect(confirmer(host)?.disabled).toBe(true);
    mounter.type(host, '[data-admin-motive]', 'trop bref');
    expect(confirmer(host)?.disabled).toBe(true);
    expect(gestures(gateway)).toHaveLength(0);
  });

  test('confirmer envoie PATCH {isActive:false, reason}, annonce le succès, ferme la feuille et relit la fiche', async () => {
    const { host, gateway } = await ouvrir();
    await click(gesture(host, 'deactivate'));
    mounter.type(host, '[data-admin-motive]', 'Contenus contraires aux règles');
    expect(confirmer(host)?.textContent).toBe('Désactiver la communauté');
    await click(confirmer(host));
    await mounter.settle();

    const [patch] = gestures(gateway);
    expect(patch).toMatchObject({ method: 'PATCH', path: `/api/v1/admin/communities/${ID(3)}`, body: { isActive: false, reason: 'Contenus contraires aux règles' } });
    expect(Object.keys((patch?.body as Record<string, unknown>) ?? {}).sort()).toEqual(['isActive', 'reason']);
    expect(text(host, '[data-admin-announcement]')).toBe('Communauté désactivée');
    expect(host.querySelector('dialog')).toBeNull();
    expect(text(host, '[data-admin-identity]')).toContain('Désactivée');
    expect(gesture(host, 'reactivate')).not.toBeNull();
    expect(gateway.calls.filter((call) => call.method === 'GET' && call.path === `/api/v1/admin/communities/${ID(3)}`).length).toBeGreaterThan(1);
  });

  test('l’effet est IMMÉDIAT : la fiche passe à « Désactivée » avant la réponse de la passerelle', async () => {
    let release: () => void = () => undefined;
    const { host, gateway } = await ouvrir([fiche(), { patch: () => new Promise((resolve) => { release = () => resolve(resultatServi({ success: true, data: fiche({ isActive: false }) })); }) }]);
    await click(gesture(host, 'deactivate'));
    mounter.type(host, '[data-admin-motive]', 'Contenus contraires aux règles');
    await click(confirmer(host));
    expect(text(host, '[data-admin-identity]')).toContain('Désactivée');
    expect(confirmer(host)?.getAttribute('aria-busy')).toBe('true');
    release();
    await mounter.settle();
    expect(gestures(gateway)).toHaveLength(1);
  });

  test('un refus DÉFAIT l’effet immédiat, garde la feuille ouverte et le dit en mots', async () => {
    const { host } = await ouvrir([fiche(), { patch: () => ({ ok: false, status: 403, error: 'Permission insuffisante' }) }]);
    await click(gesture(host, 'deactivate'));
    mounter.type(host, '[data-admin-motive]', 'Contenus contraires aux règles');
    await click(confirmer(host));
    await mounter.settle();
    expect(text(host, '[data-admin-confirm-error]')).toBe('Vous n’avez pas le droit d’effectuer ce geste.');
    expect(text(host, '[data-admin-identity]')).toContain('Active');
    expect(host.querySelector('dialog')).not.toBeNull();
    expect(text(host, '[data-admin-announcement]')).toBe('Vous n’avez pas le droit d’effectuer ce geste.');
  });

  test('annuler ferme la feuille sans rien envoyer', async () => {
    const { host, gateway } = await ouvrir();
    await click(gesture(host, 'makePublic'));
    expect(host.querySelector('dialog h2')?.textContent).toBe('Rendre cette communauté publique ?');
    await click(host.querySelector('[data-admin-action="cancel"]'));
    expect(host.querySelector('dialog')).toBeNull();
    expect(gestures(gateway)).toHaveLength(0);
  });

  test('rendre publique envoie {isPrivate:false, reason} et l’annonce', async () => {
    const { host, gateway } = await ouvrir();
    await click(gesture(host, 'makePublic'));
    mounter.type(host, '[data-admin-motive]', 'Demande du créateur de la communauté');
    await click(confirmer(host));
    expect(gestures(gateway)[0]?.body).toEqual({ isPrivate: false, reason: 'Demande du créateur de la communauté' });
    expect(text(host, '[data-admin-announcement]')).toBe('Communauté rendue publique');
    expect(text(host, '[data-admin-identity]')).toContain('Publique');
  });

  test('réactiver envoie {isActive:true, reason} et l’annonce', async () => {
    const { host, gateway } = await ouvrir([fiche({ isActive: false, deletedAt: '2026-09-20T08:00:00.000Z' })]);
    await click(gesture(host, 'reactivate'));
    expect(host.querySelector('dialog h2')?.textContent).toBe('Réactiver cette communauté ?');
    mounter.type(host, '[data-admin-motive]', 'Erreur de modération corrigée');
    await click(confirmer(host));
    expect(gestures(gateway)[0]?.body).toEqual({ isActive: true, reason: 'Erreur de modération corrigée' });
    expect(text(host, '[data-admin-announcement]')).toBe('Communauté réactivée');
    expect(text(host, '[data-admin-identity]')).toContain('Active');
  });

  test('hors ligne : les gestes sont éteints et l’écran le dit', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    const { host } = await ouvrir();
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    expect(gesture(host, 'deactivate')?.disabled).toBe(true);
    expect(host.querySelector('[data-admin-notice="warning"]')?.textContent).toContain('hors ligne');
  });
});

describe('AdminCommunityPanel — les états dessinés', () => {
  test('squelette tant que la fiche n’est pas arrivée ; le titre de page est déjà là', async () => {
    const { host } = await ouvrir([fiche(), { get: () => new Promise(() => undefined) }]);
    expect(host.querySelector('[data-admin-fiche]')).toBeNull();
    expect(text(host, '[data-admin-page-title]')).toBe('Communautés');
  });

  test('introuvable (404) : un état dessiné, pas une panne', async () => {
    const { host } = await ouvrir([fiche(), { get: () => ({ ok: false, status: 404, error: 'Communauté introuvable' }) }]);
    expect(text(host, '[data-admin-empty]')).toContain('Cette communauté est introuvable');
    expect(host.querySelector('[data-admin-error]')).toBeNull();
  });

  test('refus (403) : le bloc est dit réservé', async () => {
    const { host } = await ouvrir([fiche(), { get: () => ({ ok: false, status: 403, error: 'Permission insuffisante' }) }]);
    expect(host.querySelector('[data-admin-denied-inline]')).not.toBeNull();
  });

  test('erreur : « Réessayer » relit et la fiche apparaît', async () => {
    let calls = 0;
    const { host } = await ouvrir([fiche(), { get: () => (++calls === 1 ? { ok: false, status: 500, error: 'boom' } : resultatServi({ success: true, data: fiche() })) }]);
    expect(host.querySelector('[data-admin-error]')).not.toBeNull();
    await click(host.querySelector('[data-admin-retry]'));
    await mounter.settle();
    expect(text(host, '[data-admin-identity] h2')).toBe('Club de jazz');
  });

  test('l’écran est fermé à qui n’a pas la capacité des communautés', async () => {
    const { Router } = createRouter(
      { adminCommunity: { pattern: '/admin/communities/$community', screen: async () => ({ default: AdminCommunityScreen }) } },
      () => <p>absent</p>,
    );
    navigate(`/admin/communities/${ID(3)}`, true);
    const host = await mount(<Router wrap={(children) => children} skeleton={null} />, adminIdentityFixture({ role: 'ANALYST' }));
    for (let attempt = 0; attempt < 30 && !(host.textContent ?? '').includes('Espace réservé'); attempt += 1) await mounter.settle();
    expect(host.textContent).toContain('Espace réservé');
    expect(host.querySelector('[data-admin-screen="community"]')).toBeNull();
  });
});

describe('AdminCommunityScreen — servi par la table des routes, dans les deux espaces', () => {
  const seed = () => appQueryClient.setQueryData(adminCommunityQueryKey(ID(3)), decodeAdminCommunityFiche(fiche()));

  test('/admin/communities/$community rend la VRAIE fiche, la section « Communautés » surlignée au menu', async () => {
    seed();
    const host = await mountAdminAt(mounter, `/admin/communities/${ID(3)}`, BIGBOSS, '[data-admin-screen="community"]');
    expect(host.querySelector('[data-admin-stub]') === null).toBe(true);
    expect(text(host, '[data-admin-identity] h2')).toBe('Club de jazz');
    expect(host.querySelector('[data-admin-nav="communities"]')?.getAttribute('aria-current')).toBe('page');
    expect(host.querySelector('[data-admin-back]')?.getAttribute('href')).toBe('/admin/communities');
  });

  test('/adm/communities/$community : la même fiche, le retour et les liens restent dans /adm', async () => {
    seed();
    const host = await mountAdminAt(mounter, `/adm/communities/${ID(3)}`, BIGBOSS, '[data-admin-screen="community"]');
    expect(host.querySelector('[data-admin-back]')?.getAttribute('href')).toBe('/adm/communities');
    expect(host.querySelector(`[data-admin-conversation="${ID(5)}"] a`)?.getAttribute('href')).toBe(`/adm/conversations/${ID(5)}`);
  });
});
