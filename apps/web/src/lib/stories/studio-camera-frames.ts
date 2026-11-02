import type { CaptureFrame, FrameMood } from '@/lib/calls/frames/frame-spec';
import type { FramePerson, FrameTexts } from '@/lib/calls/frames/frame-text';

/**
 * **LA FAMILLE « CADRES » DE LA CAMÉRA DU COMPOSER** (#10190, jumelle de
 * `ComposerLookStripRule.frameItems` et de `ComposerPhotoLookRule` iOS,
 * #9295, #9329) — la photo et la vidéo prises par la caméra du composer
 * reçoivent les cadres de capture de l'appel vidéo, peints par le peintre
 * unique des cadres (`frame-studio.ts`) : rien n'est redessiné.
 *
 * Ce que la caméra propose est ce que l'atelier propose À LA CAPTURE
 * (`CAPTURE_FRAME_USES` : `canUseFrame(usage, { kind: 'capture', media })`
 * vrai pour la photo ET la vidéo, #10146), servi à deux personnes comme le
 * composer iOS (`catalogPeople = 2`) : une photo porte une personne, et la
 * géométrie d'un cadre de duo retombe en une case (« une partie des frames
 * de deux »). Chaque cadre une fois, dans l'ordre canonique des ambiances.
 * Les douze ambiances sont embarquées : rien ne se télécharge (#10184,
 * #10187).
 */

export const STUDIO_CAMERA_FRAME_PEOPLE = 2;

/** Mon identifiant de personne quand la session n'en porte pas (`ComposerPhotoLookPerson.selfId`). */
const SELF_ID = 'self';

export type StudioCameraFrameCatalog = {
  readonly moods: (people: number) => readonly FrameMood[];
  readonly framesOf: (people: number, mood: FrameMood) => readonly CaptureFrame[];
};

export function studioCameraFrames(catalog: StudioCameraFrameCatalog): readonly CaptureFrame[] {
  const all = catalog.moods(STUDIO_CAMERA_FRAME_PEOPLE).flatMap((mood) => catalog.framesOf(STUDIO_CAMERA_FRAME_PEOPLE, mood));
  return all.filter((frame, index) => all.findIndex((other) => other.id === frame.id) === index);
}

export type StudioCameraViewer = { readonly id: string | null; readonly handle: string | null; readonly displayName: string };

const filled = (value: string | null): string | null => {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
};

/** L'auteur, tel que les cadres l'écrivent — son nom d'affichage, sinon son pseudo. */
export function studioCameraAuthor(viewer: StudioCameraViewer): FramePerson {
  const handle = filled(viewer.handle);
  return { id: viewer.id ?? SELF_ID, name: filled(viewer.displayName) ?? handle ?? '', handle, isSelf: true };
}

/** Ce que le cadre écrit autour d'une prise : la date, sans nom de groupe ni accent de conversation. */
export const studioCameraTexts = (date: string): FrameTexts => ({ groupName: null, isGroup: false, date, accent: null });

/** Le fichier d'une photo encadrée : son cadre, sans point, et son heure. */
export const studioCameraFramedName = (frameId: string, at: Date): string => `photo-cadre-${frameId.replaceAll('.', '-')}-${at.toISOString().replace(/[:.]/g, '-')}.jpg`;
