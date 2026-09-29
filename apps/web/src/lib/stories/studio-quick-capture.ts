import type { InterfaceCatalogKey } from '@/lib/i18n-catalog';
import type { PublicationKind } from '@/lib/stories/publication-kind';

/**
 * **LA CAPTURE RAPIDE SUR UNE SCÈNE VIDE** (#8654, jumelle web de
 * `ComposerSceneQuickCapture` iOS, #8653 — directive porteur 2026-09-29) :
 *
 * > « Lorsque la scène est vide mettre en gris le fait de prendre une photo ou
 * > vidéo rapidement — par tap simple ça ouvre et prend la photo, longpress
 * > ouvre et lance la vidéo ! »
 *
 * Chaque geste porte UNE intention, et l'indication grise de la scène vide
 * les nomme. Le geste n'existe que là où il a un sens : une scène sans rien de
 * posé, aucun outil ni frise ouverts, hors retouche et hors envoi.
 */
export function quickCaptureOffered({
  pageBlank,
  toolOpen,
  timelineOpen,
  retouching,
  locked,
  cameraOpen,
}: {
  readonly pageBlank: boolean;
  readonly toolOpen: boolean;
  readonly timelineOpen: boolean;
  readonly retouching: boolean;
  readonly locked: boolean;
  readonly cameraOpen: boolean;
}): boolean {
  return pageBlank && !toolOpen && !timelineOpen && !retouching && !locked && !cameraOpen;
}

/** `photo` : la caméra s'ouvre ET prend la photo dès qu'elle voit. `arm` : un
 * réel attend du mouvement — elle s'ouvre, rien n'est pris (une image dans un
 * format vidéo serait une faute plus grave qu'un geste de plus). */
export type QuickCaptureTap = 'photo' | 'arm';

export function quickCaptureTap(kind: PublicationKind): QuickCaptureTap {
  return kind === 'REEL' ? 'arm' : 'photo';
}

/**
 * **UN GESTE, UNE LIGNE, SON ICÔNE** (#8672, retour porteur 2026-09-29) :
 * « L'instruction de taper photo peut avoir l'appareil photo au-devant, et à
 * la ligne une caméra vidéo pour la partie long press pour filmer. » Un réel
 * n'offre que la seconde.
 */
export type QuickCaptureHintLine = {
  readonly glyph: 'camera' | 'video';
  readonly key: Extract<InterfaceCatalogKey, 'story.studio.camera.quick.tapPhoto' | 'story.studio.camera.quick.holdFilm' | 'story.studio.camera.quick.videoOnly'>;
};

const PHOTO_AND_FILM: readonly QuickCaptureHintLine[] = [
  { glyph: 'camera', key: 'story.studio.camera.quick.tapPhoto' },
  { glyph: 'video', key: 'story.studio.camera.quick.holdFilm' },
];
const FILM_ONLY: readonly QuickCaptureHintLine[] = [{ glyph: 'video', key: 'story.studio.camera.quick.videoOnly' }];

export function quickCaptureHintLines(kind: PublicationKind): readonly QuickCaptureHintLine[] {
  return quickCaptureTap(kind) === 'photo' ? PHOTO_AND_FILM : FILM_ONLY;
}

/** Relâcher l'appui long : clore la prise, ou — la caméra ne filmait pas
 * encore — ne rien prendre (jamais une photo que personne n'a demandée). */
export function quickCaptureRelease({ recording }: { readonly recording: boolean }): 'close-take' | 'cancel-pending' {
  return recording ? 'close-take' : 'cancel-pending';
}

export type CameraFacing = 'user' | 'environment';

/**
 * **LE FLASH FAIT VRAIMENT DE LA LUMIÈRE.** Caméra avant : aucune LED ne
 * l'éclaire — le sol de l'écran devient BLANC brillant (et la luminosité
 * monte au maximum quand la coque le sert). Caméra arrière : la torche, quand
 * le matériel l'expose (`MediaTrackCapabilities.torch`) ; sinon le même sol
 * blanc, plutôt qu'un bouton qui ne ferait rien.
 */
export function cameraFlashPlan({
  flash,
  facing,
  torch,
}: {
  readonly flash: boolean;
  readonly facing: CameraFacing;
  readonly torch: boolean;
}): 'off' | 'torch' | 'screen' {
  if (!flash) return 'off';
  return facing === 'environment' && torch ? 'torch' : 'screen';
}

/** Les conteneurs que la passerelle accepte (`ACCEPTED_MIME_TYPES.VIDEO`),
 * dans l'ordre : mp4 (WebKit, lu partout), puis webm (Chromium, Android). */
const VIDEO_CANDIDATES = ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'] as const;

export function cameraVideoMime(isTypeSupported: (type: string) => boolean): string | undefined {
  return VIDEO_CANDIDATES.find((candidate) => isTypeSupported(candidate));
}
