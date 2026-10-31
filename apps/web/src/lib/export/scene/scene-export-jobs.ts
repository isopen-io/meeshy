import type { ImagerLengthChoice, ImagerQuarter } from './scene-export-length';

/**
 * **LES EXPORTS EN COURS, HORS DE REACT** (#13873) — l'état que le bandeau
 * global (`SceneExportTray`, monté une fois dans le chrome différé) lit : un
 * export tourne pendant que l'utilisateur continue d'utiliser l'app, il se
 * suit et s'annule de n'importe quel écran, et son issue se dit une fois.
 *
 * Miroir du store des stories (`lib/stories/save-store.ts`) : une poignée par
 * job, dont l'`AbortController` est l'identité ; un second départ sur la même
 * publication est refusé tant que le premier tourne. Le choix de longueur
 * d'« Imager » (1/4 · 2/4 · 3/4 · 4/4) vit ici aussi : le job ATTEND la
 * réponse du bandeau.
 */

export type SceneExportNotice = 'saved' | 'cancelled' | 'failed' | 'retry' | 'unsupported' | 'offline' | 'busy';

export type SceneExportJobView = {
  readonly key: string;
  /** 0..1 ; `null` tant que rien ne s'est mesuré (préparation). */
  readonly progress: number | null;
  readonly cancellable: boolean;
  /** Les parts offertes par « Imager », en attente d'une réponse — `null` sinon. */
  readonly choosing: readonly ImagerLengthChoice[] | null;
};

export type SceneExportJobsState = {
  readonly jobs: readonly SceneExportJobView[];
  readonly notice: { readonly id: number; readonly notice: SceneExportNotice } | null;
};

export type SceneExportJobHandle = {
  readonly signal: AbortSignal;
  readonly report: (progress: number | null) => void;
  readonly lockDelivery: () => void;
  readonly chooseLength: (choices: readonly ImagerLengthChoice[]) => Promise<ImagerQuarter | null>;
  readonly finish: () => void;
};

type Job = { readonly view: SceneExportJobView; readonly controller: AbortController; readonly answer: ((quarter: ImagerQuarter | null) => void) | null };

const jobs = new Map<string, Job>();
const listeners = new Set<() => void>();
let snapshot: SceneExportJobsState = { jobs: [], notice: null };
let noticeId = 0;

function publish(notice: SceneExportJobsState['notice'] = snapshot.notice): void {
  snapshot = { jobs: [...jobs.values()].map((job) => job.view), notice };
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const getSnapshot = (): SceneExportJobsState => snapshot;

const percent = (progress: number | null): number | null => (progress === null ? null : Math.round(Math.min(1, Math.max(0, progress)) * 100));

function update(key: string, controller: AbortController, next: (job: Job) => Job): void {
  const job = jobs.get(key);
  if (job === undefined || job.controller !== controller) return;
  const updated = next(job);
  const same =
    updated.view.cancellable === job.view.cancellable && updated.view.choosing === job.view.choosing && percent(updated.view.progress) === percent(job.view.progress);
  jobs.set(key, updated);
  if (!same) publish();
}

export function start(key: string): SceneExportJobHandle | null {
  if (jobs.has(key)) return null;
  const controller = new AbortController();
  jobs.set(key, { view: { key, progress: null, cancellable: true, choosing: null }, controller, answer: null });
  publish();
  return {
    signal: controller.signal,
    report: (progress) => update(key, controller, (job) => ({ ...job, view: { ...job.view, progress } })),
    lockDelivery: () => update(key, controller, (job) => ({ ...job, view: { ...job.view, progress: 1, cancellable: false } })),
    chooseLength: (choices) =>
      new Promise((resolve) => {
        if (controller.signal.aborted || jobs.get(key)?.controller !== controller) {
          resolve(null);
          return;
        }
        update(key, controller, (job) => ({ ...job, view: { ...job.view, choosing: choices }, answer: resolve }));
      }),
    finish: () => {
      if (jobs.get(key)?.controller !== controller) return;
      jobs.delete(key);
      publish();
    },
  };
}

/** La part choisie (ou `null` : l'utilisateur renonce) — le job reprend. */
export function choose(key: string, quarter: ImagerQuarter | null): void {
  const job = jobs.get(key);
  if (job === undefined || job.answer === null) return;
  const answer = job.answer;
  jobs.set(key, { ...job, view: { ...job.view, choosing: null }, answer: null });
  publish();
  answer(quarter);
}

/** Annule — sans effet une fois la livraison commencée. */
export function cancel(key: string): void {
  const job = jobs.get(key);
  if (job === undefined || !job.view.cancellable) return;
  job.controller.abort();
  job.answer?.(null);
  jobs.delete(key);
  publish();
}

export function announce(notice: SceneExportNotice): void {
  noticeId += 1;
  publish({ id: noticeId, notice });
}

export function dismissNotice(id: number): void {
  if (snapshot.notice?.id === id) publish(null);
}
