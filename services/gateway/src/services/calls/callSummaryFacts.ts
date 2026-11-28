/**
 * Les faits d'un appel que lit sa bulle de résumé (« Appel vidéo · 04:32 »,
 * octets, qualité) : UNE projection et UNE lecture, partagées par la pose du
 * résumé (`CallService.createCallSummaryMessage`) et par son rafraîchissement
 * après un relevé tardif (`callSummaryLateRefresh.ts`, #20709) — deux lectures
 * divergentes poseraient deux bilans pour un même appel.
 */
import type { Prisma } from '@meeshy/shared/prisma/client';
import type { CallSummaryMetadataInput } from '@meeshy/shared/utils/call-summary';
import { CALL_BYTE_COUNTER_SELECT, effectiveCallBytes } from './callByteCounters';

export const CALL_SUMMARY_FACTS_SELECT = {
  id: true,
  conversationId: true,
  initiatorId: true,
  status: true,
  endReason: true,
  duration: true,
  answeredAt: true,
  metadata: true,
  ...CALL_BYTE_COUNTER_SELECT,
  networkQuality: true
} as const satisfies Prisma.CallSessionSelect;

export type CallSummaryFactsRow = Prisma.CallSessionGetPayload<{ select: typeof CALL_SUMMARY_FACTS_SELECT }>;

const stringOrNull = (value: unknown): string | null => (typeof value === 'string' ? value : null);

export const callSummaryFacts = (call: CallSummaryFactsRow) => {
  const sessionMetadata = call.metadata as Record<string, unknown> | null;
  return {
    status: call.status,
    endReason: call.endReason,
    callType: stringOrNull(sessionMetadata?.type),
    durationSeconds: call.duration,
    callId: call.id,
    initiatorId: call.initiatorId,
    ...effectiveCallBytes(call),
    networkQuality: call.networkQuality,
    answeredAt: call.answeredAt,
    endedById: stringOrNull(sessionMetadata?.endedBy)
  } satisfies CallSummaryMetadataInput;
};
