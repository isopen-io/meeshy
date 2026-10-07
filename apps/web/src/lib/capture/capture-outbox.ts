import type { ContentCaptureKind } from '@meeshy/shared/types/content-capture-kinds';

import type { Outcome } from '@/lib/api/outcome';

/**
 * LA DÉCLARATION D'UNE CAPTURE NE SE PERD PAS (#9617, audit — même défaut
 * que celui corrigé côté iOS). Une capture a eu lieu : si sa déclaration
 * échoue (réseau, socket, coque tuée juste après, 5xx, 429), la flamme serait
 * capturée en clair sans annonce. La passerelle accepte l'annonce jusqu'à 24 h
 * après la lecture ; la déclaration est donc PERSISTÉE et rejouée avec un
 * recul exponentiel jusqu'à un verdict final (succès ou refus permanent), puis
 * retirée. Pas de double annonce : la passerelle déduplique par (acteur,
 * message, sorte). Une déclaration de plus de 24 h ne peut plus rien annoncer :
 * elle est abandonnée.
 */

export type CaptureJob = {
  readonly id: string;
  readonly conversationId: string;
  readonly messageIds: readonly string[];
  readonly kind: ContentCaptureKind;
  readonly captureId: string;
  /** Le plus récent message du fil déclaré : l'accusé de lecture part jusqu'à lui d'abord. */
  readonly readUpTo?: string;
  readonly createdAt: number;
  readonly attempts: number;
  readonly nextAt: number;
};

export type CaptureJobInput = Omit<CaptureJob, 'createdAt' | 'attempts' | 'nextAt'>;

export type CaptureOutboxStorage = {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
};

export type CaptureOutbox = {
  readonly enqueue: (jobs: readonly CaptureJobInput[]) => void;
  /** Envoie ce qui est dû ; rend quand le passage est fini. */
  readonly flush: () => Promise<void>;
  readonly pending: () => readonly CaptureJob[];
  readonly stop: () => void;
};

export const CAPTURE_JOB_LIFETIME_MS = 24 * 3_600_000;
const BASE_DELAY_MS = 2_000;
const MAX_DELAY_MS = 300_000;

export const retryDelay = (attempts: number): number => Math.min(BASE_DELAY_MS * 2 ** attempts, MAX_DELAY_MS);

const isJob = (value: unknown): value is CaptureJob => {
  if (value === null || typeof value !== 'object') return false;
  const job = value as Record<string, unknown>;
  return (
    typeof job.id === 'string' &&
    typeof job.conversationId === 'string' &&
    Array.isArray(job.messageIds) &&
    job.messageIds.every((id) => typeof id === 'string') &&
    (job.kind === 'screenshot' || job.kind === 'recording') &&
    typeof job.captureId === 'string' &&
    (job.readUpTo === undefined || typeof job.readUpTo === 'string') &&
    typeof job.createdAt === 'number' &&
    typeof job.attempts === 'number' &&
    typeof job.nextAt === 'number'
  );
};

export function createCaptureOutbox(deps: {
  readonly storage: CaptureOutboxStorage | null;
  readonly key: string;
  readonly now: () => number;
  readonly send: (job: CaptureJob) => Promise<Outcome>;
  readonly schedule: (run: () => void, ms: number) => () => void;
}): CaptureOutbox {
  const { storage, key, now, send, schedule } = deps;

  const read = (): readonly CaptureJob[] => {
    try {
      const raw = storage?.getItem(key);
      const parsed: unknown = raw === null || raw === undefined ? [] : JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(isJob) : [];
    } catch {
      return [];
    }
  };

  let jobs: readonly CaptureJob[] = read();
  let flushing: Promise<void> | null = null;
  let cancelTimer: (() => void) | null = null;
  let stopped = false;

  const write = (next: readonly CaptureJob[]) => {
    jobs = next;
    try {
      storage?.setItem(key, JSON.stringify(next));
    } catch {
      return;
    }
  };

  const replace = (id: string, next: CaptureJob | null) =>
    write(next === null ? jobs.filter((job) => job.id !== id) : jobs.map((job) => (job.id === id ? next : job)));

  const arm = () => {
    cancelTimer?.();
    cancelTimer = null;
    if (stopped || jobs.length === 0) return;
    const due = Math.min(...jobs.map((job) => job.nextAt));
    cancelTimer = schedule(() => void flush(), Math.max(0, due - now()));
  };

  const pass = async () => {
    const at = now();
    for (const job of jobs.filter((item) => item.nextAt <= at)) {
      if (at - job.createdAt > CAPTURE_JOB_LIFETIME_MS) {
        replace(job.id, null);
        continue;
      }
      const outcome = await send(job).catch((): Outcome => 'transient');
      if (outcome === 'transient') {
        replace(job.id, { ...job, attempts: job.attempts + 1, nextAt: now() + retryDelay(job.attempts) });
        continue;
      }
      replace(job.id, null);
    }
  };

  const flush = (): Promise<void> => {
    if (flushing !== null) return flushing;
    flushing = pass().finally(() => {
      flushing = null;
      arm();
    });
    return flushing;
  };

  const enqueue = (inputs: readonly CaptureJobInput[]) => {
    const at = now();
    const fresh = inputs.reduce<readonly CaptureJob[]>(
      (added, input) =>
        jobs.some((job) => job.id === input.id) || added.some((job) => job.id === input.id)
          ? added
          : [...added, { ...input, createdAt: at, attempts: 0, nextAt: at }],
      [],
    );
    write([...jobs, ...fresh]);
  };

  return {
    enqueue,
    flush,
    pending: () => jobs,
    stop: () => {
      stopped = true;
      cancelTimer?.();
      cancelTimer = null;
    },
  };
}
