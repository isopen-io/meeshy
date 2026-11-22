/**
 * Persiste les dernières statistiques rapportées d'un appel (#20152) : les
 * octets par un CAS sur l'instantané lu (deux participants, ou un rapport
 * dupliqué, peuvent écrire en même temps — un `update` nu laisserait gagner
 * le dernier, même plus petit), et la qualité réseau par sa PROPRE écriture,
 * pour qu'un octet refusé, une course perdue ou une lecture en panne ne
 * l'emportent pas avec eux. Best-effort : ne lève jamais.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { logger } from '../../utils/logger';
import { CALL_BYTE_COUNTER_SELECT, planCallByteWrite, type CallByteReport } from './callByteCounters';

export type CallStatsReport = CallByteReport & { readonly level?: string | null };

type CallStatsPrisma = Pick<PrismaClient, 'callSession'>;

const NETWORK_QUALITIES: ReadonlySet<string> = new Set(['excellent', 'good', 'fair', 'poor']);

const warn = (callId: string, what: string) => (error: unknown): null => {
  logger.warn(what, { callId, error: error instanceof Error ? error.message : String(error) });
  return null;
};

const persistByteCounters = async (prisma: CallStatsPrisma, callId: string, report: CallByteReport): Promise<void> => {
  if (report.bytesSent == null && report.bytesReceived == null) return;
  const current = await prisma.callSession
    .findUnique({ where: { id: callId }, select: CALL_BYTE_COUNTER_SELECT })
    .catch(() => null);
  if (current === null) return;
  const plan = planCallByteWrite(current, report);
  if (plan === null) return;
  await prisma.callSession
    .updateMany({ where: { id: callId, ...plan.where }, data: plan.data })
    .catch(warn(callId, 'Failed to persist call stats'));
};

const persistNetworkQuality = async (prisma: CallStatsPrisma, callId: string, level?: string | null): Promise<void> => {
  if (typeof level !== 'string' || !NETWORK_QUALITIES.has(level)) return;
  await prisma.callSession
    .updateMany({ where: { id: callId }, data: { networkQuality: level } })
    .catch(warn(callId, 'Failed to persist call network quality'));
};

export const persistCallStats = async (prisma: CallStatsPrisma, callId: string, stats: CallStatsReport): Promise<void> => {
  await Promise.all([
    persistByteCounters(prisma, callId, stats),
    persistNetworkQuality(prisma, callId, stats.level)
  ]);
};
