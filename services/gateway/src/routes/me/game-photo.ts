/**
 * LES ROUTES DES MOMENTS PHOTO ET DES CADRES (#10162, L10a — chantier « Cadres de gloire ») — le contrat
 * est dans `@meeshy/shared/types/game-routes` (`GAME_PHOTO_ROUTES`) et `@meeshy/shared/types/game-photo`
 * (schémas) ; cette route n'en invente aucun.
 *
 *   PUT  /me/game/frames/atmosphere          choisir son atmosphère — installe AUSSI son pack
 *   PUT  /me/game/photo-moments/invitations  « Me proposer d'immortaliser »
 *   POST /me/game/photo-moments/presented    accuser la présentation d'étapes (au plus 64), idempotent
 *   POST /me/game/photo-moments/kept         signaler des étapes IMMORTALISÉES (D22 b, #10182) : l'identifiant seul
 *
 * La LECTURE de ces réglages et du registre passe par l'extension `game.photo` du bloc `game` de
 * `GET /me/engagement` : aucune requête de plus. Aucune route ne prend d'`userId` : l'utilisateur est celui
 * de l'authentification. Un corps mal formé (atmosphère hors `GLORY_ATMOSPHERES`, réglage inconnu, étape
 * mal formée, plus de 64 étapes) est un 400 du schéma ; une étape bien formée mais hors des familles connues
 * (`isKnownPhotoStepId` : bornes du catalogue, `day:` de J-2 à J+1) est un 400 `PHOTO_STEP_UNKNOWN`, et rien
 * du lot n'est écrit.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { GLORY_ATMOSPHERES, type GloryAtmosphere } from '@meeshy/shared/types/glory-atmospheres';
import { PHOTO_INVITATIONS, PHOTO_KEPT_MAX, PHOTO_PRESENTED_MAX, PHOTO_STEP_ID_PATTERN, type PhotoInvitations } from '@meeshy/shared/types/game-photo';
import { isKnownPhotoStepId } from '@meeshy/shared/utils/game/photo-step-ids';
import { sendError } from '../../utils/response';
import { GamePhotoService, atmosphereRemovalGuard, type FramePackInstaller } from '../../services/game/GamePhotoService';
import { PackCatalog } from '../../services/packs/PackCatalog';
import { startupPackIndex, type PackIndex } from '../../services/packs/PackIndex';
import { gloryFramePackSpec } from '../../services/packs/gloryFramePackSpec';
import { packInstallationBroadcaster } from '../pack-routes';
import { gameRateLimitConfig, requestIdSchema, runGameWrite } from './game-shared';

export type GamePhotoRoutesOptions = {
  /** Le registre des packs de cadres ; absent : celui lu au démarrage (VIDE jusqu'au L3). */
  readonly packIndex?: PackIndex;
};

const reasonedErrors = { 400: errorResponseSchema, 401: errorResponseSchema, 429: errorResponseSchema, 500: errorResponseSchema } as const;

const envelope = (data: object) => ({
  type: 'object',
  additionalProperties: false,
  properties: { success: { type: 'boolean' }, data: { type: 'object', additionalProperties: false, ...data } },
});

const atmosphereEnum = { type: 'string', enum: [...GLORY_ATMOSPHERES] } as const;
const invitationsEnum = { type: 'string', enum: [...PHOTO_INVITATIONS] } as const;
const stepIdSchema = { type: 'string', pattern: PHOTO_STEP_ID_PATTERN } as const;

/** Un lot d'identifiants d'étape, RIEN d'autre : le corps que l'accusé et le signal « immortalisée » partagent. */
const stepIdsBody = (max: number) => ({
  type: 'object',
  required: ['requestId', 'stepIds'],
  properties: { requestId: requestIdSchema, stepIds: { type: 'array', minItems: 1, maxItems: max, items: stepIdSchema } },
  additionalProperties: false,
});

/** `{ <list>: [{ stepId, <stamp> }] }` — la réponse des deux horloges, à la clé près. */
const stampedResponse = (list: string, stamp: string) =>
  envelope({
    required: [list],
    properties: {
      [list]: {
        type: 'array',
        items: { type: 'object', additionalProperties: false, required: ['stepId', stamp], properties: { stepId: { type: 'string' }, [stamp]: { type: 'string' } } },
      },
    },
  });

/** Les identités du lot hors des familles connues : une seule suffit à refuser tout le lot en 400 `PHOTO_STEP_UNKNOWN`. */
const unknownPhotoSteps = (stepIds: readonly string[], now: Date): readonly string[] => [...new Set(stepIds.filter((stepId) => !isKnownPhotoStepId(stepId, now)))];

const refuseUnknownSteps = (reply: FastifyReply, unknown: readonly string[]) =>
  sendError(reply, 400, 'PHOTO_STEP_UNKNOWN', { code: 'PHOTO_STEP_UNKNOWN', details: { stepIds: unknown } });

type StepIdsBody = { requestId: string; stepIds: string[] };

export async function meGamePhotoRoutes(fastify: FastifyInstance, options: GamePhotoRoutesOptions = {}) {
  const photo = new GamePhotoService(fastify.prisma);
  const frames: FramePackInstaller = new PackCatalog({
    prisma: fastify.prisma,
    spec: gloryFramePackSpec({ index: options.packIndex ?? startupPackIndex(), removalGuard: atmosphereRemovalGuard(fastify.prisma) }),
    broadcast: packInstallationBroadcaster(fastify),
  });

  fastify.put(
    '/game/frames/atmosphere',
    {
      onRequest: [fastify.authenticate],
      config: { rateLimit: gameRateLimitConfig('frame-atmosphere', 30, false) },
      schema: {
        description:
          'Choisit l’atmosphère des cadres de gloire (#10162) et INSTALLE son pack ; toléré quand le registre ne connaît pas encore le pack (`packInstalled: false`). Idempotent.',
        tags: ['me', 'game'],
        summary: 'Choose my glory frame atmosphere',
        body: {
          type: 'object',
          required: ['requestId', 'atmosphere'],
          properties: { requestId: requestIdSchema, atmosphere: atmosphereEnum },
          additionalProperties: false,
        },
        response: {
          200: envelope({ required: ['atmosphere', 'packInstalled'], properties: { atmosphere: atmosphereEnum, packInstalled: { type: 'boolean' } } }),
          ...reasonedErrors,
        },
      },
    },
    (request: FastifyRequest<{ Body: { requestId: string; atmosphere: GloryAtmosphere } }>, reply: FastifyReply) =>
      runGameWrite(request, reply, (userId) => photo.setAtmosphere(userId, request.body.atmosphere, frames)),
  );

  fastify.put(
    '/game/photo-moments/invitations',
    {
      onRequest: [fastify.authenticate],
      config: { rateLimit: gameRateLimitConfig('photo-invitations', 30, false) },
      schema: {
        description: '« Me proposer d’immortaliser » (#10162) : chaque étape, les grands moments, jamais. Idempotent.',
        tags: ['me', 'game'],
        summary: 'Set my photo invitations',
        body: {
          type: 'object',
          required: ['requestId', 'invitations'],
          properties: { requestId: requestIdSchema, invitations: invitationsEnum },
          additionalProperties: false,
        },
        response: { 200: envelope({ required: ['invitations'], properties: { invitations: invitationsEnum } }), ...reasonedErrors },
      },
    },
    (request: FastifyRequest<{ Body: { requestId: string; invitations: PhotoInvitations } }>, reply: FastifyReply) =>
      runGameWrite(request, reply, (userId) => photo.setInvitations(userId, request.body.invitations)),
  );

  fastify.post(
    '/game/photo-moments/presented',
    {
      onRequest: [fastify.authenticate],
      config: { rateLimit: gameRateLimitConfig('photo-presented', 60, false) },
      schema: {
        description:
          'Accuse la présentation d’étapes du jeu (#10162) — bannière, carte photo, carnet, déroulé. Au plus 64, toutes connues (sinon 400 `PHOTO_STEP_UNKNOWN`) ; idempotent : une ligne par étape, la date de première présentation ne bouge pas. Au-delà du plafond du compte, une étape neuve est ignorée (absente de la réponse).',
        tags: ['me', 'game'],
        summary: 'Mark photo moments as presented',
        body: stepIdsBody(PHOTO_PRESENTED_MAX),
        response: { 200: stampedResponse('presented', 'presentedAt'), ...reasonedErrors },
      },
    },
    (request: FastifyRequest<{ Body: StepIdsBody }>, reply: FastifyReply) => {
      const now = new Date();
      const unknown = unknownPhotoSteps(request.body.stepIds, now);
      if (unknown.length > 0) return refuseUnknownSteps(reply, unknown);
      return runGameWrite(request, reply, (userId) => photo.markPresented(userId, request.body.stepIds, now));
    },
  );

  fastify.post(
    '/game/photo-moments/kept',
    {
      onRequest: [fastify.authenticate],
      config: { rateLimit: gameRateLimitConfig('photo-kept', 60, false) },
      schema: {
        description:
          'Signale des étapes IMMORTALISÉES sur cet appareil (#10162, D22 b) — l’identifiant d’étape seul, jamais la photo ni sa date de prise. Au plus 64, toutes connues (sinon 400 `PHOTO_STEP_UNKNOWN`) ; idempotent : la date de première immortalisation ne bouge pas, et l’étape vaut présentée. Au-delà du plafond du compte, une étape neuve est ignorée (absente de la réponse).',
        tags: ['me', 'game'],
        summary: 'Mark photo moments as kept',
        body: stepIdsBody(PHOTO_KEPT_MAX),
        response: { 200: stampedResponse('kept', 'keptAt'), ...reasonedErrors },
      },
    },
    (request: FastifyRequest<{ Body: StepIdsBody }>, reply: FastifyReply) => {
      const now = new Date();
      const unknown = unknownPhotoSteps(request.body.stepIds, now);
      if (unknown.length > 0) return refuseUnknownSteps(reply, unknown);
      return runGameWrite(request, reply, (userId) => photo.markKept(userId, request.body.stepIds, now));
    },
  );
}
