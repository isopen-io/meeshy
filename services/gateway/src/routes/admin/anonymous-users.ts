import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logError } from '../../utils/logger';
import { sendSuccess, sendInternalError, sendBadRequest, sendNotFound } from '../../utils/response.js';
import { OBJECT_ID_REGEX } from '@meeshy/shared/utils/object-id';
import { type AnonymousUserListQuery } from './types';
import { validatePagination } from '../../utils/pagination';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { validateQuery } from '../../validation/helpers.js';
import { AnonymousUsersQuerySchema } from '../../validation/admin-schemas.js';
import { permissionsService } from '../../services/admin/permissions.service';
import type { UserRoleEnum } from '@meeshy/shared/types';
import { requirePermission } from '../../middleware/authorize';

// `requireAdmin` était une garde LOCALE : elle rejouait une liste de rôles en dur
// (#4153). Elle nomme désormais la permission qu'elle exige, et la matrice
// décide — un seul endroit où lire la loi, un seul où la changer.
const requireAdmin = requirePermission('canViewUsers');

// #4157 — `sessionTokenHash` et `anonymousSession` n'y figurent PAS (voir le
// commentaire de la liste) ; `joinCountry` non plus : la fiche n'en a pas
// l'usage, et une donnée dérivée de l'IP ne sort pas sans raison écrite.
const ANONYMOUS_PARTICIPANT_SELECT = {
  id: true,
  displayName: true,
  avatar: true,
  language: true,
  isActive: true,
  isOnline: true,
  lastActiveAt: true,
  joinedAt: true,
  leftAt: true,
  permissions: true,
  conversationId: true,
  conversation: {
    select: {
      id: true,
      identifier: true,
      title: true
    }
  },
  _count: {
    select: {
      sentMessages: true
    }
  }
} as const;

// #4157 c.3 / #4692 — le lien d'ARRIVÉE sans aucune de ses clés de jointure
// (`linkId`, `identifier` : l'une comme l'autre OUVRE la porte) ni ses règles
// d'admission réseau. `id` est opaque depuis #4692 (retiré de la loi).
const ARRIVAL_SHARE_LINK_SELECT = {
  id: true,
  name: true,
  isActive: true,
  expiresAt: true,
  createdAt: true
} as const;

type AnonymousSortKey = 'joinedAt' | 'lastActiveAt' | 'displayName';

const ANONYMOUS_SORT_KEYS: ReadonlySet<string> = new Set<AnonymousSortKey>(['joinedAt', 'lastActiveAt', 'displayName']);

/**
 * #7873 — liste BLANCHE rejouée au handler (le schéma Zod la porte aussi,
 * mais une chaîne brute ne doit jamais atteindre `orderBy`). Sans
 * `canViewPresence`, trier par `lastActiveAt` révélerait la présence par la
 * POSITION : le tri retombe sur `joinedAt`, en silence.
 */
function anonymousOrderBy(sortBy: unknown, sortOrder: unknown, canSeePresence: boolean) {
  const requested = typeof sortBy === 'string' && ANONYMOUS_SORT_KEYS.has(sortBy) ? sortBy as AnonymousSortKey : 'joinedAt';
  const key: AnonymousSortKey = requested === 'lastActiveAt' && !canSeePresence ? 'joinedAt' : requested;
  return { [key]: sortOrder === 'asc' ? 'asc' : 'desc' } as Record<AnonymousSortKey, 'asc' | 'desc'>;
}

type PresenceFields = { isOnline: boolean; lastActiveAt: Date | null };

const maskPresence = <T extends PresenceFields>(participant: T, canSeePresence: boolean): T =>
  canSeePresence ? participant : { ...participant, isOnline: false, lastActiveAt: null };

export async function anonymousUsersAdminRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/v1/admin/anonymous-users
   * Liste des participants anonymes avec pagination et filtres
   */
  fastify.get('/anonymous-users', {
    onRequest: [fastify.authenticate, requireAdmin],
    preHandler: [validateQuery(AnonymousUsersQuerySchema)]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Directive produit 2026-08-25 : `requireAdmin` laisse passer
      // MODERATOR/AUDIT, qui n'ont plus le droit de voir la présence — seuil
      // `canViewPresence` (ADMIN/BIGBOSS uniquement).
      const viewerRole = (request as UnifiedAuthRequest).authContext!.registeredUser!.role as UserRoleEnum;
      const canSeePresence = permissionsService.canViewPresence(viewerRole);

      /* istanbul ignore next -- Zod AnonymousUsersQuerySchema always provides offset and limit with defaults */
      const { offset = '0', limit = '20', search, status, sortBy, sortOrder, language } = request.query as AnonymousUserListQuery;
      const { offset: offsetNum, limit: limitNum } = validatePagination(offset, limit);

      const where: any = { type: 'anonymous' };

      if (search) {
        where.OR = [
          { displayName: { contains: search, mode: 'insensitive' } }
        ];
      }

      if (status === 'active') {
        where.isActive = true;
      } else if (status === 'inactive') {
        where.isActive = false;
      }

      if (typeof language === 'string' && language.length > 0) {
        where.language = language;
      }

      const [anonymousUsers, totalCount] = await Promise.all([
        fastify.prisma.participant.findMany({
          where,
          // #4157 — deux secrets voyageaient ici SANS AUCUN gate, servis à
          // MODERATOR/AUDIT (`canViewUsers`, aucun des deux n'a
          // `canViewSensitiveData`) et jamais consommés par le web (vérifié :
          // aucune lecture de `anonymousSession`/`sessionTokenHash` dans
          // apps/web/app/admin/anonymous-users) :
          //   - `sessionTokenHash` EST le hash comparé par
          //     `middleware/auth.ts` (`createAnonymousUserContext`) pour
          //     authentifier CETTE session anonyme — un champ d'IDENTIFIANT,
          //     pas une donnée d'affichage ;
          //   - `anonymousSession` (embarqué, sans `select`) porte une
          //     SECONDE copie de ce hash (`session.sessionTokenHash`), l'IP,
          //     l'empreinte d'appareil, ET le profil PII complet
          //     (`profile.email`, `profile.birthday`) d'un participant
          //     anonyme — exactement ce que `canViewSensitiveData = false`
          //     masque partout ailleurs pour ces deux rôles.
          // Ni l'un ni l'autre n'a d'usage produit : on ne les sert plus.
          select: ANONYMOUS_PARTICIPANT_SELECT,
          orderBy: anonymousOrderBy(sortBy, sortOrder, canSeePresence),
          skip: offsetNum,
          take: limitNum
        }),
        fastify.prisma.participant.count({ where })
      ]);

      const data = anonymousUsers.map((p) => maskPresence(p, canSeePresence));

      return sendSuccess(reply, {
          anonymousUsers: data,
          pagination: {
            total: totalCount,
            limit: limitNum,
            offset: offsetNum,
            hasMore: offsetNum + anonymousUsers.length < totalCount
          }
        });
    } catch (error) {
      logError(fastify.log, 'Get admin anonymous users error:', error);
      return sendInternalError(reply, 'Erreur lors de la recuperation des utilisateurs anonymes');
    }
  });

  /**
   * GET /api/v1/admin/anonymous-users/:participantId
   * Fiche d'un participant anonyme (#7873) : la projection de la liste, plus
   * le type de sa conversation et le lien par lequel il est arrivé. Même
   * garde, même masque de présence que la liste.
   */
  fastify.get<{ Params: { participantId: string } }>('/anonymous-users/:participantId', {
    onRequest: [fastify.authenticate, requireAdmin]
  }, async (request, reply) => {
    try {
      const { participantId } = request.params;
      if (!OBJECT_ID_REGEX.test(participantId)) {
        return sendBadRequest(reply, 'Identifiant de participant invalide');
      }

      const viewerRole = (request as UnifiedAuthRequest).authContext!.registeredUser!.role as UserRoleEnum;
      const canSeePresence = permissionsService.canViewPresence(viewerRole);

      const participant = await fastify.prisma.participant.findFirst({
        where: { id: participantId, type: 'anonymous' },
        select: {
          ...ANONYMOUS_PARTICIPANT_SELECT,
          shareLinkId: true,
          conversation: {
            select: { ...ANONYMOUS_PARTICIPANT_SELECT.conversation.select, type: true }
          }
        }
      });
      if (!participant) {
        return sendNotFound(reply, 'Participant anonyme non trouvé');
      }

      const { shareLinkId, ...rest } = participant;
      const shareLink = shareLinkId
        ? await fastify.prisma.conversationShareLink.findUnique({
            where: { id: shareLinkId },
            select: ARRIVAL_SHARE_LINK_SELECT
          })
        : null;

      return sendSuccess(reply, { ...maskPresence(rest, canSeePresence), shareLink: shareLink ?? null });
    } catch (error) {
      logError(fastify.log, 'Get admin anonymous user error:', error);
      return sendInternalError(reply, 'Erreur lors de la recuperation du participant anonyme');
    }
  });
}
