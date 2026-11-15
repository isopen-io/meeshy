/**
 * #16622 — le relais abandonne un sous-titre à son délai ; le client ZMQ doit
 * l'abandonner au MÊME délai, sans le re-pousser au traducteur. Les deux lisent
 * une seule constante.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { EventEmitter } from 'events';
import { Registry } from 'prom-client';
import { callCaptionMetrics } from '../../../services/metrics/callCaptionMetrics';
import {
  CALL_CAPTION_TRANSLATION_TIMEOUT_MS,
  translateAndEmitSegment,
} from '../../../socketio/call-transcription-relay';
import type { CallTranscriptionRelayDeps } from '../../../socketio/call-transcription-relay';
import type { CallTranscriptionSegmentEvent } from '@meeshy/shared/types/video-call';
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

const silentSocket = () => {
  const target = { to: () => target, emit: () => true };
  return { to: () => target } as unknown as MeeshySocket;
};

type SilentZmq = EventEmitter & { translateText: jest.Mock<(...args: unknown[]) => Promise<string>> };

const silentZmq = (): SilentZmq => {
  const zmq = new EventEmitter() as SilentZmq;
  zmq.translateText = jest.fn(async () => 'task-en');
  return zmq;
};

const depsWith = (zmq: SilentZmq, registry: Registry): CallTranscriptionRelayDeps => ({
  prisma: { callParticipant: { findMany: jest.fn(async () => [listener(SPEAKER.userId, 'fr'), listener('bob', 'en')]) } } as unknown as CallTranscriptionRelayDeps['prisma'],
  zmqClient: () => zmq as unknown as ReturnType<CallTranscriptionRelayDeps['zmqClient']>,
  captionMetrics: callCaptionMetrics({ registry }),
});

const settle = async () => {
  for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setImmediate(resolve));
};

const timeoutCount = async (registry: Registry): Promise<number> => {
  const row = (await registry.metrics())
    .split('\n')
    .find((line) => line.startsWith('call_caption_translation_seconds_count{outcome="timeout"}'));
  return Number(row?.split(' ').pop() ?? 0);
};

describe("le délai d'un sous-titre d'appel est le même pour le relais et le client ZMQ", () => {
  it('vaut dix secondes', () => {
    expect(CALL_CAPTION_TRANSLATION_TIMEOUT_MS).toBe(10_000);
  });

  it('demande au client ZMQ ce délai, sans renvoi', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    try {
      const zmq = silentZmq();
      const relay = translateAndEmitSegment(depsWith(zmq, new Registry()), silentSocket(), finalSegment(), SPEAKER);
      await settle();
      jest.advanceTimersByTime(CALL_CAPTION_TRANSLATION_TIMEOUT_MS);
      await relay;

      expect(zmq.translateText).toHaveBeenCalledTimes(1);
      const args = zmq.translateText.mock.calls[0];
      expect(args[args.length - 1]).toEqual({ timeoutMs: CALL_CAPTION_TRANSLATION_TIMEOUT_MS, retryEnabled: false });
    } finally {
      jest.useRealTimers();
    }
  });

  it("compte l'abandon une seule fois, même quand le client ZMQ annonce aussi son expiration", async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    try {
      const zmq = silentZmq();
      const registry = new Registry();
      const relay = translateAndEmitSegment(depsWith(zmq, registry), silentSocket(), finalSegment(), SPEAKER);
      await settle();
      jest.advanceTimersByTime(CALL_CAPTION_TRANSLATION_TIMEOUT_MS);
      zmq.emit('translationError', { taskId: 'task-en', messageId: `call-caption:${CALL_ID}:0`, error: 'ZMQ timeout: no response from translator' });
      await relay;
      jest.advanceTimersByTime(60_000);

      expect(await timeoutCount(registry)).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });
});
