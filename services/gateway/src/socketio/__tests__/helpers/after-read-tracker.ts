/**
 * Harnais partagé des témoins de `AfterReadDepartureTracker` (#18556) —
 * sorti de `AfterReadDepartureTracker.test.ts` quand ses témoins des bornes
 * (plafond de retenue, débordement des regards) sont partis dans
 * `AfterReadDepartureTracker.bornes.test.ts`, pour tenir le budget de taille
 * des suites (#4531). Aucune logique n'a changé : fabriques et horloge reçues
 * verbatim.
 */
import { jest } from '@jest/globals';
import {
  AfterReadDepartureTracker,
  AFTER_READ_RECHECK_MS,
  type AfterReadDeparture,
  type AfterReadReader,
} from '../../AfterReadDepartureTracker';

export const GRACE_MS = 30_000;
export const T0 = new Date('2026-11-14T12:00:00.000Z');
export const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

export function reader(overrides: Partial<AfterReadReader> = {}): AfterReadReader {
  return { conversationId: 'conv-1', participantId: 'p-reader', readerKey: 'u-reader', ...overrides };
}

export type Options = {
  resolve?: (socketId: string, conversationId: string) => AfterReadReader | null;
  viewedElsewhere?: (reader: AfterReadReader) => Promise<boolean>;
  isAuthenticated?: (socketId: string) => boolean;
  holdsDeparture?: (reader: AfterReadReader) => Promise<boolean>;
  onDeparture?: (departure: AfterReadDeparture) => Promise<void>;
  viewStopGraceMs?: number;
  /** L'horloge suit les faux minuteurs (`jest.useFakeTimers({ now: T0 })`) : le plafond de retenue se mesure. */
  followTimers?: boolean;
  userOf?: (socketId: string) => string | undefined;
  overflowLimits?: { perKey?: number; perReader?: number; total?: number };
};

export function buildTracker(options: Options = {}) {
  const departures: AfterReadDeparture[] = [];
  const marks: Array<{ socketId: string; conversationId: string; viewing: boolean }> = [];
  const clock = { now: T0 };
  const tracker = new AfterReadDepartureTracker({
    resolveReader: async (socketId, conversationId) =>
      options.resolve ? options.resolve(socketId, conversationId) : reader({ conversationId }),
    onDeparture: async (departure) => {
      await options.onDeparture?.(departure);
      departures.push(departure);
    },
    viewedElsewhere: options.viewedElsewhere,
    isAuthenticated: options.isAuthenticated,
    holdsDeparture: options.holdsDeparture,
    viewStopGraceMs: options.viewStopGraceMs,
    markViewing: (socketId, marked, viewing) => marks.push({ socketId, conversationId: marked.conversationId, viewing }),
    graceMs: GRACE_MS,
    now: () => (options.followTimers ? new Date(Date.now()) : clock.now),
    userOf: options.userOf,
    overflowLimits: options.overflowLimits,
  });
  return { tracker, departures, marks, clock };
}

export const settle = async () => {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
};

export const periodsOf = (departure: AfterReadDeparture) =>
  departure.periods.map((period) => [period.from.toISOString(), period.to.toISOString()]);

/** Avance les faux minuteurs par pas, en laissant les départs asynchrones se résoudre à chaque pas. */
export async function elapse(ms: number, step: number = AFTER_READ_RECHECK_MS / 4): Promise<void> {
  for (let done = 0; done < ms; done += step) {
    jest.advanceTimersByTime(Math.min(step, ms - done));
    await settle();
  }
}
