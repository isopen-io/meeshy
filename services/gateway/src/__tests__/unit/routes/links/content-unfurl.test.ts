/**
 * @jest-environment node
 *
 * UN LIEN DE CONTENU SE DÉPLIE CHEZ LES ROBOTS D'APERÇU (#3673, parapluie #19331).
 *
 * `GET /posts/:postId/og` est ce que Traefik sert aux robots qui déplient
 * `/post/<id>`, `/reel/<id>`, `/story/<id>`, `/mood/<id>` ou `/feeds/post/<id>` ;
 * `GET /tracking-links/:token/og`, ce qu'il leur sert pour le lien SUIVI que frappe
 * la feuille de partage (cible `POST`/`REEL`/`STORY`/`STATUS`).
 *
 * Le robot est un lecteur SANS compte : un contenu ne se nomme que s'il lui est
 * servable (`isServableToAnonymous`, #9149 — public, vivant, auteur actif, original
 * public). Tout le reste rend l'aperçu GÉNÉRIQUE, le même pour tous, qui ne dit pas
 * si le contenu existe. Les témoins lisent la page RENDUE (`app.inject`).
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';

import { registerLinkUnfurlRoute } from '../../../../routes/links/unfurl';

const ORIGIN = 'https://staging.meeshy.me';
const POST_ID = '66f0c0ffee0000000000c0de';
const ORIGINAL_ID = '66f0c0ffee0000000000beef';
const TOKEN = 'Rl9xYz';
const GENERIQUE_FR = 'Meeshy — la messagerie qui traduit';
const IMAGE_DE_MARQUE = `${ORIGIN}/og/invitation-v1.png`;
const API = 'https://gate.meeshy.me';

type Media = {
  readonly mimeType?: string;
  readonly fileSize?: number | null;
  readonly fileUrl?: string;
  readonly thumbnailUrl?: string | null;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly duration?: number | null;
  readonly alt?: string | null;
  readonly imageVariants?: unknown;
  readonly renditions?: unknown;
  readonly videoCodec?: string | null;
};

const media = (o: Media = {}) => ({
  mimeType: o.mimeType ?? 'image/jpeg',
  fileSize: o.fileSize === undefined ? 4_200_000 : o.fileSize,
  fileUrl: o.fileUrl ?? '2026/11/66f0c0ffee0000000000aaaa/plage.jpg',
  thumbnailUrl: o.thumbnailUrl === undefined ? '2026/11/66f0c0ffee0000000000aaaa/plage_thumb.jpg' : o.thumbnailUrl,
  width: o.width === undefined ? 3024 : o.width,
  height: o.height === undefined ? 4032 : o.height,
  duration: o.duration ?? null,
  alt: o.alt ?? null,
  imageVariants: o.imageVariants === undefined
    ? [
        { width: 640, height: 853, url: '2026/11/66f0c0ffee0000000000aaaa/plage_640w.webp', size: 40_000, format: 'webp' },
        { width: 1080, height: 1440, url: '2026/11/66f0c0ffee0000000000aaaa/plage_1080w.webp', size: 120_000, format: 'webp' },
        { width: 2048, height: 2731, url: '2026/11/66f0c0ffee0000000000aaaa/plage_2048w.webp', size: 420_000, format: 'webp' },
      ]
    : o.imageVariants,
  renditions: o.renditions ?? null,
  videoCodec: o.videoCodec ?? null,
});

type Auteur = {
  readonly username?: string;
  readonly displayName?: string | null;
  readonly avatar?: string | null;
  readonly isActive?: boolean;
  readonly deletedAt?: Date | null;
  readonly deactivatedAt?: Date | null;
};

const auteur = (o: Auteur = {}) => ({
  username: o.username ?? 'amani',
  displayName: o.displayName === undefined ? 'Amani Diallo' : o.displayName,
  avatar: o.avatar === undefined ? 'https://gate.meeshy.me/api/v1/attachments/file/2026%2F10%2Favatar.png' : o.avatar,
  isActive: o.isActive ?? true,
  deletedAt: o.deletedAt ?? null,
  deactivatedAt: o.deactivatedAt ?? null,
  email: 'amani@example.org',
  phoneNumber: '+33600000000',
  isOnline: true,
});

type Contenu = {
  readonly id?: string;
  readonly type?: 'POST' | 'REEL' | 'STORY' | 'STATUS';
  readonly visibility?: string;
  readonly deletedAt?: Date | null;
  readonly expiresAt?: Date | null;
  readonly content?: string | null;
  readonly originalLanguage?: string | null;
  readonly translations?: unknown;
  readonly moodEmoji?: string | null;
  readonly author?: ReturnType<typeof auteur> | null;
  readonly media?: ReadonlyArray<ReturnType<typeof media>>;
  readonly repostOfId?: string | null;
  readonly repostOf?: Record<string, unknown> | null;
};

const contenu = (o: Contenu = {}) => ({
  id: o.id ?? POST_ID,
  type: o.type ?? 'POST',
  visibility: o.visibility ?? 'PUBLIC',
  deletedAt: o.deletedAt ?? null,
  expiresAt: o.expiresAt ?? null,
  content: o.content === undefined ? 'Coucher de soleil sur la Petite Côte.' : o.content,
  originalLanguage: o.originalLanguage === undefined ? 'fr' : o.originalLanguage,
  translations: o.translations === undefined
    ? { en: { text: 'Sunset on the Petite Côte.', translationModel: 'nllb' } }
    : o.translations,
  moodEmoji: o.moodEmoji ?? null,
  repostOfId: o.repostOfId ?? null,
  repostOf: o.repostOf ?? null,
  author: o.author === undefined ? auteur() : o.author,
  media: o.media ?? [media()],
  viewCount: 1234,
  bookmarkCount: 56,
  visibilityUserIds: ['66f0c0ffee0000000000dddd'],
});

type Ligne = ReturnType<typeof contenu> | null | (() => Promise<never>);

type Suivi = {
  readonly targetType?: string;
  readonly targetId?: string | null;
  readonly originalUrl?: string;
  readonly isActive?: boolean;
  readonly expiresAt?: Date | null;
};

const suivi = (o: Suivi = {}) => ({
  token: TOKEN,
  targetType: o.targetType ?? 'REEL',
  targetId: o.targetId === undefined ? POST_ID : o.targetId,
  originalUrl: o.originalUrl ?? `${ORIGIN}/reel/${POST_ID}`,
  isActive: o.isActive ?? true,
  expiresAt: o.expiresAt ?? null,
  createdBy: '66f0c0ffee0000000000eeee',
  addressId: null,
});

const strict = <T extends object>(nom: string, methodes: T): T =>
  new Proxy(methodes, {
    get(target, prop) {
      if (prop === 'then') return undefined;
      if (prop in target) return target[prop as keyof T];
      throw new Error(`${nom}.${String(prop)} n'est pas une lecture de l'aperçu`);
    },
  });

type Monde = { readonly ligne?: Ligne; readonly suivi?: ReturnType<typeof suivi> | null };

const monter = async (monde: Monde = {}) => {
  const postFindFirst = jest.fn(async (args: { where: { id?: string } }) => {
    const ligne = monde.ligne === undefined ? contenu() : monde.ligne;
    if (typeof ligne === 'function') return ligne();
    return ligne && args.where.id === ligne.id ? ligne : null;
  });
  const trackingFindUnique = jest.fn(async (args: { where: { token?: string } }) => {
    const ligne = monde.suivi === undefined ? suivi() : monde.suivi;
    return ligne && args.where.token === TOKEN ? ligne : null;
  });
  const prisma = strict('prisma', {
    post: strict('post', { findFirst: postFindFirst }),
    trackingLink: strict('trackingLink', { findUnique: trackingFindUnique }),
  });
  const app: FastifyInstance = Fastify({ logger: false });
  await app.register(rateLimit, { global: false, skipOnError: true });
  registerLinkUnfurlRoute(app, { prisma: prisma as never, origin: ORIGIN });
  await app.ready();
  return { app, postFindFirst, trackingFindUnique };
};

const lire = async (url: string, monde: Monde = {}, acceptLanguage?: string) => {
  const { app, postFindFirst, trackingFindUnique } = await monter(monde);
  const reponse = await app.inject({
    method: 'GET',
    url,
    headers: acceptLanguage ? { 'accept-language': acceptLanguage } : {},
  });
  await app.close();
  return { reponse, html: reponse.body, postFindFirst, trackingFindUnique };
};

const deplier = (monde: Monde = {}, acceptLanguage?: string, id: string = POST_ID) =>
  lire(`/posts/${encodeURIComponent(id)}/og`, monde, acceptLanguage);

const deplierSuivi = (monde: Monde = {}, acceptLanguage?: string) =>
  lire(`/tracking-links/${TOKEN}/og`, monde, acceptLanguage);

const meta = (html: string, cle: string): string | undefined =>
  html.match(new RegExp(`<meta (?:property|name)="${cle}" content="([^"]*)"`))?.[1];

const metas = (html: string, cle: string): readonly string[] =>
  [...html.matchAll(new RegExp(`<meta (?:property|name)="${cle}" content="([^"]*)"`, 'g'))].map((m) => m[1] as string);

describe('Un post public se déplie en carte : titre, texte, image', () => {
  it('nomme le type et l’auteur, sert le texte et la plus grande variante d’image qu’un robot accepte', async () => {
    const { reponse, html } = await deplier();
    expect(reponse.statusCode).toBe(200);
    expect(reponse.headers['content-type']).toContain('text/html');
    expect(meta(html, 'og:title')).toBe('Publication de Amani Diallo');
    expect(meta(html, 'og:description')).toBe('Coucher de soleil sur la Petite Côte.');
    expect(meta(html, 'og:url')).toBe(`${ORIGIN}/post/${POST_ID}`);
    expect(meta(html, 'og:image')).toBe(`${API}/api/v1/attachments/file/${encodeURIComponent('2026/11/66f0c0ffee0000000000aaaa/plage_1080w.webp')}`);
    expect(meta(html, 'og:image:type')).toBe('image/webp');
    expect(meta(html, 'og:image:width')).toBe('1080');
    expect(meta(html, 'og:image:height')).toBe('1440');
    expect(meta(html, 'twitter:card')).toBe('summary_large_image');
    expect(meta(html, 'og:type')).toBe('article');
    expect(html).toContain(`href="${ORIGIN}/post/${POST_ID}?open=1"`);
  });

  it('ne sert rien d’autre que le texte, l’auteur et le média : ni compteurs, ni audience, ni coordonnées', async () => {
    const { html } = await deplier();
    expect(html).not.toContain('amani@example.org');
    expect(html).not.toContain('+33600000000');
    expect(html).not.toContain('1234');
    expect(html).not.toContain('66f0c0ffee0000000000dddd');
  });

  it('un original JPEG ou PNG léger part tel quel, avec ses dimensions : tous les robots le lisent', async () => {
    const { html } = await deplier({ ligne: contenu({ media: [media({ fileSize: 480_000, width: 1600, height: 1200 })] }) });
    expect(meta(html, 'og:image')).toBe(`${API}/api/v1/attachments/file/${encodeURIComponent('2026/11/66f0c0ffee0000000000aaaa/plage.jpg')}`);
    expect(meta(html, 'og:image:type')).toBe('image/jpeg');
    expect(meta(html, 'og:image:width')).toBe('1600');
    expect(meta(html, 'og:image:height')).toBe('1200');
  });

  it('un original lourd, ou dans un format que tous ne lisent pas, cède à la variante', async () => {
    const lourd = await deplier({ ligne: contenu({ media: [media({ fileSize: 4_200_000 })] }) });
    expect(meta(lourd.html, 'og:image')).toContain('plage_1080w.webp');
    const heic = await deplier({ ligne: contenu({ media: [media({ mimeType: 'image/heic', fileSize: 300_000 })] }) });
    expect(meta(heic.html, 'og:image')).toContain('plage_1080w.webp');
    const inconnu = await deplier({ ligne: contenu({ media: [media({ fileSize: null })] }) });
    expect(meta(inconnu.html, 'og:image')).toContain('plage_1080w.webp');
  });

  it('sans variante, prend la vignette, puis l’original', async () => {
    const sansVariante = await deplier({ ligne: contenu({ media: [media({ imageVariants: null })] }) });
    expect(meta(sansVariante.html, 'og:image')).toBe(`${API}/api/v1/attachments/file/${encodeURIComponent('2026/11/66f0c0ffee0000000000aaaa/plage_thumb.jpg')}`);
    const nu = await deplier({ ligne: contenu({ media: [media({ imageVariants: null, thumbnailUrl: null })] }) });
    expect(meta(nu.html, 'og:image')).toBe(`${API}/api/v1/attachments/file/${encodeURIComponent('2026/11/66f0c0ffee0000000000aaaa/plage.jpg')}`);
    expect(meta(nu.html, 'og:image:width')).toBeUndefined();
  });

  it('échappe le texte de l’auteur, sans retour à la ligne ni contrôle invisible', async () => {
    const { html } = await deplier({ ligne: contenu({ content: '<script>alert(1)</script>\n"Bonjour"‮' }) });
    expect(html).not.toContain('<script>alert(1)');
    expect(meta(html, 'og:description')).toBe('&lt;script&gt;alert(1)&lt;/script&gt; &quot;Bonjour&quot;');
  });

  it('tronque un texte long', async () => {
    const { html } = await deplier({ ligne: contenu({ content: 'a'.repeat(400) }) });
    const description = meta(html, 'og:description') ?? '';
    expect(Array.from(description).length).toBeLessThanOrEqual(200);
    expect(description.endsWith('…')).toBe(true);
  });
});

describe('Chaque type de contenu a son titre', () => {
  it.each([
    ['REEL', 'reel', 'Réel de Amani Diallo'],
    ['STORY', 'story', 'Story de Amani Diallo'],
    ['STATUS', 'mood', 'Humeur de Amani Diallo'],
  ] as const)('%s', async (type, chemin, titre) => {
    const { html } = await deplier({ ligne: contenu({ type }) });
    expect(meta(html, 'og:title')).toBe(titre);
    expect(meta(html, 'og:url')).toBe(`${ORIGIN}/${chemin}/${POST_ID}`);
  });

  it('une humeur porte son émoji devant son texte', async () => {
    const { html } = await deplier({ ligne: contenu({ type: 'STATUS', moodEmoji: '🌅', content: 'Heureuse', media: [] }) });
    expect(meta(html, 'og:description')).toBe('🌅 Heureuse');
  });

  it('sans nom affiché, nomme le pseudo', async () => {
    const { html } = await deplier({ ligne: contenu({ author: auteur({ displayName: null }) }) });
    expect(meta(html, 'og:title')).toBe('Publication de @amani');
  });
});

describe('Une vidéo se montre par sa vignette, et se joue là où le robot le sait', () => {
  const video = media({
    mimeType: 'video/mp4',
    fileUrl: '2026/11/66f0c0ffee0000000000aaaa/danse.mp4',
    thumbnailUrl: '2026/11/66f0c0ffee0000000000aaaa/danse_thumb.jpg',
    width: 1080,
    height: 1920,
    duration: 42_000,
    imageVariants: null,
    videoCodec: 'h264',
  });

  it('pose la vignette en image et la vidéo H.264 en og:video', async () => {
    const { html } = await deplier({ ligne: contenu({ type: 'REEL', media: [video] }) });
    expect(meta(html, 'og:image')).toBe(`${API}/api/v1/attachments/file/${encodeURIComponent('2026/11/66f0c0ffee0000000000aaaa/danse_thumb.jpg')}`);
    expect(meta(html, 'og:type')).toBe('video.other');
    expect(meta(html, 'og:video')).toBe(`${API}/api/v1/attachments/file/${encodeURIComponent('2026/11/66f0c0ffee0000000000aaaa/danse.mp4')}`);
    expect(meta(html, 'og:video:secure_url')).toBe(meta(html, 'og:video'));
    expect(meta(html, 'og:video:type')).toBe('video/mp4');
    expect(meta(html, 'og:video:width')).toBe('1080');
    expect(meta(html, 'og:video:height')).toBe('1920');
  });

  it('une vidéo HEVC part par son rendu H.264, jamais par l’original', async () => {
    const hevc = { ...video, videoCodec: 'hevc', renditions: [{ codec: 'h264', url: '2026/11/66f0c0ffee0000000000aaaa/danse_h264.mp4', width: 720, height: 1280, size: 1 }] };
    const { html } = await deplier({ ligne: contenu({ type: 'REEL', media: [hevc] }) });
    expect(meta(html, 'og:video')).toBe(`${API}/api/v1/attachments/file/${encodeURIComponent('2026/11/66f0c0ffee0000000000aaaa/danse_h264.mp4')}`);
    expect(meta(html, 'og:video:width')).toBe('720');
  });

  it('une vidéo HEVC sans rendu compatible garde sa vignette, sans og:video', async () => {
    const { html } = await deplier({ ligne: contenu({ type: 'REEL', media: [{ ...video, videoCodec: 'hevc' }] }) });
    expect(meta(html, 'og:image')).toContain('danse_thumb.jpg');
    expect(meta(html, 'og:video')).toBeUndefined();
  });

  it('un média sans texte se décrit par sa nature et sa durée', async () => {
    const { html } = await deplier({ ligne: contenu({ type: 'REEL', content: null, media: [video] }) });
    expect(meta(html, 'og:description')).toBe('🎬 Vidéo · 0:42');
  });
});

describe('Sans média visuel, l’avatar de l’auteur, sinon l’image de marque', () => {
  it('un texte seul prend l’avatar, en petite carte', async () => {
    const { html } = await deplier({ ligne: contenu({ media: [] }) });
    expect(meta(html, 'og:image')).toBe('https://gate.meeshy.me/api/v1/attachments/file/2026%2F10%2Favatar.png');
    expect(meta(html, 'twitter:card')).toBe('summary');
    expect(meta(html, 'og:image:width')).toBeUndefined();
  });

  it('sans avatar non plus, l’image de marque', async () => {
    const { html } = await deplier({ ligne: contenu({ media: [], author: auteur({ avatar: null }) }) });
    expect(meta(html, 'og:image')).toBe(IMAGE_DE_MARQUE);
  });

  it('un vocal se décrit sans montrer son fichier', async () => {
    const vocal = media({ mimeType: 'audio/mp4', fileUrl: '2026/11/66f0c0ffee0000000000aaaa/voix.m4a', thumbnailUrl: null, imageVariants: null, duration: 65_000, width: null, height: null });
    const { html } = await deplier({ ligne: contenu({ content: null, media: [vocal] }) });
    expect(meta(html, 'og:description')).toBe('🎤 Audio · 1:05');
    expect(html).not.toContain('voix.m4a');
  });
});

describe('La langue : celle que le robot demande, son texte quand une traduction existe', () => {
  it('en anglais, titre anglais et traduction anglaise', async () => {
    const { html } = await deplier({ ligne: contenu({ type: 'REEL' }) }, 'en-US,en;q=0.9');
    expect(meta(html, 'og:title')).toBe('Reel by Amani Diallo');
    expect(meta(html, 'og:description')).toBe('Sunset on the Petite Côte.');
    expect(meta(html, 'og:locale')).toBe('en_US');
  });

  it('une langue sans traduction sert l’original, jamais une autre traduction', async () => {
    const { html } = await deplier({}, 'de');
    expect(meta(html, 'og:title')).toBe('Beitrag von Amani Diallo');
    expect(meta(html, 'og:description')).toBe('Coucher de soleil sur la Petite Côte.');
  });

  it('un robot muet lit dans la langue de l’auteur', async () => {
    const { html } = await deplier({ ligne: contenu({ originalLanguage: 'es', content: 'Atardecer.', translations: null }) });
    expect(meta(html, 'og:title')).toBe('Publicación de Amani Diallo');
    expect(meta(html, 'og:description')).toBe('Atardecer.');
  });
});

describe('Ce qu’un visiteur sans compte ne peut pas lire rend l’aperçu générique, le même pour tous', () => {
  const generique = async (monde: Monde, id: string = POST_ID) => {
    const { reponse, html } = await deplier(monde, undefined, id);
    expect(reponse.statusCode).toBe(200);
    expect(meta(html, 'og:title')).toBe(GENERIQUE_FR);
    expect(meta(html, 'og:image')).toBe(IMAGE_DE_MARQUE);
    expect(meta(html, 'og:url')).toBe(`${ORIGIN}/`);
    expect(html).not.toContain('Amani');
    expect(html).not.toContain('Petite Côte');
    return html;
  };

  it.each([
    ['réservé aux amis', contenu({ visibility: 'FRIENDS' })],
    ['réservé à l’auteur', contenu({ visibility: 'PRIVATE' })],
    ['réservé aux Sangs', contenu({ visibility: 'BLOOD' })],
    ['supprimé', contenu({ deletedAt: new Date('2026-11-01T00:00:00Z') })],
    ['une story expirée', contenu({ type: 'STORY', expiresAt: new Date('2026-01-01T00:00:00Z') })],
    ['d’un auteur désactivé', contenu({ author: auteur({ deactivatedAt: new Date('2026-11-01T00:00:00Z') }) })],
    ['d’un auteur inactif', contenu({ author: auteur({ isActive: false }) })],
    ['d’un auteur introuvable', contenu({ author: null })],
    ['la republication d’un original réservé', contenu({ repostOfId: ORIGINAL_ID, repostOf: { visibility: 'FRIENDS', deletedAt: null, expiresAt: null, content: 'secret', originalLanguage: 'fr', translations: null, media: [] } })],
    ['la republication d’un original disparu', contenu({ repostOfId: ORIGINAL_ID, repostOf: null })],
  ])('%s', async (_cas, ligne) => {
    await generique({ ligne });
  });

  it('un identifiant inconnu rend la MÊME page qu’un contenu réservé', async () => {
    const inconnu = await generique({ ligne: null });
    const reserve = await generique({ ligne: contenu({ visibility: 'FRIENDS' }) });
    expect(inconnu).toBe(reserve);
  });

  it('un identifiant malformé ne lit rien', async () => {
    const { reponse, html, postFindFirst } = await deplier({}, undefined, 'pas-un-id');
    expect(reponse.statusCode).toBe(200);
    expect(meta(html, 'og:title')).toBe(GENERIQUE_FR);
    expect(postFindFirst).not.toHaveBeenCalled();
  });

  it('une lecture qui tombe rend le générique, en 200', async () => {
    await generique({ ligne: () => Promise.reject(new Error('mongo down')) });
  });
});

describe('Une republication publique d’un original public', () => {
  it('sans texte propre, montre le texte et le média de l’original', async () => {
    const original = {
      visibility: 'PUBLIC',
      deletedAt: null,
      expiresAt: null,
      content: 'Le texte de l’original.',
      originalLanguage: 'fr',
      translations: null,
      media: [media({ imageVariants: null, thumbnailUrl: '2026/11/66f0c0ffee0000000000aaaa/original_thumb.jpg' })],
      author: auteur({ username: 'bintou', displayName: 'Bintou' }),
    };
    const { html } = await deplier({ ligne: contenu({ content: null, media: [], repostOfId: ORIGINAL_ID, repostOf: original }) });
    expect(meta(html, 'og:title')).toBe('Publication de Amani Diallo');
    expect(meta(html, 'og:description')).toBe('Le texte de l’original.');
    expect(meta(html, 'og:image')).toContain('original_thumb.jpg');
  });
});

describe('Le lien SUIVI que frappe la feuille de partage se déplie en carte du contenu', () => {
  it('un réel public : la carte, à l’adresse suivie (le clic se compte sur le lien)', async () => {
    const { reponse, html } = await deplierSuivi({ ligne: contenu({ type: 'REEL' }) });
    expect(reponse.statusCode).toBe(200);
    expect(meta(html, 'og:title')).toBe('Réel de Amani Diallo');
    expect(meta(html, 'og:url')).toBe(`${ORIGIN}/l/${TOKEN}`);
    expect(html).toContain(`href="${ORIGIN}/l/${TOKEN}?open=1"`);
  });

  it('un ancien lien sans cible typée se lit par son adresse', async () => {
    const { html } = await deplierSuivi({
      ligne: contenu(),
      suivi: suivi({ targetType: 'EXTERNAL', targetId: null, originalUrl: `${ORIGIN}/feeds/post/${POST_ID}` }),
    });
    expect(meta(html, 'og:title')).toBe('Publication de Amani Diallo');
  });

  it.each([
    ['un contenu réservé', { ligne: contenu({ visibility: 'FRIENDS' }) }],
    ['un lien désactivé', { suivi: suivi({ isActive: false }) }],
    ['un lien échu', { suivi: suivi({ expiresAt: new Date('2026-01-01T00:00:00Z') }) }],
    ['un contenu inconnu', { ligne: null }],
  ] as const)('%s : le générique', async (_cas, monde) => {
    const { html } = await deplierSuivi(monde);
    expect(meta(html, 'og:title')).toBe(GENERIQUE_FR);
    expect(meta(html, 'og:url')).toBe(`${ORIGIN}/`);
    expect(html).not.toContain('Amani');
  });
});

describe('Le robot ne reçoit aucune autre balise que celles d’un aperçu', () => {
  it('une seule image, une seule description, et l’instruction de ne pas indexer', async () => {
    const { reponse, html } = await deplier();
    expect(metas(html, 'og:image')).toHaveLength(1);
    expect(metas(html, 'og:description')).toHaveLength(1);
    expect(reponse.headers['x-robots-tag']).toBe('noindex, nofollow');
  });
});
