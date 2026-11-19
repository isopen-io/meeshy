/**
 * Les DOUBLES de la surface d'appel, et rien d'autre — ce fichier n'importe
 * JAMAIS le module sous test.
 *
 * #19808 — la séparation en deux helpers n'est pas cosmétique, c'est une
 * contrainte de CYCLE. `calls-routes-harness.ts` importe `routes/calls` (son
 * `setup` l'enregistre), et `routes/calls` importe `services/CallService`, dont
 * la fabrique de double vit ici. Si les deux moitiés partageaient un fichier,
 * la fabrique recevrait ce fichier À MOITIÉ CHARGÉ au premier `require` de
 * `CallService` — un cycle dont le symptôme est `callServiceModule is not a
 * function`, au chargement, sans rapport visible avec la cause.
 *
 * Les `jest.fn()` vivent ici pour que les deux fichiers de test qui les
 * interrogent voient les MÊMES instances (cache de modules), et pour qu'aucun
 * d'eux ne redéclare une moitié du double : un double PARTIEL cache un bug ou
 * empêche un correctif de se charger, et le dépôt l'a payé trois fois en trois
 * cycles (cycles 91, 93, 104).
 */
import { jest } from '@jest/globals';

export const callMocks = {
  initiateCall: jest.fn<any>(),
  getCallSession: jest.fn<any>(),
  getCallTranscript: jest.fn<any>(),
  endCall: jest.fn<any>(),
  joinCall: jest.fn<any>(),
  leaveCall: jest.fn<any>(),
  getActiveCallForConversation: jest.fn<any>(),
  listHistory: jest.fn<any>(),
  finalizeCallSummary: jest.fn<any>(),
  broadcastCallEndedIfTerminal: jest.fn<any>(),
  invalidateSignalCache: jest.fn<any>(),
  broadcastParticipantLeft: jest.fn<any>(),
};

export const mockSendSuccess = jest.fn<any>((reply: any, data: any, opts?: any) => {
  const statusCode = opts?.statusCode ?? 200;
  reply.statusCode = statusCode;
  reply._body = { success: true, data };
  return reply;
});

/**
 * Le double de `services/CallService`.
 *
 * `CallAlreadyEndedError` MIROITE la classe de production (même forme de message
 * que `parseCallHandlerError` découpe, plus l'`endReason` qu'elle porte) : depuis
 * #3581, `endCall()` la jette sur un appel déjà terminal au lieu de rendre
 * silencieusement, et la route doit la traiter comme un 200 idempotent.
 */
export function callServiceModule(): Record<string, unknown> {
  class CallAlreadyEndedError extends Error {
    readonly endReason: string;
    constructor(endReason: string) {
      super('CALL_ENDED: This call has already ended');
      this.name = 'CallAlreadyEndedError';
      this.endReason = endReason;
    }
  }
  return {
    CallService: jest.fn<any>().mockImplementation(() => ({
      initiateCall: (...args: any[]) => callMocks.initiateCall(...args),
      getCallSession: (...args: any[]) => callMocks.getCallSession(...args),
      getCallTranscript: (...args: any[]) => callMocks.getCallTranscript(...args),
      endCall: (...args: any[]) => callMocks.endCall(...args),
      joinCall: (...args: any[]) => callMocks.joinCall(...args),
      leaveCall: (...args: any[]) => callMocks.leaveCall(...args),
      getActiveCallForConversation: (...args: any[]) => callMocks.getActiveCallForConversation(...args),
      listHistory: (...args: any[]) => callMocks.listHistory(...args),
      finalizeCallSummary: (...args: any[]) => callMocks.finalizeCallSummary(...args),
      broadcastCallEndedIfTerminal: (...args: any[]) => callMocks.broadcastCallEndedIfTerminal(...args),
      invalidateSignalCache: (...args: any[]) => callMocks.invalidateSignalCache(...args),
      broadcastParticipantLeft: (...args: any[]) => callMocks.broadcastParticipantLeft(...args),
    })),
    CallAlreadyEndedError,
  };
}

export const authMiddlewareModule = () => ({
  createUnifiedAuthMiddleware: jest.fn<any>().mockReturnValue(jest.fn<any>()),
});

export const validationMiddlewareModule = () => ({
  createValidationMiddleware: jest.fn<any>().mockReturnValue(jest.fn<any>()),
});

export const rateLimitModule = () => ({
  ROUTE_RATE_LIMITS: { initiateCall: {}, joinCall: {}, callOperations: {}, activeCallProbe: {} },
});

export const loggerModule = () => ({
  logger: { info: jest.fn<any>(), warn: jest.fn<any>(), error: jest.fn<any>(), debug: jest.fn<any>() },
});

/**
 * `sendSuccess` est le SEUL membre doublé : le reste du module passe par
 * `requireActual`, parce qu'un double partiel de `utils/response` désarmerait
 * la forme d'enveloppe que ces routes servent.
 */
export const responseModule = (actual: Record<string, unknown>) => ({
  ...actual,
  sendSuccess: (...args: any[]) => mockSendSuccess(...args),
});

export const apiSchemasModule = () => ({
  callSessionSchema: { type: 'object' },
  callSessionMinimalSchema: { type: 'object' },
  startCallRequestSchema: { type: 'object' },
  errorResponseSchema: { type: 'object' },
});
