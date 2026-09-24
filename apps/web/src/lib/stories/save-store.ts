import { downloadShare } from './save-progress';

/**
 * **LE JOB D'EXPORT D'UNE STORY, HORS DE REACT** (#7116) — miroir du
 * singleton `StoryPhotoSaveService` (`jobs: [storyId: Double]`,
 * `apps/ios/Meeshy/Features/Main/Services/StoryPhotoSaveService.swift:36-366`) :
 * « l'anneau doit survivre à la fermeture de la sheet et à la navigation,
 * donc l'état vit ici », jamais dans le `useState` d'un écran qui se démonte.
 *
 * `useSyncExternalStore` (même primitive que `useOnline`, `lib/net/online.ts`)
 * lit CE module directement : deux instances de `StoryActionRail` qui liraient
 * chacune leur propre `useState` désynchroniseraient l'anneau au premier
 * remontage — ce module est la SEULE source, `subscribe`/`getState` en sont
 * la porte.
 */
export type StorySaveJobView = {
  readonly progress: number;
  readonly cancellable: boolean;
};

type StorySaveJob = StorySaveJobView & { readonly controller: AbortController };

const jobs = new Map<string, StorySaveJob>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Démarre un job — **IDEMPOTENT** (`guard jobs[storyId] == nil`, `:191`) :
 * un second appel pendant qu'un job tourne déjà est IGNORÉ, et rend `null`
 * plutôt qu'un second contrôleur que personne n'annulerait.
 */
export function start(storyId: string): AbortController | null {
  if (jobs.has(storyId)) return null;
  const controller = new AbortController();
  jobs.set(storyId, { progress: 0, cancellable: true, controller });
  notify();
  return controller;
}

/** La progression BRUTE du téléchargement (0..1) — convertie en part de
 * l'anneau par `downloadShare`, jamais recopiée telle quelle. */
export function report(storyId: string, rawProgress: number): void {
  const job = jobs.get(storyId);
  if (job === undefined) return;
  jobs.set(storyId, { ...job, progress: downloadShare(rawProgress) });
  notify();
}

/** La LIVRAISON a commencé (écriture navigateur, partage de fichier) : plus
 * d'annulation possible, miroir de `isCancellable` faux dès que l'écriture
 * Photos a commencé (`:118-132`). */
export function lockDelivery(storyId: string): void {
  const job = jobs.get(storyId);
  if (job === undefined || !job.cancellable) return;
  jobs.set(storyId, { ...job, cancellable: false });
  notify();
}

/** Annule — SANS EFFET si le job n'est plus annulable (miroir `:236`) : un
 * clic sur un anneau devenu inerte n'abandonne pas une livraison en cours. */
export function cancel(storyId: string): void {
  const job = jobs.get(storyId);
  if (job === undefined || !job.cancellable) return;
  job.controller.abort();
  jobs.delete(storyId);
  notify();
}

/** Le job est terminé (succès, échec ou annulation déjà actée) — retiré,
 * l'anneau disparaît. */
export function finish(storyId: string): void {
  if (!jobs.has(storyId)) return;
  jobs.delete(storyId);
  notify();
}

export function getState(storyId: string): StorySaveJobView | null {
  const job = jobs.get(storyId);
  return job === undefined ? null : { progress: job.progress, cancellable: job.cancellable };
}
