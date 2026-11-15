import type { Lens } from '@meeshy/shared/types/lens-format';

import { loadLensFiles, type LensFileDeps } from '@/lib/meeshy-lens/lens-files';
import type { LensLevel } from '@/lib/meeshy-lens/lens-plan';
import type { LensSettings } from '@/lib/meeshy-lens/lens-stage';

import { callActions } from './call-actions';
import { callLensStore } from './call-lens-store';

export { callLensStore };

/**
 * **LA LENS POSÉE SUR MA VIDÉO D'APPEL** (#11994) — ce qu'une surface d'appel
 * remet au moteur : la lens LUE (`parseLens`), ses fichiers lus et décodés UNE
 * fois par l'hôte (`loadLensFiles` — la lens n'ouvre rien elle-même, contrat
 * v1), et les langues de l'ÉMETTEUR : le texte d'une lens est incrusté dans
 * la vidéo envoyée, chaque participant le voit tel que je l'ai posé.
 *
 * Le moteur la lit à chaque réglage (`engine-defaults.ts` → `camera-effects.ts`)
 * et la remet au worker dans `FrameSettings.lens`.
 */
export async function loadCallLens({
  lens,
  senderLanguages,
  level = 'full',
  files,
}: {
  readonly lens: Lens;
  readonly senderLanguages: readonly string[];
  readonly level?: LensLevel;
  readonly files: LensFileDeps<ImageBitmap>;
}): Promise<LensSettings> {
  return { lens, languages: senderLanguages, level, files: await loadLensFiles(lens, files) };
}

/** Poser une lens relâche les images de la précédente : le worker a reçu les siennes en copie. */
export function poseCallLens(settings: LensSettings | null, refresh: () => void = callActions.refreshEffects): void {
  const previous = callLensStore.getState().lens?.files;
  callLensStore.setState({ lens: settings });
  refresh();
  if (previous !== undefined && previous !== settings?.files) Object.values(previous.images).forEach((image) => image.close());
}
