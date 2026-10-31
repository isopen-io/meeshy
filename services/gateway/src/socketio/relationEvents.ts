/**
 * Les émissions du LIEN entre deux personnes (#13933) : un niveau monté, et les
 * temps du rituel du Sang. Une charge PAR destinataire — chacune nomme l'AUTRE.
 *
 * Aucune émission de baisse, de sortie ni de refus n'existe ici, et c'est
 * volontaire (RG-07) : le silence est une propriété du module, pas de ses
 * appelants. Même patron que `emitMentionCreated.ts` : un `io` optionnel, jamais
 * d'échec — un événement temps réel ne fait pas échouer le geste qu'il annonce.
 */
import {
  ROOMS,
  SERVER_EVENTS,
  type RelationLevelRaisedEventData,
  type RelationRitualCompletedEventData,
  type RelationRitualProgressEventData,
  type RelationRitualStartedEventData,
} from '@meeshy/shared/types/socketio-events';
import type { RelationLevel } from '@meeshy/shared/types/relation';

export type RelationIo = { to(room: string): { emit(event: string, payload: unknown): unknown } };

export type RelationFastify = {
  readonly socketIOHandler?: { getManager?: () => { getIO?: () => RelationIo | undefined } | undefined } | null;
};

export const relationIoOf = (fastify: RelationFastify): RelationIo | undefined =>
  fastify.socketIOHandler?.getManager?.()?.getIO?.();

const toUser = (io: RelationIo | undefined, userId: string, event: string, payload: unknown): void => {
  try {
    io?.to(ROOMS.user(userId)).emit(event, payload);
  } catch {
    /* un événement temps réel ne fait jamais échouer le geste qu'il annonce */
  }
};

/** Aux DEUX : chacun reçoit l'identifiant de l'autre. */
export function emitRelationLevelRaised(io: RelationIo | undefined, params: { userA: string; userB: string; level: RelationLevel; at: Date }): void {
  const at = params.at.toISOString();
  const payload = (userId: string): RelationLevelRaisedEventData => ({ userId, level: params.level, at });
  toUser(io, params.userA, SERVER_EVENTS.RELATION_LEVEL_RAISED, payload(params.userB));
  toUser(io, params.userB, SERVER_EVENTS.RELATION_LEVEL_RAISED, payload(params.userA));
}

export function emitRitualStarted(io: RelationIo | undefined, params: { toUserId: string; fromUserId: string } & Omit<RelationRitualStartedEventData, 'userId'>): void {
  const { toUserId, fromUserId, ...rest } = params;
  toUser(io, toUserId, SERVER_EVENTS.RELATION_RITUAL_STARTED, { ...rest, userId: fromUserId });
}

export function emitRitualProgress(io: RelationIo | undefined, params: { toUserId: string; fromUserId: string } & Omit<RelationRitualProgressEventData, 'userId'>): void {
  const { toUserId, fromUserId, ...rest } = params;
  toUser(io, toUserId, SERVER_EVENTS.RELATION_RITUAL_PROGRESS, { ...rest, userId: fromUserId });
}

export function emitRitualCompleted(io: RelationIo | undefined, params: { userA: string; userB: string; token: string; level: RelationLevel; at: Date }): void {
  const at = params.at.toISOString();
  const payload = (userId: string): RelationRitualCompletedEventData => ({ token: params.token, userId, level: params.level, at });
  toUser(io, params.userA, SERVER_EVENTS.RELATION_RITUAL_COMPLETED, payload(params.userB));
  toUser(io, params.userB, SERVER_EVENTS.RELATION_RITUAL_COMPLETED, payload(params.userA));
}
