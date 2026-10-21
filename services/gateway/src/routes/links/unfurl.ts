/**
 * `GET /links/:identifier/og` — la page que lisent les robots d'aperçu quand on
 * colle `https://meeshy.me/chat/<lien>` dans WhatsApp, iMessage, Telegram,
 * Messenger, Slack ou X (#9712).
 *
 * Traefik y envoie les robots (routeur `*-unfurl`, `docker-compose.{staging,prod}.yml`) ;
 * les humains reçoivent l'application. La page est TOUJOURS un 200 en HTML : un
 * lien mort, inconnu ou illisible rend l'aperçu générique de Meeshy, le même
 * pour tous, qui ne dit pas si le lien a existé.
 *
 * `GET /tracking-links/:token/og` est sa jumelle pour un lien SUIVI
 * `/l/<jeton>` (#10192) : l'aperçu de la cible publique, sinon le même
 * générique. Les deux partagent la ligne de lien de partage lue, le plafond et
 * les en-têtes.
 *
 * Pas de `sendSuccess` ici, et c'est le seul écart à la règle de réponse : un
 * robot d'aperçu lit du HTML, pas une enveloppe JSON.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { BoundedTtlCache } from '../../utils/bounded-cache';
import { logWarn } from '../../utils/logger';
import {
  composeLinkUnfurl,
  isUnfurlableIdentifier,
  LINK_UNFURL_OPEN_QUERY,
  loadLinkUnfurlSource,
  renderLinkUnfurlPage,
  type LinkUnfurl,
  type LinkUnfurlSource
} from '../../services/linkUnfurl/page';
import {
  composeAffiliateUnfurl,
  isAffiliateToken,
  loadAffiliateUnfurlSource,
  type AffiliateUnfurlSource
} from '../../services/linkUnfurl/affiliate';
import {
  decideTrackingLinkUnfurl,
  isTrackingToken,
  loadTrackingLinkUnfurlSource,
  type TrackingLinkUnfurlSource
} from '../../services/linkUnfurl/trackingLink';

export const LINK_UNFURL_RATE_LIMIT_MAX = 60;
export const LINK_UNFURL_CACHE_TTL_MS = 5 * 60_000;
const LINK_UNFURL_CACHE_MAX = 2_000;

const RESPONSE_HEADERS = {
  'cache-control': `public, max-age=${LINK_UNFURL_CACHE_TTL_MS / 1000}`,
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src https:",
  'x-robots-tag': 'noindex, nofollow',
  'referrer-policy': 'no-referrer',
  vary: 'Accept-Language, User-Agent'
} as const;

/** 60 dépliages par minute et par adresse, comptés à `onRequest`, en échec OUVERT (#9712). */
const unfurlRateLimit = (bucket: string) => ({
  max: LINK_UNFURL_RATE_LIMIT_MAX,
  timeWindow: '1 minute',
  hook: 'onRequest' as const,
  skipOnError: true,
  keyGenerator: (request: FastifyRequest) => `${bucket}:ip:${request.ip}`,
  errorResponseBuilder: () => ({
    success: false,
    statusCode: 429,
    error: 'RATE_LIMIT_EXCEEDED',
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many link previews. Please try again later.'
  })
});

/**
 * L'origine publique de l'application web — celle des adresses que les liens
 * de partage portent (`FRONTEND_URL`, même repli que `conversations/sharing.ts`).
 */
export function publicAppOrigin(raw: string | undefined = process.env.FRONTEND_URL): string {
  try {
    const url = new URL(raw ?? '');
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : 'http://localhost:3100';
  } catch {
    return 'http://localhost:3100';
  }
}

export function registerLinkUnfurlRoute(
  fastify: FastifyInstance,
  deps: { readonly prisma: PrismaClient; readonly origin: string }
): void {
  const { prisma, origin } = deps;
  const rows = new BoundedTtlCache<string, LinkUnfurlSource | null>({
    maxSize: LINK_UNFURL_CACHE_MAX,
    ttlMs: LINK_UNFURL_CACHE_TTL_MS
  });

  const readSource = async (identifier: string): Promise<LinkUnfurlSource | null> => {
    if (!isUnfurlableIdentifier(identifier)) return null;
    const cached = rows.get(identifier);
    if (cached !== undefined) return cached;
    const row = await loadLinkUnfurlSource(prisma, identifier);
    rows.set(identifier, row);
    return row;
  };

  fastify.get<{ Params: { identifier: string } }>('/links/:identifier/og', {
    schema: {
      description: 'Page HTML d’aperçu (Open Graph, Twitter Card) d’un lien de partage, servie aux robots d’aperçu des messageries (#9712). Nomme l’hôte qui invite et le titre de la conversation, rien d’autre. Toujours 200 : un lien mort ou inconnu rend l’aperçu générique de Meeshy.',
      tags: ['links'],
      summary: 'Aperçu d’un lien de partage pour les robots',
      params: {
        type: 'object',
        required: ['identifier'],
        properties: { identifier: { type: 'string' } }
      },
      response: {
        200: { description: 'Document HTML portant les balises Open Graph et Twitter Card', type: 'string' },
        429: errorResponseSchema
      }
    },
    config: { rateLimit: unfurlRateLimit('link-unfurl') }
  }, async (request, reply: FastifyReply) => {
    const { identifier } = request.params;
    const source = await readSource(identifier).catch((error: unknown) => {
      logWarn(fastify.log, 'Link unfurl read failed — serving the generic preview', error);
      return null;
    });
    const unfurl = composeLinkUnfurl({
      source,
      identifier,
      acceptLanguage: request.headers['accept-language'],
      origin,
      now: new Date()
    });
    return reply
      .code(200)
      .headers(RESPONSE_HEADERS)
      .type('text/html; charset=utf-8')
      .send(renderLinkUnfurlPage(unfurl));
  });

  const trackingRows = new BoundedTtlCache<string, TrackingLinkUnfurlSource | null>({
    maxSize: LINK_UNFURL_CACHE_MAX,
    ttlMs: LINK_UNFURL_CACHE_TTL_MS
  });

  const readTracking = async (token: string): Promise<TrackingLinkUnfurlSource | null> => {
    const cached = trackingRows.get(token);
    if (cached !== undefined) return cached;
    const row = await loadTrackingLinkUnfurlSource(prisma, token);
    trackingRows.set(token, row);
    return row;
  };

  /**
   * `GET /tracking-links/:token/og` — la page que lisent les robots d'aperçu
   * quand on colle `https://meeshy.me/l/<jeton>` (#10192, D-199). L'aperçu de
   * la cible PUBLIQUE, sinon le générique (`services/linkUnfurl/trackingLink.ts`).
   */
  fastify.get<{ Params: { token: string } }>('/tracking-links/:token/og', {
    schema: {
      description: 'Aperçu d’un lien suivi pour les robots d’aperçu des messageries (#10192) : une cible web extérieure d’un lien actif renvoie le robot vers elle (302, aucun clic compté) ; une invitation Meeshy ouverte et publique rend son aperçu ; tout le reste rend l’aperçu générique de Meeshy, en 200.',
      tags: ['tracking-links'],
      summary: 'Aperçu d’un lien suivi pour les robots',
      params: {
        type: 'object',
        required: ['token'],
        properties: { token: { type: 'string' } }
      },
      response: {
        200: { description: 'Document HTML portant les balises Open Graph et Twitter Card', type: 'string' },
        302: { description: 'Redirection du robot vers la cible web publique du lien' },
        429: errorResponseSchema
      }
    },
    config: { rateLimit: unfurlRateLimit('tracking-unfurl') }
  }, async (request, reply: FastifyReply) => {
    const { token } = request.params;
    const now = new Date();
    const tracking = isTrackingToken(token)
      ? await readTracking(token).catch((error: unknown) => {
          logWarn(fastify.log, 'Tracking link unfurl read failed — serving the generic preview', error);
          return undefined;
        })
      : null;
    const decision = tracking === undefined ? { kind: 'generic' as const } : decideTrackingLinkUnfurl({ token, tracking, origin, now });

    if (decision.kind === 'redirect') {
      return reply
        .headers({
          'cache-control': RESPONSE_HEADERS['cache-control'],
          'x-robots-tag': RESPONSE_HEADERS['x-robots-tag'],
          'referrer-policy': RESPONSE_HEADERS['referrer-policy']
        })
        .redirect(decision.location, 302);
    }

    const source = decision.kind === 'invitation'
      ? await readSource(decision.identifier).catch((error: unknown) => {
          logWarn(fastify.log, 'Tracking link unfurl invitation read failed — serving the generic preview', error);
          return null;
        })
      : null;
    const unfurl = composeLinkUnfurl({
      source,
      identifier: decision.kind === 'invitation' ? decision.identifier : '',
      acceptLanguage: request.headers['accept-language'],
      origin,
      now
    });
    return reply
      .code(200)
      .headers(RESPONSE_HEADERS)
      .type('text/html; charset=utf-8')
      .send(renderLinkUnfurlPage(atTrackingAddress(unfurl, { origin, token })));
  });

  const affiliateRows = new BoundedTtlCache<string, AffiliateUnfurlSource | null>({
    maxSize: LINK_UNFURL_CACHE_MAX,
    ttlMs: LINK_UNFURL_CACHE_TTL_MS
  });

  const readAffiliate = async (token: string): Promise<AffiliateUnfurlSource | null> => {
    if (!isAffiliateToken(token)) return null;
    const cached = affiliateRows.get(token);
    if (cached !== undefined) return cached;
    const row = await loadAffiliateUnfurlSource(prisma, token);
    affiliateRows.set(token, row);
    return row;
  };

  /**
   * `GET /affiliate/:token/og` — la page que lisent les robots d'aperçu quand on
   * colle `https://meeshy.me/signup/affiliate/<jeton>` (#10559) : qui invite, sa
   * bannière sinon son avatar (`services/linkUnfurl/affiliate.ts`). Aucun clic
   * n'est compté.
   */
  fastify.get<{ Params: { token: string } }>('/affiliate/:token/og', {
    schema: {
      description: 'Aperçu d’un lien d’affiliation pour les robots d’aperçu des messageries (#10559). Nomme celui qui invite et montre sa bannière, sinon son avatar — ce que la validation publique du jeton sert déjà. Toujours 200 : un jeton fermé ou inconnu, ou un compte désactivé, rend l’aperçu générique de Meeshy.',
      tags: ['affiliate'],
      summary: 'Aperçu d’un lien d’affiliation pour les robots',
      params: {
        type: 'object',
        required: ['token'],
        properties: { token: { type: 'string' } }
      },
      response: {
        200: { description: 'Document HTML portant les balises Open Graph et Twitter Card', type: 'string' },
        429: errorResponseSchema
      }
    },
    config: { rateLimit: unfurlRateLimit('affiliate-unfurl') }
  }, async (request, reply: FastifyReply) => {
    const { token } = request.params;
    const source = await readAffiliate(token).catch((error: unknown) => {
      logWarn(fastify.log, 'Affiliate link unfurl read failed — serving the generic preview', error);
      return null;
    });
    const unfurl = composeAffiliateUnfurl({
      source,
      token,
      acceptLanguage: request.headers['accept-language'],
      origin,
      now: new Date()
    });
    return reply
      .code(200)
      .headers(RESPONSE_HEADERS)
      .type('text/html; charset=utf-8')
      .send(renderLinkUnfurlPage(unfurl));
  });
}

/**
 * Une invitation dépliée par son lien SUIVI garde l'adresse suivie : la carte
 * d'une messagerie ouvre `og:url`, et c'est `/l/<jeton>` qui compte le clic.
 * Le générique, lui, ne nomme aucune adresse.
 */
function atTrackingAddress(unfurl: LinkUnfurl, params: { readonly origin: string; readonly token: string }): LinkUnfurl {
  if (unfurl.url === `${params.origin}/`) return unfurl;
  const url = `${params.origin}/l/${encodeURIComponent(params.token)}`;
  return { ...unfurl, url, openUrl: `${url}?${LINK_UNFURL_OPEN_QUERY}` };
}
