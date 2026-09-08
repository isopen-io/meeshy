import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { UserAuditAction } from '@meeshy/shared/types';
import type { BanService } from '../../services/admin/ban.service';
import { estEnVigueur } from '../../services/admin/ban.service';
import type { UserAuditService } from '../../services/admin/user-audit.service';
import type { UserManagementService } from '../../services/admin/user-management.service';
import { requireHierarchy } from '../../middleware/authorize';
import { requireUserModifyAccess, requireUserViewAccess } from '../../middleware/admin-user-auth.middleware';
import { UnifiedAuthContext, UnifiedAuthRequest, authUserCacheKey } from '../../middleware/auth';
import { getCacheStore } from '../../services/CacheStore';
import { sendSuccess, sendNotFound, sendBadRequest, sendInternalError } from '../../utils/response';
import { logError } from '../../utils/logger.js';

type Deps = {
  banService: BanService;
  userManagementService: UserManagementService;
  userAuditService: UserAuditService;
};

const creerBanSchema = z.object({
  reason: z.string().trim().min(3, 'Le motif doit compter au moins 3 caractères'),
  // `null` = permanent. Une échéance passée serait un ban déjà expiré à la
  // création — refusée, ce n'est jamais l'intention d'un admin.
  expiresAt: z
    .union([z.string().datetime(), z.null()])
    .optional()
    .refine((v) => v === undefined || v === null || new Date(v).getTime() > Date.now(), {
      message: "L'échéance doit être dans le futur",
    }),
});

const leverBanSchema = z.object({
  reason: z.string().trim().min(1).optional(),
});

function acteurDe(request: FastifyRequest): { id: string } {
  const ctx = (request as UnifiedAuthRequest).authContext as UnifiedAuthContext;
  return { id: ctx.registeredUser!.id };
}

async function oublierLeCache(userId: string): Promise<void> {
  try {
    await getCacheStore().del(authUserCacheKey(userId));
  } catch {
    /* best-effort : le rôle servi par le cache expire de lui-même */
  }
}

function rendreErreur(fastify: FastifyInstance, reply: FastifyReply, error: unknown, message: string): void {
  if (error instanceof z.ZodError) {
    sendBadRequest(reply, error.issues[0]?.message ?? 'Invalid input data');
    return;
  }
  logError(fastify.log, message, error);
  sendInternalError(reply, 'Internal server error', { message });
}

/**
 * Bannissement durable d'un utilisateur (#3719) : `Ban` porte le motif et la
 * durée que `User.isActive` seul ne pouvait pas exprimer, et sert de journal
 * IMMUABLE — un lever ne supprime ni ne réécrit la ligne d'origine.
 *
 * Mêmes gardes que la suspension existante (`PATCH /admin/users/:userId`
 * avec `isActive`) : `canUpdateUsers` (ADMIN+) et la hiérarchie de rang sur la
 * cible — bannir n'est pas un geste que MODERATOR obtient d'un coup, pour ne
 * pas ouvrir une seconde porte vers le même effet que la suspension.
 */
export function registerUserBanRoutes(fastify: FastifyInstance, deps: Deps): void {
  const { banService, userManagementService, userAuditService } = deps;
  const gardesEcriture = [fastify.authenticate, requireUserModifyAccess, requireHierarchy({ param: 'userId' })];

  fastify.post<{ Params: { userId: string }; Body: unknown }>(
    '/admin/users/:userId/ban',
    { preHandler: gardesEcriture },
    async (request, reply) => {
      try {
        const { userId } = request.params;
        const cible = await userManagementService.getUserById(userId);
        if (!cible) {
          sendNotFound(reply, 'User not found', { message: 'The requested user does not exist' });
          return;
        }

        const corps = creerBanSchema.parse(request.body);
        const moi = acteurDe(request);

        const ban = await banService.createBan({
          userId,
          bannedById: moi.id,
          reason: corps.reason,
          expiresAt: corps.expiresAt ? new Date(corps.expiresAt) : null,
        });
        await oublierLeCache(userId);

        await userAuditService.createAuditLog({
          userId,
          adminId: moi.id,
          action: UserAuditAction.BAN_USER,
          entityId: ban.id,
          changes: { isActive: { before: cible.isActive, after: false } },
          metadata: { reason: corps.reason, expiresAt: corps.expiresAt ?? null, banId: ban.id },
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
        });

        sendSuccess(reply, ban, { message: 'User banned successfully' });
      } catch (error) {
        rendreErreur(fastify, reply, error, 'Failed to ban user');
      }
    }
  );

  fastify.post<{ Params: { userId: string; banId: string }; Body: unknown }>(
    '/admin/users/:userId/bans/:banId/lift',
    { preHandler: gardesEcriture },
    async (request, reply) => {
      try {
        const { userId, banId } = request.params;
        const cible = await userManagementService.getUserById(userId);
        if (!cible) {
          sendNotFound(reply, 'User not found', { message: 'The requested user does not exist' });
          return;
        }

        const bansExistants = await banService.listBans(userId);
        const ban = bansExistants.find((b) => b.id === banId);
        if (!ban) {
          sendNotFound(reply, 'Ban not found', { message: 'The requested ban does not exist for this user' });
          return;
        }
        if (ban.liftedAt !== null) {
          sendBadRequest(reply, 'Ban already lifted');
          return;
        }

        const corps = leverBanSchema.parse(request.body ?? {});
        const moi = acteurDe(request);

        const leve = await banService.liftBan({ banId, liftedById: moi.id, liftReason: corps.reason });
        await oublierLeCache(userId);

        await userAuditService.createAuditLog({
          userId,
          adminId: moi.id,
          action: UserAuditAction.UNBAN_USER,
          entityId: banId,
          changes: {},
          metadata: { reason: corps.reason ?? null, banId },
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
        });

        sendSuccess(reply, leve, { message: 'Ban lifted successfully' });
      } catch (error) {
        rendreErreur(fastify, reply, error, 'Failed to lift ban');
      }
    }
  );

  fastify.get<{ Params: { userId: string } }>(
    '/admin/users/:userId/bans',
    { preHandler: [fastify.authenticate, requireUserViewAccess] },
    async (request, reply) => {
      try {
        const { userId } = request.params;
        const cible = await userManagementService.getUserById(userId);
        if (!cible) {
          sendNotFound(reply, 'User not found', { message: 'The requested user does not exist' });
          return;
        }

        const bans = await banService.listBans(userId);
        sendSuccess(reply, bans.map((b) => ({ ...b, active: estEnVigueur(b) })));
      } catch (error) {
        rendreErreur(fastify, reply, error, 'Failed to list bans');
      }
    }
  );
}
