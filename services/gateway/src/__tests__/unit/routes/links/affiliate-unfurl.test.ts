/**
 * @jest-environment node
 *
 * UN LIEN D'AFFILIATION SE DÉPLIE CHEZ LES ROBOTS D'APERÇU (#10559).
 *
 * `GET /affiliate/:token/og` est ce que Traefik sert aux robots qui déplient
 * `/signup/affiliate/<jeton>` : « X t'invite sur Meeshy », et pour image la
 * bannière de l'invitant, sinon son avatar, sinon l'image de marque. Les témoins
 * lisent la page RENDUE (`app.inject`).
 *
 * Le double Prisma ne connaît QUE `affiliateToken.findUnique` : toute autre
 * lecture, ou toute écriture (un clic compté), LÈVE.
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';

import { registerLinkUnfurlRoute } from '../../../../routes/links/unfurl';

const ORIGIN = 'https://staging.meeshy.me';
const TOKEN = 'aff_1760000000000_k3j2h1g0f9d8a';
const BANNER_KEY = '2026/10/66f0c0ffee0000000000abcd/banniere.jpg';
const AVATAR_URL = 'https://gate.meeshy.me/api/v1/attachments/file/2026%2F10%2Favatar.png';

type Parrain = {
  readonly displayName?: string | null;
  readonly username?: string | null;
  readonly avatar?: string | null;
  readonly banner?: string | null;
  readonly isActive?: boolean;
  readonly deletedAt?: Date | null;
  readonly systemLanguage?: string | null;
};

type JetonFactice = {
  readonly isActive?: boolean;
  readonly expiresAt?: Date | null;
  readonly maxUses?: number | null;
  readonly currentUses?: number;
  readonly parrain?: Parrain;
};

const jeton = (o: JetonFactice = {}) => ({
  token: TOKEN,
  isActive: o.isActive ?? true,
  expiresAt: o.expiresAt ?? null,
  maxUses: o.maxUses ?? null,
  currentUses: o.currentUses ?? 0,
  creator: {
    displayName: o.parrain?.displayName === undefined ? 'Amani Diallo' : o.parrain.displayName,
    username: o.parrain?.username === undefined ? 'amani' : o.parrain.username,
    avatar: o.parrain?.avatar === undefined ? AVATAR_URL : o.parrain.avatar,
    banner: o.parrain?.banner === undefined ? BANNER_KEY : o.parrain.banner,
    isActive: o.parrain?.isActive ?? true,
    deletedAt: o.parrain?.deletedAt ?? null,
    systemLanguage: o.parrain?.systemLanguage === undefined ? 'fr' : o.parrain.systemLanguage,
    regionalLanguage: null,
    customDestinationLanguage: null,
    deviceLocale: null,
    email: 'amani@example.org',
    phoneNumber: '+33600000000',
    isOnline: true,
    lastActiveAt: new Date('2026-10-13T10:00:00Z'),
  },
});

type Ligne = ReturnType<typeof jeton> | null;

const prismaStrict = (ligne: Ligne) => {
  const findUnique = jest.fn(async (args: { where: { token: string } }) => (ligne !== null && args.where.token === TOKEN ? ligne : null));
  const strict = <T extends object>(target: T, nom: string): T =>
    new Proxy(target, {
      get(cible, prop) {
        if (prop in cible) return cible[prop as keyof T];
        if (prop === 'then') return undefined;
        throw new Error(`${nom}.${String(prop)} n'est pas une lecture de l'aperçu`);
      },
    });
  return { prisma: strict({ affiliateToken: strict({ findUnique }, 'affiliateToken') }, 'prisma'), findUnique };
};

const monter = async (ligne: Ligne) => {
  const { prisma, findUnique } = prismaStrict(ligne);
  const app: FastifyInstance = Fastify({ logger: false });
  await app.register(rateLimit, { global: false, skipOnError: true });
  registerLinkUnfurlRoute(app, { prisma: prisma as never, origin: ORIGIN });
  await app.ready();
  return { app, findUnique };
};

const page = async (ligne: Ligne = jeton(), options: { readonly token?: string; readonly acceptLanguage?: string } = {}) => {
  const { app, findUnique } = await monter(ligne);
  const reponse = await app.inject({
    method: 'GET',
    url: `/affiliate/${encodeURIComponent(options.token ?? TOKEN)}/og`,
    headers: options.acceptLanguage ? { 'accept-language': options.acceptLanguage } : {},
  });
  await app.close();
  return { reponse, findUnique };
};

const meta = (html: string, cle: string): string | undefined => {
  const echappee = cle.replace(/[.*+?^${}()|[\]\\:]/g, '\\$&');
  return html.match(new RegExp(`<meta (?:property|name)="${echappee}" content="([^"]*)"`))?.[1];
};

const GENERIQUE_FR = 'Meeshy — la messagerie qui traduit';
const IMAGE_DE_MARQUE = `${ORIGIN}/og/invitation-v1.png`;

describe('Un lien d’affiliation vivant se déplie au nom de l’invitant', () => {
  it('dit qui invite, et montre sa bannière en grande carte', async () => {
    const { reponse } = await page();
    const html = reponse.body;

    expect(reponse.statusCode).toBe(200);
    expect(reponse.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(meta(html, 'og:title')).toBe('Amani Diallo (@amani) t’invite sur Meeshy');
    expect(meta(html, 'twitter:title')).toBe('Amani Diallo (@amani) t’invite sur Meeshy');
    expect(meta(html, 'og:description')).toBe('Écris dans ta langue, lis dans la tienne : Meeshy traduit chaque message en temps réel.');
    expect(meta(html, 'og:url')).toBe(`${ORIGIN}/signup/affiliate/${TOKEN}`);
    expect(meta(html, 'og:image')).toBe(`https://gate.meeshy.me/api/v1/attachments/file/${encodeURIComponent(BANNER_KEY)}`);
    expect(meta(html, 'twitter:image')).toBe(meta(html, 'og:image'));
    expect(meta(html, 'og:image:alt')).toBe('Amani Diallo');
    expect(meta(html, 'twitter:card')).toBe('summary_large_image');
    expect(html).toContain(`href="${ORIGIN}/signup/affiliate/${TOKEN}?open=1"`);
  });

  it('n’annonce pas les dimensions d’une image qu’elle ne connaît pas', async () => {
    const { reponse } = await page();
    expect(meta(reponse.body, 'og:image:width')).toBeUndefined();
    expect(meta(reponse.body, 'og:image:height')).toBeUndefined();
    expect(meta(reponse.body, 'og:image:type')).toBeUndefined();
  });

  it('sans bannière, montre son avatar en petite carte', async () => {
    const { reponse } = await page(jeton({ parrain: { banner: null } }));
    expect(meta(reponse.body, 'og:image')).toBe(AVATAR_URL);
    expect(meta(reponse.body, 'twitter:card')).toBe('summary');
    expect(meta(reponse.body, 'og:title')).toBe('Amani Diallo (@amani) t’invite sur Meeshy');
  });

  it('sans bannière ni avatar, garde son nom sur l’image de marque', async () => {
    const { reponse } = await page(jeton({ parrain: { banner: '  ', avatar: null } }));
    expect(meta(reponse.body, 'og:title')).toBe('Amani Diallo (@amani) t’invite sur Meeshy');
    expect(meta(reponse.body, 'og:image')).toBe(IMAGE_DE_MARQUE);
    expect(meta(reponse.body, 'og:image:width')).toBe('1200');
    expect(meta(reponse.body, 'twitter:card')).toBe('summary_large_image');
  });

  it('écarte une image qui n’est pas servie en https', async () => {
    const { reponse } = await page(jeton({ parrain: { banner: 'http://exemple.test/b.jpg', avatar: null } }));
    expect(meta(reponse.body, 'og:image')).toBe(IMAGE_DE_MARQUE);
  });

  it('nomme par son nom affiché seul un invitant dont le pseudo ne se lit pas', async () => {
    const { reponse } = await page(jeton({ parrain: { username: null } }));
    expect(meta(reponse.body, 'og:title')).toBe('Amani Diallo t’invite sur Meeshy');
  });

  it('ne répète pas un pseudo identique au nom affiché', async () => {
    const { reponse } = await page(jeton({ parrain: { displayName: 'amani' } }));
    expect(meta(reponse.body, 'og:title')).toBe('amani t’invite sur Meeshy');
  });

  it('nomme par le pseudo un invitant sans nom affiché', async () => {
    const { reponse } = await page(jeton({ parrain: { displayName: '   ' } }));
    expect(meta(reponse.body, 'og:title')).toBe('amani t’invite sur Meeshy');
  });

  it('parle la langue de l’invitant, pas celle du robot', async () => {
    const { reponse } = await page(jeton({ parrain: { systemLanguage: 'en' } }), { acceptLanguage: 'de' });
    expect(meta(reponse.body, 'og:title')).toBe('Amani Diallo (@amani) invites you to Meeshy');
    expect(reponse.body).toContain('<html lang="en" dir="ltr">');
  });

  it('échappe tout ce que l’invitant a saisi, dans les balises comme dans le corps', async () => {
    const { reponse } = await page(
      jeton({ parrain: { displayName: '"><script>alert(1)</script>', banner: 'https://cdn.test/b.jpg?a="><img src=x onerror=1>' } }),
    );
    expect(reponse.body).not.toContain('<script>');
    expect(reponse.body).not.toContain('<img');
    expect(reponse.body).toContain('&quot;&gt;&lt;script&gt;');
  });

  it('ne laisse partir ni e-mail, ni téléphone, ni présence, ni identifiant', async () => {
    const { reponse, findUnique } = await page();
    expect(reponse.body).not.toContain('amani@example.org');
    expect(reponse.body).not.toContain('+33600000000');
    expect(reponse.body).not.toContain('2026-10-13T10');
    const select = (findUnique.mock.calls[0]?.[0] as unknown as { select: { creator: { select: Record<string, unknown> } } }).select.creator.select;
    expect(Object.keys(select).sort()).toEqual(
      ['avatar', 'banner', 'customDestinationLanguage', 'deletedAt', 'deviceLocale', 'displayName', 'isActive', 'regionalLanguage', 'systemLanguage', 'username'].sort(),
    );
  });
});

describe('Un lien qui ne nomme personne rend l’aperçu générique, le même pour tous', () => {
  const generique = (html: string) => {
    expect(meta(html, 'og:title')).toBe(GENERIQUE_FR);
    expect(meta(html, 'og:image')).toBe(IMAGE_DE_MARQUE);
    expect(meta(html, 'og:url')).toBe(`${ORIGIN}/`);
    expect(html).not.toContain('Amani');
    expect(html).not.toContain('banniere');
  };

  it.each([
    ['inconnu', null],
    ['désactivé', jeton({ isActive: false })],
    ['échu', jeton({ expiresAt: new Date(0) })],
    ['épuisé', jeton({ maxUses: 3, currentUses: 3 })],
    ['d’un compte désactivé', jeton({ parrain: { isActive: false } })],
    ['d’un compte supprimé', jeton({ parrain: { deletedAt: new Date('2026-10-01T00:00:00Z') } })],
    ['d’un compte sans nom lisible', jeton({ parrain: { displayName: null, username: '​' } })],
  ] as const)('jeton %s', async (_cas, ligne) => {
    const { reponse } = await page(ligne);
    expect(reponse.statusCode).toBe(200);
    generique(reponse.body);
  });

  it('un jeton malformé n’atteint pas la base', async () => {
    const { reponse, findUnique } = await page(jeton(), { token: 'aff.<x>' });
    generique(reponse.body);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('ne lit la base qu’une fois pour deux dépliages du même lien', async () => {
    const { app, findUnique } = await monter(jeton());
    await app.inject({ method: 'GET', url: `/affiliate/${TOKEN}/og` });
    await app.inject({ method: 'GET', url: `/affiliate/${TOKEN}/og` });
    await app.close();
    expect(findUnique).toHaveBeenCalledTimes(1);
  });
});
