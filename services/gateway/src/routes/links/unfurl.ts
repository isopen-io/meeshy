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
  loadLinkUnfurlSource,
  renderLinkUnfurlPage,
  type LinkUnfurlSource
} from '../../services/linkUnfurl/page';

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
    config: {
      rateLimit: {
        max: LINK_UNFURL_RATE_LIMIT_MAX,
        timeWindow: '1 minute',
        hook: 'onRequest' as const,
        skipOnError: true,
        keyGenerator: (request: FastifyRequest) => `link-unfurl:ip:${request.ip}`,
        errorResponseBuilder: () => ({
          success: false,
          statusCode: 429,
          error: 'RATE_LIMIT_EXCEEDED',
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many link previews. Please try again later.'
        })
      }
    }
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
}
