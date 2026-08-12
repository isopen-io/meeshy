import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { GlobalUserRoleType } from '@meeshy/shared/types/role-types';
import { applyPresenceVisibility } from '@meeshy/shared/utils/presence-visibility';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { createUnifiedAuthMiddleware } from '../../middleware/auth';
import { getPresenceVisibilityService, type PresenceViewer } from '../../services/PresenceVisibilityService';

type ProfilePresenceAuthContext =
  | {
      type?: string;
      userId?: string;
      registeredUser?: { role?: string } | null;
    }
  | undefined;

/**
 * Construit le viewer de présence à partir de l'authContext.
 * Seul un utilisateur enregistré (avec rôle) compte ; anonyme/non-auth → null
 * (présence masquée sur les canaux à critère strict).
 */
export function viewerFromAuthContext(authContext: ProfilePresenceAuthContext): PresenceViewer {
  const role = authContext?.registeredUser?.role;
  if (authContext?.type === 'user' && authContext.userId && role) {
    return { userId: authContext.userId, role: role as GlobalUserRoleType };
  }
  return null;
}

/**
 * Applique le gate de présence (critère STRICT : self/modo/ami/affilié) sur un
 * objet profil, en masquant isOnline/lastActiveAt selon la visibilité résolue.
 */
export async function gateProfilePresence<
  T extends { id: string; isOnline: boolean | null; lastActiveAt: Date | null; deactivatedAt?: Date | null },
>(fastify: FastifyInstance, request: FastifyRequest, profile: T) {
  const authContext = (request as FastifyRequest & { authContext?: ProfilePresenceAuthContext }).authContext;
  const visibility = await getPresenceVisibilityService(fastify.prisma).resolveForTarget(
    viewerFromAuthContext(authContext),
    { id: profile.id, deactivatedAt: profile.deactivatedAt ?? null },
  );
  return applyPresenceVisibility(profile, visibility);
}

let optionalAuthMiddleware: ReturnType<typeof createUnifiedAuthMiddleware> | null = null;

/**
 * Middleware d'auth optionnelle (attache authContext même pour anonyme/non-auth,
 * sans rejeter) — nécessaire pour identifier le viewer sur les routes profil publiques.
 */
export function getOptionalAuth(prisma: PrismaClient): ReturnType<typeof createUnifiedAuthMiddleware> {
  if (!optionalAuthMiddleware) {
    optionalAuthMiddleware = createUnifiedAuthMiddleware(prisma, { requireAuth: false, allowAnonymous: true });
  }
  return optionalAuthMiddleware;
}
