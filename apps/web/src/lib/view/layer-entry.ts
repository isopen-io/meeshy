/**
 * L'ENTRÉE D'HISTORIQUE D'UNE COUCHE (#18523) — ce que `use-back-dismiss.ts`
 * pose à l'ouverture d'un menu, d'une feuille ou d'une visionneuse, et ce que
 * le routeur doit reconnaître pour ne pas l'enterrer sous une destination.
 * Sans dépendance : `lib/router.tsx` n'importe rien d'autre que React.
 */
export type LayerEntryState = { readonly backDismiss: string };

export const layerEntryState = (marker: string): LayerEntryState => ({ backDismiss: marker });

export function layerMarkerOf(state: unknown): string | null {
  if (typeof state !== 'object' || state === null) return null;
  const marker = (state as { readonly backDismiss?: unknown }).backDismiss;
  return typeof marker === 'string' ? marker : null;
}

/** L'entrée courante est-elle celle d'une couche ? Même adresse que l'écran qu'elle recouvre. */
export function onLayerEntry(): boolean {
  return typeof window !== 'undefined' && layerMarkerOf(window.history.state) !== null;
}
