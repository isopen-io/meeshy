import type { ImageJob, ImageJobReply, ImageJobRequest } from './image-job';

/**
 * **LE CLIENT DU WORKER D'IMAGE** (#11310) — un seul worker, créé à la
 * première photo, multiplexé par identifiant, éteint après `IDLE_MS` sans
 * travail : une photo de 12 Mpx décodée coûte des dizaines de Mo, qu'on ne
 * garde pas pour rien (dimension 3).
 *
 * Sans worker (navigateur sans `OffscreenCanvas` ou `createImageBitmap` —
 * Safari avant 16.4), `run` rend `undefined` : l'appelant garde le chemin
 * d'avant (le canevas courant) ou l'original. Un worker en panne, impossible à
 * créer (CSP, origine) ou MUET (aucune réponse pendant `WATCHDOG_MS`, un
 * worker tué par le système ne lève pas toujours `error`) rend `null` à
 * chaque photo en cours — jamais une promesse pendante, jamais un envoi
 * bloqué — et le suivant est neuf.
 */

export type WorkerSignal = ImageJobReply | { readonly failed: true };

export type ImageJobWorker = {
  readonly post: (request: ImageJobRequest, transfer: readonly Transferable[]) => void;
  readonly listen: (handler: (signal: WorkerSignal) => void) => void;
  readonly terminate: () => void;
};

export type ImageJobTimers = {
  readonly set: (run: () => void, ms: number) => number;
  readonly clear: (handle: number) => void;
};

export type ImageJobClient = {
  /** Le worker est-il possible ici ? */
  readonly available: boolean;
  readonly run: (job: ImageJob) => Promise<Blob | null> | undefined;
};

export const IMAGE_JOB_IDLE_MS = 20_000;

/** Sans AUCUNE réponse pendant ce délai, le worker est tenu pour mort. Réarmé à chaque réponse : une file de dix photos n'y est pas prise. */
export const IMAGE_JOB_WATCHDOG_MS = 30_000;

type Pending = ReadonlyMap<number, (blob: Blob | null) => void>;

export function createImageJobClient(params: {
  readonly spawn: (() => ImageJobWorker) | null;
  readonly idleMs?: number;
  readonly watchdogMs?: number;
  readonly timers?: ImageJobTimers;
}): ImageJobClient {
  const { spawn } = params;
  const timers: ImageJobTimers = params.timers ?? { set: (run, ms) => Number(setTimeout(run, ms)), clear: (handle) => clearTimeout(handle) };
  let worker: ImageJobWorker | null = null;
  let pending: Pending = new Map();
  let nextId = 1;
  let idle: number | null = null;
  let watchdog: number | null = null;

  const unwatch = (): void => {
    if (watchdog !== null) timers.clear(watchdog);
    watchdog = null;
  };

  const stop = (): void => {
    unwatch();
    worker?.terminate();
    worker = null;
  };

  const settle = (id: number, blob: Blob | null): void => {
    pending.get(id)?.(blob);
    pending = new Map([...pending].filter(([key]) => key !== id));
  };

  const arm = (): void => {
    if (idle !== null) timers.clear(idle);
    idle = timers.set(() => {
      idle = null;
      if (pending.size === 0) stop();
    }, params.idleMs ?? IMAGE_JOB_IDLE_MS);
  };

  const fail = (): void => {
    const waiting = pending;
    pending = new Map();
    stop();
    waiting.forEach((resolve) => resolve(null));
  };

  const watch = (): void => {
    unwatch();
    if (pending.size > 0) watchdog = timers.set(fail, params.watchdogMs ?? IMAGE_JOB_WATCHDOG_MS);
  };

  const open = (make: () => ImageJobWorker): ImageJobWorker => {
    if (worker !== null) return worker;
    const created = make();
    created.listen((signal) => {
      if ('failed' in signal) return fail();
      settle(signal.id, signal.blob);
      watch();
      if (pending.size === 0) arm();
    });
    worker = created;
    return created;
  };

  return {
    available: spawn !== null,
    run: (job) => {
      if (spawn === null) return undefined;
      const id = nextId;
      nextId += 1;
      if (idle !== null) timers.clear(idle);
      idle = null;
      return new Promise<Blob | null>((resolve) => {
        pending = new Map([...pending, [id, resolve]]);
        try {
          open(spawn).post({ id, job }, job.input.kind === 'frame' ? [job.input.bitmap] : []);
          watch();
        } catch {
          if (job.input.kind === 'frame') job.input.bitmap.close();
          fail();
        }
      });
    },
  };
}

function browserSpawn(): (() => ImageJobWorker) | null {
  const capable = typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap === 'function';
  if (!capable) return null;
  return () => {
    const worker = new Worker(new URL('./image-job-worker.ts', import.meta.url), { type: 'module', name: 'meeshy-image-job' });
    return {
      post: (request, transfer) => worker.postMessage(request, [...transfer]),
      listen: (handler) => {
        worker.onmessage = (event: MessageEvent<ImageJobReply>) => handler(event.data);
        worker.onerror = () => handler({ failed: true });
      },
      terminate: () => worker.terminate(),
    };
  };
}

export const imageJobClient: ImageJobClient = createImageJobClient({ spawn: browserSpawn() });
