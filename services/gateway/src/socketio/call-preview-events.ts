import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { CLIENT_EVENTS, ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { callPreviewRequestSchema } from '@meeshy/shared/types/call-preview';
import type { CallControlErrorCode } from '@meeshy/shared/types/call-controls';
import type { CallSignalEvent } from '@meeshy/shared/types/video-call';
import type { MeeshyIOServer, MeeshySocket } from './typed-socket';
import type { CallService } from '../services/CallService';
import { SOCKET_RATE_LIMITS, type SocketRateLimiter } from '../utils/socket-rate-limiter';
import { PARTICIPATION_VIVANTE } from '../routes/conversations/utils/access-control';
import { socketSignalSchema } from '../validation/call-schemas';
import { ACCEPTED, gatedCallControl, refused } from './call-control-gate';

/**
 * L'APERÇU AVANT DÉCROCHÉ (#8480) — l'appelé voit, et entend s'il le choisit,
 * l'appelant pendant que l'appel sonne.
 *
 * Deux verbes, hors de `call:signal` : là-bas un `answer` décroche l'appel, et
 * l'appelé n'est pas encore participant. Ici la passerelle ne relaie qu'entre
 * l'INITIATEUR d'un appel 1:1 qui SONNE et un MEMBRE de sa conversation qui n'a
 * pas encore décroché. « Décroché » se lit au STATUT, jamais à la présence dans
 * la salle : iOS la rejoint dès la sonnerie (l'offre doit y circuler), et le
 * décroché seul fait passer l'appel à `active`. Au décroché, à la fin ou au
 * refus, le statut quitte la sonnerie et plus rien ne passe : l'aperçu n'a
 * aucun état serveur à nettoyer.
 * Que l'appelé n'envoie rien (réception seule) est la loi de ses clients — la
 * passerelle, elle, garantit qu'il ne peut viser que l'initiateur.
 */

const RINGING: ReadonlySet<string> = new Set(['initiated', 'ringing']);

export type PreviewCall = {
  readonly status: string;
  readonly initiatorId: string;
  readonly conversationId: string;
  readonly conversationType: string;
};

export type CallPreviewEventDeps = {
  readonly io: MeeshyIOServer;
  readonly rateLimiter: Pick<SocketRateLimiter, 'checkLimit'>;
  readonly loadCall: (callId: string) => Promise<PreviewCall | null>;
  readonly isMember: (conversationId: string, userId: string) => Promise<boolean>;
};

export function callPreviewDependencies(input: {
  readonly io: MeeshyIOServer;
  readonly prisma: PrismaClient;
  readonly callService: Pick<CallService, 'getCallSession'>;
  readonly rateLimiter: Pick<SocketRateLimiter, 'checkLimit'>;
}): CallPreviewEventDeps {
  const { io, prisma, callService, rateLimiter } = input;
  return {
    io,
    rateLimiter,
    loadCall: async (callId) => {
      const session = await callService.getCallSession(callId).catch(() => null);
      if (!session) return null;
      return {
        status: session.status,
        initiatorId: session.initiatorId,
        conversationId: session.conversationId,
        conversationType: session.conversation?.type ?? 'unknown',
      };
    },
    // #20261 — la PARTICIPATION VIVANTE, et dans la CLAUSE.
    //
    // C'est le SEUL contrôle d'appartenance de `calleeRefusal`, qui gouverne
    // les DEUX verbes de l'aperçu (`CALL_PREVIEW_REQUEST`,
    // `CALL_PREVIEW_SIGNAL`) : le relais WebRTC de la caméra et du micro de
    // l'appelant AVANT tout décroché. Rien ne relit `Participant` en aval —
    // `loadCall` ne lit que `CallSession` — donc la question « qui AUTORISE ce
    // que cette clause rend ? » (#20183) se répond ici et nulle part ailleurs.
    //
    // Sous `isActive` nu, un participant `isActive: true, bannedAt ≠ null` le
    // franchissait. C'est un PIÈGE ARMÉ et non une panne vivante, et la nuance
    // est mesurée : `resolveBanWrite` écrit toujours `isActive: false` à côté
    // de `bannedAt`, donc un bannissement d'aujourd'hui ne produit pas cet
    // état — seules les lignes HÉRITÉES d'avant #19688 / #10436 le portent, et
    // aucune migration ne les a reprises. Le geste est pourtant atteignable en
    // tête-à-tête : la route de bannissement n'a AUCUNE garde par type de
    // conversation, et l'ouvreur d'un direct porte `role: 'creator'`, donc
    // au-dessus du plancher MODERATOR.
    //
    // Le resserrement ne retire rien à personne d'autre : un banni du chemin
    // nominal était déjà exclu, et un membre vivant n'a pas de `bannedAt`.
    isMember: async (conversationId, userId) =>
      (await prisma.participant.count({
        where: { conversationId, userId, ...PARTICIPATION_VIVANTE },
      })) > 0,
  };
}

/**
 * Le membre qui sonne, ou la raison pour laquelle il n'a pas droit à l'aperçu.
 * Même règle pour la demande et pour chaque signal.
 */
async function calleeRefusal(
  deps: CallPreviewEventDeps,
  call: PreviewCall,
  calleeId: string
): Promise<CallControlErrorCode | null> {
  if (!RINGING.has(call.status)) return 'CALL_NOT_ACTIVE';
  if (call.conversationType !== 'direct') return 'PERMISSION_DENIED';
  if (calleeId === call.initiatorId) return 'PERMISSION_DENIED';
  if (!(await deps.isMember(call.conversationId, calleeId))) return 'NOT_A_PARTICIPANT';
  return null;
}

export function registerCallPreviewEvents(
  deps: CallPreviewEventDeps,
  socket: MeeshySocket,
  getUserId: (socketId: string) => string | undefined
): void {
  socket.on(
    CLIENT_EVENTS.CALL_PREVIEW_REQUEST,
    gatedCallControl({
      socket,
      getUserId,
      rateLimiter: deps.rateLimiter,
      limit: SOCKET_RATE_LIMITS.CALL_PREVIEW_REQUEST,
      schema: callPreviewRequestSchema,
      label: 'call-preview-request',
      run: async (userId, { callId }) => {
        const call = await deps.loadCall(callId);
        if (!call) return refused('NOT_A_PARTICIPANT');
        const refusal = await calleeRefusal(deps, call, userId);
        if (refusal) return refused(refusal);
        deps.io.to(ROOMS.user(call.initiatorId)).emit(SERVER_EVENTS.CALL_PREVIEW_REQUESTED, { callId, userId });
        return ACCEPTED;
      },
    })
  );

  socket.on(
    CLIENT_EVENTS.CALL_PREVIEW_SIGNAL,
    gatedCallControl({
      socket,
      getUserId,
      rateLimiter: deps.rateLimiter,
      limit: SOCKET_RATE_LIMITS.CALL_PREVIEW_SIGNAL,
      schema: socketSignalSchema,
      label: 'call-preview-signal',
      run: async (userId, { callId, signal }) => {
        if (signal.from !== userId) return refused('PERMISSION_DENIED');
        const call = await deps.loadCall(callId);
        if (!call) return refused('NOT_A_PARTICIPANT');
        const fromInitiator = userId === call.initiatorId;
        if (!fromInitiator && signal.to !== call.initiatorId) return refused('PERMISSION_DENIED');
        const callee = fromInitiator ? signal.to : userId;
        const refusal = await calleeRefusal(deps, call, callee);
        if (refusal) return refused(fromInitiator && refusal === 'NOT_A_PARTICIPANT' ? 'TARGET_NOT_IN_CALL' : refusal);
        const relayed: CallSignalEvent = { callId, signal };
        deps.io.to(ROOMS.user(signal.to)).emit(SERVER_EVENTS.CALL_PREVIEW_SIGNAL, relayed);
        return ACCEPTED;
      },
    })
  );
}
