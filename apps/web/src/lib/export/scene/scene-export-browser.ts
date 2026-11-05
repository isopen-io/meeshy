import { fetchCardMediaBlob } from '@/lib/export/message-card-fetch';
import { isInGallery, saveToGallery } from '@/lib/gallery/save-to-gallery';
import type { GallerySaver } from '@/lib/gallery/gallery-saver';
import type { FileDeliveryHost } from '@/lib/media/file-delivery-host';

import { prepareSceneExport } from './scene-export-assets';
import { BRANDING_BUDGET_MS, brandPreparedScene } from './scene-export-branding';
import { noRelationLevel, type RelationLevelProvider } from './scene-export-branding-level';
import type { ExportPalette } from './scene-export-paint';
import { renderSceneExport, type RenderEnvironment } from './scene-export-render';
import { runSceneExport, type SceneDelivery, type SceneExportMode, type SceneExportResult, type SceneExportRunDeps } from './scene-export-run';
import { sceneDeliveryOf, shareSceneFile } from './scene-export-share';
import type { SceneExportSubject } from './scene-export-subject';

/**
 * **L'EXPORT DANS LE NAVIGATEUR** (#13873) — le seul module qui touche au DOM,
 * au réseau et à Web Audio. Chargé à la demande, au premier « Enregistrer »,
 * « Partager » ou « Imager » d'une œuvre composée (`renderSceneFile`) : aucun
 * lecteur qui ne tape jamais ces gestes ne le paie.
 *
 * « Enregistrer » range le fichier (galerie de la coque, sinon la porte de
 * fichier) ; « Partager » le remet à la feuille de partage (#13881,
 * `shareSceneFile`), un toucher neuf du bandeau la rouvrant quand le rendu a
 * fait expirer l'activation du geste.
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

async function brandingImage(src: string): Promise<CanvasImageSource | null> {
  if (typeof createImageBitmap !== 'function') return null;
  const blob = await fetchCardMediaBlob(src, mediaIdOf(src));
  return blob === null ? null : createImageBitmap(blob);
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
  if (gallery !== null) return isInGallery(gallery) ? 'delivered' : 'failed';
  const { fileDeliveryPortal } = await import('@/lib/media/deliver-file');
  const portal = fileDeliveryPortal(params.host);
  return sceneDeliveryOf(portal === null ? 'unavailable' : await portal.deliver(params.blob, params.fileName, params.mimeType));
}

type SceneEngine = Pick<SceneExportRunDeps, 'prepare' | 'render'>;

function sceneEngine(params: {
  readonly subject: SceneExportSubject;
  readonly audioContext: AudioContext | null;
  readonly preferredLanguages: readonly string[];
  readonly placeHere: string;
  readonly relationLevel?: RelationLevelProvider | undefined;
}): SceneEngine {
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
  return {
    prepare: async (signal) => {
      const prepared = await prepareSceneExport({
        document: subject.document,
        carrier: subject.carrier,
        signal,
        deps: {
          doc,
          fetchBlob: (src) => fetchCardMediaBlob(src, mediaIdOf(src)),
          createObjectURL: (blob) => URL.createObjectURL(blob),
          revokeObjectURL: (url) => URL.revokeObjectURL(url),
          decodeImage: typeof createImageBitmap === 'function' ? (blob) => createImageBitmap(blob) : undefined,
          imageDecoder: typeof ImageDecoder === 'function' ? ImageDecoder : undefined,
          decodeAudio: audioContext === null ? null : (data) => audioContext.decodeAudioData(data),
        },
      });
      if (subject.branding === undefined || prepared === 'cancelled') return prepared;
      return brandPreparedScene({
        prepared,
        author: subject.branding.author,
        signal,
        deps: { loadImage: brandingImage, relationLevel: params.relationLevel ?? noRelationLevel, now: () => Date.now(), budgetMs: BRANDING_BUDGET_MS },
      });
    },
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
  };
}

/**
 * **LE RENDU D'UNE SCÈNE, SANS LIVRAISON** (#16393) — le fichier qu'« Imager »
 * pose comme média sur la carte d'une œuvre composée : la composition
 * entière, image fixe ou vidéo. `null` : rien n'a pu se rendre.
 */
export async function renderSceneFile(params: {
  readonly subject: SceneExportSubject;
  readonly audioContext: AudioContext | null;
  readonly preferredLanguages: readonly string[];
  readonly placeHere: string;
  readonly signal: AbortSignal;
  readonly onProgress?: (fraction: number) => void;
}): Promise<RenderedSceneFile | null> {
  const engine = sceneEngine(params);
  try {
    const prepared = await engine.prepare(params.signal).catch(() => null);
    if (prepared === null || prepared === 'cancelled') return null;
    try {
      const outcome = await engine.render({ prepared, lengthMs: prepared.plan.totalMs, signal: params.signal, onProgress: params.onProgress ?? (() => undefined) });
      if (outcome.kind === 'video') return { blob: outcome.blob, mimeType: outcome.mimeType };
      if (outcome.kind === 'image') return { blob: outcome.blob, mimeType: outcome.blob.type || 'image/png' };
      return null;
    } finally {
      prepared.dispose();
    }
  } catch {
    return null;
  } finally {
    void params.audioContext?.close().catch(() => undefined);
  }
}

export type RenderedSceneFile = { readonly blob: Blob; readonly mimeType: string };

export async function startSceneExport(params: {
  readonly subject: SceneExportSubject;
  readonly mode: SceneExportMode;
  readonly audioContext: AudioContext | null;
  readonly preferredLanguages: readonly string[];
  readonly placeHere: string;
  readonly host: FileDeliveryHost;
  readonly gallerySaver: GallerySaver | null;
  /** Le niveau de lien de l'auteur (#13997) — le port injecté du logo de cercle (`relationLevelProvider`) ; absent : aucun logo. */
  readonly relationLevel?: RelationLevelProvider;
  /** « Partager » : le fichier prêt attend un toucher neuf — absent, il se livre sans attendre. */
  readonly awaitDeliveryTap?: (deliver: () => Promise<SceneDelivery>) => Promise<SceneDelivery>;
  readonly signal: AbortSignal;
  readonly onProgress: (fraction: number) => void;
  readonly onDelivering?: () => void;
}): Promise<SceneExportResult> {
  const { subject, audioContext } = params;
  /* La livraison se charge PENDANT le rendu : prête au moment de livrer,
     elle ne retarde pas le partage au-delà de l'activation du geste. */
  void import('@/lib/media/deliver-file').catch(() => undefined);
  const engine = sceneEngine(params);
  try {
    return await runSceneExport({
      mode: params.mode,
      fileStem: subject.fileStem,
      signal: params.signal,
      onProgress: params.onProgress,
      ...(params.onDelivering !== undefined ? { onDelivering: params.onDelivering } : {}),
      deps: {
        ...engine,
        deliver: (blob, fileName, mimeType) =>
          params.mode === 'share'
            ? shareSceneFile({ blob, fileName, mimeType, host: params.host, awaitTap: params.awaitDeliveryTap ?? ((deliver) => deliver()) })
            : deliverFile({ blob, fileName, mimeType, host: params.host, gallerySaver: params.gallerySaver }),
      },
    });
  } finally {
    void audioContext?.close().catch(() => undefined);
  }
}
