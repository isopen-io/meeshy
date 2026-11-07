import { describe, it, expect, jest } from '@jest/globals';
import { CALL_EVENTS } from '@meeshy/shared/types/video-call';
import { registerCallClientReportEvents, type CallClientReportDeps } from '../call-client-reports';

/**
 * #16665 — `call:screen-capture-detected` porte un `kind` optionnel que la
 * passerelle relaie, et chaque DÉBUT de capture s'écrit au journal de l'appel.
 */

const CALL = '64b7f0c2a1b2c3d4e5f60718';

const harness = () => {
  const handlers = new Map<string, (data: unknown) => Promise<void>>();
  const relayed: Array<{ room: string; event: string; payload: unknown }> = [];
  const screenCaptureStarted = jest.fn(async (_input: unknown) => true);
  const socket = {
    id: 'sock-1',
    rooms: new Set([`call:${CALL}`]),
    data: {},
    on: (event: string, handler: (data: unknown) => Promise<void>) => {
      handlers.set(event, handler);
    },
    emit: jest.fn(),
    to: (room: string) => ({
      emit: (event: string, payload: unknown) => {
        relayed.push({ room, event, payload });
        return true;
      },
    }),
  };
  const deps = {
    prisma: {},
    callService: {},
    rateLimiter: { checkLimit: async () => true, getRateLimitInfo: () => ({ resetIn: 0 }) },
    resolveActiveCallParticipant: async () => ({ participantId: 'p-karim', userId: 'u-karim' }),
    resolveActiveCallParticipantId: async () => 'p-karim',
    resolveEverCallParticipantId: async () => 'p-karim',
    captureJournal: { screenCaptureStarted },
  } as unknown as CallClientReportDeps;
  registerCallClientReportEvents(deps, socket as never, { getUserId: () => 'u-karim', rememberAuth: () => undefined });
  const send = (data: unknown) => handlers.get(CALL_EVENTS.SCREEN_CAPTURE_DETECTED)?.(data);
  return { send, relayed, screenCaptureStarted };
};

describe('call:screen-capture-detected — la sorte de capture voyage et se garde (#16665)', () => {
  it('relaie une capture ponctuelle avec son kind et l’écrit au journal', async () => {
    const h = harness();

    await h.send({ callId: CALL, participantId: 'spoofed', isCapturing: true, kind: 'screenshot' });

    expect(h.relayed).toEqual([
      { room: `call:${CALL}`, event: CALL_EVENTS.SCREEN_CAPTURE_ALERT, payload: { callId: CALL, participantId: 'p-karim', userId: 'u-karim', isCapturing: true, kind: 'screenshot' } },
    ]);
    expect(h.screenCaptureStarted).toHaveBeenCalledWith({ callId: CALL, participantId: 'p-karim', userId: 'u-karim', kind: 'screenshot' });
  });

  it('lit un kind absent comme un enregistrement d’écran, ce qu’envoient les clients d’avant', async () => {
    const h = harness();

    await h.send({ callId: CALL, participantId: 'p-karim', isCapturing: true });

    expect(h.relayed[0]?.payload).toEqual(expect.objectContaining({ kind: 'recording' }));
    expect(h.screenCaptureStarted).toHaveBeenCalledWith(expect.objectContaining({ kind: 'recording' }));
  });

  it('relaie la fin d’un enregistrement sans rien écrire au journal', async () => {
    const h = harness();

    await h.send({ callId: CALL, participantId: 'p-karim', isCapturing: false, kind: 'recording' });

    expect(h.relayed[0]?.payload).toEqual(expect.objectContaining({ isCapturing: false, kind: 'recording' }));
    expect(h.screenCaptureStarted).not.toHaveBeenCalled();
  });

  it('relaie quand même si l’écriture au journal échoue', async () => {
    const h = harness();
    h.screenCaptureStarted.mockRejectedValueOnce(new Error('db down'));

    await h.send({ callId: CALL, participantId: 'p-karim', isCapturing: true, kind: 'screenshot' });

    expect(h.relayed).toHaveLength(1);
  });
});
