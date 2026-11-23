import { describe, expect, test } from 'bun:test';
import type { CallAnalyticsEvent } from '@meeshy/shared/types/video-call';

import { createTelemetry, markCaptions, type EngineAnalyticsContext, type QualityReportPayload, type Telemetry } from './call-analytics';
import { lazyCallReports, type CallReportBuilders } from './call-analytics-lazy';
import { analyticsPayload, qualityReport } from './call-analytics-report';
import type { PeerQuality } from './call-quality';

/**
 * LES RAPPORTS D'UN APPEL CHARGÉS À PART (#19894) — `call:analytics` et
 * `call:quality-report` sont composés par un chunk paresseux, préchargé dès que
 * le moteur se charge. Ces témoins prouvent qu'un rapport ne se perd pas quand
 * le chunk arrive après lui, et qu'un chunk qui ne charge pas ne fait jamais
 * tomber l'appel.
 */

const context: EngineAnalyticsContext = { callId: '507f1f77bcf86cd799439099', now: 5_000, isVideo: false, endReason: 'local', platform: 'web' };

const builders: CallReportBuilders = { analyticsPayload: (telemetry, served) => analyticsPayload(telemetry, { ...served, deviceModel: 'Chrome · Linux' }), qualityReport };

const total = (overrides: Partial<PeerQuality> = {}): PeerQuality => ({ level: 'good', packetLoss: 1, rtt: 120.4, jitter: 8, audioKbps: 32, videoKbps: 0, bytesSent: 1_000, bytesReceived: 2_000, ...overrides });

const deferred = <T>() => {
  const handlers: { resolve: (value: T) => void; reject: (reason: unknown) => void } = { resolve: () => undefined, reject: () => undefined };
  const promise = new Promise<T>((resolve, reject) => Object.assign(handlers, { resolve, reject }));
  return { promise, ...handlers };
};

const settle = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const collectGarbage = (): void => (globalThis as unknown as { readonly Bun: { readonly gc: (force: boolean) => void } }).Bun.gc(true);

const manualClock = () => {
  const state = { now: 0 };
  return { now: (): number => state.now, set: (now: number): void => void (state.now = now) };
};

const recorder = <T>() => {
  const sent: T[] = [];
  return { sent, send: (payload: T) => void sent.push(payload) };
};

describe('les rapports d’un appel chargés à la demande (#19894)', () => {
  test('chargés avant le raccroché, `call:analytics` part TOUT DE SUITE, composé par le vrai module', async () => {
    const reports = lazyCallReports(() => import('./call-analytics-report').then((module) => ({ analyticsPayload: module.browserAnalyticsPayload, qualityReport: module.qualityReport })));
    await settle();
    const { sent, send } = recorder<CallAnalyticsEvent>();
    reports.final(createTelemetry(1_000), context, send);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ callId: context.callId, endReason: 'local', platform: 'web', transcriptionUsed: false });
    expect(typeof sent[0]?.deviceModel).toBe('string');
  });

  test('raccroché avant l’arrivée du module, `call:analytics` part à son arrivée, avec la télémétrie du raccroché', async () => {
    const load = deferred<CallReportBuilders>();
    const reports = lazyCallReports(() => load.promise);
    const { sent, send } = recorder<CallAnalyticsEvent>();
    const atHangup: Telemetry = markCaptions(createTelemetry(1_000));
    reports.final(atHangup, context, send);
    expect(sent).toEqual([]);
    load.resolve(builders);
    await settle();
    expect(sent).toEqual([builders.analyticsPayload(atHangup, context)]);
    expect(sent[0]?.transcriptionUsed).toBe(true);
  });

  test('des relevés arrivés avant le module partent à son arrivée, dans l’ordre, horodatés à leur relevé', async () => {
    const load = deferred<CallReportBuilders>();
    const reports = lazyCallReports(() => load.promise);
    const { sent, send } = recorder<QualityReportPayload>();
    reports.quality('call-1', total({ level: 'good' }), 1_000, send);
    reports.quality('call-1', total({ level: 'poor' }), 6_000, send);
    expect(sent).toEqual([]);
    load.resolve(builders);
    await settle();
    expect(sent).toEqual([qualityReport('call-1', total({ level: 'good' }), 1_000), qualityReport('call-1', total({ level: 'poor' }), 6_000)]);
  });

  test('un rapport demandé à l’arrivée du module part APRÈS ceux qui l’attendaient (#20426)', async () => {
    const load = deferred<CallReportBuilders>();
    const reports = lazyCallReports(() => load.promise);
    const { sent, send } = recorder<QualityReportPayload>();
    reports.quality('call-1', total({ level: 'good' }), 1_000, send);
    reports.quality('call-1', total({ level: 'fair' }), 6_000, send);
    void load.promise.then(() => reports.quality('call-1', total({ level: 'poor' }), 11_000, send));
    load.resolve(builders);
    await settle();
    expect(sent).toEqual([qualityReport('call-1', total({ level: 'good' }), 1_000), qualityReport('call-1', total({ level: 'fair' }), 6_000), qualityReport('call-1', total({ level: 'poor' }), 11_000)]);
  });

  test('un rapport demandé pendant que la file se vide part à sa suite, dans l’ordre (#20426)', async () => {
    const load = deferred<CallReportBuilders>();
    const reports = lazyCallReports(() => load.promise);
    const { sent, send } = recorder<QualityReportPayload>();
    const sendThenReport = (payload: QualityReportPayload): void => {
      send(payload);
      if (sent.length === 1) reports.quality('call-1', total({ level: 'poor' }), 11_000, send);
    };
    reports.quality('call-1', total({ level: 'good' }), 1_000, sendThenReport);
    reports.quality('call-1', total({ level: 'fair' }), 6_000, send);
    load.resolve(builders);
    await settle();
    expect(sent).toEqual([qualityReport('call-1', total({ level: 'good' }), 1_000), qualityReport('call-1', total({ level: 'fair' }), 6_000), qualityReport('call-1', total({ level: 'poor' }), 11_000)]);
  });

  test('un envoi en attente qui lève n’arrête ni la file ni le direct, et ne laisse aucun rejet (#20426)', async () => {
    const escaped: unknown[] = [];
    const onRejection = (reason: unknown): void => void escaped.push(reason);
    process.on('unhandledRejection', onRejection);
    const load = deferred<CallReportBuilders>();
    const reports = lazyCallReports(() => load.promise);
    const { sent, send } = recorder<QualityReportPayload>();
    reports.quality('call-1', total({ level: 'good' }), 1_000, () => {
      throw new Error('transport fermé');
    });
    reports.quality('call-1', total({ level: 'fair' }), 6_000, send);
    load.resolve(builders);
    await settle();
    reports.quality('call-1', total({ level: 'poor' }), 11_000, send);
    process.off('unhandledRejection', onRejection);
    expect(sent).toEqual([qualityReport('call-1', total({ level: 'fair' }), 6_000), qualityReport('call-1', total({ level: 'poor' }), 11_000)]);
    expect(escaped).toEqual([]);
  });

  test('un module qui ne charge pas n’est pas retenté dans la minute qui suit son échec, quel que soit le nombre de relevés (#20426)', async () => {
    const attempts: number[] = [];
    const clock = manualClock();
    const reports = lazyCallReports(() => {
      attempts.push(clock.now());
      return Promise.reject(new Error('chunk introuvable'));
    }, clock.now);
    const { sent, send } = recorder<QualityReportPayload>();
    await settle();
    for (const at of [5_000, 10_000, 15_000, 20_000, 25_000, 30_000, 35_000, 40_000, 45_000, 50_000, 55_000]) {
      clock.set(at);
      expect(() => reports.quality('call-1', total(), at, send)).not.toThrow();
      await settle();
    }
    expect(() => reports.final(createTelemetry(0), context, () => undefined)).not.toThrow();
    await settle();
    expect(attempts).toEqual([0]);
    expect(sent).toEqual([]);
  });

  test('un module qui ne charge pas : rien ne lève, aucun rapport ne part, aucun rejet ne s’échappe', async () => {
    const escaped: unknown[] = [];
    const onRejection = (reason: unknown): void => void escaped.push(reason);
    process.on('unhandledRejection', onRejection);
    const reports = lazyCallReports(() => Promise.reject(new Error('chunk introuvable')));
    const finals = recorder<CallAnalyticsEvent>();
    const qualities = recorder<QualityReportPayload>();
    expect(() => reports.quality('call-1', total(), 1_000, qualities.send)).not.toThrow();
    expect(() => reports.final(createTelemetry(0), context, finals.send)).not.toThrow();
    await settle();
    process.off('unhandledRejection', onRejection);
    expect(finals.sent).toEqual([]);
    expect(qualities.sent).toEqual([]);
    expect(escaped).toEqual([]);
  });

  test('une minute après un échec, la demande suivante retente le module ; des échecs répétés ne condamnent jamais l’onglet, et un succès tardif sert les rapports (#20426)', async () => {
    const attempts: number[] = [];
    const clock = manualClock();
    const reports = lazyCallReports(() => {
      attempts.push(clock.now());
      return attempts.length <= 3 ? Promise.reject(new Error('réseau coupé')) : Promise.resolve(builders);
    }, clock.now);
    const { sent, send } = recorder<QualityReportPayload>();
    await settle();
    const at = async (now: number): Promise<void> => {
      clock.set(now);
      reports.quality('call-1', total(), now, send);
      await settle();
    };
    await at(60_000);
    await at(119_999);
    await at(120_000);
    await at(180_000);
    expect(attempts).toEqual([0, 60_000, 120_000, 180_000]);
    expect(sent).toEqual([qualityReport('call-1', total(), 180_000)]);
    reports.quality('call-1', total(), 185_000, send);
    expect(sent).toEqual([qualityReport('call-1', total(), 180_000), qualityReport('call-1', total(), 185_000)]);
  });

  test('une fois le module arrivé, la file vidée ne retient plus les rapports qu’elle a servis (#20426)', async () => {
    const load = deferred<CallReportBuilders>();
    const reports = lazyCallReports(() => load.promise);
    const held = ((): WeakRef<object> => {
      const payloadSink = { sent: [] as QualityReportPayload[] };
      reports.quality('call-1', total(), 1_000, (payload) => void payloadSink.sent.push(payload));
      return new WeakRef(payloadSink);
    })();
    load.resolve(builders);
    await settle();
    collectGarbage();
    await settle();
    collectGarbage();
    expect(held.deref()).toBeUndefined();
  });
});
