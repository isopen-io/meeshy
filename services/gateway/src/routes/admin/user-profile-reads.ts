/**
 * Deux lectures de la fiche utilisateur de l'espace d'administration web
 * (#7873, #7845), sous le seuil des autres sous-ressources de la fiche
 * (`requireUserViewAccess` ⇒ `canViewUsers`, comme `/media` et
 * `/conversations`) :
 *
 * - `GET /admin/users/:userId/communities` — les communautés dont la cible
 *   est ou a été membre, avec SON appartenance (rôle, dates, actif) ;
 * - `GET /admin/users/:userId/voice-profile` — les MÉTADONNÉES du profil
 *   vocal et les trois consentements vocaux. Jamais la voix elle-même : ni
 *   l'empreinte (`embedding`), ni les conditionnels de clonage
 *   (`chatterboxConditionals`), ni le média de référence
 *   (`referenceAudioUrl` / `referenceAudioId` / `embeddingPath`), ni les
 *   échantillons d'entraînement, ni la signature d'identification. Ces champs
 *   permettent de CLONER ou de RECONNAÎTRE une voix ; une fiche d'admin n'a
 *   besoin que de savoir qu'un profil existe, sa taille et sa qualité. La
 *   projection est explicite À LA REQUÊTE et À LA SORTIE : un `select` qui les
 *   rajouterait un jour ne les ferait pas sortir pour autant.
 */
import type { FastifyInstance } from 'fastify';
import { UserAuditAction } from '@meeshy/shared/types';
import type { UserAuditService } from '../../services/admin/user-audit.service';
import { requireUserViewAccess } from '../../middleware/admin-user-auth.middleware';
import { UnifiedAuthContext, UnifiedAuthRequest } from '../../middleware/auth';
import { validatePagination } from '../../utils/pagination';
import { sendNotFound, sendInternalError, sendSuccess, sendPaginatedSuccess } from '../../utils/response';
import { logError } from '../../utils/logger.js';

type Deps = {
  userAuditService: UserAuditService;
};

const COMMUNITY_MEMBERSHIP_SELECT = {
  id: true,
  role: true,
  joinedAt: true,
  isActive: true,
  leftAt: true,
  community: {
    select: {
      id: true,
      identifier: true,
      name: true,
      avatar: true,
      isPrivate: true,
      isActive: true,
      createdAt: true,
      createdBy: true,
      _count: { select: { members: { where: { isActive: true } } } }
    }
  }
} as const;

type CommunityMembershipRow = {
  id: string;
  role: string;
  joinedAt: Date;
  isActive: boolean;
  leftAt: Date | null;
  community: {
    id: string;
    identifier: string;
    name: string;
    avatar: string | null;
    isPrivate: boolean;
    isActive: boolean;
    createdAt: Date;
    createdBy: string;
    _count: { members: number };
  };
};

const toCommunityItem = (row: CommunityMembershipRow, userId: string) => {
  const { createdBy, _count, ...community } = row.community;
  return {
    ...community,
    memberCount: _count.members,
    isCreator: createdBy === userId,
    membership: {
      id: row.id,
      role: row.role,
      joinedAt: row.joinedAt,
      isActive: row.isActive,
      leftAt: row.leftAt
    }
  };
};

const VOICE_PROFILE_SELECT = {
  profileId: true,
  audioCount: true,
  totalDurationMs: true,
  embeddingModel: true,
  embeddingDimension: true,
  qualityScore: true,
  version: true,
  voiceAnalysisAt: true,
  voiceAnalysisModel: true,
  nextRecalibrationAt: true,
  voicePublicAt: true,
  createdAt: true,
  updatedAt: true
} as const;

type VoiceProfileRow = {
  profileId: string | null;
  audioCount: number;
  totalDurationMs: number;
  embeddingModel: string;
  embeddingDimension: number;
  qualityScore: number;
  version: number;
  voiceAnalysisAt: Date | null;
  voiceAnalysisModel: string | null;
  nextRecalibrationAt: Date | null;
  voicePublicAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const toVoiceProfile = (row: VoiceProfileRow) => ({
  profileId: row.profileId,
  audioCount: row.audioCount,
  totalDurationMs: row.totalDurationMs,
  embeddingModel: row.embeddingModel,
  embeddingDimension: row.embeddingDimension,
  qualityScore: row.qualityScore,
  version: row.version,
  voiceAnalysisAt: row.voiceAnalysisAt,
  voiceAnalysisModel: row.voiceAnalysisModel,
  nextRecalibrationAt: row.nextRecalibrationAt,
  voicePublicAt: row.voicePublicAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
});

const VOICE_CONSENT_SELECT = {
  id: true,
  voiceProfileConsentAt: true,
  voiceDataConsentAt: true,
  voiceCloningEnabledAt: true
} as const;

export function registerUserProfileReadRoutes(fastify: FastifyInstance, deps: Deps): void {
  const { userAuditService } = deps;

  /**
   * GET /admin/users/:userId/communities - Communautés de la cible, paginées,
   * triées par date d'adhésion décroissante. Requiert canViewUsers.
   */
  fastify.get<{
    Params: { userId: string };
    Querystring: { offset?: string; limit?: string };
  }>('/admin/users/:userId/communities', {
    preHandler: [fastify.authenticate, requireUserViewAccess]
  }, async (request, reply) => {
    try {
      const { userId } = request.params;
      const { offset = '0', limit } = request.query;
      const { offset: offsetNum, limit: limitNum } = validatePagination(offset, limit, { defaultLimit: 20, maxLimit: 100 });

      const userExists = await fastify.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!userExists) {
        return sendNotFound(reply, 'Utilisateur non trouvé');
      }

      const where = { userId };
      const [memberships, total] = await Promise.all([
        fastify.prisma.communityMember.findMany({
          where,
          select: COMMUNITY_MEMBERSHIP_SELECT,
          orderBy: { joinedAt: 'desc' },
          skip: offsetNum,
          take: limitNum
        }),
        fastify.prisma.communityMember.count({ where })
      ]);

      const data = (memberships as CommunityMembershipRow[]).map((row) => toCommunityItem(row, userId));

      return sendPaginatedSuccess(reply, data, {
        total,
        offset: offsetNum,
        limit: limitNum,
        hasMore: offsetNum + memberships.length < total
      });
    } catch (error) {
      logError(fastify.log, 'Error fetching user communities', error);
      return sendInternalError(reply, 'Internal server error', { message: 'Failed to fetch user communities' });
    }
  });

  /**
   * GET /admin/users/:userId/voice-profile - Métadonnées du profil vocal et
   * consentements vocaux. Requiert canViewUsers ; chaque lecture est tracée
   * (AdminAuditLog, `VIEW_USER` + `metadata.surface`).
   */
  fastify.get<{
    Params: { userId: string };
  }>('/admin/users/:userId/voice-profile', {
    preHandler: [fastify.authenticate, requireUserViewAccess]
  }, async (request, reply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext as UnifiedAuthContext;
      const { userId } = request.params;

      const user = await fastify.prisma.user.findUnique({ where: { id: userId }, select: VOICE_CONSENT_SELECT });
      if (!user) {
        return sendNotFound(reply, 'Utilisateur non trouvé');
      }

      const voiceModel = await fastify.prisma.userVoiceModel.findUnique({
        where: { userId },
        select: VOICE_PROFILE_SELECT
      });

      await userAuditService.createAuditLog({
        userId,
        adminId: authContext.registeredUser!.id,
        action: UserAuditAction.VIEW_USER,
        entityId: userId,
        metadata: { surface: 'voice-profile' },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent']
      });

      return sendSuccess(reply, {
        voiceProfile: voiceModel ? toVoiceProfile(voiceModel as VoiceProfileRow) : null,
        consents: {
          voiceProfileConsentAt: user.voiceProfileConsentAt,
          voiceDataConsentAt: user.voiceDataConsentAt,
          voiceCloningEnabledAt: user.voiceCloningEnabledAt
        }
      });
    } catch (error) {
      logError(fastify.log, 'Error fetching user voice profile', error);
      return sendInternalError(reply, 'Internal server error', { message: 'Failed to fetch user voice profile' });
    }
  });
}
