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

/**
 * **LA PHOTO EN DEUX TEMPS** (#8715, jumelle de #8711 — directive porteur
 * 2026-09-29 : « le premier tap arme et affiche avec les contrôleurs (flash,
 * changement d'optique) habituels, second tap n'importe où sur la scène prend
 * la photo »). Le premier toucher ARME le viseur, quel que soit le format :
 * rien n'est pris. Elle supplante le « un toucher ouvre et prend » de #8654 —
 * une photo prise avant que l'auteur voie son cadre et règle son flash est un
 * cliché qu'il n'a pas composé.
 *
 * **Le second toucher, sur le viseur armé** : la photo ne part que d'un
 * viseur qui VOIT, rien en cours, dans un format qui la sert (un réel filme).
 */
export function quickCaptureArmedTap({
  live,
  recording,
  busy,
  kind,
}: {
  readonly live: boolean;
  readonly recording: boolean;
  readonly busy: boolean;
  readonly kind: PublicationKind;
}): 'take-photo' | 'ignore' {
  return live && !recording && !busy && kind !== 'REEL' ? 'take-photo' : 'ignore';
}

/**
 * **UN GESTE, UNE LIGNE, SON ICÔNE** (#8672) — la photo a DEUX lignes depuis
 * #8711 (toucher arme, toucher encore prend), la vidéo une. Un réel n'offre
 * que la vidéo.
 */
export type QuickCaptureHintLine = {
  readonly glyph: 'viewfinder' | 'camera' | 'video';
  readonly key: Extract<
    InterfaceCatalogKey,
    'story.studio.camera.quick.tapArm' | 'story.studio.camera.quick.tapAgain' | 'story.studio.camera.quick.holdFilm' | 'story.studio.camera.quick.videoOnly'
  >;
};

const PHOTO_AND_FILM: readonly QuickCaptureHintLine[] = [
  { glyph: 'viewfinder', key: 'story.studio.camera.quick.tapArm' },
  { glyph: 'camera', key: 'story.studio.camera.quick.tapAgain' },
  { glyph: 'video', key: 'story.studio.camera.quick.holdFilm' },
];
const FILM_ONLY: readonly QuickCaptureHintLine[] = [{ glyph: 'video', key: 'story.studio.camera.quick.videoOnly' }];

export function quickCaptureHintLines(kind: PublicationKind): readonly QuickCaptureHintLine[] {
  return kind === 'REEL' ? FILM_ONLY : PHOTO_AND_FILM;
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
