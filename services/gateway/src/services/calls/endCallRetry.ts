/**
 * L'écriture terminale de `CallService.endCall`, tenue face aux conflits
 * TRANSITOIRES (#8293).
 *
 * Un P2034 (« write conflict, please retry ») ne dit pas qu'un autre rédacteur
 * TERMINAL a gagné : au raccroché, les deux clients émettent `call:analytics`
 * dans la même milliseconde que `call:end`, et l'écriture de télémétrie sur la
 * ligne `CallParticipant` suffit à faire échouer la transaction de fin. La
 * lire comme « course perdue » laissait la session `active`, `leftAt` vide et
 * la bulle « en cours · Rejoindre » jusqu'au ramasse-miettes.
 *
 * La règle : après un P2034, RELIRE. Terminal ⇒ la course est perdue, rien ne
 * se réécrit. Encore ouvert ⇒ retenter, au plus `maxAttempts` fois, après un
 * court délai ; le conflit qui persiste remonte tel quel. Un conflit de
 * VERSION, lui, est bien la trace d'un autre rédacteur : il ne se retente pas.
 */

export type CallEndWriteResult = 'written' | 'version-conflict';

export type CallEndOutcome<T> =
  | { readonly kind: 'written' }
  | { readonly kind: 'lost'; readonly current: T };

export type CommitCallEndOptions<T> = {
  readonly write: () => Promise<CallEndWriteResult>;
  readonly readCurrent: () => Promise<T>;
  readonly isTerminal: (current: T) => boolean;
  readonly isTransientConflict: (error: unknown) => boolean;
  readonly maxAttempts?: number;
  readonly delayMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
};

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_DELAY_MS = 25;

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function commitCallEnd<T>(options: CommitCallEndOptions<T>): Promise<CallEndOutcome<T>> {
  const {
    write,
    readCurrent,
    isTerminal,
    isTransientConflict,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    delayMs = DEFAULT_DELAY_MS,
    sleep = defaultSleep
  } = options;

  const attempt = async (index: number): Promise<CallEndOutcome<T>> => {
    const result = await write().catch((error: unknown) => {
      if (!isTransientConflict(error) || index + 1 >= maxAttempts) throw error;
      return 'transient-conflict' as const;
    });
    if (result === 'written') return { kind: 'written' };
    const current = await readCurrent();
    if (result === 'version-conflict' || isTerminal(current)) return { kind: 'lost', current };
    await sleep(delayMs);
    return attempt(index + 1);
  };

  return attempt(0);
}
