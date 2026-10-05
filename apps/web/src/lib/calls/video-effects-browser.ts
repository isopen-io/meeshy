import { browserReducedMotion, createFaceLayer } from './face-effects-draw';
import { browserFaceDetector } from './face-tracker';
import { createSegmentedBlur, type SegmenterPort } from './video-effects-blur';
import { createBlurCompositor } from './video-effects-compositor';
import type { BlurStage, FrameEnv, Surface } from './video-effects-frames';

/**
 * **CE QUE LE TRAITEMENT REÇOIT DU NAVIGATEUR** (#9099, #8471) — le canevas
 * de travail, la fabrique d'images, le flou et le calque de visage, bâtis
 * avec les seules API qu'un WORKER connaît aussi (`OffscreenCanvas`,
 * `VideoFrame`, `createImageBitmap`) : le worker et le repli du fil principal
 * en reçoivent la même chose.
 *
 * Le mouvement réduit se lit avec `matchMedia`, qui n'existe pas dans un
 * worker : l'hôte le passe (`reducedMotion`), le fil principal le relaie.
 */

export type LocalFrameEnv = FrameEnv & { readonly frameFrom: (canvas: CanvasImageSource, init: { readonly timestamp: number }) => VideoFrame };

const now = (): number => (typeof performance === 'undefined' ? Date.now() : performance.now());

const SEGMENT_EDGE = 256;

function offscreen2d(): Surface {
  const canvas = new OffscreenCanvas(1, 1);
  const context = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
  return { canvas, context, resize: (width, height) => void (canvas.width !== width || canvas.height !== height ? Object.assign(canvas, { width, height }) : undefined) };
}

/** Une réduction de l'image pour la découpe — une image vidéo est COPIÉE d'abord : l'originale est relâchée aussitôt traitée. */
function snapshot(source: CanvasImageSource, width: number, height: number): Promise<ImageBitmap> {
  const size = { resizeWidth: SEGMENT_EDGE, resizeHeight: Math.max(1, Math.round((SEGMENT_EDGE * height) / Math.max(1, width))), resizeQuality: 'low' as const };
  if (typeof VideoFrame === 'undefined' || !(source instanceof VideoFrame)) return createImageBitmap(source, size);
  const copy = new VideoFrame(source);
  return createImageBitmap(copy, size).finally(() => copy.close());
}

const loadSegmenter = (): Promise<SegmenterPort> => import('./video-effects-segmentation').then((module) => module.loadSelfieSegmenter());

/** Le flou par segmentation, ou `null` là où WebGL2 manque ou refuse. */
export function browserBlur(): BlurStage | null {
  if (typeof OffscreenCanvas === 'undefined') return null;
  const canvas = new OffscreenCanvas(1, 1);
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
  if (gl === null) return null;
  try {
    return createSegmentedBlur({ compositor: createBlurCompositor(gl), canvas, loadSegmenter, snapshot, schedule: (task) => void setTimeout(task, 0), now });
  } catch {
    return null;
  }
}

export function browserFrameEnv(options: { readonly reducedMotion?: () => boolean } = {}): LocalFrameEnv {
  const face = createFaceLayer(browserFaceDetector(), options.reducedMotion === undefined ? {} : { reducedMotion: options.reducedMotion });
  return { surface: offscreen2d, now, face, blur: browserBlur, frameFrom: (canvas, init) => new VideoFrame(canvas, init) };
}

/** Le repli du fil principal : `matchMedia` y existe, le calque de visage le lit lui-même. */
export const browserMainFrameEnv = (): LocalFrameEnv => browserFrameEnv({ reducedMotion: browserReducedMotion() });
