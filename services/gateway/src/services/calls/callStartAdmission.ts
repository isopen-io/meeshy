import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { CALL_ERROR_CODES } from '@meeshy/shared/types/video-call';
import { canStartCall } from '@meeshy/shared/utils/call-permission';

/**
 * L'admission d'un appel qui DÉMARRE (#10207) — la loi `canStartCall`
 * appliquée par `CallService.initiateCall`, point de passage unique des deux
 * transports d'ouverture (`call:initiate`, `POST /calls`). Rejoindre un appel
 * en cours n'est pas gouverné ici.
 */

type CallStarterMembership = {
  readonly type: string;
  readonly role: string;
  readonly userId: string | null;
};

const PRIVILEGED_PROBE = {
  viewerIsCreator: true,
  viewerConversationRole: 'creator',
  viewerPlatformRole: 'BIGBOSS',
  viewerIsGuest: false
} as const;

/**
 * Un type que PERSONNE ne peut appeler (`global`, `broadcast`, inconnu) garde
 * son code historique, que les clients déjà publiés savent lire.
 */
export function assertCallableConversationType(conversationType: string): void {
  if (canStartCall({ conversationType, ...PRIVILEGED_PROBE })) return;
  throw new Error(
    `${CALL_ERROR_CODES.VIDEO_CALLS_NOT_SUPPORTED}: Video calls are only supported for DIRECT and GROUP conversations`
  );
}

async function platformRoleOf(prisma: PrismaClient, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  return user?.role ?? null;
}

export async function assertViewerMayStartCall(
  prisma: PrismaClient,
  params: { readonly conversationType: string; readonly membership: CallStarterMembership }
): Promise<void> {
  const { conversationType, membership } = params;
  const viewerIsGuest = membership.type === 'anonymous' || !membership.userId;
  const needsPlatformRole = !viewerIsGuest && conversationType.toLowerCase() === 'public';
  const viewerPlatformRole = needsPlatformRole ? await platformRoleOf(prisma, membership.userId) : null;

  const allowed = canStartCall({
    conversationType,
    viewerIsCreator: false,
    viewerConversationRole: membership.role,
    viewerPlatformRole,
    viewerIsGuest
  });
  if (allowed) return;
  throw new Error(`${CALL_ERROR_CODES.CALL_NOT_ALLOWED}: You are not allowed to start a call in this conversation`);
}
