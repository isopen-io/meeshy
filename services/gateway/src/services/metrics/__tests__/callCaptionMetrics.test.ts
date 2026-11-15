/**
 * #16548 — le temps d'un sous-titre d'appel traduit se mesure sur la passerelle.
 *
 * Les témoins passent par le VRAI relais (`translateAndEmitSegment`) avec un
 * traducteur simulé : la mesure n'atteste que ce que le relais fait vraiment.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { EventEmitter } from 'events';
import { Registry } from 'prom-client';
import { CALL_CAPTION_OUTCOMES, CALL_CAPTION_PATHS, callCaptionMetrics } from '../callCaptionMetrics';
import { translateAndEmitSegment } from '../../../socketio/call-transcription-relay';
import type { CallTranscriptionRelayDeps } from '../../../socketio/call-transcription-relay';
import type { CallTranscriptionSegmentEvent } from '@meeshy/shared/types/video-call';
import type { MeeshySocket } from '../../../socketio/typed-socket';

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const CALL_ID = '507f1f77bcf86cd799439011';
const SPEAKER = { userId: 'speaker', displayName: 'Awa' };

const segment = (language = 'fr'): CallTranscriptionSegmentEvent => ({
  callId: CALL_ID,
  segment: { text: 'Bonjour', speakerId: SPEAKER.userId, startMs: 0, endMs: 900, isFinal: true, confidence: 0.9, language, capturedAtMs: 1 },
});

const listener = (userId: string, systemLanguage: string) => ({ participant: { userId, user: { systemLanguage } } });

const fakeClock = (...readings: number[]) => {
  const queue = [...readings];
  return () => queue.shift() ?? 0;
};

const fakeSocket = () => {
  const emitted: string[] = [];
  const chain = { to: () => chain, emit: (event: string) => { emitted.push(event); return true; } };
  return { socket: { to: () => chain } as unknown as MeeshySocket, emitted };
};

type FakeZmq = EventEmitter & { translateText: jest.Mock<(...args: unknown[]) => Promise<string>> };

const fakeZmq = (behaviour: 'answers' | 'silent' | 'throws'): FakeZmq => {
  const zmq = new EventEmitter() as FakeZmq;
  zmq.translateText = jest.fn(async (_text: unknown, _source: unknown, target: unknown, messageId: unknown) => {
    if (behaviour === 'throws') throw new Error('translator down');
    const taskId = `task-${String(target)}`;
    if (behaviour === 'answers') {
      setImmediate(() => zmq.emit(`translationCompleted:${String(messageId)}`, {
        taskId,
        result: { translatedText: `[${String(target)}] Bonjour`, targetLanguage: target },
      }));
    }
    return taskId;
  });
  return zmq;
};

const depsWith = (options: { listeners: ReturnType<typeof listener>[]; zmq: FakeZmq | null; clock?: () => number }) => {
  const metrics = callCaptionMetrics({ registry: new Registry(), clock: options.clock });
  const deps: CallTranscriptionRelayDeps = {
    prisma: { callParticipant: { findMany: jest.fn(async () => [listener(SPEAKER.userId, 'fr'), ...options.listeners]) } } as unknown as CallTranscriptionRelayDeps['prisma'],
    zmqClient: () => options.zmq as unknown as ReturnType<CallTranscriptionRelayDeps['zmqClient']>,
    captionMetrics: metrics,
  };
  return { deps, metrics };
};

const sample = async (metrics: ReturnType<typeof callCaptionMetrics>, name: string, labels: string) => {
  const line = (await metrics.registry.metrics()).split('\n').find((row) => row.startsWith(`${name}{${labels}}`));
  return line === undefined ? 0 : Number(line.split(' ').pop());
};

describe('call_caption_translation_seconds{outcome} et call_caption_deliveries_total{path}', () => {
  it('ne nomme que des issues et des chemins bornés', () => {
    expect(CALL_CAPTION_OUTCOMES).toEqual(['translated', 'timeout', 'error']);
    expect(CALL_CAPTION_PATHS).toEqual(['translated', 'timeout', 'error', 'same_language', 'untranslated']);
  });

  it('mesure, en secondes et sur l’horloge de la passerelle, le temps d’une traduction réussie', async () => {
    const { deps, metrics } = depsWith({ listeners: [listener('bob', 'en')], zmq: fakeZmq('answers'), clock: fakeClock(1_000, 1_420) });

    await translateAndEmitSegment(deps, fakeSocket().socket, segment(), SPEAKER);

    expect(await sample(metrics, 'call_caption_translation_seconds_count', 'outcome="translated"')).toBe(1);
    expect(await sample(metrics, 'call_caption_translation_seconds_sum', 'outcome="translated"')).toBeCloseTo(0.42);
    expect(await sample(metrics, 'call_caption_deliveries_total', 'path="translated"')).toBe(1);
  });

  it('compte une observation par LANGUE servie, jamais par auditeur', async () => {
    const { deps, metrics } = depsWith({
      listeners: [listener('bob', 'en'), listener('carol', 'en'), listener('dan', 'es'), listener('eve', 'fr')],
      zmq: fakeZmq('answers'),
    });

    await translateAndEmitSegment(deps, fakeSocket().socket, segment(), SPEAKER);

    expect(await sample(metrics, 'call_caption_translation_seconds_count', 'outcome="translated"')).toBe(2);
    expect(await sample(metrics, 'call_caption_deliveries_total', 'path="translated"')).toBe(2);
    expect(await sample(metrics, 'call_caption_deliveries_total', 'path="same_language"')).toBe(1);
  });

  it('range sous « error » un traducteur qui lève, avec le temps qu’il a coûté', async () => {
    const { deps, metrics } = depsWith({ listeners: [listener('bob', 'en')], zmq: fakeZmq('throws'), clock: fakeClock(0, 30) });

    await translateAndEmitSegment(deps, fakeSocket().socket, segment(), SPEAKER);

    expect(await sample(metrics, 'call_caption_translation_seconds_count', 'outcome="error"')).toBe(1);
    expect(await sample(metrics, 'call_caption_translation_seconds_sum', 'outcome="error"')).toBeCloseTo(0.03);
    expect(await sample(metrics, 'call_caption_translation_seconds_count', 'outcome="translated"')).toBe(0);
  });

  it('range sous « timeout » un traducteur muet, au délai du relais', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    try {
      const { deps, metrics } = depsWith({ listeners: [listener('bob', 'en')], zmq: fakeZmq('silent'), clock: fakeClock(0, 10_000) });

      const relay = translateAndEmitSegment(deps, fakeSocket().socket, segment(), SPEAKER);
      await Promise.resolve();
      await new Promise((resolve) => setImmediate(resolve));
      jest.advanceTimersByTime(10_000);
      await relay;

      expect(await sample(metrics, 'call_caption_translation_seconds_count', 'outcome="timeout"')).toBe(1);
      expect(await sample(metrics, 'call_caption_deliveries_total', 'path="timeout"')).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('compte « untranslated » chaque langue servie en original faute de traducteur', async () => {
    const { deps, metrics } = depsWith({ listeners: [listener('bob', 'en'), listener('dan', 'es')], zmq: null });

    await translateAndEmitSegment(deps, fakeSocket().socket, segment(), SPEAKER);

    expect(await sample(metrics, 'call_caption_deliveries_total', 'path="untranslated"')).toBe(2);
    expect(await sample(metrics, 'call_caption_translation_seconds_count', 'outcome="translated"')).toBe(0);
  });

  it('ne mesure aucun aller-retour quand tous les auditeurs lisent déjà la langue du locuteur', async () => {
    const zmq = fakeZmq('answers');
    const { deps, metrics } = depsWith({ listeners: [listener('eve', 'fr')], zmq });

    await translateAndEmitSegment(deps, fakeSocket().socket, segment(), SPEAKER);

    expect(zmq.translateText).not.toHaveBeenCalled();
    expect(await sample(metrics, 'call_caption_deliveries_total', 'path="same_language"')).toBe(1);
    expect(await sample(metrics, 'call_caption_translation_seconds_count', 'outcome="translated"')).toBe(0);
  });

  it('n’observe une traduction qu’une fois, même si l’issue est signalée deux fois', async () => {
    const metrics = callCaptionMetrics({ registry: new Registry(), clock: fakeClock(0, 100, 900) });

    const timing = metrics.startTranslation();
    timing.finish('translated');
    timing.finish('timeout');

    expect(await sample(metrics, 'call_caption_translation_seconds_count', 'outcome="translated"')).toBe(1);
    expect(await sample(metrics, 'call_caption_translation_seconds_count', 'outcome="timeout"')).toBe(0);
  });
});
