/**
 * CallEventsHandler — aucune parole d'un appel chiffré de bout en bout n'atteint
 * la passerelle (#13720, directives #9224, #9229).
 *
 * `call:transcription-segment` porte le TEXTE de ce qu'un participant vient de
 * dire ; la passerelle le relaie, le fait traduire et le grave pour le journal
 * d'après l'appel. Dans une conversation `e2ee`, rien de tout cela ne doit
 * arriver — ni pour un segment, ni pour l'annonce `call:transcription-active`
 * qui fait capturer le micro du pair. Un régime illisible est refusé aussi.
 *
 * Le refus part par l'ACQUITTEMENT, jamais par `call:error` : un iOS publié
 * raccroche sur un `call:error` qu'il ne connaît pas (`CallErrorDisposition`),
 * et Android le lit en `ConnectionFailed`. Un ancien client qui émet encore
 * des segments reçoit donc le refus sans perdre son appel.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { EventEmitter } from 'events';

const mockGetCallSession = jest.fn<any>();
jest.mock('../../../services/CallService', () => ({
  ...(jest.requireActual('../../../services/CallService') as object),
  CallService: jest.fn().mockImplementation(() => ({
    getCallSession: mockGetCallSession,
  })),
}));

jest.mock('../../../services/notifications/NotificationService', () => ({
  NotificationService: jest.fn(),
}));

jest.mock('../../../services/PushNotificationService', () => ({
  PushNotificationService: jest.fn(),
}));

jest.mock('../../../middleware/validation', () => ({
  validateSocketEvent: jest.fn(),
  isValidationFailure: jest.fn((r: { success: boolean }) => !r.success),
}));

const mockCheckSocketRateLimit = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);
jest.mock('../../../utils/socket-rate-limiter', () => ({
  SocketRateLimiter: jest.fn().mockImplementation(() => ({ checkLimit: jest.fn(), destroy: jest.fn() })),
  getSocketRateLimiter: jest.fn().mockReturnValue({ checkLimit: jest.fn(), destroy: jest.fn() }),
  checkSocketRateLimit: mockCheckSocketRateLimit,
  SOCKET_RATE_LIMITS: {
    CALL_TRANSCRIPTION_SEGMENT: { maxRequests: 60, windowMs: 10000, keyPrefix: 'socket:call:transcription' },
    CALL_TRANSCRIPTION_ACTIVE: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:call:transcription-active' },
  },
}));

const mockLogger = { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
jest.mock('../../../utils/logger', () => ({ logger: mockLogger }));

import { CallEventsHandler } from '../../../socketio/CallEventsHandler';
import { CALL_EVENTS, CALL_ERROR_CODES } from '@meeshy/shared/types/video-call';
import { validateSocketEvent } from '../../../middleware/validation';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { ZmqTranslationClient } from '../../../services/zmq-translation';

const CALL_ID = '507f1f77bcf86cd799439011';
const SPEAKER_ID = 'user-speaker-abc';

const FINAL_SEGMENT = {
  callId: CALL_ID,
  segment: {
    text: 'Le code du coffre est 4512',
    speakerId: SPEAKER_ID,
    startMs: 0,
    endMs: 1500,
    isFinal: true,
    confidence: 0.95,
    language: 'fr',
  },
};

type SessionRead = () => Promise<unknown>;

function sessionIn(encryptionMode: string | null): SessionRead {
  return () => Promise.resolve({ status: 'active', conversation: { encryptionMode } });
}

function setup(read: SessionRead, options: { withZmq?: boolean } = {}) {
  const findUnique = jest.fn<any>().mockImplementation(read);
  const transcriptionCreate = jest.fn<any>().mockResolvedValue({ id: 'transcription-row-1' });
  const prisma = {
    callSession: { findUnique },
    participant: { findFirst: jest.fn<any>() },
    transcription: { create: transcriptionCreate },
    translationCall: { create: jest.fn<any>().mockResolvedValue({ id: 'translation-row-1' }) },
  } as unknown as PrismaClient;

  const handlers: Record<string, (...args: any[]) => any> = {};
  const roomEmit = jest.fn<any>();
  const directEmit = jest.fn<any>();
  const socket = {
    id: 'socket-e2ee-1',
    on: jest.fn((event: string, fn: (...args: any[]) => any) => {
      handlers[event] = fn;
    }),
    emit: directEmit,
    to: jest.fn().mockReturnValue({ emit: roomEmit }),
    data: {},
  };

  const callService = {
    getCallSession: jest.fn<any>().mockResolvedValue({
      participants: [{ participantId: 'participant-1', participant: { userId: SPEAKER_ID }, leftAt: null }],
    }),
  } as unknown as import('../../../services/CallService').CallService;

  const handler = new CallEventsHandler(prisma, callService);
  const translateText = jest.fn<any>().mockResolvedValue('task-1');
  if (options.withZmq) {
    const zmq = Object.assign(new EventEmitter(), { translateText });
    handler.setZmqClient(zmq as unknown as ZmqTranslationClient);
  }
  handler.setupCallEvents(socket as any, {} as any, () => SPEAKER_ID);
  return { handlers, roomEmit, directEmit, findUnique, transcriptionCreate, translateText };
}

const refusal = expect.objectContaining({ success: false, code: CALL_ERROR_CODES.E2EE_CAPTIONS_REFUSED });

describe('CallEventsHandler — sous-titres d’un appel chiffré de bout en bout (#13720)', () => {
  beforeEach(() => {
    (validateSocketEvent as jest.MockedFunction<any>).mockReturnValue({ success: true });
    mockCheckSocketRateLimit.mockResolvedValue(true);
    mockGetCallSession.mockReset();
    mockLogger.warn.mockClear();
  });

  describe('call:transcription-segment', () => {
    it.each(['e2ee', 'E2EE'])('ne relaie, ne traduit ni ne grave rien quand la conversation est %s', async (mode) => {
      const { handlers, roomEmit, transcriptionCreate, translateText } = setup(sessionIn(mode), { withZmq: true });
      const ack = jest.fn<any>();

      await handlers[CALL_EVENTS.TRANSCRIPTION_SEGMENT](FINAL_SEGMENT, ack);

      expect(roomEmit).not.toHaveBeenCalled();
      expect(transcriptionCreate).not.toHaveBeenCalled();
      expect(translateText).not.toHaveBeenCalled();
      expect(ack).toHaveBeenCalledWith(refusal);
    });

    it('refuse un segment PARTIEL aussi (rien du texte ne repart vers la salle)', async () => {
      const { handlers, roomEmit } = setup(sessionIn('e2ee'));

      await handlers[CALL_EVENTS.TRANSCRIPTION_SEGMENT]({ ...FINAL_SEGMENT, segment: { ...FINAL_SEGMENT.segment, isFinal: false } });

      expect(roomEmit).not.toHaveBeenCalled();
    });

    it('ne coupe pas l’appel d’un ancien client : aucun call:error, et un émetteur sans acquittement ne fait rien lever', async () => {
      const { handlers, directEmit } = setup(sessionIn('e2ee'));

      await expect(handlers[CALL_EVENTS.TRANSCRIPTION_SEGMENT](FINAL_SEGMENT)).resolves.toBeUndefined();

      expect(directEmit).not.toHaveBeenCalled();
    });

    it.each<[string, SessionRead]>([
      ['la lecture du régime échoue', () => Promise.reject(new Error('mongo down'))],
      ['la conversation de l’appel est introuvable', () => Promise.resolve({ status: 'active', conversation: null })],
      ['le régime n’est pas servi', () => Promise.resolve({ status: 'active' })],
      ['le mode est inconnu', sessionIn('quantum')],
    ])('refuse fermé quand %s', async (_label, read) => {
      const { handlers, roomEmit, transcriptionCreate } = setup(read);
      const ack = jest.fn<any>();

      await handlers[CALL_EVENTS.TRANSCRIPTION_SEGMENT](FINAL_SEGMENT, ack);

      expect(roomEmit).not.toHaveBeenCalled();
      expect(transcriptionCreate).not.toHaveBeenCalled();
      expect(ack).toHaveBeenCalledWith(refusal);
    });

    it.each([null, '', 'server', 'hybrid'])('relaie et grave toujours dans une conversation que le serveur lit (mode %p)', async (mode) => {
      const { handlers, roomEmit, transcriptionCreate } = setup(sessionIn(mode));
      const ack = jest.fn<any>();

      await handlers[CALL_EVENTS.TRANSCRIPTION_SEGMENT](FINAL_SEGMENT, ack);

      expect(roomEmit).toHaveBeenCalledTimes(1);
      expect(transcriptionCreate).toHaveBeenCalledTimes(1);
      expect(ack).not.toHaveBeenCalled();
    });

    it('lit le régime de la conversation dans la MÊME requête que l’état de l’appel', async () => {
      const { handlers, findUnique } = setup(sessionIn(null));

      await handlers[CALL_EVENTS.TRANSCRIPTION_SEGMENT](FINAL_SEGMENT);

      expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: CALL_ID },
        select: expect.objectContaining({ status: true, conversation: { select: { encryptionMode: true } } }),
      }));
    });

    it('journalise le refus sans jamais le texte prononcé', async () => {
      const { handlers } = setup(sessionIn('e2ee'));

      await handlers[CALL_EVENTS.TRANSCRIPTION_SEGMENT](FINAL_SEGMENT);

      expect(mockLogger.warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ code: CALL_ERROR_CODES.E2EE_CAPTIONS_REFUSED, reason: 'e2ee' }));
      expect(JSON.stringify(mockLogger.warn.mock.calls)).not.toContain(FINAL_SEGMENT.segment.text);
    });
  });

  describe('call:transcription-active', () => {
    it('ne relaie pas l’annonce à la salle : le pair ne se met pas à capturer son micro pour la passerelle', async () => {
      const { handlers, roomEmit } = setup(sessionIn('e2ee'));
      const ack = jest.fn<any>();

      await handlers[CALL_EVENTS.TRANSCRIPTION_ACTIVE]({ callId: CALL_ID, active: true }, ack);

      expect(roomEmit).not.toHaveBeenCalled();
      expect(ack).toHaveBeenCalledWith(refusal);
    });

    it('refuse fermé quand le régime ne se lit pas', async () => {
      const { handlers, roomEmit, directEmit } = setup(() => Promise.reject(new Error('mongo down')));
      const ack = jest.fn<any>();

      await handlers[CALL_EVENTS.TRANSCRIPTION_ACTIVE]({ callId: CALL_ID, active: true }, ack);

      expect(roomEmit).not.toHaveBeenCalled();
      expect(directEmit).not.toHaveBeenCalled();
      expect(ack).toHaveBeenCalledWith(refusal);
    });

    it('relaie toujours l’annonce dans une conversation en clair', async () => {
      const { handlers, roomEmit } = setup(sessionIn(null));

      await handlers[CALL_EVENTS.TRANSCRIPTION_ACTIVE]({ callId: CALL_ID, active: true });

      expect(roomEmit).toHaveBeenCalledWith(CALL_EVENTS.TRANSCRIPTION_ACTIVE, { callId: CALL_ID, speakerId: SPEAKER_ID, active: true });
    });
  });
});
