import type { CompositeTile, VideoCompositor } from './call-recording-runtime';
import { compositeRects } from './call-recording-runtime';

/**
 * **LA COMPOSITION D'UN ENREGISTREMENT VIDÉO** (#8437) — un canevas 1280 × 720
 * où chaque tuile visible de l'appel est peinte en grille, quinze fois par
 * seconde : l'image de qui en a une (recadrée pour remplir sa case, comme la
 * grille de l'écran), son nom sur fond sombre sinon. Sa piste
 * (`captureStream`) rejoint le mélange des voix. Chargé avec l'enregistreur,
 * chez lui seul.
 */

const WIDTH = 1280;
const HEIGHT = 720;
const FPS = 15;
const BACKGROUND = '#07060b';
const TILE = '#1c1a24';
const GAP = 4;

type Source = { readonly tile: CompositeTile; readonly video: HTMLVideoElement | null };

function videoFor(stream: MediaStream): HTMLVideoElement {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  void video.play().catch(() => undefined);
  return video;
}

function drawCover(context: CanvasRenderingContext2D, video: HTMLVideoElement, x: number, y: number, width: number, height: number): void {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  if (sourceWidth === 0 || sourceHeight === 0) return;
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const cropWidth = width / scale;
  const cropHeight = height / scale;
  context.drawImage(video, (sourceWidth - cropWidth) / 2, (sourceHeight - cropHeight) / 2, cropWidth, cropHeight, x, y, width, height);
}

export function createBrowserCompositor(): VideoCompositor {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d');
  let sources: readonly Source[] = [];

  const paint = (): void => {
    if (context === null) return;
    context.fillStyle = BACKGROUND;
    context.fillRect(0, 0, WIDTH, HEIGHT);
    const rects = compositeRects(sources.length, WIDTH, HEIGHT);
    sources.forEach((source, index) => {
      const rect = rects[index];
      if (rect === undefined) return;
      const x = rect.x + GAP / 2;
      const y = rect.y + GAP / 2;
      const width = rect.width - GAP;
      const height = rect.height - GAP;
      context.fillStyle = TILE;
      context.fillRect(x, y, width, height);
      if (source.video !== null) drawCover(context, source.video, x, y, width, height);
      else if (source.tile.name !== '') {
        context.fillStyle = '#ffffff';
        context.font = `600 ${Math.max(20, Math.round(height / 9))}px system-ui, sans-serif`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(source.tile.name, x + width / 2, y + height / 2, width - 24);
      }
    });
  };

  const timer = setInterval(paint, 1000 / FPS);
  paint();
  const track = canvas.captureStream(FPS).getVideoTracks()[0];
  if (track === undefined) throw new Error('canvas-capture-missing');

  const release = (source: Source): void => {
    if (source.video === null) return;
    source.video.pause();
    source.video.srcObject = null;
  };

  return {
    output: track,
    setTiles: (tiles) => {
      const next = tiles.map((tile): Source => {
        const kept = sources.find((source) => source.tile.key === tile.key && source.tile.stream === tile.stream);
        return kept ?? { tile, video: tile.stream === null ? null : videoFor(tile.stream) };
      });
      sources.filter((source) => !next.includes(source)).forEach(release);
      sources = next;
    },
    close: () => {
      clearInterval(timer);
      sources.forEach(release);
      sources = [];
      track.stop();
    },
  };
}
