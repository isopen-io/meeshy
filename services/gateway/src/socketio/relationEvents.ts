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
  type RelationRitualProgressEventData,
  type RelationRitualStartedEventData,
} from '@meeshy/shared/types/socketio-events';
import type { RelationLevel } from '@meeshy/shared/types/relation';
import type { ServerEmitIO } from './serverEmit';

/** La porte d'émission du contrat (`serverEmit.ts`) : le couple (événement, charge) est celui des types partagés. */
export type RelationIo = ServerEmitIO;

export type RelationFastify = {
  readonly socketIOHandler?: { getManager?: () => { getIO?: () => RelationIo | undefined } | undefined } | null;
};

export const relationIoOf = (fastify: RelationFastify): RelationIo | undefined =>
  fastify.socketIOHandler?.getManager?.()?.getIO?.();

/** Un événement temps réel ne fait jamais échouer le geste qu'il annonce. */
const safely = (send: () => void): void => {
  try {
    send();
  } catch {
    /* le geste est déjà committé */
  }
};

/** Aux DEUX : chacun reçoit l'identifiant de l'autre. */
export function emitRelationLevelRaised(io: RelationIo | undefined, params: { userA: string; userB: string; level: RelationLevel; at: Date }): void {
  const at = params.at.toISOString();
  safely(() => io?.to(ROOMS.user(params.userA)).emit(SERVER_EVENTS.RELATION_LEVEL_RAISED, { userId: params.userB, level: params.level, at }));
  safely(() => io?.to(ROOMS.user(params.userB)).emit(SERVER_EVENTS.RELATION_LEVEL_RAISED, { userId: params.userA, level: params.level, at }));
}

export function emitRitualStarted(io: RelationIo | undefined, params: { toUserId: string; fromUserId: string } & Omit<RelationRitualStartedEventData, 'userId'>): void {
  const { toUserId, fromUserId, ...rest } = params;
  safely(() => io?.to(ROOMS.user(toUserId)).emit(SERVER_EVENTS.RELATION_RITUAL_STARTED, { ...rest, userId: fromUserId }));
}

export function emitRitualProgress(io: RelationIo | undefined, params: { toUserId: string; fromUserId: string } & Omit<RelationRitualProgressEventData, 'userId'>): void {
  const { toUserId, fromUserId, ...rest } = params;
  safely(() => io?.to(ROOMS.user(toUserId)).emit(SERVER_EVENTS.RELATION_RITUAL_PROGRESS, { ...rest, userId: fromUserId }));
}

export function emitRitualCompleted(io: RelationIo | undefined, params: { userA: string; userB: string; token: string; level: RelationLevel; at: Date }): void {
  const at = params.at.toISOString();
  safely(() => io?.to(ROOMS.user(params.userA)).emit(SERVER_EVENTS.RELATION_RITUAL_COMPLETED, { token: params.token, userId: params.userB, level: params.level, at }));
  safely(() => io?.to(ROOMS.user(params.userB)).emit(SERVER_EVENTS.RELATION_RITUAL_COMPLETED, { token: params.token, userId: params.userA, level: params.level, at }));
}
