/**
 * CE QU'UN LIEN DU JEU OUVRE (#9947) — le contrat est dans
 * `@meeshy/shared/types/game-archive` (adresses, codes, schémas Zod) :
 *
 *   GET /me/game/seasons/:number          une saison passée, en cours ou future : calendrier, thème, MA progression
 *   GET /me/game/league/weeks/:weekKey    une semaine de ligue : MON résultat gravé, ou la purge
 *
 * Lecture seule, l'utilisateur est celui de l'authentification. Un paramètre qui
 * n'est pas une saison ou un lundi est un 400 avec le code du contrat. Les schémas
 * de réponse sont STRICTS (`additionalProperties: false`) : un champ qu'un service
 * ajouterait demain — pseudonyme, total ou rang d'un autre — est supprimé, pas servi.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { GAME_ARCHIVE_ERROR_CODES, GAME_ARCHIVE_RETENTIONS, GAME_ARCHIVE_STATUSES } from '@meeshy/shared/types/game-archive';
import { isLeagueWeekKeyParam, parseSeasonNumberParam } from '@meeshy/shared/utils/game/game-links';
import { GameArchiveService } from '../../services/game/GameArchiveService';
import { AUTH_ERROR_CODES } from '../../utils/auth-error-codes';
import { logError } from '../../utils/logger';
import { sendBadRequest, sendInternalError, sendNotFound, sendSuccess, sendUnauthorized } from '../../utils/response.js';
import { gameRateLimitConfig, runGameWrite } from './game-shared';

const nullable = (type: string) => ({ type: [type, 'null'] }) as const;
const strict = (properties: Record<string, object>, required: readonly string[] = Object.keys(properties)) =>
  ({ type: 'object', additionalProperties: false, required: [...required], properties }) as const;
const envelope = (data: object) => ({ type: 'object', properties: { success: { type: 'boolean' }, data } }) as const;
const statusSchema = { type: 'string', enum: [...GAME_ARCHIVE_STATUSES] } as const;

const seasonArchiveResponse = envelope(
  strict({
    number: { type: 'integer' },
    status: statusSchema,
    themeKey: { type: 'string' },
    startDay: { type: 'string' },
    endDay: { type: 'string' },
    weekKeys: { type: 'array', items: { type: 'string' } },
    progress: {
      anyOf: [
        { type: 'null' },
        strict({
          stars: { type: 'integer' },
          steps: { type: 'integer' },
          claimedSteps: { type: 'array', items: { type: 'integer' } },
          sealOwned: { type: 'boolean' },
          completed: { type: 'boolean' },
          settled: { type: 'boolean' },
        }),
      ],
    },
  }),
);

const leagueWeekArchiveResponse = envelope(
  strict({
    weekKey: { type: 'string' },
    status: statusSchema,
    season: nullable('integer'),
    retention: { type: 'string', enum: [...GAME_ARCHIVE_RETENTIONS] },
    result: {
      anyOf: [
        { type: 'null' },
        strict({
          league: { type: 'string' },
          finalRank: nullable('integer'),
          finalPoints: nullable('integer'),
          zone: nullable('string'),
          cup: nullable('string'),
          settled: { type: 'boolean' },
        }),
      ],
    },
  }),
);

const readErrors = { 400: errorResponseSchema, 401: errorResponseSchema, 404: errorResponseSchema, 429: errorResponseSchema, 500: errorResponseSchema } as const;

export async function meGameArchiveRoutes(fastify: FastifyInstance) {
  const archive = new GameArchiveService(fastify.prisma);

  fastify.get(
    '/game/seasons/:number',
    {
      onRequest: [fastify.authenticate],
      config: { rateLimit: gameRateLimitConfig('season-archive', 60, false) },
      schema: {
        description:
          'Une saison par son numéro (#9947) — passée, en cours ou future : son calendrier et son thème (les mêmes pour tous), et MA ' +
          'progression si j’y ai joué. Ce que la carte d’un événement in-app ou un lien `/me/progression/saison/{n}` ouvre.',
        tags: ['me', 'game'],
        summary: 'Get a season by number',
        params: { type: 'object', required: ['number'], properties: { number: { type: 'string', maxLength: 16 } } },
        response: { 200: seasonArchiveResponse, ...readErrors },
      },
    },
    async (request: FastifyRequest<{ Params: { number: string } }>, reply: FastifyReply) => {
      const userId = request.auth?.userId;
      if (!userId) return sendUnauthorized(reply, 'Authentication required', { code: AUTH_ERROR_CODES.UNAUTHORIZED });
      const number = parseSeasonNumberParam(request.params.number);
      if (number === null) return sendBadRequest(reply, GAME_ARCHIVE_ERROR_CODES.seasonInvalid, { code: GAME_ARCHIVE_ERROR_CODES.seasonInvalid });
      try {
        const season = await archive.season(userId, number);
        if (season === null) return sendNotFound(reply, GAME_ARCHIVE_ERROR_CODES.seasonNotFound, { code: GAME_ARCHIVE_ERROR_CODES.seasonNotFound });
        return sendSuccess(reply, season);
      } catch (error) {
        logError('Error in game season read', error, { source: 'me-game-archive' });
        return sendInternalError(reply, 'GAME_READ_FAILED');
      }
    },
  );

  fastify.get(
    '/game/league/weeks/:weekKey',
    {
      onRequest: [fastify.authenticate],
      config: { rateLimit: gameRateLimitConfig('league-week-archive', 60, false) },
      schema: {
        description:
          'Une semaine de ligue par sa clé, le lundi qui l’ouvre (#9947) : MON résultat gravé (ligue, rang, zone, coupe), ou `retention: purged` ' +
          'passé la conservation. Rien des autres membres du groupe. Ce qu’un lien `/me/progression/ligue/{weekKey}` ouvre.',
        tags: ['me', 'game'],
        summary: 'Get a league week by key',
        params: { type: 'object', required: ['weekKey'], properties: { weekKey: { type: 'string', maxLength: 16 } } },
        response: { 200: leagueWeekArchiveResponse, ...readErrors },
      },
    },
    async (request: FastifyRequest<{ Params: { weekKey: string } }>, reply: FastifyReply) => {
      const { weekKey } = request.params;
      if (request.auth?.userId && !isLeagueWeekKeyParam(weekKey)) {
        return sendBadRequest(reply, GAME_ARCHIVE_ERROR_CODES.leagueWeekInvalid, { code: GAME_ARCHIVE_ERROR_CODES.leagueWeekInvalid });
      }
      return runGameWrite(request, reply, (userId) => archive.leagueWeek(userId, weekKey));
    },
  );
}
