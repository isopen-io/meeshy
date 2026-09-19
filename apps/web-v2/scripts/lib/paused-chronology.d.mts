/**
 * Les types du module voisin — même motif que `await-fact.d.mts` : plusieurs
 * runtimes consomment le `.mjs`, seul `tsc` lit ces déclarations.
 */

export declare const CHRONOLOGY_STEP_MS: 50;

type PausableClockPage = {
  clock: {
    install(options: { time: number | Date }): Promise<void>;
    pauseAt(time: number | Date): Promise<void>;
    runFor(ticks: number): Promise<void>;
  };
};

export type Chronology = {
  readonly now: () => number;
  readonly mark: () => number;
  readonly advanceTo: (targetMs: number) => Promise<void>;
  readonly advanceBy: (durationMs: number) => Promise<void>;
  readonly factBefore: (beforeMs: number, fact: () => boolean | Promise<boolean>) => Promise<boolean>;
};

export declare function pausedChronology(
  page: PausableClockPage,
  options: { time: number | Date; stepMs?: number },
): Promise<Chronology>;
