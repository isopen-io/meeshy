import { act } from 'react';
import { describe, expect, test } from 'bun:test';

import type { AdminDeps } from '@/lib/api/admin';
import type { ApiResult, HttpRequest } from '@/lib/api/http';
import { createRouter, navigate } from '@/lib/router';
import { adminIdentityFixture, expectNoRawIdentifiers } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';
import { resultatServi } from '@/test-support/served-pagination';

import { adminPostQueryKey, decodeAdminPostFiche } from '@/lib/api/admin-posts-detail';
import { appQueryClient } from '@/lib/api/query-client';
import { mountAdminAt } from '@/test-support/admin-router';

import AdminPostScreen, { AdminPostPanel } from './admin-post';

/**
 * LA FICHE D'UNE PUBLICATION (#8876) — auteur nommé, contenu, médias, compteurs,
 * contexte, commentaires, spectateurs, métadonnées interprétées, et le geste
 * « Retirer la publication ». La position et les personnes visées par l'audience
 * n'y figurent jamais.
 */
const { mount, mounter } = setupAdminKitTests({ languages: ['fr', 'en'] });
const BIGBOSS = adminIdentityFixture({ role: 'BIGBOSS' });
const ID = (n: number) => `64f1c2a9e8b7d6c5b4a3928${n}`;
const NOW = new Date('2026-09-30T12:00:00.000Z');
const person = (n: number, name: string, username = name.split(' ')[0]?.toLowerCase() ?? 'x') => ({ id: ID(n), username, displayName: name, avatar: null });

const served = (overrides: Record<string, unknown> = {}) => ({
  id: ID(9),
  authorId: ID(1),
  type: 'STORY',
  visibility: 'ONLY',
  visibilityUserIds: [ID(5), ID(6), ID(7)],
  content: 'Ce soir, on fête ça !',
  originalLanguage: 'fr',
  translations: { en: { text: 'Tonight we celebrate!' }, es: { text: '¡Esta noche lo celebramos!' } },
  metadata: { trackingLinks: [{ url: 'https://x', token: 'secret-token' }] },
  geoPoint: { type: 'Point', coordinates: [2.35, 48.85] },
  geoPrecision: 'EXACT',
  communityId: ID(3),
  repostOfId: ID(8),
  isQuote: true,
  moodEmoji: '🎉',
  expiresAt: '2026-09-30T20:00:00.000Z',
  likeCount: 12,
  commentCount: 4,
  repostCount: 2,
  viewCount: 300,
  shareCount: 1,
  bookmarkCount: 3,
  isPinned: true,
  isEdited: true,
  contentEditedAt: '2026-09-30T09:30:00.000Z',
  deletedAt: null,
  createdAt: '2026-09-30T09:00:00.000Z',
  updatedAt: '2026-09-30T09:31:00.000Z',
  author: person(1, 'Awa Diop'),
  media: [
    { id: 'm1', mimeType: 'image/jpeg', fileUrl: 'https://cdn.meeshy.me/1.jpg', thumbnailUrl: 'https://cdn.meeshy.me/1-t.jpg', caption: 'La scène', alt: 'Une scène éclairée', fileSize: 204800, duration: null },
    { id: 'm2', mimeType: 'audio/mpeg', fileUrl: 'https://cdn.meeshy.me/2.mp3', thumbnailUrl: null, caption: null, alt: null, fileSize: 1024, duration: 12500 },
  ],
  comments: [
    { id: 'c1', content: 'Magnifique, bravo à toute l’équipe', likeCount: 2, replyCount: 0, createdAt: '2026-09-30T10:00:00.000Z', author: person(2, 'Jean Mbarga') },
    { id: 'c2', content: null, createdAt: '2026-09-30T10:30:00.000Z', author: person(4, 'Mariam Nkolo') },
  ],
  views: [
    { id: 'v1', userId: ID(2), viewedAt: '2026-09-30T10:00:00.000Z', duration: 4000, user: person(2, 'Jean Mbarga') },
    { id: 'v2', userId: ID(4), viewedAt: '2026-09-30T10:05:00.000Z', duration: 2000, user: person(4, 'Mariam Nkolo') },
  ],
  repostOf: { id: ID(8), content: 'Le texte originel', type: 'POST', createdAt: '2026-09-29T10:00:00.000Z', author: person(4, 'Mariam Nkolo') },
  community: { id: ID(3), identifier: 'mshy_club-jazz', name: 'Club de jazz', avatar: null },
  _count: { comments: 31, views: 61, bookmarks: 3, reposts: 2 },
  ...overrides,
});

type Gateway = {
  current: Readonly<Record<string, unknown>>;
  readonly calls: HttpRequest[];
  remove?: () => ApiResult<unknown> | Promise<ApiResult<unknown>>;
  get?: () => ApiResult<unknown> | Promise<ApiResult<unknown>>;
};

function gatewayOf(initial = served(), overrides: Partial<Pick<Gateway, 'remove' | 'get'>> = {}) {
  const gateway: Gateway = { current: initial, calls: [], ...overrides };
  const reply = async (req: HttpRequest): Promise<ApiResult<unknown>> => {
    gateway.calls.push(req);
    if (req.method === 'DELETE') {
      if (gateway.remove !== undefined) return gateway.remove();
      gateway.current = { ...gateway.current, deletedAt: '2026-09-30T12:00:00.000Z' };
      return resultatServi({ success: true, message: 'Post supprime avec succes' });
    }
    return gateway.get?.() ?? resultatServi({ success: true, data: gateway.current });
  };
  const transport: AdminDeps['transport'] = Object.assign(async () => ({ ok: false as const, status: 0, error: 'jamais appelé' }), {
    request: async <T,>(req: HttpRequest): Promise<ApiResult<T>> => (await reply(req)) as ApiResult<T>,
  });
  return { gateway, deps: { source: 'gateway', transport } satisfies AdminDeps };
}

async function ouvrir(gatewayOptions: Parameters<typeof gatewayOf> = [], url = `/admin/posts/${ID(9)}`, identity = BIGBOSS) {
  const { gateway, deps } = gatewayOf(...gatewayOptions);
  const { Router } = createRouter(
    { adminPost: { pattern: '/admin/posts/$post', screen: async () => ({ default: () => <AdminPostPanel language="fr" postId={ID(9)} deps={deps} now={NOW} /> }) } },
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
const confirmer = (host: ParentNode) => host.querySelector<HTMLButtonElement>('[data-admin-action="confirm"]');
const removals = (gateway: Gateway) => gateway.calls.filter((call) => call.method === 'DELETE');

describe('AdminPostPanel — identité : le nom de la publication, son auteur, ses badges', () => {
  test('« {type} de {auteur} » en titre de page et de carte', async () => {
    const { host } = await ouvrir();
    expect(text(host, '[data-admin-page-title]')).toBe('Story de Awa Diop');
    expect(text(host, '[data-admin-identity] h2')).toBe('Story de Awa Diop');
  });

  test('le secondaire dit QUAND elle a été publiée, en absolu et en relatif', async () => {
    const { host } = await ouvrir();
    expect(text(host, '[data-admin-identity]')).toContain('Publiée le 30 sept. 2026, 09:00 · il y a 3 heures');
  });

  test('type, audience, état, épinglage et modification se disent en badges', async () => {
    const { host } = await ouvrir();
    const identity = text(host, '[data-admin-identity]');
    for (const word of ['Story', 'Certains amis', 'Publiée', 'Épinglée', 'Modifiée']) expect(identity).toContain(word);
  });

  test('le fil d’Ariane : Contenus › Publications (lien) › le nom', async () => {
    const { host } = await ouvrir();
    expect([...host.querySelectorAll('nav[aria-label] li')].map((item) => item.textContent?.trim())).toEqual(['Contenus', 'Publications', 'Story de Awa Diop']);
    expect(host.querySelector('nav[aria-label] a')?.getAttribute('href')).toBe('/admin/posts');
  });

  test('les six compteurs', async () => {
    const { host } = await ouvrir();
    const expected = { likes: '12', comments: '4', shares: '1', views: '300', bookmarks: '3', reposts: '2' };
    for (const [id, value] of Object.entries(expected)) expect(text(host, `[data-admin-stat="${id}"]`)).toContain(value);
    expect(text(host, '[data-admin-stat="bookmarks"]')).toContain('Enregistrements');
  });
});

describe('AdminPostPanel — contenu, langue, médias', () => {
  test('le texte, la langue d’origine NOMMÉE et le nombre de langues traduites', async () => {
    const { host } = await ouvrir();
    expect(text(host, '[data-admin-fiche-section="content"]')).toContain('Ce soir, on fête ça !');
    expect(text(host, '[data-admin-language]')).toContain('Français');
    expect(text(host, '[data-admin-language]')).toContain('Traduite en 2 langues');
    expect(text(host, '[data-admin-mood]')).toContain('🎉');
  });

  test('une audience restreinte dit pourquoi son texte est lisible ici', async () => {
    const { host } = await ouvrir();
    expect(host.querySelector('[data-admin-fiche-section="content"] [data-admin-notice="info"]')?.textContent).toContain('audience restreinte');
  });

  test('une publication publique n’a pas cet avis', async () => {
    const { host } = await ouvrir([served({ visibility: 'PUBLIC', visibilityUserIds: [] })]);
    expect(host.querySelector('[data-admin-fiche-section="content"] [data-admin-notice]')).toBeNull();
  });

  test('sans texte : l’écran le dit ; sans langue : « Langue non détectée »', async () => {
    const { host } = await ouvrir([served({ content: null, originalLanguage: null, translations: null, moodEmoji: null })]);
    expect(text(host, '[data-admin-fiche-section="content"]')).toContain('n’a pas de texte');
    expect(text(host, '[data-admin-language]')).toContain('Langue non détectée');
    expect(text(host, '[data-admin-language]')).toContain('Pas encore traduite');
    expect(host.querySelector('[data-admin-mood]')).toBeNull();
  });

  test('les médias : vignette, légende, texte alternatif, genre · poids · durée, et un lien vers le fichier', async () => {
    const { host } = await ouvrir();
    const image = host.querySelector('[data-admin-media="m1"]');
    expect(image?.textContent?.replace(/\s/g, ' ')).toContain('Image · 200 ko');
    expect(image?.textContent).toContain('Légende : La scène');
    expect(image?.textContent).toContain('Texte alternatif : Une scène éclairée');
    expect(image?.querySelector('img')?.getAttribute('alt')).toBe('Une scène éclairée');
    expect(image?.querySelector('a')?.getAttribute('aria-label')).toBe('Ouvrir le média 1');
    expect(image?.querySelector('a')?.getAttribute('target')).toBe('_blank');
    expect(image?.querySelector('a')?.getAttribute('rel')).toBe('noopener noreferrer');
    const audio = host.querySelector('[data-admin-media="m2"]');
    expect(audio?.textContent).toContain('Audio');
    expect(audio?.textContent?.replace(/\s/g, ' ')).toContain('13 s');
    expect(audio?.querySelector('img')).toBeNull();
  });

  test('sans média : pas de section « Médias »', async () => {
    const { host } = await ouvrir([served({ media: [] })]);
    expect(host.querySelector('[data-admin-fiche-section="media"]')).toBeNull();
  });
});

describe('AdminPostPanel — contexte, commentaires, spectateurs', () => {
  test('l’auteur ouvre sa fiche, et « Voir ses publications » filtre la liste sur lui', async () => {
    const { host } = await ouvrir();
    const links = [...host.querySelectorAll('[data-admin-meta="author"] a')].map((link) => link.getAttribute('href'));
    expect(links).toContain(`/admin/users/${ID(1)}`);
    expect(links).toContain(`/admin/posts?authorId=${ID(1)}`);
  });

  test('la communauté est une puce qui ouvre sa fiche', async () => {
    const { host } = await ouvrir();
    const community = host.querySelector('[data-admin-meta="community"]');
    expect(community?.textContent).toContain('Club de jazz');
    expect(community?.querySelector('a')?.getAttribute('href')).toBe(`/admin/communities/${ID(3)}`);
  });

  test('le repartage est une puce de publication, et dit s’il est une citation', async () => {
    const { host } = await ouvrir();
    const repost = host.querySelector('[data-admin-meta="repost"]');
    expect(repost?.textContent).toContain('Publication de Mariam Nkolo');
    expect(repost?.textContent).toContain('Repartage avec commentaire');
    expect(repost?.querySelector('a')?.getAttribute('href')).toBe(`/admin/posts/${ID(8)}`);
    expect(host.textContent).not.toContain('texte originel');
  });

  test('un repartage simple le dit', async () => {
    const { host } = await ouvrir([served({ isQuote: false })]);
    expect(text(host, '[data-admin-meta="repost"]')).toContain('Repartage simple');
  });

  test('sans communauté ni repartage, ces lignes disparaissent', async () => {
    const { host } = await ouvrir([served({ community: null, repostOf: null })]);
    expect(host.querySelector('[data-admin-meta="community"]') === null).toBe(true);
    expect(host.querySelector('[data-admin-meta="repost"]') === null).toBe(true);
  });

  test('les derniers commentaires : auteur nommé, texte, date relative, et « N sur TOTAL »', async () => {
    const { host } = await ouvrir();
    const section = host.querySelector('[data-admin-fiche-section="comments"]');
    expect(section?.textContent).toContain('Derniers commentaires : 2 sur 31');
    const first = host.querySelector('[data-admin-comment="c1"]');
    expect(first?.textContent).toContain('Jean Mbarga');
    expect(first?.textContent).toContain('Magnifique, bravo à toute l’équipe');
    expect(first?.textContent).toContain('il y a 2 heures');
    expect(first?.querySelector('a')?.getAttribute('href')).toBe(`/admin/users/${ID(2)}`);
    expect(text(host, '[data-admin-comment="c2"]')).toContain('Commentaire sans texte');
  });

  test('sans commentaire : « Aucun commentaire pour le moment. »', async () => {
    const { host } = await ouvrir([served({ comments: [] })]);
    expect(text(host, '[data-admin-fiche-section="comments"]')).toContain('Aucun commentaire pour le moment.');
  });

  test('les derniers spectateurs sont des puces nommées, avec « N sur TOTAL »', async () => {
    const { host } = await ouvrir();
    const section = host.querySelector('[data-admin-fiche-section="viewers"]');
    expect(section?.textContent).toContain('Derniers spectateurs : 2 sur 61');
    expect(host.querySelector(`[data-admin-viewer="${ID(2)}"]`)?.textContent).toContain('Jean Mbarga');
    expect(host.querySelector(`[data-admin-viewer="${ID(4)}"] a`)?.getAttribute('href')).toBe(`/admin/users/${ID(4)}`);
  });

  test('sans spectateur : « Personne n’a encore vu cette publication. »', async () => {
    const { host } = await ouvrir([served({ views: [] })]);
    expect(text(host, '[data-admin-fiche-section="viewers"]')).toContain('Personne n’a encore vu');
  });
});

describe('AdminPostPanel — métadonnées interprétées', () => {
  test('l’audience choisie se dit par sa TAILLE : « Visible par 3 personnes choisies »', async () => {
    const { host } = await ouvrir();
    expect(text(host, '[data-admin-meta="visibility"]')).toContain('Certains amis');
    expect(text(host, '[data-admin-meta="visibility"]')).toContain('Visible par 3 personnes choisies');
  });

  test('une audience « sauf certains » dit combien de personnes sont exclues', async () => {
    const { host } = await ouvrir([served({ visibility: 'EXCEPT', visibilityUserIds: [ID(5)] })]);
    expect(text(host, '[data-admin-meta="visibility"]')).toContain('Masquée à 1 personne');
  });

  test('l’état est expliqué, l’épinglage et la modification dits en mots', async () => {
    const { host } = await ouvrir();
    expect(text(host, '[data-admin-meta="state"]')).toContain('Publiée');
    expect(text(host, '[data-admin-meta="pinned"]')).toContain('Épinglée');
    expect(text(host, '[data-admin-meta="edited"]')).toContain('Modifiée le 30 sept. 2026, 09:30');
  });

  test('jamais modifiée, non épinglée : dit en toutes lettres, jamais « false »', async () => {
    const { host } = await ouvrir([served({ isPinned: false, isEdited: false, contentEditedAt: null })]);
    expect(text(host, '[data-admin-meta="pinned"]')).toContain('Non épinglée');
    expect(text(host, '[data-admin-meta="edited"]')).toContain('Jamais modifiée');
  });

  test('une story encore en ligne dit quand elle s’éteindra', async () => {
    const { host } = await ouvrir();
    expect(text(host, '[data-admin-meta="expires"]')).toContain('disparaîtra d’elle-même');
  });

  test('une story expirée dit qu’elle a fini sa vie', async () => {
    const { host } = await ouvrir([served({ expiresAt: '2026-09-30T08:00:00.000Z' })]);
    expect(text(host, '[data-admin-meta="state"]')).toContain('Expirée');
    expect(text(host, '[data-admin-meta="expires"]')).toContain('Une story disparaît d’elle-même à la fin de sa durée de vie.');
  });

  test('« Mise à jour » est expliquée : elle bouge avec les compteurs', async () => {
    const { host } = await ouvrir();
    expect(text(host, '[data-admin-meta="updated"]')).toContain('compteur');
  });

  test('l’identifiant technique est la SEULE place d’un ObjectId', async () => {
    const { host } = await ouvrir();
    expect(text(host, '[data-admin-technical-id]')).toBe(ID(9));
    expectNoRawIdentifiers(host);
  });

  test('ni la position, ni les personnes visées, ni un jeton ne se lisent dans la fiche', async () => {
    const { host } = await ouvrir();
    const body = host.innerHTML;
    for (const secret of ['geoPoint', '48.85', '2.35', ID(5), ID(6), ID(7), 'secret-token', 'Tonight we celebrate']) expect(body).not.toContain(secret);
  });
});

describe('AdminPostPanel — « Retirer la publication »', () => {
  test('une publication en ligne offre le geste', async () => {
    const { host } = await ouvrir();
    expect(text(host, '[data-admin-action="remove"]')).toBe('Retirer la publication');
  });

  test('une publication retirée ne l’offre plus et se dit « Retirée »', async () => {
    const { host } = await ouvrir([served({ deletedAt: '2026-09-30T10:00:00.000Z' })]);
    expect(host.querySelector('[data-admin-action="remove"]') === null).toBe(true);
    expect(text(host, '[data-admin-identity]')).toContain('Retirée');
  });

  test('la feuille DIT l’effet (et qu’aucune restauration n’est offerte), demande un motif de 3 caractères, rien ne part avant', async () => {
    const { host, gateway } = await ouvrir();
    await click(host.querySelector('[data-admin-action="remove"]'));
    expect(host.querySelector('dialog h2')?.textContent).toBe('Retirer cette publication ?');
    expect(text(host, '[data-admin-confirm]')).toContain('ne permet pas de la rétablir');
    expect(confirmer(host)?.disabled).toBe(true);
    mounter.type(host, '[data-admin-motive]', 'ab');
    expect(confirmer(host)?.disabled).toBe(true);
    mounter.type(host, '[data-admin-motive]', 'abc');
    expect(confirmer(host)?.disabled).toBe(false);
    expect(removals(gateway)).toHaveLength(0);
  });

  test('confirmer envoie DELETE {reason}, annonce le succès, ferme la feuille, relit la fiche — qui passe à « Retirée »', async () => {
    const { host, gateway } = await ouvrir();
    await click(host.querySelector('[data-admin-action="remove"]'));
    mounter.type(host, '[data-admin-motive]', 'Propos haineux signalés');
    expect(confirmer(host)?.textContent).toBe('Retirer la publication');
    await click(confirmer(host));
    await mounter.settle();

    expect(removals(gateway)[0]).toMatchObject({ method: 'DELETE', path: `/api/v1/admin/posts/${ID(9)}`, body: { reason: 'Propos haineux signalés' } });
    expect(text(host, '[data-admin-announcement]')).toBe('Publication retirée');
    expect(host.querySelector('dialog')).toBeNull();
    expect(text(host, '[data-admin-identity]')).toContain('Retirée');
    expect(host.querySelector('[data-admin-action="remove"]')).toBeNull();
    expect(gateway.calls.filter((call) => call.method === 'GET').length).toBeGreaterThan(1);
  });

  test('l’effet est IMMÉDIAT : « Retirée » avant la réponse de la passerelle', async () => {
    let release: () => void = () => undefined;
    const { host } = await ouvrir([served(), { remove: () => new Promise((resolve) => { release = () => resolve(resultatServi({ success: true, message: 'ok' })); }) }]);
    await click(host.querySelector('[data-admin-action="remove"]'));
    mounter.type(host, '[data-admin-motive]', 'Propos haineux signalés');
    await click(confirmer(host));
    expect(text(host, '[data-admin-identity]')).toContain('Retirée');
    expect(confirmer(host)?.getAttribute('aria-busy')).toBe('true');
    release();
    await mounter.settle();
  });

  test('un refus DÉFAIT l’effet immédiat, garde la feuille ouverte et le dit en mots', async () => {
    const { host } = await ouvrir([served(), { remove: () => ({ ok: false, status: 403, error: 'Permission insuffisante' }) }]);
    await click(host.querySelector('[data-admin-action="remove"]'));
    mounter.type(host, '[data-admin-motive]', 'Propos haineux signalés');
    await click(confirmer(host));
    await mounter.settle();
    expect(text(host, '[data-admin-confirm-error]')).toBe('Vous n’avez pas le droit d’effectuer ce geste.');
    expect(host.querySelector('dialog')).not.toBeNull();
    expect(text(host, '[data-admin-identity]')).not.toContain('Retirée');
  });

  test('« déjà retirée » (400) se dit en mots, et l’état n’est pas faussé', async () => {
    const { host } = await ouvrir([served(), { remove: () => ({ ok: false, status: 400, error: 'Le post est deja supprime' }) }]);
    await click(host.querySelector('[data-admin-action="remove"]'));
    mounter.type(host, '[data-admin-motive]', 'Doublon de signalement');
    await click(confirmer(host));
    await mounter.settle();
    expect(text(host, '[data-admin-confirm-error]')).toBe('Cette publication était déjà retirée.');
  });

  test('annuler ferme la feuille sans rien envoyer', async () => {
    const { host, gateway } = await ouvrir();
    await click(host.querySelector('[data-admin-action="remove"]'));
    await click(host.querySelector('[data-admin-action="cancel"]'));
    expect(host.querySelector('dialog')).toBeNull();
    expect(removals(gateway)).toHaveLength(0);
  });

  test('hors ligne : le geste est éteint et l’écran le dit', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    const { host } = await ouvrir();
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    expect(host.querySelector<HTMLButtonElement>('[data-admin-action="remove"]')?.disabled).toBe(true);
    expect(host.querySelector('[data-admin-notice="warning"]')?.textContent).toContain('hors ligne');
  });
});

describe('AdminPostPanel — les états dessinés', () => {
  test('squelette tant que la fiche n’est pas arrivée ; le titre de page est déjà là', async () => {
    const { host } = await ouvrir([served(), { get: () => new Promise(() => undefined) }]);
    expect(host.querySelector('[data-admin-fiche]') === null).toBe(true);
    expect(text(host, '[data-admin-page-title]')).toBe('Publications');
  });

  test('introuvable (404) : un état dessiné, pas une panne', async () => {
    const { host } = await ouvrir([served(), { get: () => ({ ok: false, status: 404, error: 'Post non trouve' }) }]);
    expect(text(host, '[data-admin-empty]')).toContain('Cette publication est introuvable');
    expect(host.querySelector('[data-admin-error]')).toBeNull();
  });

  test('refus (403) : le bloc est dit réservé', async () => {
    const { host } = await ouvrir([served(), { get: () => ({ ok: false, status: 403, error: 'Permission insuffisante' }) }]);
    expect(host.querySelector('[data-admin-denied-inline]')).not.toBeNull();
  });

  test('erreur : « Réessayer » relit et la fiche apparaît', async () => {
    let calls = 0;
    const { host } = await ouvrir([served(), { get: () => (++calls === 1 ? { ok: false, status: 500, error: 'boom' } : resultatServi({ success: true, data: served() })) }]);
    expect(host.querySelector('[data-admin-error]')).not.toBeNull();
    await click(host.querySelector('[data-admin-retry]'));
    await mounter.settle();
    expect(text(host, '[data-admin-identity] h2')).toBe('Story de Awa Diop');
  });

  test('l’écran est fermé à qui n’a pas la capacité de modérer', async () => {
    const { Router } = createRouter({ adminPost: { pattern: '/admin/posts/$post', screen: async () => ({ default: AdminPostScreen }) } }, () => <p>absent</p>);
    navigate(`/admin/posts/${ID(9)}`, true);
    const host = await mount(<Router wrap={(children) => children} skeleton={null} />, adminIdentityFixture({ role: 'ANALYST' }));
    for (let attempt = 0; attempt < 30 && !(host.textContent ?? '').includes('Espace réservé'); attempt += 1) await mounter.settle();
    expect(host.textContent).toContain('Espace réservé');
    expect(host.querySelector('[data-admin-screen="post"]')).toBeNull();
  });
});

describe('AdminPostScreen — servi par la table des routes, dans les deux espaces', () => {
  const seed = () => appQueryClient.setQueryData(adminPostQueryKey(ID(9)), decodeAdminPostFiche(served()));

  test('/admin/posts/$post rend la VRAIE fiche, la section « Publications » surlignée au menu', async () => {
    seed();
    const host = await mountAdminAt(mounter, `/admin/posts/${ID(9)}`, BIGBOSS, '[data-admin-screen="post"]');
    expect(host.querySelector('[data-admin-stub]') === null).toBe(true);
    expect(text(host, '[data-admin-identity] h2')).toBe('Story de Awa Diop');
    expect(host.querySelector('[data-admin-nav="posts"]')?.getAttribute('aria-current')).toBe('page');
    expect(host.querySelector('[data-admin-back]')?.getAttribute('href')).toBe('/admin/posts');
  });

  test('/adm/posts/$post : la même fiche, le retour et les liens restent dans /adm', async () => {
    seed();
    const host = await mountAdminAt(mounter, `/adm/posts/${ID(9)}`, BIGBOSS, '[data-admin-screen="post"]');
    expect(host.querySelector('[data-admin-back]')?.getAttribute('href')).toBe('/adm/posts');
    expect(host.querySelector('[data-admin-meta="community"] a')?.getAttribute('href')).toBe(`/adm/communities/${ID(3)}`);
  });
});
