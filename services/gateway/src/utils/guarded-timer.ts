/**
 * La minuterie GARDÉE — la seule forme admise d'un rappel de minuterie dans la
 * passerelle (#9480, cliquet `timer-callback-guard-sweep`).
 *
 * La pile d'un rappel de `setInterval` / `setTimeout` part de la boucle
 * d'événements, pas du site qui l'a armé : aucun `try/catch` englobant n'existe
 * à invoquer. Une levée SYNCHRONE y devient une exception non interceptée, un
 * REJET y devient un rejet non géré — et sous Node 22 les deux terminent le
 * processus, toute la passerelle tombée pour un entretien best-effort (#9474).
 *
 * La garde vit ici, une fois : elle attrape les deux formes, les dit au journal
 * du service sous le nom du canal, et laisse battre l'intervalle — le battement
 * SUIVANT a lieu, sans quoi on échangerait une panne bruyante contre une panne
 * muette.
 */

export type TimerErrorLogger = {
  error: (message: string, context?: Record<string, unknown>) => void;
};

export type GuardedIntervalOptions = {
  readonly name: string;
  readonly run: () => unknown;
  readonly everyMs: number;
  readonly logger: TimerErrorLogger;
};

export type GuardedTimeoutOptions = {
  readonly name: string;
  readonly run: () => unknown;
  readonly afterMs: number;
  readonly logger: TimerErrorLogger;
};

const describeError = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { then?: unknown }).then === 'function';

const guard = (name: string, run: () => unknown, logger: TimerErrorLogger) => (): void => {
  const report = (error: unknown): void => {
    logger.error(`[timer:${name}] callback failed`, {
      timer: name,
      error: describeError(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  };
  try {
    const result = run();
    if (isThenable(result)) {
      Promise.resolve(result).catch(report);
    }
  } catch (error) {
    report(error);
  }
};

export const guardedInterval = ({ name, run, everyMs, logger }: GuardedIntervalOptions): NodeJS.Timeout =>
  setInterval(guard(name, run, logger), everyMs);

export const guardedTimeout = ({ name, run, afterMs, logger }: GuardedTimeoutOptions): NodeJS.Timeout =>
  setTimeout(guard(name, run, logger), afterMs);
