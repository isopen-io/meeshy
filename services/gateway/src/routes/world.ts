/**
 * `GET /api/v1/world` (#10000) — ce que la landing de meeshy.me lit pour faire
 * entrer quelqu'un dans World Wide : l'identifiant de la conversation, son
 * titre, la clé du lien de partage à suivre, et l'effectif.
 *
 * PUBLIC par conception : la landing est servie à des visiteurs qui n'ont ni
 * compte ni session. L'entrée est la MÊME pour tous, d'où un cache serveur
 * court. L'EFFECTIF, lui, ne part que vers un compte Meeshy (#10205, directive
 * porteur du 2026-10-11) : un visiteur sans compte, ou un invité de lien, reçoit
 * l'entrée SANS `memberCount` (cache public), un compte la reçoit avec (cache
 * PRIVÉ) — `Vary: Authorization` sépare les deux formes dans tout cache partagé.
 *
 * Ce qui ne sort JAMAIS : un id de conversation, de lien ou d'utilisateur, une
 * liste de personnes, la présence de qui que ce soit. Le schéma de réponse est
 * FERMÉ sur les sept clés du contrat (`@meeshy/shared/types/world`) : une clé de
 * plus portée par le chargeur est retirée par le sérialiseur.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { worldEntrySchema, type WorldEntry } from '@meeshy/shared/types/world';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { getCacheStore, type CacheStore } from '../services/CacheStore';
import { loadWorldEntry } from '../services/world/worldConversation';
import { computeETag, ifNoneMatchMatches } from '../utils/etag';
import { enhancedLogger } from '../utils/logger-enhanced';
import { sendNotFound, sendSuccess } from '../utils/response';
import { getOptionalAuth } from './users/presence-gate';
import {
  LEGACY_COUNTS_VARY,
  clientDecodesLegacyCounts,
  isGuestViewer,
  type GuestViewerContext,
} from '../services/guests/guestMemberVisibility';

const logger = enhancedLogger.child({ module: 'WorldRoutes' });

/** Fraîcheur de l'entrée — serveur ET client. Un effectif vieux de 30 s reste vrai pour une landing. */
export const WORLD_ENTRY_CACHE_TTL_SECONDS = 30;

const WORLD_ENTRY_CACHE_KEY = 'world:entry:v1';

const CACHE_CONTROL = `public, max-age=${WORLD_ENTRY_CACHE_TTL_SECONDS}, stale-while-revalidate=60`;
const MEMBER_CACHE_CONTROL = `private, max-age=${WORLD_ENTRY_CACHE_TTL_SECONDS}`;

type WorldAuthenticate = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

/**
 * L'entrée telle qu'un lecteur la reçoit : l'effectif est réservé aux comptes
 * Meeshy. Un client natif sans compte, dont le SDK publié exige le champ
 * (`clientDecodesLegacyCounts`), reçoit un effectif NEUTRE — jamais le vrai.
 */
function servedEntry(entry: WorldEntry, viewer: { readonly isGuest: boolean; readonly legacyCounts: boolean }): WorldEntry {
  if (!viewer.isGuest) return entry;
  const { memberCount: _memberCount, memberCountCapped: _memberCountCapped, ...withoutCount } = entry;
  return viewer.legacyCounts ? { ...withoutCount, memberCount: 0 } : withoutCount;
}

export type WorldRoutesOptions = {
  readonly cache?: Pick<CacheStore, 'get' | 'set'>;
  readonly loadEntry?: (prisma: PrismaClient) => Promise<WorldEntry | null>;
  readonly authenticate?: WorldAuthenticate;
};

const worldEntryResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      additionalProperties: false,
      required: ['identifier', 'title', 'shareLinkIdentifier'],
      properties: {
        identifier: { type: 'string', description: 'Identifiant lisible de la conversation World Wide' },
        title: { type: 'string' },
        shareLinkIdentifier: { type: 'string', description: 'Clé de jonction du lien de partage (POST /links/:key/members)' },
        memberCount: { type: 'integer', description: 'Effectif, servi à un compte Meeshy seulement (#10205), plafonné à 199' },
        memberCountCapped: { type: 'boolean', description: 'Présent et vrai quand memberCount est plafonné (« 199+ »)' },
        avatar: { type: 'string', description: 'Avatar de World Wide, adresse absolue (#10204)' },
        banner: { type: 'string', description: 'Bannière de World Wide, adresse absolue (#10204)' },
      },
    },
  },
} as const;

/**
 * L'entrée servie depuis le cache quand il répond, depuis la base sinon. Le
 * cache n'est JAMAIS une condition : une lecture ou une écriture qui lève
 * retombe sur la base, journalisée, sans faire échouer la landing.
 */
async function resolveEntry(
  prisma: PrismaClient,
  cache: Pick<CacheStore, 'get' | 'set'>,
  loadEntry: (prisma: PrismaClient) => Promise<WorldEntry | null>,
): Promise<WorldEntry | null> {
  const cached = await cache.get(WORLD_ENTRY_CACHE_KEY).catch((error: unknown) => {
    logger.warn('world entry cache read failed', { error: error instanceof Error ? error.message : String(error) });
    return null;
  });
  const parsed = cached ? parseCached(cached) : undefined;
  if (parsed !== undefined) return parsed;

  const entry = await loadEntry(prisma);
  await cache
    .set(WORLD_ENTRY_CACHE_KEY, JSON.stringify({ entry }), WORLD_ENTRY_CACHE_TTL_SECONDS)
    .catch((error: unknown) => {
      logger.warn('world entry cache write failed', { error: error instanceof Error ? error.message : String(error) });
    });
  return entry;
}

/** `undefined` = rien d'exploitable en cache ; `null` = « pas de porte », mis en cache lui aussi. */
function parseCached(raw: string): WorldEntry | null | undefined {
  try {
    const { entry } = JSON.parse(raw) as { entry: unknown };
    if (entry === null) return null;
    const result = worldEntrySchema.safeParse(entry);
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}

export async function worldRoutes(fastify: FastifyInstance, options: WorldRoutesOptions = {}): Promise<void> {
  const prisma = fastify.prisma as PrismaClient;
  const cache = options.cache ?? getCacheStore();
  const loadEntry = options.loadEntry ?? loadWorldEntry;
  const authenticate = options.authenticate ?? (getOptionalAuth(prisma) as unknown as WorldAuthenticate);
  // Seul un JETON de compte ouvre l'effectif : sans `Authorization`, aucune
  // identité n'est résolue — une session invitée, même révoquée (410 ailleurs),
  // ne change rien à cette route publique, et la landing ne paie aucune lecture.
  const identify: WorldAuthenticate = async (request, reply) => {
    if (!request.headers.authorization) return;
    await authenticate(request, reply);
  };

  fastify.get(
    '/world',
    {
      schema: {
        description:
          "L'entrée publique de World Wide : ce que la landing de meeshy.me lit pour faire entrer un visiteur sans compte. Mise en cache 30 s ; l'effectif n'est servi qu'à un compte Meeshy (#10205).",
        tags: ['world', 'public'],
        summary: 'Entrée publique de World Wide',
        response: {
          200: worldEntryResponseSchema,
          404: errorResponseSchema,
        },
      },
      preValidation: [identify],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const loaded = await resolveEntry(prisma, cache, loadEntry);
      if (!loaded) {
        return sendNotFound(reply, 'World Wide unavailable', {
          code: 'WORLD_UNAVAILABLE',
          message: "World Wide n'a pas d'entrée ouverte pour le moment",
        });
      }

      const viewerIsGuest = isGuestViewer((request as FastifyRequest & { authContext?: GuestViewerContext }).authContext);
      const entry = servedEntry(loaded, { isGuest: viewerIsGuest, legacyCounts: clientDecodesLegacyCounts(request.headers) });
      const etag = computeETag(entry);
      reply.header('ETag', etag);
      reply.header('Cache-Control', viewerIsGuest ? CACHE_CONTROL : MEMBER_CACHE_CONTROL);
      reply.header('Vary', `Authorization, ${LEGACY_COUNTS_VARY}`);
      if (ifNoneMatchMatches(request.headers['if-none-match'], etag)) {
        return reply.code(304).send();
      }
      return sendSuccess(reply, entry);
    },
  );
}
