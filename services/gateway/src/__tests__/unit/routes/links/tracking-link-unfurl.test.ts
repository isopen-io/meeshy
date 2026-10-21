/**
 * @jest-environment node
 *
 * UN LIEN SUIVI `/l/<jeton>` SE DÉPLIE CHEZ LES ROBOTS D'APERÇU (#10192).
 *
 * `GET /tracking-links/:token/og` est ce que Traefik sert aux robots qui
 * déplient `https://meeshy.me/l/<jeton>`. L'aperçu est celui de la CIBLE quand
 * elle est publique, sinon le générique de Meeshy :
 *
 * - une cible web EXTÉRIEURE, d'un lien actif : le robot y est renvoyé (302) et
 *   lit l'aperçu que la cible publie elle-même — Meeshy ne la lit pas ;
 * - une invitation Meeshy (`/chat/<lien>`, `/join/<lien>`, ou le jeton d'un lien
 *   de partage) : l'aperçu de l'invitation, si le lien est ouvert et public ;
 * - toute autre adresse Meeshy (une conversation, un post), un lien mort,
 *   inconnu, ou une cible qui n'est pas une adresse web : le générique, sans
 *   rien de l'adresse.
 *
 * Le double Prisma ne connaît QUE `trackingLink.findUnique` et
 * `conversationShareLink.findFirst` : toute autre lecture, et toute écriture
 * (un clic compté), LÈVE.
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';

import { registerLinkUnfurlRoute, LINK_UNFURL_RATE_LIMIT_MAX } from '../../../../routes/links/unfurl';

const ORIGIN = 'https://staging.meeshy.me';
const TOKEN = 'Ab3xYz';
const SHARE_ID = 'mshy_beta-10192';
const CONVERSATION_ID = '64f0c0ffee0000000000abcd';

type Suivi = { readonly targetType?: string; readonly originalUrl?: string; readonly isActive?: boolean; readonly expiresAt?: Date | null };

const suivi = (o: Suivi = {}) => ({
  targetType: o.targetType ?? 'EXTERNAL',
  originalUrl: o.originalUrl ?? 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  isActive: o.isActive ?? true,
  expiresAt: o.expiresAt ?? null,
});

type Partage = { readonly isActive?: boolean; readonly allowedIpRanges?: readonly string[] };

const partage = (o: Partage = {}) => ({
  linkId: SHARE_ID,
  name: 'Invitation bêta',
  isActive: o.isActive ?? true,
  expiresAt: null,
  maxUses: null,
  currentUses: 0,
  allowedIpRanges: o.allowedIpRanges ?? [],
  conversation: { title: 'Les bêta-testeurs', isActive: true, closedAt: null },
  creator: {
    displayName: 'Alice Martin',
    username: 'alice',
    isActive: true,
    deletedAt: null,
    systemLanguage: 'fr',
    regionalLanguage: null,
    customDestinationLanguage: null,
    deviceLocale: null,
  },
});

type Monde = {
  readonly suivi?: ReturnType<typeof suivi> | null | (() => Promise<never>);
  readonly partage?: ReturnType<typeof partage> | null;
};

const strict = <T extends object>(nom: string, methodes: T): T =>
  new Proxy(methodes, {
    get(target, prop) {
      if (prop === 'then') return undefined;
      if (prop in target) return target[prop as keyof T];
      throw new Error(`${nom}.${String(prop)} n'est pas une lecture de l'aperçu`);
    },
  });

const monter = async (monde: Monde = {}) => {
  const findUnique = jest.fn(async (args: { where: { token?: string } }) => {
    const ligne = monde.suivi === undefined ? suivi() : monde.suivi;
    if (typeof ligne === 'function') return ligne();
    return ligne && args.where.token === TOKEN ? ligne : null;
  });
  const findFirst = jest.fn(async (args: { where?: { OR?: ReadonlyArray<Record<string, unknown>> } }) => {
    const ligne = monde.partage === undefined ? partage() : monde.partage;
    const cles = (args.where?.OR ?? []).flatMap((c) => Object.values(c));
    return ligne && (cles.includes(SHARE_ID) || cles.includes(TOKEN)) ? ligne : null;
  });
  const prisma = strict('prisma', {
    trackingLink: strict('trackingLink', { findUnique }),
    conversationShareLink: strict('conversationShareLink', { findFirst }),
  });
  const app = Fastify({ logger: false });
  await app.register(rateLimit, { global: false, skipOnError: true, keyGenerator: (request) => `global:${request.ip}` });
  registerLinkUnfurlRoute(app, { prisma: prisma as never, origin: ORIGIN });
  await app.ready();
  return { app, findUnique, findFirst };
};

const deplier = async (monde: Monde = {}, options: { readonly token?: string; readonly acceptLanguage?: string } = {}) => {
  const { app, findUnique, findFirst } = await monter(monde);
  const reponse = await app.inject({
    method: 'GET',
    url: `/tracking-links/${encodeURIComponent(options.token ?? TOKEN)}/og`,
    headers: options.acceptLanguage ? { 'accept-language': options.acceptLanguage } : {},
  });
  await app.close();
  return { reponse, findUnique, findFirst };
};

const meta = (html: string, cle: string): string | undefined =>
  html.match(new RegExp(`<meta (?:property|name)="${cle.replace(/:/g, ':')}" content="([^"]*)"`))?.[1];

const GENERIQUE = 'Meeshy — la messagerie qui traduit';

describe('Une cible web extérieure, d’un lien actif : le robot lit l’aperçu de la cible', () => {
  it('renvoie le robot vers la cible (302), sans compter de clic', async () => {
    const { reponse } = await deplier();

    expect(reponse.statusCode).toBe(302);
    expect(reponse.headers.location).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(reponse.headers['cache-control']).toBe('public, max-age=300');
    expect(reponse.headers['x-robots-tag']).toBe('noindex, nofollow');
    expect(reponse.headers['referrer-policy']).toBe('no-referrer');
  });

  it('normalise l’adresse : aucun retour à la ligne ne traverse l’en-tête', async () => {
    const { reponse } = await deplier({ suivi: suivi({ originalUrl: 'https://exemple.org/a b?x=1' }) });

    expect(reponse.statusCode).toBe(302);
    expect(reponse.headers.location).toBe('https://exemple.org/a%20b?x=1');
  });
});

describe('Une cible qui n’est pas publique, ou un lien mort, rend le générique', () => {
  const generiques: ReadonlyArray<readonly [string, Monde]> = [
    ['lien désactivé (modération comprise)', { suivi: suivi({ isActive: false }) }],
    ['lien échu', { suivi: suivi({ expiresAt: new Date('2020-01-01') }) }],
    ['cible `javascript:`', { suivi: suivi({ originalUrl: 'javascript:alert(1)' }) }],
    ['cible `data:`', { suivi: suivi({ originalUrl: 'data:text/html,<script>alert(1)</script>' }) }],
    ['cible illisible', { suivi: suivi({ originalUrl: 'pas une adresse' }) }],
    ['cible avec identifiants', { suivi: suivi({ originalUrl: 'https://alice:secret@exemple.org/' }) }],
    ['une conversation Meeshy', { suivi: suivi({ originalUrl: `${ORIGIN}/c/${CONVERSATION_ID}` }) }],
    ['un post Meeshy', { suivi: suivi({ targetType: 'POST', originalUrl: `${ORIGIN}/feeds/post/${CONVERSATION_ID}` }) }],
    ['un partage de contenu dont l’adresse n’est pas celle de l’application', { suivi: suivi({ targetType: 'STORY', originalUrl: `https://www.exemple.org/story/${CONVERSATION_ID}` }) }],
    ['une conversation Meeshy sous www.', { suivi: suivi({ originalUrl: `https://www.staging.meeshy.me/c/${CONVERSATION_ID}` }) }],
    ['une invitation fermée', { suivi: suivi({ originalUrl: `${ORIGIN}/chat/${SHARE_ID}` }), partage: partage({ isActive: false }) }],
    ['une invitation bornée à des plages d’adresses', { suivi: suivi({ originalUrl: `${ORIGIN}/chat/${SHARE_ID}` }), partage: partage({ allowedIpRanges: ['10.0.0.0/8'] }) }],
    ['un lien à jeton d’e-mail sur un autre hôte (#10871)', { suivi: suivi({ originalUrl: 'https://exemple.org/auth/magic-link?token=secret' }) }],
    ['jeton inconnu', { suivi: null, partage: null }],
  ];

  it.each(generiques)('%s ⇒ 200, aperçu de Meeshy, rien de la cible', async (_cas, monde) => {
    const { reponse } = await deplier(monde);

    expect(reponse.statusCode).toBe(200);
    expect(reponse.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(meta(reponse.body, 'og:title')).toBe(GENERIQUE);
    expect(meta(reponse.body, 'og:image')).toBe(`${ORIGIN}/og/invitation-v1.png`);
    expect(meta(reponse.body, 'twitter:card')).toBe('summary_large_image');
    for (const fuite of [CONVERSATION_ID, SHARE_ID, TOKEN, 'youtube', 'exemple.org', 'secret', 'alert', 'Alice', 'bêta']) {
      expect(reponse.body).not.toContain(fuite);
    }
  });

  it('rend le MÊME octet pour chacun — un lien mort ne se distingue pas d’un jeton inconnu', async () => {
    const corps = await Promise.all(generiques.map(async ([, monde]) => (await deplier(monde)).reponse.body));

    expect(new Set(corps).size).toBe(1);
  });

  it('un jeton malformé rend le générique sans interroger la base', async () => {
    for (const token of ['a', 'x'.repeat(51), 'a.b']) {
      const { reponse, findUnique, findFirst } = await deplier({}, { token });
      expect(reponse.statusCode).toBe(200);
      expect(meta(reponse.body, 'og:title')).toBe(GENERIQUE);
      expect(findUnique).not.toHaveBeenCalled();
      expect(findFirst).not.toHaveBeenCalled();
    }
  });

  it('une base en panne rend le générique, jamais une page d’erreur', async () => {
    const { reponse } = await deplier({ suivi: () => Promise.reject(new Error('mongo down')) });

    expect(reponse.statusCode).toBe(200);
    expect(meta(reponse.body, 'og:title')).toBe(GENERIQUE);
  });

  it('le générique suit la langue demandée par le robot', async () => {
    const { reponse } = await deplier({ suivi: null, partage: null }, { acceptLanguage: 'en-US,en;q=0.9' });

    expect(meta(reponse.body, 'og:title')).toBe('Meeshy — the messenger that translates');
  });
});

describe('Une invitation Meeshy ouverte et publique se déplie en invitation', () => {
  const invitations: ReadonlyArray<readonly [string, Monde]> = [
    ['cible /chat/<lien>', { suivi: suivi({ originalUrl: `${ORIGIN}/chat/${SHARE_ID}` }) }],
    ['cible /join/<lien>', { suivi: suivi({ originalUrl: `${ORIGIN}/join/${SHARE_ID}?utm=x` }) }],
    ['jeton d’un lien de partage', { suivi: null }],
  ];

  it.each(invitations)('%s ⇒ l’hôte et le titre, l’adresse suivie gardée', async (_cas, monde) => {
    const { reponse } = await deplier(monde);

    expect(reponse.statusCode).toBe(200);
    expect(meta(reponse.body, 'og:title')).toBe('Alice Martin t’invite à « Les bêta-testeurs »');
    expect(meta(reponse.body, 'og:url')).toBe(`${ORIGIN}/l/${TOKEN}`);
    expect(reponse.body).toContain(`<a href="${ORIGIN}/l/${TOKEN}?open=1">`);
    expect(reponse.body).not.toContain(CONVERSATION_ID);
  });
});

describe('Le débit est borné', () => {
  it(`au-delà de ${LINK_UNFURL_RATE_LIMIT_MAX} dépliages par minute, 429`, async () => {
    const { app } = await monter({ suivi: null, partage: null });
    const codes: number[] = [];
    for (let i = 0; i <= LINK_UNFURL_RATE_LIMIT_MAX; i += 1) {
      codes.push((await app.inject({ method: 'GET', url: `/tracking-links/${TOKEN}/og` })).statusCode);
    }
    await app.close();

    expect(codes.slice(0, LINK_UNFURL_RATE_LIMIT_MAX).every((code) => code === 200)).toBe(true);
    expect(codes[LINK_UNFURL_RATE_LIMIT_MAX]).toBe(429);
  });
});
