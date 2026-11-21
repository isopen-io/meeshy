import type { Prisma, PrismaClient } from '@meeshy/shared/prisma/client';
import { CALL_TERMINAL_STATUSES } from '@meeshy/shared/types/video-call';
import { callSummaryClientMessageId } from '@meeshy/shared/utils/call-summary';
import { CALL_SUMMARY_MESSAGE_INCLUDE } from '../CallService';

/**
 * LE TÊTE-À-TÊTE D'ORIGINE D'UN APPEL PARTI DANS SON GROUPE (#19650).
 *
 * La bascule (`callConversationRebranch.ts`) garde la réservation du tête-à-tête
 * et sa bulle « Appel … en cours ». Deux choses doivent continuer à s'y lire :
 *
 * - `GET /conversations/:id/active-call` y sert l'appel vivant — c'est ce que
 *   « Rejoindre » de la bulle d'origine et la reprise d'un ANCIEN client lisent ;
 *   la garde de la route ne change pas (membre actif du tête-à-tête) ;
 * - à la fin, sa réservation est rendue (compare-and-clear sur l'appel) et sa
 *   bulle reçoit le MÊME état terminal que celle du groupe, par édition
 *   seulement (jamais une création, et l'engagement d'appel n'est crédité
 *   qu'une fois, dans le groupe).
 */

const TERMINAL = [...CALL_TERMINAL_STATUSES];

/** L'appel vivant qui tient la réservation de `conversationId` et en est parti — sinon `null`. */
export async function originConversationActiveCallId(
  prisma: Pick<PrismaClient, 'conversation' | 'callSession'>,
  conversationId: string
): Promise<string | null> {
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { activeCallId: true } });
  if (!conversation?.activeCallId) return null;
  const call = await prisma.callSession.findFirst({
    where: { id: conversation.activeCallId, originConversationId: conversationId, status: { notIn: TERMINAL } },
    select: { id: true },
  });
  return call?.id ?? null;
}

type CallMessage = { readonly callId: string; readonly content: string; readonly metadata: Record<string, unknown> };

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;

/** Un message d'appel TERMINAL (résumé), lu sur la charge diffusée au groupe. */
function terminalCallMessage(message: unknown): CallMessage | null {
  const row = record(message);
  const metadata = record(row?.metadata);
  if (!row || !metadata || typeof row.content !== 'string') return null;
  const callId = metadata.callId;
  if (typeof callId !== 'string' || metadata.kind === 'call-live') return null;
  if (row.clientMessageId !== undefined && row.clientMessageId !== callSummaryClientMessageId(callId)) return null;
  return { callId, content: row.content, metadata };
}

export type MirroredCallMessage = {
  readonly conversationId: string;
  readonly message: Prisma.MessageGetPayload<{ include: typeof CALL_SUMMARY_MESSAGE_INCLUDE }> | null;
};

/**
 * Le résumé d'un appel basculé vient d'être posé dans le groupe : le tête-à-tête
 * d'origine rend la réservation qu'il gardait pour cet appel, puis sa bulle
 * « en cours » passe au même état (`message` vaut `null` quand elle n'existe pas
 * ou est déjà terminale). `null` quand l'appel n'a pas d'origine ou que le
 * message n'est pas un résumé d'appel.
 */
export async function finishOriginConversation(
  prisma: Pick<PrismaClient, 'callSession' | 'message' | 'conversation'>,
  message: unknown
): Promise<MirroredCallMessage | null> {
  const terminal = terminalCallMessage(message);
  if (!terminal) return null;
  const call = await prisma.callSession.findUnique({ where: { id: terminal.callId }, select: { originConversationId: true } });
  const origin = call?.originConversationId;
  if (!origin) return null;
  await prisma.conversation.updateMany({ where: { id: origin, activeCallId: terminal.callId }, data: { activeCallId: null } });
  const live = await prisma.message.findFirst({
    where: { conversationId: origin, clientMessageId: callSummaryClientMessageId(terminal.callId) },
    select: { id: true, metadata: true },
  });
  if (!live || record(live.metadata)?.kind !== 'call-live') return { conversationId: origin, message: null };
  const updated = await prisma.message.update({
    where: { id: live.id },
    data: { content: terminal.content, metadata: terminal.metadata as Prisma.InputJsonValue },
    include: CALL_SUMMARY_MESSAGE_INCLUDE,
  });
  return { conversationId: origin, message: updated };
}
