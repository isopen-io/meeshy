/**
 * @jest-environment node
 *
 * UN LIEN DE CONVERSATION SE DÉPLIE CHEZ LES ROBOTS D'APERÇU (#9712).
 *
 * `GET /links/:identifier/og` est ce que Traefik sert à WhatsApp, iMessage,
 * Telegram, Messenger, Slack ou X quand ils déplient `/chat/<lien>`. Les
 * témoins lisent la page RENDUE (`app.inject`), jamais une fonction interne :
 * ce qui compte est ce qui part sur le fil.
 *
 * Le double Prisma ne connaît QUE `conversationShareLink.findFirst` : tout autre
 * modèle, ou toute autre méthode, LÈVE. C'est ce qui prouve que la page ne lit
 * ni message, ni participant, et n'écrit rien (aucune visite comptée).
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';

import { registerLinkUnfurlRoute, LINK_UNFURL_RATE_LIMIT_MAX } from '../../../../routes/links/unfurl';

const ORIGIN = 'https://staging.meeshy.me';
const LINK_ID = 'mshy_beta-9712';
const LINK_DB_ID = '507f1f77bcf86cd799439055';

type Hote = {
  readonly displayName?: string | null;
  readonly username?: string | null;
  readonly isActive?: boolean;
  readonly deletedAt?: Date | null;
  readonly systemLanguage?: string | null;
  readonly regionalLanguage?: string | null;
  readonly customDestinationLanguage?: string | null;
  readonly deviceLocale?: string | null;
};

type LienFactice = {
  readonly isActive?: boolean;
  readonly expiresAt?: Date | null;
  readonly maxUses?: number | null;
  readonly currentUses?: number;
  readonly title?: string | null;
  readonly name?: string | null;
  readonly conversationActive?: boolean;
  readonly closedAt?: Date | null;
  readonly hote?: Hote | null;
};

const hote = (o: Hote = {}) => ({
  displayName: o.displayName === undefined ? 'Alice Martin' : o.displayName,
  username: o.username === undefined ? 'alice' : o.username,
  isActive: o.isActive ?? true,
  deletedAt: o.deletedAt ?? null,
  systemLanguage: o.systemLanguage === undefined ? 'fr' : o.systemLanguage,
  regionalLanguage: o.regionalLanguage ?? null,
  customDestinationLanguage: o.customDestinationLanguage ?? null,
  deviceLocale: o.deviceLocale ?? null,
});

const lien = (o: LienFactice = {}) => ({
  linkId: LINK_ID,
  name: o.name === undefined ? 'Invitation bêta' : o.name,
  description: 'Venez, on parle du secret de la bêta',
  isActive: o.isActive ?? true,
  expiresAt: o.expiresAt ?? null,
  maxUses: o.maxUses ?? null,
  currentUses: o.currentUses ?? 0,
  conversation: {
    title: o.title === undefined ? 'Les bêta-testeurs' : o.title,
    description: 'Un groupe privé où Bob parle de la date de sortie',
    isActive: o.conversationActive ?? true,
    closedAt: o.closedAt ?? null,
  },
  creator: o.hote === null ? null : hote(o.hote ?? {}),
});

type Ligne = ReturnType<typeof lien> | null;

const prismaStrict = (ligne: Ligne | (() => Promise<Ligne>)) => {
  const findFirst = jest.fn(async (args: { where?: Record<string, unknown> }) => {
    if (typeof ligne === 'function') return ligne();
    if (!ligne) return null;
    const where = args.where ?? {};
    const candidats = [where, ...((where.OR as ReadonlyArray<Record<string, unknown>> | undefined) ?? [])];
    return candidats.some((c) => c.id === LINK_DB_ID || c.linkId === LINK_ID || c.identifier === LINK_ID)
      ? ligne
      : null;
  });
  const shareLink = new Proxy({ findFirst }, {
    get(target, prop) {
      if (prop === 'findFirst') return target.findFirst;
      if (prop === 'then') return undefined;
      throw new Error(`conversationShareLink.${String(prop)} n'est pas une lecture de l'aperçu`);
    },
  });
  const prisma = new Proxy({ conversationShareLink: shareLink }, {
    get(target, prop) {
      if (prop === 'conversationShareLink') return target.conversationShareLink;
      if (prop === 'then') return undefined;
      throw new Error(`prisma.${String(prop)} n'est pas une lecture de l'aperçu`);
    },
  });
  return { prisma, findFirst };
};

const monter = async (ligne: Ligne | (() => Promise<Ligne>) = lien()): Promise<{ app: FastifyInstance; findFirst: jest.Mock }> => {
  const { prisma, findFirst } = prismaStrict(ligne);
  const app = Fastify({ logger: false });
  await app.register(rateLimit, { global: false, skipOnError: true, keyGenerator: (request) => `global:${request.ip}` });
  registerLinkUnfurlRoute(app, { prisma: prisma as never, origin: ORIGIN });
  await app.ready();
  return { app, findFirst: findFirst as unknown as jest.Mock };
};

const page = async (
  ligne: Ligne | (() => Promise<Ligne>) = lien(),
  options: { readonly identifier?: string; readonly acceptLanguage?: string } = {},
) => {
  const { app } = await monter(ligne);
  const reponse = await app.inject({
    method: 'GET',
    url: `/links/${encodeURIComponent(options.identifier ?? LINK_ID)}/og`,
    headers: options.acceptLanguage ? { 'accept-language': options.acceptLanguage } : {},
  });
  await app.close();
  return reponse;
};

const meta = (html: string, cle: string): string | undefined => {
  const echappee = cle.replace(/[.*+?^${}()|[\]\\:]/g, '\\$&');
  const balise = html.match(new RegExp(`<meta (?:property|name)="${echappee}" content="([^"]*)"`));
  return balise?.[1];
};

const fr = (texte: string): string => texte.replace(/« /g, '«\u00A0').replace(/ »/g, '\u00A0»');

const decode = (valeur: string | undefined): string | undefined =>
  valeur
    ?.replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

describe('Un lien vivant se déplie en invitation', () => {
  it("dit qui invite, à quoi, et la promesse — dans les balises que lisent les robots", async () => {
    const reponse = await page();

    expect(reponse.statusCode).toBe(200);
    expect(reponse.headers['content-type']).toBe('text/html; charset=utf-8');
    const html = reponse.body;
    expect(decode(meta(html, 'og:title'))).toBe(fr('Alice Martin t’invite à « Les bêta-testeurs »'));
    expect(decode(meta(html, 'twitter:title'))).toBe(decode(meta(html, 'og:title')));
    expect(decode(meta(html, 'og:description'))).toBe('Écris dans ta langue, lis dans la tienne — sans compte, sans installation.');
    expect(decode(meta(html, 'twitter:description'))).toBe(decode(meta(html, 'og:description')));
    expect(meta(html, 'og:url')).toBe(`${ORIGIN}/chat/${LINK_ID}`);
    expect(meta(html, 'og:type')).toBe('website');
    expect(meta(html, 'og:site_name')).toBe('Meeshy');
    expect(meta(html, 'og:locale')).toBe('fr_FR');
    expect(meta(html, 'twitter:card')).toBe('summary_large_image');
  });

  it("sert une image 1200×630 ABSOLUE, avec ses dimensions et son texte alternatif", async () => {
    const html = (await page()).body;

    expect(meta(html, 'og:image')).toBe(`${ORIGIN}/og/invitation-v1.png`);
    expect(meta(html, 'twitter:image')).toBe(`${ORIGIN}/og/invitation-v1.png`);
    expect(meta(html, 'og:image:width')).toBe('1200');
    expect(meta(html, 'og:image:height')).toBe('630');
    expect(meta(html, 'og:image:type')).toBe('image/png');
    expect(decode(meta(html, 'og:image:alt'))?.length).toBeGreaterThan(10);
    expect(meta(html, 'twitter:image:alt')).toBe(meta(html, 'og:image:alt'));
  });

  it("garde la page hors des index et lui interdit tout script", async () => {
    const reponse = await page();

    expect(meta(reponse.body, 'robots')).toBe('noindex, nofollow');
    expect(reponse.headers['x-robots-tag']).toBe('noindex, nofollow');
    expect(reponse.headers['content-security-policy']).toBe("default-src 'none'; style-src 'unsafe-inline'; img-src https:");
    expect(reponse.headers['cache-control']).toBe('public, max-age=300');
    expect(reponse.body).not.toMatch(/<script/i);
    expect(reponse.body).not.toMatch(/http-equiv="refresh"/i);
  });

  it("ne nomme pas l'hôte d'un compte désactivé ou supprimé — l'invitation reste dite", async () => {
    for (const absent of [{ isActive: false }, { deletedAt: new Date('2026-09-01') }]) {
      const html = (await page(lien({ hote: absent }))).body;
      expect(decode(meta(html, 'og:title'))).toBe(fr('Rejoins « Les bêta-testeurs » sur Meeshy'));
      expect(html).not.toContain('Alice');
    }
  });

  it("sans titre de conversation, retombe sur le nom du lien, puis sur l'hôte seul", async () => {
    expect(decode(meta((await page(lien({ title: null }))).body, 'og:title'))).toBe(fr('Alice Martin t’invite à « Invitation bêta »'));
    expect(decode(meta((await page(lien({ title: '  ', name: null }))).body, 'og:title'))).toBe('Alice Martin t’invite sur Meeshy');
  });

  it("nomme l'hôte par son pseudo quand il n'a pas de nom affiché", async () => {
    expect(decode(meta((await page(lien({ hote: { displayName: null } }))).body, 'og:title'))).toBe(fr('alice t’invite à « Les bêta-testeurs »'));
  });
});

describe("Rien de la conversation ne part avant le choix (#5561)", () => {
  it("ne sert ni la description du groupe, ni le message d'invitation, ni aucun autre nom que l'hôte", async () => {
    const html = (await page()).body;

    expect(html).not.toContain('secret de la bêta');
    expect(html).not.toContain('date de sortie');
    expect(html).not.toContain('Bob');
    expect(html).not.toContain(LINK_DB_ID);
  });

  it("ne lit aucun message ni participant, et n'écrit rien — le double strict lèverait", async () => {
    const reponse = await page();

    expect(reponse.statusCode).toBe(200);
    expect(decode(meta(reponse.body, 'og:title'))).toContain('Alice Martin');
  });
});

describe('Chaque valeur saisie par un utilisateur est échappée', () => {
  it("un titre et un nom hostiles ne deviennent jamais du balisage", async () => {
    const html = (await page(lien({
      title: '</title><script>alert(1)</script>"\' & co',
      hote: { displayName: '"><img src=x onerror=alert(2)>' },
    }))).body;

    expect(html).not.toMatch(/<script>alert/);
    expect(html).not.toMatch(/<img/);
    expect(html).not.toContain('"><');
    expect(html).toContain('&lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt;&quot;&#039; &amp; co');
    expect(decode(meta(html, 'og:title'))).toBe(fr('"><img src=x onerror=alert(2)> t’invite à « </title><script>alert(1)</script>"\' & co »'));
  });

  it("retire les caractères de contrôle et les marques de direction, qui retourneraient l'aperçu", async () => {
    const html = (await page(lien({ title: 'Équipe\u202Edlrow\u0000\u2066 cachée\u2069', hote: { displayName: 'Ali\u200Fce\u0007' } }))).body;

    expect(decode(meta(html, 'og:title'))).toBe(fr('Alice t’invite à « Équipedlrow cachée »'));
  });

  it("tronque un titre démesuré au lieu de le servir entier", async () => {
    const title = (decode(meta((await page(lien({ title: 'a'.repeat(500) }))).body, 'og:title')) ?? '');

    expect(title.length).toBeLessThan(140);
    expect(title).toContain('…');
  });
});

describe("La langue de l'aperçu est celle de l'HÔTE — sa langue de cadrage", () => {
  it("descend au rang suivant quand le rang 1 de l'hôte n'est pas servi", async () => {
    const html = (await page(lien({ hote: { systemLanguage: 'sw', regionalLanguage: 'pt' } }))).body;

    expect(html).toMatch(/<html lang="pt" dir="ltr">/);
    expect(decode(meta(html, 'og:title'))).toBe('Alice Martin convida você para “Les bêta-testeurs”');
    expect(meta(html, 'og:locale')).toBe('pt_BR');
  });

  it("atteint la locale de l'appareil (rang 4) quand l'hôte n'a rien configuré", async () => {
    const html = (await page(lien({ hote: { systemLanguage: null, deviceLocale: 'de-DE' } }))).body;

    expect(decode(meta(html, 'og:title'))).toBe('Alice Martin lädt dich zu „Les bêta-testeurs“ ein');
  });

  it("s'écrit de droite à gauche en arabe", async () => {
    const html = (await page(lien({ hote: { systemLanguage: 'ar' } }))).body;

    expect(html).toMatch(/<html lang="ar" dir="rtl">/);
    expect(meta(html, 'og:locale')).toBe('ar_AR');
  });

  it("ignore la langue du robot quand celle de l'hôte est connue", async () => {
    const html = (await page(lien({ hote: { systemLanguage: 'it' } }), { acceptLanguage: 'es-ES,es;q=0.9' })).body;

    expect(decode(meta(html, 'og:title'))).toBe('Alice Martin ti invita a «Les bêta-testeurs»');
  });

  it("sert les sept langues, chacune avec sa promesse", async () => {
    const promesses = await Promise.all(['fr', 'en', 'es', 'pt', 'de', 'it', 'ar'].map(async (systemLanguage) =>
      decode(meta((await page(lien({ hote: { systemLanguage } }))).body, 'og:description'))));

    expect(new Set(promesses).size).toBe(7);
  });
});

describe("Un lien mort ou inconnu rend l'aperçu GÉNÉRIQUE, sans dire s'il a existé", () => {
  const morts: ReadonlyArray<readonly [string, Ligne]> = [
    ['désactivé', lien({ isActive: false })],
    ['échu', lien({ expiresAt: new Date('2020-01-01') })],
    ['épuisé', lien({ maxUses: 3, currentUses: 3 })],
    ['conversation close', lien({ closedAt: new Date('2026-09-01') })],
    ['conversation inactive', lien({ conversationActive: false })],
    ['inconnu', null],
  ];

  it.each(morts)('%s ⇒ 200, aperçu de Meeshy, aucun nom ni titre', async (_cas, ligne) => {
    const reponse = await page(ligne);

    expect(reponse.statusCode).toBe(200);
    expect(decode(meta(reponse.body, 'og:title'))).toBe('Meeshy — la messagerie qui traduit');
    expect(meta(reponse.body, 'og:url')).toBe(`${ORIGIN}/`);
    expect(meta(reponse.body, 'og:image')).toBe(`${ORIGIN}/og/invitation-v1.png`);
    expect(reponse.body).not.toContain('Alice');
    expect(reponse.body).not.toContain('bêta');
    expect(reponse.body).not.toContain(LINK_ID);
  });

  it("rend le MÊME octet pour un lien mort que pour un lien qui n'a jamais existé", async () => {
    const corps = await Promise.all(morts.map(async ([, ligne]) => (await page(ligne)).body));

    expect(new Set(corps).size).toBe(1);
  });

  it("un identifiant malformé rend le générique sans même interroger la base", async () => {
    const { app, findFirst } = await monter();
    const reponse = await app.inject({ method: 'GET', url: `/links/${encodeURIComponent('<x>"')}/og` });
    await app.close();

    expect(reponse.statusCode).toBe(200);
    expect(decode(meta(reponse.body, 'og:title'))).toBe('Meeshy — la messagerie qui traduit');
    expect(reponse.body).not.toContain('<x>');
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("une base en panne rend aussi le générique, jamais une page d'erreur", async () => {
    const reponse = await page(async () => { throw new Error('mongo down'); });

    expect(reponse.statusCode).toBe(200);
    expect(decode(meta(reponse.body, 'og:title'))).toBe('Meeshy — la messagerie qui traduit');
  });

  it("le générique suit la langue demandée par le robot, puis le français", async () => {
    expect(decode(meta((await page(null, { acceptLanguage: 'es-ES,es;q=0.9,en;q=0.8' })).body, 'og:title'))).toBe('Meeshy — la mensajería que traduce');
    expect(decode(meta((await page(null, { acceptLanguage: 'ja,zh;q=0.9' })).body, 'og:title'))).toBe('Meeshy — la messagerie qui traduit');
    expect(decode(meta((await page(null)).body, 'og:title'))).toBe('Meeshy — la messagerie qui traduit');
  });
});

describe('Un dépliage coûte au plus une lecture toutes les cinq minutes par lien', () => {
  it("relit la base une seule fois pour deux robots qui déplient le même lien", async () => {
    const { app, findFirst } = await monter();
    const premiere = await app.inject({ method: 'GET', url: `/links/${LINK_ID}/og` });
    const seconde = await app.inject({ method: 'GET', url: `/links/${LINK_ID}/og` });
    await app.close();

    expect(seconde.body).toBe(premiere.body);
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it(`refuse au-delà de ${LINK_UNFURL_RATE_LIMIT_MAX} dépliages par minute et par adresse`, async () => {
    const { app } = await monter();
    const statuts: number[] = [];
    for (let i = 0; i <= LINK_UNFURL_RATE_LIMIT_MAX; i += 1) {
      statuts.push((await app.inject({ method: 'GET', url: `/links/${LINK_ID}/og` })).statusCode);
    }
    await app.close();

    expect(statuts.slice(0, LINK_UNFURL_RATE_LIMIT_MAX).every((s) => s === 200)).toBe(true);
    expect(statuts[LINK_UNFURL_RATE_LIMIT_MAX]).toBe(429);
  }, 30_000);
});
