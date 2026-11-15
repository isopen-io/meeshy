/**
 * LE CALENDRIER DES SAISONS SERVI (#10016) — `GET /me/game/seasons/calendar`.
 *
 * Les définitions programmées par l'admin (numéro, lundi de début, statut, thème,
 * points d'étape, textes en sept langues) et leur révision. Les clients le lisent
 * par la loi partagée (`season-schedule.ts`, miroir Swift `GameSeasonSchedule`) et
 * le gardent hors ligne, clé = révision ; sans lui, la constante. Une donnée de
 * CALENDRIER, la même pour tous : rien de personnel, rien de la présence d'autrui.
 * `ETag: "season-schedule-<révision>"` : une revalidation ne coûte qu'un 304.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { SEASON_COPY_LOCALES } from '@meeshy/shared/utils/game/season-schedule';
import { seasonSchedule } from '../../services/game/SeasonScheduleService';
import { ifNoneMatchMatches } from '../../utils/etag';
import { gameRateLimitConfig } from './game-shared';

const copyText = { type: 'object', additionalProperties: false, required: ['title', 'tagline', 'description'], properties: { title: { type: 'string' }, tagline: { type: 'string' }, description: { type: 'string' } } } as const;

const definitionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['number', 'startDay', 'status', 'themeKey', 'stepPoints', 'copy'],
  properties: {
    number: { type: 'integer' },
    startDay: { type: 'string' },
    status: { type: 'string', enum: ['scheduled', 'paused'] },
    themeKey: { type: 'string' },
    stepPoints: { type: 'integer' },
    rewardPack: { type: 'string' },
    copy: {
      anyOf: [
        { type: 'null' },
        { type: 'object', additionalProperties: false, required: [...SEASON_COPY_LOCALES], properties: Object.fromEntries(SEASON_COPY_LOCALES.map((l) => [l, copyText])) },
      ],
    },
  },
} as const;

export const seasonCalendarResponse = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      additionalProperties: false,
      required: ['revision', 'seasons'],
      properties: { revision: { type: 'integer' }, seasons: { type: 'array', items: definitionSchema } },
    },
  },
} as const;

export const seasonCalendarEtag = (revision: number): string => `"season-schedule-${revision}"`;

export async function meGameSeasonCalendarRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/game/seasons/calendar',
    {
      onRequest: [fastify.authenticate],
      config: { rateLimit: gameRateLimitConfig('season-calendar', 60, false) },
      schema: {
        description:
          'Le calendrier des saisons servi (#10016) : les saisons programmées (lundi de début, statut, thème, points d’étape, textes en 7 langues) ' +
          'et leur révision. Ce qui n’y figure pas se dérive de la loi partagée. ETag par révision (304 sur If-None-Match).',
        tags: ['me', 'game'],
        summary: 'Get the served seasons calendar',
        response: { 200: seasonCalendarResponse, 401: errorResponseSchema, 429: errorResponseSchema },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.auth?.userId) return reply.status(401).send({ success: false, error: 'Authentication required', message: 'Authentication required' });
      const schedule = await seasonSchedule(fastify.prisma);
      const etag = seasonCalendarEtag(schedule.revision);
      reply.header('ETag', etag).header('Cache-Control', 'private, no-cache');
      if (ifNoneMatchMatches(request.headers['if-none-match'], etag)) return reply.code(304).send();
      return reply.send({ success: true, data: { revision: schedule.revision, seasons: schedule.seasons } });
    },
  );
}
