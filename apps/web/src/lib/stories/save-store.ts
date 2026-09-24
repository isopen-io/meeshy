import { percent } from './save-progress';

/**
 * **LE JOB D'EXPORT D'UNE STORY, HORS DE REACT** (#7116) — miroir du
 * singleton `StoryPhotoSaveService` (`jobs: [storyId: Double]`,
 * `generations`, `apps/ios/Meeshy/Features/Main/Services/StoryPhotoSaveService.swift:36-366`) :
 * « l'anneau doit survivre à la fermeture de la sheet et à la navigation,
 * donc l'état vit ici », jamais dans le `useState` d'un écran qui se démonte.
 *
 * **LA SEULE SOURCE DE L'ANNEAU** (revue #7116). L'hôte la lit par
 * `useSyncExternalStore` (même primitive que `useOnline`, `lib/net/online.ts`)
 * avec la clé de la story AFFICHÉE : revenir sur une story dont l'export
 * tourne rend son anneau, et le job d'une story ne se peint jamais sur une
 * autre. `getState` rend un instantané STABLE (la même référence tant que
 * rien ne change) — une copie neuve à chaque lecture ferait boucler
 * `useSyncExternalStore`.
 *
 * **LA PROGRESSION EST BRUTE** (0..1 du téléchargement ; `null` quand le flux
 * n'annonce pas sa longueur — le cas NOMINAL de la passerelle, qui sert
 * l'export par `createReadStream`, `media-export.ts:178-181`). La part de
 * l'anneau (`downloadShare`, 0…0,9) est calculée par le RENDU, une seule
 * fois (`lib/stories/save-progress.ts`).
 *
 * **UNE POIGNÉE PAR GÉNÉRATION.** `start` rend la poignée du job qu'il crée ;
 * `report`/`lockDelivery`/`finish` n'agissent que tant que CE job est celui
 * du store. Sans elle, un export annulé puis relancé voyait le `finish`
 * tardif du premier retirer le second — la raison d'être des `generations`
 * iOS. Aucun jeton de plus n'est nécessaire : l'`AbortController` du job EST
 * son identité, et il coupe VRAIMENT le flux (contrairement à un
 * `AVAssetWriter`).
 */
export type StorySaveJobView = {
  readonly progress: number | null;
  readonly cancellable: boolean;
};

export type StorySaveJobHandle = {
  readonly signal: AbortSignal;
  readonly report: (rawProgress: number | null) => void;
  readonly lockDelivery: () => void;
  readonly finish: () => void;
};

type StorySaveJob = { readonly view: StorySaveJobView; readonly controller: AbortController };

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

/** Le CHIFFRE que l'anneau peindrait — une mise à jour qui ne le change pas
 * ne mérite aucun rendu (un flux de 10 Mo arrive en ~160 paquets). */
const ringFigure = (progress: number | null): number | null => (progress === null ? null : percent(progress));

function update(storyId: string, controller: AbortController, next: (view: StorySaveJobView) => StorySaveJobView): void {
  const job = jobs.get(storyId);
  if (job === undefined || job.controller !== controller) return;
  const view = next(job.view);
  if (view.cancellable === job.view.cancellable && ringFigure(view.progress) === ringFigure(job.view.progress)) return;
  jobs.set(storyId, { view, controller });
  notify();
}

/**
 * Démarre un job — **IDEMPOTENT** (`guard jobs[storyId] == nil`, `:191`) :
 * un second appel pendant qu'un job tourne déjà rend `null`, jamais une
 * seconde poignée que personne n'annulerait.
 *
 * Le job naît INDÉTERMINÉ (`progress: null`) : tant que la réponse n'a pas
 * dit sa longueur, rien ne permet d'afficher un pour-cent — un « 0 » figé
 * pendant l'aller-retour se lisait « rien ne se passe » (mesuré à la
 * capture, requête retenue).
 */
export function start(storyId: string): StorySaveJobHandle | null {
  if (jobs.has(storyId)) return null;
  const controller = new AbortController();
  jobs.set(storyId, { view: { progress: null, cancellable: true }, controller });
  notify();
  return {
    signal: controller.signal,
    report: (rawProgress) => update(storyId, controller, (view) => ({ ...view, progress: rawProgress })),
    /* La LIVRAISON commence (écriture navigateur, partage de fichier) : le
       téléchargement est plein, et l'annulation n'est plus possible — miroir
       de `isCancellable` faux dès que l'écriture Photos a commencé. */
    lockDelivery: () => update(storyId, controller, () => ({ progress: 1, cancellable: false })),
    finish: () => {
      if (jobs.get(storyId)?.controller !== controller) return;
      jobs.delete(storyId);
      notify();
    },
  };
}

/** Annule — SANS EFFET si la livraison a commencé (miroir `:236`) : un clic
 * sur un anneau devenu inerte n'abandonne pas une livraison en cours. */
export function cancel(storyId: string): void {
  const job = jobs.get(storyId);
  if (job === undefined || !job.view.cancellable) return;
  job.controller.abort();
  jobs.delete(storyId);
  notify();
}

export function getState(storyId: string): StorySaveJobView | null {
  return jobs.get(storyId)?.view ?? null;
}
