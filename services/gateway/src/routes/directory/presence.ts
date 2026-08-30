import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { sendSuccess, sendBadRequest, sendInternalError } from '../../utils/response';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { createCustomRateLimiter } from '../../utils/rate-limiter.js';
import { callerRateKey } from '../../utils/client-rate-key';
import { presenceFor, viewerFromAuthContext } from '../users/presence-gate';
import { getPresenceVisibilityService } from '../../services/PresenceVisibilityService';

/** La borne anti-moisson, conservée telle quelle. */
export const MAX_IDS_PAR_REQUETE = 200;

export type PresenceServie = {
  readonly userId: string;
  readonly isOnline: boolean;
  readonly lastActiveAt: Date | null;
};

/**
 * La forme SERVIE d'un instantané de présence — déclarée une fois, partagée par
 * l'adresse canonique et son alias.
 */
export const presenceResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      properties: {
        users: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              userId: { type: 'string' },
              isOnline: { type: 'boolean' },
              lastActiveAt: { type: ['string', 'null'], format: 'date-time' },
            },
          },
        },
      },
    },
  },
} as const;

/**
 * Décode le paramètre `ids`, ou dit pourquoi il est refusé.
 *
 * Rendre le refus plutôt que d'écrire dans `reply` garde le décodage testable
 * sans monter de serveur, et laisse les deux adresses répondre à l'identique.
 */
export function decoderIds(brut: string | undefined): { ids: string[] } | { refus: string } {
  const nettoye = (brut ?? '').trim();
  if (!nettoye) return { refus: 'Query param "ids" is required' };

  const ids = Array.from(new Set(
    nettoye.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
  ));

  if (ids.length > MAX_IDS_PAR_REQUETE) return { refus: `Max ${MAX_IDS_PAR_REQUETE} ids per request` };
  return { ids };
}

/**
 * L'instantané de présence d'une liste d'ids, sous la loi du 2026-08-25.
 *
 * ## Ce qui change : la branche FAIL-OPEN est fermée
 *
 * Le site précédent traitait une entrée ABSENTE de la carte de visibilité en
 * servant la présence runtime BRUTE — l'inverse exact de la règle, qui dit
 * qu'une entrée absente vaut masquée sauf pour ADMIN/BIGBOSS. Il rejouait de
 * plus la politique de repli à la main (`isGlobalAdmin(viewer.role)`), et pour
 * les seuls participants anonymes.
 *
 * `presenceFor` tient les deux : il ne rend JAMAIS `undefined`, et son repli
 * EST `presenceMissingEntryPolicy`, dérivée de la loi partagée. Il n'y a donc
 * plus de branche à écrire, plus de rôle à relire, et plus de cas « absent »
 * qui puisse se traiter différemment d'un cas « refusé ».
 *
 * ## Un anonyme n'a plus besoin d'un cas à lui
 *
 * Un participant anonyme n'a ni ami ni compte : il n'apparaît jamais dans la
 * carte, donc `presenceFor` lui applique le repli — masqué, sauf ADMIN. C'est
 * ce que la branche spéciale calculait, en une règle au lieu de deux.
 */
export async function servirPresence(
  fastify: FastifyInstance,
  request: FastifyRequest,
  ids: readonly string[]
): Promise<PresenceServie[]> {
  const presenceChecker = fastify.presenceChecker;

  if (!presenceChecker) {
    // Service non encore monté (phase de démarrage). Tout hors ligne plutôt
    // qu'un 500 — et c'est la réponse FERMÉE, donc la bonne des deux.
    return ids.map((id) => ({ userId: id, isOnline: false, lastActiveAt: null }));
  }

  const presenceRuntime = presenceChecker.bulk(ids);

  const [users, participants] = await Promise.all([
    fastify.prisma.user.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, lastActiveAt: true },
    }),
    fastify.prisma.participant.findMany({
      where: { id: { in: [...ids] }, type: 'anonymous' },
      select: { id: true, lastActiveAt: true },
    }),
  ]);

  const derniereActivite = new Map<string, Date | null>();
  for (const u of users) derniereActivite.set(u.id, u.lastActiveAt);
  for (const p of participants) derniereActivite.set(p.id, p.lastActiveAt);

  const viewer = viewerFromAuthContext(
    (request as FastifyRequest & {
      authContext?: { type?: string; userId?: string; registeredUser?: { role?: string } | null };
    }).authContext
  );

  const carte = await getPresenceVisibilityService(fastify.prisma).resolveForTargets(
    viewer,
    users.map((u) => u.id)
  );

  return ids.map((id) => {
    // UNE seule lecture de la carte, pour tous les ids : présent, absent,
    // inscrit ou anonyme. `presenceFor` décide, jamais le site d'appel.
    const vis = presenceFor(viewer, carte, id);
    return {
      userId: id,
      isOnline: vis.showOnline ? (presenceRuntime.get(id) ?? false) : false,
      lastActiveAt: vis.showLastSeenTimestamp ? (derniereActivite.get(id) ?? null) : null,
    };
  });
}

/**
 * `GET /directory/presence?ids=…` — l'instantané de présence (S2).
 *
 * Sert à resynchroniser après une reconnexion, un retour d'onglet ou un
 * changement de connectivité, sans attendre le `presence:snapshot` que seule
 * l'authentification socket déclenche.
 */
export async function directoryPresenceRoutes(fastify: FastifyInstance) {
  const parAppelant = createCustomRateLimiter(
    {
      max: 120,
      windowMs: 60 * 1000,
      keyPrefix: 'dir:presence:u',
      message: 'Trop de requêtes de présence. Veuillez patienter une minute.',
      keyGenerator: callerRateKey,
    },
    fastify.redis ?? undefined
  );

  fastify.get<{ Querystring: { ids?: string } }>('/presence', {
    onRequest: [fastify.authenticate],
    preHandler: [parAppelant.middleware()],
    schema: {
      description: 'Runtime presence for a list of user or participant ids, under the visibility law.',
      tags: ['directory'],
      summary: 'Presence snapshot',
      querystring: {
        type: 'object',
        required: ['ids'],
        properties: {
          ids: { type: 'string', description: `Comma-separated ids, at most ${MAX_IDS_PAR_REQUETE}` },
        },
      },
      response: {
        200: presenceResponseSchema,
        400: errorResponseSchema,
        401: errorResponseSchema,
        429: errorResponseSchema,
        500: errorResponseSchema,
      },
      security: [{ bearerAuth: [] }],
    },
  }, async (request: FastifyRequest<{ Querystring: { ids?: string } }>, reply: FastifyReply) => {
    const decode = decoderIds(request.query.ids);
    if ('refus' in decode) return sendBadRequest(reply, decode.refus);

    try {
      return sendSuccess(reply, { users: await servirPresence(fastify, request, decode.ids) });
    } catch (error) {
      fastify.log.error({ error }, '[directory/presence] Failed to resolve presence');
      return sendInternalError(reply, 'Failed to resolve presence');
    }
  });
}
