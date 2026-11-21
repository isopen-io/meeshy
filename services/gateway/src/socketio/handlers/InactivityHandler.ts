/**
 * La VÉRIFICATION D'INACTIVITÉ côté socket (#18738) : aucun événement montant — une socket
 * authentifiée du téléphone suivi EST une activité. Ce module arme le balayage (une minuterie par
 * processus, un verrou Redis par passe pour qu'une flotte de passerelles ne pose ni n'alerte deux
 * fois) et note les activités que l'authentification lui remet.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { inactivityRelayDepsOf } from '../../services/inactivityCheck/inactivityDeps';
import { noteInactivityActivity, sweepInactivity, type InactivityRelayDeps } from '../../services/inactivityCheck/inactivityRelay';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { guardedInterval } from '../../utils/guarded-timer';
import type { ServerEmitIO } from '../serverEmit';

const logger = enhancedLogger.child({ module: 'InactivityHandler' });

export const INACTIVITY_SWEEP_INTERVAL_MS = 60_000;
const SWEEP_LOCK_KEY = 'inact:sweep-lock';
const SWEEP_LOCK_SECONDS = 50;

const failureMessage = (error: unknown): string => (error instanceof Error ? error.message : 'unknown');

/** Une passe du balayage, sous verrou partagé : rend `null` quand une autre passerelle la tient. */
export async function runInactivitySweep(relay: InactivityRelayDeps): Promise<number | null> {
  if (!(await relay.cache.setnx(SWEEP_LOCK_KEY, String(relay.now()), SWEEP_LOCK_SECONDS))) return null;
  return sweepInactivity(relay);
}

let sweep: NodeJS.Timeout | null = null;
let processRelay: InactivityRelayDeps | null = null;

/** Idempotent : la première socket arme la minuterie du processus, les suivantes ne font rien. */
export function ensureInactivitySweep(params: { readonly prisma: PrismaClient; readonly io: ServerEmitIO }): void {
  const relay = processRelay ?? inactivityRelayDepsOf(params);
  processRelay = relay;
  if (sweep !== null) return;
  sweep = guardedInterval({
    name: 'inactivity-sweep',
    run: () => runInactivitySweep(relay),
    everyMs: INACTIVITY_SWEEP_INTERVAL_MS,
    logger: { error: (message) => logger.error('[INACTIVITY_SWEEP] Error', { error: message }) },
  });
  sweep.unref?.();
}

export function stopInactivitySweep(): void {
  if (sweep !== null) clearInterval(sweep);
  sweep = null;
  processRelay = null;
}

/** Une ACTIVITÉ du téléphone suivi (socket authentifiée). Détachée, `.catch` posé ; sans relais armé, rien. */
export function noteInactivitySignOfActivity(params: { readonly userId: string; readonly sessionId: string | null }): void {
  const relay = processRelay;
  if (relay === null) return;
  noteInactivityActivity(relay, params).catch((error: unknown) => logger.error('[INACTIVITY_ACTIVITY] Error', { error: failureMessage(error) }));
}
