/**
 * Persiste les dernières statistiques rapportées d'un appel (#20152) : les
 * octets par un CAS sur l'instantané lu (deux participants, ou un rapport
 * dupliqué, peuvent écrire en même temps — un `update` nu laisserait gagner
 * le dernier, même plus petit), et la qualité réseau par sa PROPRE écriture,
 * pour qu'un octet refusé, une course perdue ou une lecture en panne ne
 * l'emportent pas avec eux. Best-effort : ne lève jamais.
 *
 * Rend `true` quand ce relevé a fait grandir les octets, ou changé la qualité
 * d'un appel déjà terminé : ce sont les deux cas où la bulle de résumé d'un
 * appel terminé est devenue périmée (#20709).
 */
import type { CallStatus, Prisma, PrismaClient } from '@meeshy/shared/prisma/client';
import { logger } from '../../utils/logger';
import { CALL_BYTE_COUNTER_SELECT, planCallByteWrite, type CallByteReport } from './callByteCounters';

export type CallStatsReport = CallByteReport & { readonly level?: string | null };

type CallStatsPrisma = Pick<PrismaClient, 'callSession'>;

type NetworkQualityWrite = {
  readonly where: Prisma.CallSessionWhereInput;
  readonly data: Prisma.CallSessionUpdateManyMutationInput;
};

const QUALITY_FROM_BEST_TO_WORST: ReadonlyArray<string> = ['excellent', 'good', 'fair', 'poor'];

const ENDED_CALL_STATUSES = ['ended', 'missed', 'rejected', 'failed'] as const satisfies ReadonlyArray<CallStatus>;

const warn = (callId: string, what: string) => (error: unknown): null => {
  logger.warn(what, { callId, error: error instanceof Error ? error.message : String(error) });
  return null;
};

const wroteSomething = (result: { count: number } | null): boolean => (result?.count ?? 0) > 0;

const persistByteCounters = async (prisma: CallStatsPrisma, callId: string, report: CallByteReport): Promise<boolean> => {
  if (report.bytesSent == null && report.bytesReceived == null) return false;
  const current = await prisma.callSession
    .findUnique({ where: { id: callId }, select: CALL_BYTE_COUNTER_SELECT })
    .catch(() => null);
  if (current === null) return false;
  const plan = planCallByteWrite(current, report);
  if (plan === null) return false;
  return wroteSomething(await prisma.callSession
    .updateMany({ where: { id: callId, ...plan.where }, data: plan.data })
    .catch(warn(callId, 'Failed to persist call stats')));
};

/** Pendant l'appel, le dernier relevé fait foi : c'est la qualité du moment. */
export const liveReportOverwritesQuality = (callId: string, level: string): NetworkQualityWrite => ({
  where: { id: callId, status: { notIn: [...ENDED_CALL_STATUSES] } },
  data: { networkQuality: level }
});

/**
 * Une fois l'appel terminé, un relevé tardif ne peut que DÉGRADER la qualité
 * retenue : il remplace une qualité absente ou meilleure, jamais une égale ni
 * une pire. Le bilan d'un appel ne s'embellit pas après le raccroché.
 */
export const endedCallReportOnlyDegradesQuality = (callId: string, level: string): NetworkQualityWrite => {
  const better = QUALITY_FROM_BEST_TO_WORST.slice(0, QUALITY_FROM_BEST_TO_WORST.indexOf(level));
  return {
    where: {
      id: callId,
      status: { in: [...ENDED_CALL_STATUSES] },
      OR: [
        { networkQuality: null },
        { networkQuality: { isSet: false } },
        ...(better.length > 0 ? [{ networkQuality: { in: [...better] } }] : [])
      ]
    },
    data: { networkQuality: level }
  };
};

const persistNetworkQuality = async (prisma: CallStatsPrisma, callId: string, level?: string | null): Promise<boolean> => {
  if (typeof level !== 'string' || !QUALITY_FROM_BEST_TO_WORST.includes(level)) return false;
  const write = (plan: NetworkQualityWrite) => prisma.callSession
    .updateMany(plan)
    .catch(warn(callId, 'Failed to persist call network quality'));
  if (wroteSomething(await write(liveReportOverwritesQuality(callId, level)))) return false;
  return wroteSomething(await write(endedCallReportOnlyDegradesQuality(callId, level)));
};

export const persistCallStats = async (prisma: CallStatsPrisma, callId: string, stats: CallStatsReport): Promise<boolean> => {
  const [bytesGrew, endedCallQualityChanged] = await Promise.all([
    persistByteCounters(prisma, callId, stats),
    persistNetworkQuality(prisma, callId, stats.level)
  ]);
  return bytesGrew || endedCallQualityChanged;
};
