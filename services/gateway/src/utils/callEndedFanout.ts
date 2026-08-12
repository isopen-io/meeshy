/**
 * Shared `call:ended` room fan-out — used by every terminal call path
 * (CallEventsHandler's call:end/call:leave/ringing-timeout handlers AND
 * CallCleanupService's GC force-end) so the termination audience always
 * matches the invitation audience.
 *
 * A still-ringing callee has joined NEITHER the call room (never answered)
 * NOR often the conversation room (conversation not open) — only their
 * per-device `user:{id}` room, the same room `call:initiated` targets.
 * Without this fan-out a callee whose caller hangs up before being answered
 * keeps ringing until their own client-side timeout fires (prod incident
 * 2026-07-03 06:14 — `call:join` arrived 25s after `call:ended` and was
 * rejected with "This call has already ended").
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ROOMS } from '@meeshy/shared/types/socketio-events';
import { logger } from './logger';

export async function resolveCallEndedRooms(
  prisma: PrismaClient,
  callId: string,
  conversationId: string | null | undefined
): Promise<string[]> {
  const rooms: string[] = [ROOMS.call(callId)];
  if (!conversationId) {
    return rooms;
  }

  rooms.push(ROOMS.conversation(conversationId));
  try {
    // `userId: { not: null }` est DÉLIBÉRÉ ici, à l'inverse de tous les autres
    // éventails par room personnelle — vérifié, pas déduit. La règle générale
    // (`participantUserRooms`, cycle 44) veut qu'un participant sans compte soit
    // adressé par son `Participant.id`. Elle ne s'applique pas à ce fan-out,
    // pour la raison que dit l'en-tête : l'audience de terminaison doit refléter
    // l'audience d'invitation, et `call:initiated` porte EXACTEMENT le même
    // filtre (`CallEventsHandler`, requête `conversationParticipants`). Un
    // participant sans compte n'est jamais sonné, donc n'a jamais de sonnerie à
    // faire taire.
    //
    // Il peut en revanche REJOINDRE l'appel — `CallService.joinCall` admet sur
    // le seul `Participant.id`, et la bulle « appel en cours » lui parvient
    // comme un message ordinaire. Ce cas est déjà couvert : dès qu'il a rejoint,
    // il est dans `ROOMS.call(callId)`, la première room de cette liste.
    const members = await prisma.participant.findMany({
      where: { conversationId, isActive: true, userId: { not: null } },
      select: { userId: true }
    });
    for (const member of members) {
      if (member.userId) rooms.push(ROOMS.user(member.userId));
    }
  } catch (error) {
    logger.error('resolveCallEndedRooms: member fanout lookup failed — falling back to call+conversation rooms', {
      callId,
      error
    });
  }
  return rooms;
}
