/**
 * LE VALIDATEUR DE LA FENÊTRE DE MESSAGES (#19049) — `GET /conversations/:id/messages`.
 *
 * Deux régimes, choisis par le CLIENT (`X-Meeshy-Capabilities`), jamais devinés :
 *
 * | régime | validateur | un accusé de lecture seul |
 * |---|---|---|
 * | `strict` (aucune capacité — tout client publié) | ETag FORT, SHA-256 du corps entier | change l'ETag ⇒ 200 |
 * | `live-receipts` | ETag FAIBLE (`W/"…"`), corps sans `LIVE_RECEIPT_FIELDS` | ne le change pas ⇒ 304 |
 *
 * Le corps servi est le même dans les deux régimes ; seul le validateur
 * diffère. Les deux sont DISJOINTS : l'empreinte faible est salée par le nom du
 * régime, si bien qu'un validateur obtenu sous l'un ne vaut jamais 304 sous
 * l'autre — un cache qui aurait gardé une copie sous un régime et revalide sous
 * l'autre reçoit un 200. C'est ce qui dispense d'un `Vary` : avec
 * `no-cache`, aucune copie n'est resservie sans revalidation, et la
 * revalidation tranche dans le bon régime.
 *
 * Le contrat (le jeton, les champs ignorés, ce que le client doit tenir) vit
 * dans `@meeshy/shared/types/live-receipts`.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { LIVE_RECEIPTS_CAPABILITY, LIVE_RECEIPT_FIELDS } from '@meeshy/shared/types/live-receipts';

import { announcesCapability, CLIENT_CAPABILITIES } from '../../utils/client-capabilities';
import { computeETag, sendWithValidator, type ConditionalOutcome } from '../../utils/etag';

export type MessageWindowValidatorKind = 'strict' | typeof LIVE_RECEIPTS_CAPABILITY;

type MessageWindowPayload = { readonly data: readonly unknown[] };

const LIVE_RECEIPT_FIELD_SET: ReadonlySet<string> = new Set(LIVE_RECEIPT_FIELDS);

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const withoutLiveReceipts = (message: unknown): unknown =>
  isRecord(message) ? Object.fromEntries(Object.entries(message).filter(([field]) => !LIVE_RECEIPT_FIELD_SET.has(field))) : message;

export const messageWindowValidatorKind = (params: { readonly liveReceipts: boolean }): MessageWindowValidatorKind =>
  params.liveReceipts ? LIVE_RECEIPTS_CAPABILITY : 'strict';

export function messageWindowETag(payload: MessageWindowPayload, params: { readonly liveReceipts: boolean }): string {
  if (!params.liveReceipts) return computeETag(payload);
  return `W/${computeETag({ validator: LIVE_RECEIPTS_CAPABILITY, payload: { ...payload, data: payload.data.map(withoutLiveReceipts) } })}`;
}

/**
 * La revalidation de la fenêtre, telle que la route la sert : le régime se lit
 * dans `X-Meeshy-Capabilities`, l'ETag est posé (304 sans corps sur une
 * correspondance), et le résultat est rendu pour la mesure de #19049 — la part
 * de 304 par régime, dans le journal de la route.
 */
export function revalidateMessageWindow(
  request: FastifyRequest,
  reply: FastifyReply,
  payload: MessageWindowPayload
): { readonly conditional: ConditionalOutcome; readonly validator: MessageWindowValidatorKind } {
  const liveReceipts = announcesCapability(request.headers, CLIENT_CAPABILITIES.liveReceipts);
  return {
    validator: messageWindowValidatorKind({ liveReceipts }),
    conditional: sendWithValidator(request, reply, messageWindowETag(payload, { liveReceipts })),
  };
}
