import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ROOMS, SERVER_EVENTS, type UserUpdatedEventData } from '@meeshy/shared/types/socketio-events';

import type { ServerEmitIO } from '../../socketio/serverEmit';
import { getDistinctConversationPartnerUserIds } from '../../utils/conversation-partners';

type PublicProfileChanges = UserUpdatedEventData['changes'];

/**
 * **CE QU'UN PAIR A LE DROIT D'APPRENDRE D'UN PROFIL QUI CHANGE** (#8889).
 *
 * `user:updated` part vers TOUS les co-participants d'une conversation — une
 * audience qui n'est pas celle de l'amitié. Le contrat déclare six champs
 * publics (nom, pseudo, photo, bannière) ; ce que la charge transporte À CÔTÉ
 * se décide ICI, pas au site d'appel : un appelant qui répandrait la ligne
 * `User` mise à jour (`email`, `phoneNumber`, `isOnline`, `lastActiveAt`,
 * `role`…) ne fuit pas, le surplus est retiré. Une clé ABSENTE reste absente —
 * le delta ne fabrique aucun effacement.
 */
const PUBLIC_PROFILE_FIELDS = ['displayName', 'firstName', 'lastName', 'username', 'avatar', 'banner'] as const;

export function publicProfileChanges(changes: PublicProfileChanges): PublicProfileChanges {
  return Object.fromEntries(
    PUBLIC_PROFILE_FIELDS.filter((field) => changes[field] !== undefined).map((field) => [field, changes[field]]),
  );
}

/**
 * Le changement de profil atteint la room personnelle de chaque co-participant
 * d'une conversation ACTIVE — jamais une diffusion générale, jamais une ligne
 * `Notification` (signal temps réel seul). tasks/socketio-events-cleanup.md #6.
 */
export async function emitUserUpdatedToPartners(
  deps: { readonly io: ServerEmitIO; readonly prisma: PrismaClient },
  params: { readonly userId: string; readonly changes: PublicProfileChanges },
): Promise<void> {
  const partnerIds = await getDistinctConversationPartnerUserIds(deps.prisma, params.userId);
  const payload: UserUpdatedEventData = { userId: params.userId, changes: publicProfileChanges(params.changes) };
  partnerIds.forEach((partnerId) => deps.io.to(ROOMS.user(partnerId)).emit(SERVER_EVENTS.USER_UPDATED, payload));
}
