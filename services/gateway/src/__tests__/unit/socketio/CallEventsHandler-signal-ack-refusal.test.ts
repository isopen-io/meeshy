/**
 * `call:signal` — un refus ACQUITTE, il ne laisse pas l'appelant expirer.
 *
 * Six des sorties de ce handler n'émettaient que `call:error` et rendaient la
 * main sans appeler le rappel qu'elles déclarent. Côté iOS,
 * `SocketAck.parse` rend `.timedOut` quand rien n'arrive et `.refused(…)`
 * quand un `{ success: false }` arrive — et `CallSdpSignaler.emitOfferWithRetry`
 * / `emitAnswerRetry` REJOUENT en backoff exponentiel sur le premier. Un refus
 * DÉFINITIF (`NOT_A_PARTICIPANT`, `SIGNAL_SENDER_MISMATCH`, `INVALID_SIGNAL`)
 * était donc rejoué à l'identique, 3 s d'attente par tentative, en consommant
 * le budget de débit — dont le refus, lui, acquittait, si bien que la boucle
 * abandonnait sur une raison fausse. Sur l'ANSWER, la fenêtre de
 * `CXAnswerCallAction.fulfill()` était tenue 3 s pour un refus que la
 * passerelle connaissait immédiatement (#18632).
 *
 * Ces témoins assertent sur le COUPLE : le refus part sur le canal de
 * diagnostic ET dans l'acquittement, sous le MÊME code. Un seul des deux ne
 * suffit pas — c'est leur séparation qui a produit le défaut.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.mock('../../../services/CallService', () => ({
  ...(jest.requireActual('../../../services/CallService') as object),
  CallService: jest.fn(),
}));

jest.mock('../../../services/notifications/NotificationService', () => ({
  NotificationService: jest.fn(),
}));

jest.mock('../../../services/PushNotificationService', () => ({
  PushNotificationService: jest.fn(),
}));

jest.mock('../../../middleware/validation', () => ({
  validateSocketEvent: jest.fn(),
  isValidationFailure: jest.fn((r: any) => !r.success),
}));

const mockCheckSocketRateLimit = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);
/**
 * `requireActual` + surcharge CIBLÉE, jamais une liste écrite à la main.
 *
 * La première version de ce harnais énumérait quatre membres de ce module et
 * omettait `callSignalBudgetId`, que le handler appelle juste avant sa garde de
 * débit : les trois témoins qui franchissent cette ligne levaient un
 * `TypeError`, et le témoin du `catch` PASSAIT — pour la mauvaise raison, par
 * une levée du double plutôt que celle qu'il provoque. C'est le quatrième
 * exemplaire du « double partiel » du dépôt (cycles 86, 91, 93, 104), et la
 * leçon y est écrite : prolonger, ne pas remplacer.
 */
jest.mock('../../../utils/socket-rate-limiter', () => ({
  ...(jest.requireActual('../../../utils/socket-rate-limiter') as object),
  getSocketRateLimiter: jest.fn().mockReturnValue({ checkLimit: jest.fn(), destroy: jest.fn() }),
  checkSocketRateLimit: mockCheckSocketRateLimit,
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { CallEventsHandler } from '../../../socketio/CallEventsHandler';
import { CALL_EVENTS, CALL_ERROR_CODES } from '@meeshy/shared/types/video-call';
import { validateSocketEvent } from '../../../middleware/validation';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const CALL_ID = '507f1f77bcf86cd799439011';
const USER_ID = 'user-signal-ack-abc';

type Ack = { success: boolean; error?: { code: string; message: string } };

function makeHarness(getUserId: (socketId: string) => string | undefined = () => USER_ID) {
  const handlers: Record<string, (...args: any[]) => any> = {};
  const emit = jest.fn<any>();
  const socket = {
    id: 'socket-signal-ack',
    on: jest.fn((event: string, fn: (...args: any[]) => any) => {
      handlers[event] = fn;
    }),
    emit,
    to: jest.fn().mockReturnValue({ emit: jest.fn() }),
    rooms: new Set<string>(),
    data: {},
  };
  const io = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) };

  const handler = new CallEventsHandler({} as unknown as PrismaClient, {} as any);
  handler.setupCallEvents(socket as any, io as any, getUserId as any);

  const acks: Ack[] = [];
  const ack = (response: Ack): void => {
    acks.push(response);
  };

  return { handlers, emit, acks, ack };
}

const validSignal = {
  callId: CALL_ID,
  signal: { type: 'offer', sdp: 'v=0', from: USER_ID, to: 'peer-1' },
};

describe('call:signal — le refus atteint l’appelant qui attend', () => {
  beforeEach(() => {
    mockCheckSocketRateLimit.mockResolvedValue(true);
    (validateSocketEvent as jest.MockedFunction<any>).mockImplementation((_s: unknown, d: unknown) => ({
      success: true,
      data: d,
    }));
  });

  it('une socket non authentifiée reçoit un refus NOT_AUTHENTICATED, pas un silence', async () => {
    const { handlers, emit, acks, ack } = makeHarness(() => undefined);

    await handlers[CALL_EVENTS.SIGNAL](validSignal, ack);

    expect(acks).toEqual([
      { success: false, error: { code: 'NOT_AUTHENTICATED', message: 'User not authenticated' } },
    ]);
    expect(emit).toHaveBeenCalledWith(
      CALL_EVENTS.ERROR,
      expect.objectContaining({ code: 'NOT_AUTHENTICATED', callId: CALL_ID })
    );
  });

  it('une charge malformée reçoit un refus INVALID_SIGNAL portant le message de validation', async () => {
    (validateSocketEvent as jest.MockedFunction<any>).mockReturnValue({
      success: false,
      error: 'Validation failed: signal.sdp too large',
    });
    const { handlers, emit, acks, ack } = makeHarness();

    await handlers[CALL_EVENTS.SIGNAL](validSignal, ack);

    expect(acks).toEqual([
      {
        success: false,
        error: {
          code: CALL_ERROR_CODES.INVALID_SIGNAL,
          message: 'Validation failed: signal.sdp too large',
        },
      },
    ]);
    expect(emit).toHaveBeenCalledWith(
      CALL_EVENTS.ERROR,
      expect.objectContaining({ code: CALL_ERROR_CODES.INVALID_SIGNAL })
    );
  });

  it('un dépassement de débit reçoit un refus RATE_LIMIT_EXCEEDED', async () => {
    mockCheckSocketRateLimit.mockResolvedValue(false);
    const { handlers, acks, ack } = makeHarness();

    await handlers[CALL_EVENTS.SIGNAL](validSignal, ack);

    expect(acks).toEqual([
      {
        success: false,
        error: { code: CALL_ERROR_CODES.RATE_LIMIT_EXCEEDED, message: 'Rate limit exceeded' },
      },
    ]);
  });

  /**
   * Le `catch` est la sortie qu'on n'a pas écrite : elle est atteinte par tout
   * ce que le corps peut lever, et l'appelant qui attend n'a aucun autre
   * signal. Le harnais la provoque en faisant lever la lecture de session.
   */
  it('une levée en cours de relais reçoit un refus SIGNAL_FAILED', async () => {
    const { handlers, emit, acks, ack } = makeHarness();
    (validateSocketEvent as jest.MockedFunction<any>).mockImplementation(() => {
      throw new Error('session read exploded');
    });

    await handlers[CALL_EVENTS.SIGNAL](validSignal, ack);

    expect(acks).toEqual([
      { success: false, error: { code: 'SIGNAL_FAILED', message: 'Failed to forward WebRTC signal' } },
    ]);
    expect(emit).toHaveBeenCalledWith(
      CALL_EVENTS.ERROR,
      expect.objectContaining({ code: 'SIGNAL_FAILED' })
    );
  });

  /**
   * L'ack est OPTIONNEL par conception (le web et Android n'en envoient pas) :
   * un refus sans rappel ne doit pas faire tomber le handler.
   */
  it('un émetteur sans rappel est refusé sans que le handler lève', async () => {
    const { handlers, emit } = makeHarness(() => undefined);

    await expect(handlers[CALL_EVENTS.SIGNAL](validSignal)).resolves.toBeUndefined();
    expect(emit).toHaveBeenCalledWith(
      CALL_EVENTS.ERROR,
      expect.objectContaining({ code: 'NOT_AUTHENTICATED' })
    );
  });
});
