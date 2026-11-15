/**
 * Le REFUS d'un geste au-delà de sa limite quotidienne (#9584), servi à
 * l'identique par REST et par socket : `code` stable (`DAILY_COMMENT_LIMIT`,
 * `DAILY_REACTION_LIMIT`), `resetAt` — minuit du jour civil du compte, dans son
 * fuseau —, `retryAfter` en secondes et la `limit` atteinte. Le client compose
 * sa phrase dans la langue d'interface depuis le code ; le texte servi n'est
 * qu'un repli.
 */

import type { FastifyReply } from 'fastify';
import type { DailyGestureLimitReached } from '../services/engagement/DailyGestureGate';
import { sendError } from './response';

export function refuseDailyGesture(reply: FastifyReply, refusal: DailyGestureLimitReached, now: Date = new Date()): void {
  const details = refusal.details(now);
  reply.header('Retry-After', String(details.retryAfter));
  sendError(reply, 429, refusal.message, { code: refusal.code, details });
}

export function dailyGestureAck(refusal: DailyGestureLimitReached, now: Date = new Date()): {
  readonly success: false;
  readonly error: string;
  readonly code: string;
  readonly retryAfter: number;
  readonly resetAt: string;
  readonly limit: number;
} {
  const { retryAfter, resetAt, limit } = refusal.details(now);
  return { success: false, error: refusal.message, code: refusal.code, retryAfter, resetAt, limit };
}
