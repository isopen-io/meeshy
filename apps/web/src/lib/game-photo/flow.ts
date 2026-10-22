import {
  applyFormatChange,
  applyFrameChange,
  applySaved,
  applySaveFailed,
  beginTake,
  type CaptureFormat,
  type CaptureZone,
  type FrameChoice,
  type TakeSaveState,
} from '@meeshy/shared/utils/capture/capture-save';

import type { CameraFailure } from './camera';
import type { NotebookMode } from './notebook';
import type { ShareOutcome } from './share';

/**
 * LE DÉROULÉ DE LA PHOTO (#9382) — un réducteur PUR (conception, partie VI) :
 * proposition → caméra → frappe en place → résultat. L'écran lui envoie des
 * événements et lit l'étape ; il ne peut pas produire une étape impossible
 * (déclencher une caméra qui n'est pas vivante, partager avant d'avoir
 * composé) : l'événement hors de son étape est ignoré.
 *
 * Le refus de la caméra n'est pas une impasse : sa raison est NOMMÉE dans
 * l'état, et la galerie comme la carte seule restent possibles depuis tous ses
 * états.
 *
 * LE CADRE EST LE DÉCLENCHEUR (#10284) : la prise retient la ZONE qui l'a
 * déclenchée — la case du cadre (`frame`) ou la scène (`outside`) ; une photo
 * importée et la carte seule sont hors cadre. Le résultat porte l'état
 * d'enregistrement de la loi partagée (`capture-save`) : une prise par le
 * cadre y arrive déjà en galerie avec ce cadre, au format de la prise ;
 * « Enregistrer » se lit par `saveButtonVisible(state.save)`. Changer de cadre
 * OU de format (story, carré) fait réapparaître « Enregistrer » (#10296).
 */

export type FlowState =
  | { readonly step: 'offer' }
  | { readonly step: 'camera'; readonly camera: 'opening' | 'live' | CameraFailure }
  | { readonly step: 'striking'; readonly mode: NotebookMode; readonly zone: CaptureZone }
  | {
      readonly step: 'result';
      readonly mode: NotebookMode;
      readonly kept: boolean | null;
      readonly shared: ShareOutcome | null;
      readonly save: TakeSaveState;
    }
  | { readonly step: 'failed' }
  | { readonly step: 'done'; readonly deferred: boolean };

export type FlowEvent =
  | { readonly type: 'selfie' }
  | { readonly type: 'card' }
  /** La reprise d'une photo gardée depuis sa source (#10166) : une photo prise ou importée, jamais une carte seule. */
  | { readonly type: 'same-photo'; readonly mode: Exclude<NotebookMode, 'card'> }
  | { readonly type: 'later' }
  | { readonly type: 'close' }
  | { readonly type: 'camera-ready' }
  | { readonly type: 'camera-failed'; readonly reason: CameraFailure }
  | { readonly type: 'shutter'; readonly zone: CaptureZone }
  | { readonly type: 'gallery' }
  | { readonly type: 'composed'; readonly frame: string; readonly format: CaptureFormat }
  | { readonly type: 'compose-failed' }
  | { readonly type: 'kept'; readonly ok: boolean }
  | { readonly type: 'shared'; readonly outcome: ShareOutcome }
  | { readonly type: 'saved' }
  | { readonly type: 'save-failed'; readonly frame: FrameChoice; readonly format: CaptureFormat }
  | { readonly type: 'frame'; readonly frame: FrameChoice }
  | { readonly type: 'format'; readonly format: CaptureFormat };

const takeOf = (zone: CaptureZone, frame: string, format: CaptureFormat): TakeSaveState =>
  beginTake(zone === 'frame' ? { zone: 'frame', frameId: frame, format } : { zone: 'outside', frameId: frame, format });

export function flowReducer(state: FlowState, event: FlowEvent): FlowState {
  if (state.step === 'done') return state;
  if (event.type === 'close') return { step: 'done', deferred: false };

  switch (state.step) {
    case 'offer':
      if (event.type === 'selfie') return { step: 'camera', camera: 'opening' };
      if (event.type === 'card') return { step: 'striking', mode: 'card', zone: 'outside' };
      if (event.type === 'same-photo') return { step: 'striking', mode: event.mode, zone: 'outside' };
      if (event.type === 'later') return { step: 'done', deferred: true };
      return state;
    case 'camera':
      if (event.type === 'camera-ready' && state.camera === 'opening') return { step: 'camera', camera: 'live' };
      if (event.type === 'camera-failed') return { step: 'camera', camera: event.reason };
      if (event.type === 'shutter' && state.camera === 'live') return { step: 'striking', mode: 'selfie', zone: event.zone };
      if (event.type === 'gallery') return { step: 'striking', mode: 'gallery', zone: 'outside' };
      if (event.type === 'card') return { step: 'striking', mode: 'card', zone: 'outside' };
      return state;
    case 'striking':
      if (event.type === 'composed') return { step: 'result', mode: state.mode, kept: null, shared: null, save: takeOf(state.zone, event.frame, event.format) };
      if (event.type === 'compose-failed') return { step: 'failed' };
      return state;
    case 'result':
      if (event.type === 'kept') return { ...state, kept: event.ok };
      if (event.type === 'shared') return { ...state, shared: event.outcome };
      if (event.type === 'saved') return { ...state, save: applySaved(state.save) };
      if (event.type === 'save-failed') return { ...state, save: applySaveFailed(state.save, { frameId: event.frame, format: event.format }) };
      if (event.type === 'frame') return { ...state, save: applyFrameChange(state.save, event.frame) };
      if (event.type === 'format') return { ...state, save: applyFormatChange(state.save, event.format) };
      return state;
    case 'failed':
      return state;
  }
}
