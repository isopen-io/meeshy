/**
 * Le TÉLÉPHONE INJOIGNABLE côté socket (#18737) : aucun événement montant — une socket authentifiée
 * du téléphone suivi EST le signe de vie. Ce module arme le balayage des sondes (une minuterie par
 * processus, un verrou Redis par passe pour qu'une flotte de passerelles ne sonde ni n'annonce deux
 * fois) et note les signes de vie que l'authentification et le relevé de batterie lui remettent.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { phoneReachabilityRelayDepsOf } from '../../services/phoneReachability/phoneReachabilityDeps';
import { notePhoneAlive, sweepPhoneReachability, type PhoneReachabilityRelayDeps } from '../../services/phoneReachability/phoneReachabilityRelay';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { guardedInterval } from '../../utils/guarded-timer';
import type { ServerEmitIO } from '../serverEmit';

const logger = enhancedLogger.child({ module: 'PhoneReachabilityHandler' });

export const PHONE_REACHABILITY_SWEEP_INTERVAL_MS = 60_000;
const SWEEP_LOCK_KEY = 'reach:sweep-lock';
const SWEEP_LOCK_SECONDS = 50;

const failureMessage = (error: unknown): string => (error instanceof Error ? error.message : 'unknown');

/** Une passe du balayage, sous verrou partagé : rend `null` quand une autre passerelle la tient. */
export async function runPhoneReachabilitySweep(relay: PhoneReachabilityRelayDeps): Promise<number | null> {
  if (!(await relay.cache.setnx(SWEEP_LOCK_KEY, String(relay.now()), SWEEP_LOCK_SECONDS))) return null;
  return sweepPhoneReachability(relay);
}

let sweep: NodeJS.Timeout | null = null;
let processRelay: PhoneReachabilityRelayDeps | null = null;

/** Idempotent : la première socket arme la minuterie du processus, les suivantes ne font rien. */
export function ensurePhoneReachabilitySweep(params: { readonly prisma: PrismaClient; readonly io: ServerEmitIO }): void {
  const relay = processRelay ?? phoneReachabilityRelayDepsOf(params);
  processRelay = relay;
  if (sweep !== null) return;
  sweep = guardedInterval({
    name: 'phone-reachability-sweep',
    run: () => runPhoneReachabilitySweep(relay),
    everyMs: PHONE_REACHABILITY_SWEEP_INTERVAL_MS,
    logger: { error: (message) => logger.error('[PHONE_REACHABILITY_SWEEP] Error', { error: message }) },
  });
  sweep.unref?.();
}

export function stopPhoneReachabilitySweep(): void {
  if (sweep !== null) clearInterval(sweep);
  sweep = null;
  processRelay = null;
}

/**
 * Un SIGNE DE VIE du téléphone suivi (socket authentifiée, relevé de batterie). Détaché, `.catch`
 * posé ; sans relais armé (aucune socket encore branchée sur ce processus), rien.
 */
export function notePhoneSignOfLife(params: { readonly userId: string; readonly sessionId: string | null }): void {
  const relay = processRelay;
  if (relay === null) return;
  notePhoneAlive(relay, params).catch((error: unknown) => logger.error('[PHONE_ALIVE] Error', { error: failureMessage(error) }));
}
