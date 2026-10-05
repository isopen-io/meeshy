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
 */

export type FlowState =
  | { readonly step: 'offer' }
  | { readonly step: 'camera'; readonly camera: 'opening' | 'live' | CameraFailure }
  | { readonly step: 'striking'; readonly mode: NotebookMode }
  | { readonly step: 'result'; readonly mode: NotebookMode; readonly kept: boolean | null; readonly shared: ShareOutcome | null }
  | { readonly step: 'failed' }
  | { readonly step: 'done'; readonly deferred: boolean };

export type FlowEvent =
  | { readonly type: 'selfie' }
  | { readonly type: 'card' }
  | { readonly type: 'later' }
  | { readonly type: 'close' }
  | { readonly type: 'camera-ready' }
  | { readonly type: 'camera-failed'; readonly reason: CameraFailure }
  | { readonly type: 'shutter' }
  | { readonly type: 'gallery' }
  | { readonly type: 'composed' }
  | { readonly type: 'compose-failed' }
  | { readonly type: 'kept'; readonly ok: boolean }
  | { readonly type: 'shared'; readonly outcome: ShareOutcome };

export function flowReducer(state: FlowState, event: FlowEvent): FlowState {
  if (state.step === 'done') return state;
  if (event.type === 'close') return { step: 'done', deferred: false };

  switch (state.step) {
    case 'offer':
      if (event.type === 'selfie') return { step: 'camera', camera: 'opening' };
      if (event.type === 'card') return { step: 'striking', mode: 'card' };
      if (event.type === 'later') return { step: 'done', deferred: true };
      return state;
    case 'camera':
      if (event.type === 'camera-ready' && state.camera === 'opening') return { step: 'camera', camera: 'live' };
      if (event.type === 'camera-failed') return { step: 'camera', camera: event.reason };
      if (event.type === 'shutter' && state.camera === 'live') return { step: 'striking', mode: 'selfie' };
      if (event.type === 'gallery') return { step: 'striking', mode: 'gallery' };
      if (event.type === 'card') return { step: 'striking', mode: 'card' };
      return state;
    case 'striking':
      if (event.type === 'composed') return { step: 'result', mode: state.mode, kept: null, shared: null };
      if (event.type === 'compose-failed') return { step: 'failed' };
      return state;
    case 'result':
      if (event.type === 'kept') return { ...state, kept: event.ok };
      if (event.type === 'shared') return { ...state, shared: event.outcome };
      return state;
    case 'failed':
      return state;
  }
}
