/**
 * LA VÉRIFICATION D'INACTIVITÉ — la fonction PURE qui décide, activité après activité et balayage
 * après balayage, quand demander « Tout va bien ? » et quand prévenir les Sangs (#18738).
 * Aucun délai n'est écrit ici : tout vient de `InactivityCheckConfig` et du réglage de la personne.
 */
import {
  INACTIVITY_CHECK_CONFIG,
  type InactivityAnnouncement,
  type InactivityCheckConfig,
} from '../types/inactivity-check.js';

export type InactivityPhase = 'idle' | 'asked' | 'alerted';

export type InactivityCheckRecord = {
  readonly lastActivityAt: string | null;
  readonly phase: InactivityPhase;
  readonly askedAt: string | null;
};

export const INITIAL_INACTIVITY_CHECK: InactivityCheckRecord = { lastActivityAt: null, phase: 'idle', askedAt: null };

export type InactivityCheckInput =
  | { readonly kind: 'activity'; readonly at: string }
  /** `delayHours` nul : la personne a coupé la vérification. */
  | { readonly kind: 'tick'; readonly now: string; readonly delayHours: number | null };

export type InactivityCheckStepResult = {
  readonly state: InactivityCheckRecord;
  /** Poser la question « Tout va bien ? » maintenant. */
  readonly ask: boolean;
  readonly announcement?: InactivityAnnouncement;
};

const MINUTE_MS = 60_000;
const ms = (iso: string): number => Date.parse(iso);
const elapsed = (from: string, now: string, minutes: number): boolean => ms(now) - ms(from) >= minutes * MINUTE_MS;

const stepActivity = (state: InactivityCheckRecord, at: string): InactivityCheckStepResult => {
  if (state.lastActivityAt !== null && ms(at) < ms(state.lastActivityAt)) return { state, ask: false };
  const next: InactivityCheckRecord = { lastActivityAt: at, phase: 'idle', askedAt: null };
  return state.phase === 'alerted' && state.lastActivityAt !== null
    ? { state: next, ask: false, announcement: { kind: 'responded', inactiveSince: state.lastActivityAt, at } }
    : { state: next, ask: false };
};

const stepTick = (state: InactivityCheckRecord, input: { readonly now: string; readonly delayHours: number | null }, config: InactivityCheckConfig): InactivityCheckStepResult => {
  const idle: InactivityCheckStepResult = { state, ask: false };
  if (state.lastActivityAt === null) return idle;
  if (state.phase === 'idle') {
    if (input.delayHours === null || !elapsed(state.lastActivityAt, input.now, input.delayHours * 60)) return idle;
    return { state: { ...state, phase: 'asked', askedAt: input.now }, ask: true };
  }
  if (state.phase === 'asked' && state.askedAt !== null && elapsed(state.askedAt, input.now, config.answerWindowMinutes)) {
    return {
      state: { ...state, phase: 'alerted' },
      ask: false,
      announcement: { kind: 'alert', inactiveSince: state.lastActivityAt, at: input.now },
    };
  }
  return idle;
};

export const inactivityCheckStep = (
  previous: InactivityCheckRecord | null,
  input: InactivityCheckInput,
  config: InactivityCheckConfig = INACTIVITY_CHECK_CONFIG,
): InactivityCheckStepResult => {
  const state = previous ?? INITIAL_INACTIVITY_CHECK;
  return input.kind === 'activity' ? stepActivity(state, input.at) : stepTick(state, input, config);
};
