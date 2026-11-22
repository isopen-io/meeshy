import type { CallAnalyticsEvent } from '@meeshy/shared/types/video-call';

import type { CallReports, EngineAnalyticsContext, QualityReportPayload, Telemetry } from './call-analytics';
import type { PeerQuality } from './call-quality';

export type CallReportBuilders = {
  readonly analyticsPayload: (telemetry: Telemetry, context: EngineAnalyticsContext) => CallAnalyticsEvent;
  readonly qualityReport: (callId: string, total: PeerQuality, at: number) => QualityReportPayload;
};

/**
 * Les rapports d'un appel chargés à part (#19894) : le chargement part à la
 * construction, donc bien avant le premier relevé et le raccroché. Prêt, un
 * rapport part tout de suite, à la même place qu'avant ; pas encore prêt, il
 * part à l'arrivée du module, dans l'ordre, avec ce qui valait au moment où il
 * a été demandé ; un module qui ne charge pas ne coûte que ces rapports-là, et
 * la demande suivante le retente.
 */
export function lazyCallReports(load: () => Promise<CallReportBuilders>): CallReports {
  let ready: CallReportBuilders | null = null;
  let pending: Promise<CallReportBuilders> | null = null;
  const ensure = (): Promise<CallReportBuilders> =>
    (pending ??= load().then(
      (builders) => (ready = builders),
      (error: unknown) => {
        pending = null;
        throw error;
      },
    ));
  const run = (use: (builders: CallReportBuilders) => void): void => {
    if (ready !== null) return use(ready);
    ensure()
      .then(use)
      .catch(() => undefined);
  };
  ensure().catch(() => undefined);
  return {
    final: (telemetry, context, send) => run((builders) => send(builders.analyticsPayload(telemetry, context))),
    quality: (callId, total, at, send) => run((builders) => send(builders.qualityReport(callId, total, at))),
  };
}
