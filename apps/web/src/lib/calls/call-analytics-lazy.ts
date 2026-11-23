import type { CallAnalyticsEvent } from '@meeshy/shared/types/video-call';

import type { CallReports, EngineAnalyticsContext, QualityReportPayload, Telemetry } from './call-analytics';
import type { PeerQuality } from './call-quality';

export type CallReportBuilders = {
  readonly analyticsPayload: (telemetry: Telemetry, context: EngineAnalyticsContext) => CallAnalyticsEvent;
  readonly qualityReport: (callId: string, total: PeerQuality, at: number) => QualityReportPayload;
};

type ReportUse = (builders: CallReportBuilders) => void;

/**
 * Les rapports d'un appel chargés à part (#19894) : le chargement part à la
 * construction, donc bien avant le premier relevé et le raccroché. Prêt, un
 * rapport part tout de suite, à la même place qu'avant ; pas encore prêt, il
 * attend dans une file, avec ce qui valait au moment où il a été demandé, et la
 * file se vide en entier, dans l'ordre, avant qu'un rapport parte en direct
 * (#20426). Un module qui ne charge pas ne coûte que les rapports en attente ;
 * il n'est retenté qu'une minute après son échec, par la demande suivante, et
 * les rapports demandés entre-temps sont abandonnés sans bruit.
 */
export function lazyCallReports(load: () => Promise<CallReportBuilders>, now: () => number = () => performance.now()): CallReports {
  let ready: CallReportBuilders | null = null;
  let waiting: ReportUse[] | null = null;
  let failedAt = -Infinity;
  const run = (use: ReportUse): void => {
    if (ready) return use(ready);
    if (waiting) return void waiting.push(use);
    if (now() - failedAt < 60_000) return;
    const queue = (waiting = [use]);
    load().then(
      (builders) => {
        for (const queued of queue) {
          try {
            queued(builders);
          } catch {}
        }
        ready = builders;
        waiting = null;
      },
      () => {
        waiting = null;
        failedAt = now();
      },
    );
  };
  run(() => {});
  return {
    final: (telemetry, context, send) => run((builders) => send(builders.analyticsPayload(telemetry, context))),
    quality: (callId, total, at, send) => run((builders) => send(builders.qualityReport(callId, total, at))),
  };
}
