/**
 * #16613 — décision #16612 : un sous-titre d'appel part TOUT DE SUITE, en
 * original, vers tous les auditeurs ; sa traduction le rejoint quand elle
 * arrive, sous le même énoncé, comme pour un message.
 *
 * Les témoins passent par le VRAI relais (`translateAndEmitSegment`) avec un
 * traducteur simulé dont on décide QUAND il répond.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { EventEmitter } from 'events';
import { Registry } from 'prom-client';
import { callCaptionMetrics } from '../../../services/metrics/callCaptionMetrics';
import { translateAndEmitSegment } from '../../../socketio/call-transcription-relay';
import type { CallTranscriptionRelayDeps } from '../../../socketio/call-transcription-relay';
import type { CallTranscriptionSegmentEvent, CallTranslatedSegmentEvent } from '@meeshy/shared/types/video-call';
import type { MeeshySocket } from '../../../socketio/typed-socket';

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const CALL_ID = '507f1f77bcf86cd799439011';
const SPEAKER = { userId: 'speaker', displayName: 'Awa' };

const finalSegment = (): CallTranscriptionSegmentEvent => ({
  callId: CALL_ID,
  segment: { id: 'utt-1', text: 'Bonjour', speakerId: SPEAKER.userId, startMs: 0, endMs: 900, isFinal: true, confidence: 0.9, language: 'fr', capturedAtMs: 1 },
});

const listener = (userId: string, systemLanguage: string) => ({ participant: { userId, user: { systemLanguage } } });

type Emission = { readonly rooms: readonly string[]; readonly event: string; readonly payload: CallTranslatedSegmentEvent };

const recordingSocket = () => {
  const emissions: Emission[] = [];
  const target = (rooms: readonly string[]) => ({
    to: (room: string) => target([...rooms, room]),
    emit: (event: string, payload: CallTranslatedSegmentEvent) => {
      emissions.push({ rooms, event, payload });
      return true;
    },
  });
  return { socket: { to: (room: string) => target([room]) } as unknown as MeeshySocket, emissions };
};

type ControlledZmq = EventEmitter & {
  translateText: jest.Mock<(...args: unknown[]) => Promise<string>>;
  answer: (target: string) => void;
};

const controlledZmq = (behaviour: 'answers-on-demand' | 'throws'): ControlledZmq => {
  const zmq = new EventEmitter() as ControlledZmq;
  const messageIds = new Map<string, string>();
  zmq.translateText = jest.fn(async (_text: unknown, _source: unknown, target: unknown, messageId: unknown) => {
    if (behaviour === 'throws') throw new Error('translator down');
    messageIds.set(String(target), String(messageId));
    return `task-${String(target)}`;
  });
  zmq.answer = (target: string) => {
    zmq.emit(`translationCompleted:${messageIds.get(target) ?? ''}`, {
      taskId: `task-${target}`,
      result: { translatedText: `[${target}] Bonjour`, targetLanguage: target },
    });
  };
  return zmq;
};

const depsWith = (listeners: ReturnType<typeof listener>[], zmq: ControlledZmq): CallTranscriptionRelayDeps => ({
  prisma: { callParticipant: { findMany: jest.fn(async () => [listener(SPEAKER.userId, 'fr'), ...listeners]) } } as unknown as CallTranscriptionRelayDeps['prisma'],
  zmqClient: () => zmq as unknown as ReturnType<CallTranscriptionRelayDeps['zmqClient']>,
  captionMetrics: callCaptionMetrics({ registry: new Registry() }),
});

const settle = async () => {
  for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setImmediate(resolve));
};

describe('un sous-titre final part en original avant sa traduction', () => {
  it("sert l'original à toute la salle AVANT que le traducteur réponde", async () => {
    const zmq = controlledZmq('answers-on-demand');
    const { socket, emissions } = recordingSocket();

    const relay = translateAndEmitSegment(depsWith([listener('bob', 'en')], zmq), socket, finalSegment(), SPEAKER);
    await settle();

    expect(emissions).toHaveLength(1);
    expect(emissions[0].rooms).toEqual([`call:${CALL_ID}`]);
    expect(emissions[0].event).toBe('call:translated-segment');
    expect(emissions[0].payload.segment.text).toBe('Bonjour');
    expect(emissions[0].payload.segment.translatedText).toBeUndefined();

    zmq.answer('en');
    await relay;
  });

  it("joint ensuite la traduction, sous le MÊME énoncé, aux seuls auditeurs de sa langue", async () => {
    const zmq = controlledZmq('answers-on-demand');
    const { socket, emissions } = recordingSocket();

    const relay = translateAndEmitSegment(depsWith([listener('bob', 'en'), listener('eve', 'fr')], zmq), socket, finalSegment(), SPEAKER);
    await settle();
    zmq.answer('en');
    await relay;

    expect(emissions).toHaveLength(2);
    expect(emissions[0].rooms).toEqual([`call:${CALL_ID}`]);
    expect(emissions[1].rooms).toEqual(['user:bob']);
    expect(emissions[1].payload.segment).toMatchObject({ id: 'utt-1', startMs: 0, text: 'Bonjour', translatedText: '[en] Bonjour', targetLanguage: 'en' });
  });

  it("ne renvoie pas un second original quand le traducteur lève : l'original est déjà là", async () => {
    const { socket, emissions } = recordingSocket();

    await translateAndEmitSegment(depsWith([listener('bob', 'en')], controlledZmq('throws')), socket, finalSegment(), SPEAKER);

    expect(emissions).toHaveLength(1);
    expect(emissions[0].rooms).toEqual([`call:${CALL_ID}`]);
  });

  it("ne renvoie pas un second original quand le traducteur se tait jusqu'au délai", async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    try {
      const { socket, emissions } = recordingSocket();

      const relay = translateAndEmitSegment(depsWith([listener('bob', 'en')], controlledZmq('answers-on-demand')), socket, finalSegment(), SPEAKER);
      await settle();
      jest.advanceTimersByTime(10_000);
      await relay;

      expect(emissions).toHaveLength(1);
      expect(emissions[0].rooms).toEqual([`call:${CALL_ID}`]);
    } finally {
      jest.useRealTimers();
    }
  });
});
