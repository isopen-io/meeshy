/**
 * LA JOIGNABILITÉ DU TÉLÉPHONE — la fonction PURE qui décide, signe de vie après signe de vie
 * et balayage après balayage, quand sonder le téléphone et quand le déclarer injoignable (#18737).
 *
 * La passerelle la fait tourner (relais `phoneReachability`). Aucun délai n'est écrit ici : tout
 * vient de `PhoneReachabilityConfig` (`PHONE_REACHABILITY_CONFIG`).
 */
import type { PhoneReachabilityAnnouncement } from '../types/phone-reachability.js';
import {
  PHONE_REACHABILITY_CONFIG,
  type PhoneReachabilityAnnouncementKind,
  type PhoneReachabilityConfig,
  type PhoneReachabilityReaderChannel,
  type PhoneUnreachableCause,
} from '../types/phone-reachability-constants.js';

/** L'état d'UN émetteur, rangé côté serveur (Redis, TTL court, aucun historique). */
export type PhoneReachabilityRecord = {
  /** Le dernier signe de vie du téléphone suivi ; nul tant qu'aucun n'est connu. */
  readonly lastSeenAt: string | null;
  readonly probesSent: number;
  readonly lastProbeAt: string | null;
  /** La dernière RÉPONSE à une sonde : la sonde suivante s'espace depuis elle. */
  readonly lastAnsweredAt: string | null;
  readonly unreachableSince: string | null;
  readonly cause: PhoneUnreachableCause | null;
};

export const INITIAL_PHONE_REACHABILITY: PhoneReachabilityRecord = {
  lastSeenAt: null,
  probesSent: 0,
  lastProbeAt: null,
  lastAnsweredAt: null,
  unreachableSince: null,
  cause: null,
};

export type PhoneReachabilityInput =
  /** Un signe de vie ; `answer` quand c'est la réponse à une sonde. */
  | { readonly kind: 'alive'; readonly at: string; readonly answer?: boolean }
  /** Un balayage ; `batteryLow` quand le dernier épisode de batterie était critique ou éteint. */
  | { readonly kind: 'tick'; readonly now: string; readonly batteryLow: boolean };

export type PhoneReachabilityStepResult = {
  readonly state: PhoneReachabilityRecord;
  /** Envoyer une sonde silencieuse maintenant. */
  readonly probe: boolean;
  readonly announcement?: PhoneReachabilityAnnouncement;
};

const MINUTE_MS = 60_000;
const ms = (iso: string): number => Date.parse(iso);
const elapsed = (from: string, now: string, minutes: number): boolean => ms(now) - ms(from) >= minutes * MINUTE_MS;

const stepAlive = (state: PhoneReachabilityRecord, input: { readonly at: string; readonly answer?: boolean }): PhoneReachabilityStepResult => {
  const newer = state.lastSeenAt === null || ms(input.at) >= ms(state.lastSeenAt);
  const lastAnsweredAt = input.answer === true ? input.at : state.lastAnsweredAt;
  if (!newer) return { state: { ...state, lastAnsweredAt }, probe: false };
  const next: PhoneReachabilityRecord = { ...state, lastSeenAt: input.at, probesSent: 0, lastProbeAt: null, lastAnsweredAt, unreachableSince: null, cause: null };
  return state.unreachableSince === null
    ? { state: next, probe: false }
    : { state: next, probe: false, announcement: { kind: 'reachable', at: input.at } };
};

const cycleOpen = (state: PhoneReachabilityRecord, lastSeenAt: string, now: string, config: PhoneReachabilityConfig): boolean =>
  elapsed(lastSeenAt, now, config.quietMinutes) && (state.lastAnsweredAt === null || elapsed(state.lastAnsweredAt, now, config.reprobeAfterMinutes));

/**
 * Un téléphone qui n'a JAMAIS répondu à une sonde n'est pas déclaré : une version antérieure aux
 * sondes les ignore, et la déclarer injoignable serait faux à chaque mise en poche. Il est re-sondé
 * une fois par `reprobeAfterMinutes` ; sa première réponse le rend éligible.
 */
const stepUnproven = (state: PhoneReachabilityRecord, now: string, config: PhoneReachabilityConfig): PhoneReachabilityStepResult =>
  state.lastProbeAt !== null && elapsed(state.lastProbeAt, now, config.reprobeAfterMinutes)
    ? { state: { ...state, probesSent: 1, lastProbeAt: now }, probe: true }
    : { state, probe: false };

const stepTick = (state: PhoneReachabilityRecord, input: { readonly now: string; readonly batteryLow: boolean }, config: PhoneReachabilityConfig): PhoneReachabilityStepResult => {
  const idle: PhoneReachabilityStepResult = { state, probe: false };
  if (state.lastSeenAt === null || state.unreachableSince !== null) return idle;
  if (state.probesSent === 0) {
    return cycleOpen(state, state.lastSeenAt, input.now, config) ? { state: { ...state, probesSent: 1, lastProbeAt: input.now }, probe: true } : idle;
  }
  if (state.lastProbeAt === null || !elapsed(state.lastProbeAt, input.now, config.probeTimeoutMinutes)) return idle;
  if (state.probesSent < config.probesBeforeUnreachable) {
    return { state: { ...state, probesSent: state.probesSent + 1, lastProbeAt: input.now }, probe: true };
  }
  if (state.lastAnsweredAt === null) return stepUnproven(state, input.now, config);
  return {
    state: { ...state, unreachableSince: state.lastSeenAt, cause: input.batteryLow ? 'battery' : 'network' },
    probe: false,
    announcement: { kind: 'unreachable', at: input.now },
  };
};

export const phoneReachabilityStep = (
  previous: PhoneReachabilityRecord | null,
  input: PhoneReachabilityInput,
  config: PhoneReachabilityConfig = PHONE_REACHABILITY_CONFIG,
): PhoneReachabilityStepResult => {
  const state = previous ?? INITIAL_PHONE_REACHABILITY;
  return input.kind === 'alive' ? stepAlive(state, input) : stepTick(state, input, config);
};

/**
 * Le canal d'UNE annonce pour UN lecteur. L'injoignabilité change l'attente de l'autre : elle
 * part en SyncPill quand il est en conversation avec l'émetteur, en push sinon. Le retour n'est
 * poussé qu'à qui a reçu le push d'injoignabilité ; en conversation il passe en SyncPill, sinon
 * l'état s'efface en silence.
 */
export const phoneReachabilityReaderChannel = (params: {
  readonly kind: PhoneReachabilityAnnouncementKind;
  readonly inConversation: boolean;
  readonly receivedUnreachablePush: boolean;
}): PhoneReachabilityReaderChannel => {
  if (params.kind === 'unreachable') return params.inConversation ? 'socket' : 'push';
  if (params.receivedUnreachablePush) return 'push';
  return params.inConversation ? 'socket' : 'none';
};
