import type { PlayOptions } from '@/lib/game/play';

import { loadArt } from './art';
import { openFrontCamera, type CameraResult } from './camera';
import type { PhotoPalette, PhotoSource } from './compose';
import { rasterizeSvg } from './compose';
import { rootVarReader } from './css-vars';
import type { PhotoMoment } from './moments';
import { createNotebook, lazyBackend, openIndexedDbBackend, type Notebook } from './notebook';
import { renderPhotoFiles, type PhotoFiles } from './render';
import { downloadFile, shareImage, type ShareOutcome } from './share';

/**
 * L'ENVIRONNEMENT DE LA PHOTO (#9382) — tout ce que le déroulé demande au
 * navigateur, derrière UNE interface injectable : la caméra, le carnet, le
 * partage, l'enregistrement, la composition, la lecture d'une photo de la
 * galerie. L'écran (`GamePhotoFlow`) ne touche aucun global ; les témoins lui
 * passent des doubles, la production lui passe `browserPhotoEnv()`.
 *
 * Aucune image n'est envoyée à Meeshy : le carnet est local (IndexedDB), le
 * partage passe par la feuille du système, l'enregistrement par un fichier.
 */

export type PhotoEnv = {
  readonly openCamera: () => Promise<CameraResult>;
  readonly notebook: Notebook;
  readonly share: (file: File, title: string) => Promise<ShareOutcome>;
  readonly save: (file: File) => boolean;
  /** Compose les deux images depuis le cadre affiché (ses dessins) et la photo ; `null` si le navigateur ne sait pas. */
  readonly render: (input: { readonly moment: PhotoMoment; readonly photo: PhotoSource | null; readonly frame: HTMLElement | null }) => Promise<PhotoFiles | null>;
  readonly captureVideo: (video: HTMLVideoElement) => PhotoSource | null;
  readonly readGallery: (file: File) => Promise<PhotoSource | null>;
  readonly now: () => Date;
  /** Réduction des animations, haptique, ordonnanceur : voir `PlayOptions`. */
  readonly playOptions?: PlayOptions;
};

/** L'image est peinte aux couleurs de la charte : chaque rôle est un jeton du document. */
export function paletteFrom(read: (name: string) => string): PhotoPalette {
  const token = (name: string): string => read(name) || 'currentColor';
  return {
    top: token('--ios-indigo-950'),
    bottom: token('--ios-indigo-600'),
    ink: token('--ios-on-brand'),
    inkSoft: token('--ios-indigo-200'),
    scrim: token('--ios-indigo-950'),
  };
}

export const fontFamilyFrom = (read: (name: string) => string): string => {
  const native = read('--font-native');
  return native === '' ? 'system-ui, sans-serif' : `${native}, system-ui, sans-serif`;
};

const createCanvas = (width: number, height: number): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

function captureVideo(video: HTMLVideoElement): PhotoSource | null {
  const { videoWidth: width, videoHeight: height } = video;
  if (width === 0 || height === 0) return null;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (ctx === null) return null;
  ctx.drawImage(video, 0, 0, width, height);
  return { image: canvas, width, height, mirror: true };
}

async function readGallery(file: File): Promise<PhotoSource | null> {
  try {
    const bitmap = await createImageBitmap(file);
    return { image: bitmap, width: bitmap.width, height: bitmap.height, mirror: false };
  } catch {
    return null;
  }
}

export function browserPhotoEnv(): PhotoEnv {
  const now = (): Date => new Date();
  const notebook = createNotebook({
    backend: lazyBackend(() => openIndexedDbBackend(typeof indexedDB === 'undefined' ? undefined : indexedDB)),
    now,
  });
  return {
    openCamera: () => openFrontCamera(typeof navigator === 'undefined' ? undefined : navigator.mediaDevices),
    notebook,
    share: (file, title) => shareImage({ file, title, nav: navigator, download: (f) => downloadFile(f, document) }),
    save: (file) => {
      try {
        downloadFile(file, document);
        return true;
      } catch {
        return false;
      }
    },
    render: async ({ moment, photo, frame }) => {
      if (frame === null) return null;
      const read = rootVarReader({ getComputedStyle: (root) => getComputedStyle(root), root: document.documentElement });
      const art = await loadArt({
        root: frame,
        read,
        raster: (markup) =>
          rasterizeSvg(markup, {
            createImage: () => new Image(),
            createObjectUrl: (blob) => URL.createObjectURL(blob),
            revokeObjectUrl: (url) => URL.revokeObjectURL(url),
          }),
      });
      if (art === null) return null;
      return renderPhotoFiles({ moment, photo, art, palette: paletteFrom(read), fontFamily: fontFamilyFrom(read), now: now(), createCanvas });
    },
    captureVideo,
    readGallery,
    now,
  };
}
