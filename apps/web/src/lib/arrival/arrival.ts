/**
 * L'ARRIVÉE PAR LE LIEN DE VALIDATION (#8088, demande porteur 2026-09-26) —
 * le lien de l'e-mail ouvre la session : l'écran le CÉLÈBRE pendant que les
 * premières données réelles se préchargent, puis mène aux conversations.
 *
 * Deux bornes, et ce module n'est que leur loi :
 *  - un MINIMUM (~1,5 s) — la célébration se voit, même quand le cache se
 *    remplit en 200 ms ;
 *  - un PLAFOND (~4 s) — un préchargement lent ne retient JAMAIS
 *    l'utilisateur : il continue en arrière-plan, l'écran suivant le recevra.
 *
 * Aucun module lourd ici : ce fichier vit dans le chunk de la page d'arrivée.
 * Le préchargement (`prefetch.ts`) et le feu d'artifice
 * (`components/arrival-fireworks.tsx`) se chargent à la demande.
 */

export const ARRIVAL_MIN_MS = 1_500;
export const ARRIVAL_MAX_MS = 4_000;

export type ArrivalDeps = {
  /** Précharge les premières données — ne doit jamais retenir l'arrivée au-delà du plafond. */
  readonly prefetch: () => Promise<unknown>;
  readonly wait: (ms: number) => Promise<void>;
  readonly reducedMotion: () => boolean;
};

/** Résolue quand l'arrivée peut naviguer : minimum joué ET préchargement fini, ou plafond atteint. */
export function arrivalReady(prefetch: Promise<unknown>, wait: ArrivalDeps['wait']): Promise<void> {
  const warmed = prefetch.then(
    () => undefined,
    () => undefined,
  );
  return Promise.race([Promise.all([wait(ARRIVAL_MIN_MS), warmed]), wait(ARRIVAL_MAX_MS)]).then(() => undefined);
}
