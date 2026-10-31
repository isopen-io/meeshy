import { fetchCardMediaBlob } from '@/lib/export/message-card-fetch';
import { saveToGallery } from '@/lib/gallery/save-to-gallery';
import type { GallerySaver } from '@/lib/gallery/gallery-saver';
import { fileDeliveryPortal } from '@/lib/media/deliver-file';
import type { FileDeliveryHost } from '@/lib/media/file-delivery-host';

import { prepareSceneExport } from './scene-export-assets';
import type { ImagerLengthChoice, ImagerQuarter } from './scene-export-length';
import type { ExportPalette } from './scene-export-paint';
import { renderSceneExport, type RenderEnvironment } from './scene-export-render';
import { runSceneExport, type SceneDelivery, type SceneExportMode, type SceneExportResult } from './scene-export-run';
import type { SceneExportSubject } from './scene-export-subject';

/**
 * **L'EXPORT DANS LE NAVIGATEUR** (#13873) — le seul module qui touche au DOM,
 * au réseau et à Web Audio. Chargé à la demande, au premier « Enregistrer » ou
 * « Imager » : aucun lecteur qui ne tape jamais ces gestes ne le paie.
 *
 * La palette est celle du lecteur, relue sur les jetons CSS de la page : le
 * fichier rendu porte les couleurs que l'utilisateur voit (loi 6).
 */

const cssToken = (style: CSSStyleDeclaration, name: string, fallback: string): string => {
  const value = style.getPropertyValue(name).trim();
  return value === '' ? fallback : value;
};

export function exportPalette(doc: Document): ExportPalette {
  const view = doc.defaultView;
  const style = view === null ? null : view.getComputedStyle(doc.documentElement);
  const font = view === null || doc.body === null ? '' : view.getComputedStyle(doc.body).fontFamily;
  const token = (name: string, fallback: string) => (style === null ? fallback : cssToken(style, name, fallback));
  return {
    card: token('--color-ios-card', '#1C1C1E'),
    scrim: token('--color-scrim', 'rgba(0, 0, 0, 0.45)'),
    onMedia: token('--color-on-media', '#FFFFFF'),
    placeFill: token('--ios-indigo-50', '#EEF2FF'),
    placeInk: token('--ios-indigo-900', '#312E81'),
    pin: token('--ios-error', '#FF3B30'),
    mediaBackdrop: token('--color-media-backdrop', '#000000'),
    fontFamily: font === '' ? 'system-ui, sans-serif' : font,
  };
}

const mediaIdOf = (src: string): string => src.split(/[?#]/)[0]?.split('/').pop() ?? src;

function requestFrame(doc: Document): (callback: () => void) => void {
  /* Un onglet caché ne peint plus d'images d'animation : l'export continue au
     rythme du minuteur, l'horloge du son gardant chaque image à sa place. */
  return (callback) => {
    if (doc.visibilityState === 'hidden' || typeof requestAnimationFrame !== 'function') setTimeout(callback, 33);
    else requestAnimationFrame(() => callback());
  };
}

async function deliverFile(params: {
  readonly blob: Blob;
  readonly fileName: string;
  readonly mimeType: string;
  readonly host: FileDeliveryHost;
  readonly gallerySaver: GallerySaver | null;
}): Promise<SceneDelivery> {
  const gallery = await saveToGallery({ saver: params.gallerySaver, blob: params.blob, fileName: params.fileName, mimeType: params.mimeType });
  if (gallery !== null) return gallery === 'media.viewer.saved' ? 'delivered' : 'failed';
  const portal = fileDeliveryPortal(params.host);
  const outcome = portal === null ? 'unavailable' : await portal.deliver(params.blob, params.fileName, params.mimeType);
  if (outcome === 'delivered' || outcome === 'cancelled') return outcome;
  return outcome === 'expired' ? 'retry' : 'failed';
}

export async function startSceneExport(params: {
  readonly subject: SceneExportSubject;
  readonly mode: SceneExportMode;
  readonly audioContext: AudioContext | null;
  readonly preferredLanguages: readonly string[];
  readonly placeHere: string;
  readonly host: FileDeliveryHost;
  readonly gallerySaver: GallerySaver | null;
  readonly chooseLength: (choices: readonly ImagerLengthChoice[]) => Promise<ImagerQuarter | null>;
  readonly signal: AbortSignal;
  readonly onProgress: (fraction: number) => void;
  readonly onDelivering?: () => void;
}): Promise<SceneExportResult> {
  const { subject, audioContext } = params;
  const doc = document;
  const env: RenderEnvironment = {
    doc,
    MediaRecorder: typeof MediaRecorder === 'undefined' ? undefined : MediaRecorder,
    audioContext,
    requestFrame: requestFrame(doc),
    now: () => performance.now(),
    palette: exportPalette(doc),
    labels: { placeHere: params.placeHere },
  };
  try {
    return await runSceneExport({
      mode: params.mode,
      fileStem: subject.fileStem,
      signal: params.signal,
      onProgress: params.onProgress,
      ...(params.onDelivering !== undefined ? { onDelivering: params.onDelivering } : {}),
      deps: {
        prepare: (signal) =>
          prepareSceneExport({
            document: subject.document,
            carrier: subject.carrier,
            signal,
            deps: {
              doc,
              fetchBlob: (src) => fetchCardMediaBlob(src, mediaIdOf(src)),
              createObjectURL: (blob) => URL.createObjectURL(blob),
              revokeObjectURL: (url) => URL.revokeObjectURL(url),
              decodeImage: typeof createImageBitmap === 'function' ? (blob) => createImageBitmap(blob) : undefined,
              decodeAudio: audioContext === null ? null : (data) => audioContext.decodeAudioData(data),
            },
          }),
        render: ({ prepared, lengthMs, signal, onProgress }) =>
          renderSceneExport({
            prepared,
            document: subject.document,
            carrier: subject.carrier,
            preferredLanguages: params.preferredLanguages,
            watermark: subject.watermark,
            lengthMs,
            env,
            signal,
            onProgress,
          }),
        deliver: (blob, fileName, mimeType) => deliverFile({ blob, fileName, mimeType, host: params.host, gallerySaver: params.gallerySaver }),
        chooseLength: params.chooseLength,
      },
    });
  } finally {
    void audioContext?.close().catch(() => undefined);
  }
}
