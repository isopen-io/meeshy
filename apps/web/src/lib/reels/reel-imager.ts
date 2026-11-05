import type { FeedCardModel } from '@/lib/feed/card-model';
import { gestureAudioContext, postExportSubject, type SceneExportSubject } from '@/lib/export/scene/scene-export-subject';

/**
 * « IMAGER » UN RÉEL (#16333) — la baguette du rail compose la scène du réel
 * en carte image, par le MÊME départ que l'entrée « Imager » du menu « … »
 * (`publication-menu-panel.tsx`) : le bandeau global des exports, le choix de
 * longueur au-delà d'une minute. Le contexte audio naît DANS le geste (Safari),
 * le moteur ne se charge qu'après.
 */
export type ReelImagerLauncher = (input: { readonly subject: SceneExportSubject; readonly audioContext: AudioContext | null }) => Promise<unknown>;

const browserLauncher: ReelImagerLauncher = (input) =>
  import('@/lib/export/scene/scene-export-launch').then(({ launchSceneExport }) => launchSceneExport({ ...input, mode: 'imager' }));

export function reelImager(launcher: ReelImagerLauncher = browserLauncher): (model: FeedCardModel) => void {
  return (model) => {
    const subject = postExportSubject(model);
    if (subject === null) return;
    const audioContext = gestureAudioContext();
    void launcher({ subject, audioContext }).catch(() => void audioContext?.close().catch(() => undefined));
  };
}

/** Le départ du navigateur — une référence STABLE, que la page mémoïsée du réel reçoit. */
export const imagerReel = reelImager();
