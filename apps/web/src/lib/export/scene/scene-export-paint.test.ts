import { describe, expect, test } from 'bun:test';

import type { SceneCarrier } from '@/lib/canvas/carrier';
import { parseCanvasDocument, type CanvasScene } from '@/lib/canvas/document';

import { paintSceneFrame, type ExportAssets, type ScenePaintable } from './scene-export-paint';

type Op = { readonly op: string; readonly detail: string; readonly alpha: number };

/** Un contexte 2D qui ENREGISTRE ce qu'on lui peint, dans l'ordre. */
function recordingContext() {
  const ops: Op[] = [];
  const stack: number[] = [];
  const ctx = {
    fillStyle: '' as string | CanvasGradient | CanvasPattern,
    strokeStyle: '' as string | CanvasGradient | CanvasPattern,
    lineWidth: 1,
    lineCap: 'butt' as CanvasLineCap,
    lineJoin: 'miter' as CanvasLineJoin,
    font: '',
    filter: 'none',
    textAlign: 'left' as CanvasTextAlign,
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    direction: 'ltr' as CanvasDirection,
    globalAlpha: 1,
    shadowColor: 'transparent',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    record(op: string, detail = '') {
      ops.push({ op, detail, alpha: this.globalAlpha });
    },
    fillRect(x: number, y: number, w: number, h: number) {
      this.record('fillRect', `${String(this.fillStyle)}:${x},${y},${w},${h}`);
    },
    fillText(text: string) {
      this.record('fillText', text);
    },
    strokeText(text: string) {
      this.record('strokeText', text);
    },
    measureText: (text: string) => ({ width: text.length * 10 }) as TextMetrics,
    beginPath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    arc: () => undefined,
    closePath: () => undefined,
    roundRect: () => undefined,
    rect: () => undefined,
    clip() {
      this.record('clip');
    },
    fill() {
      this.record('fill', String(this.fillStyle));
    },
    stroke() {
      this.record('stroke', String(this.strokeStyle));
    },
    save() {
      stack.push(this.globalAlpha);
    },
    restore() {
      this.globalAlpha = stack.pop() ?? 1;
    },
    translate: () => undefined,
    rotate: () => undefined,
    scale: () => undefined,
    setTransform: () => undefined,
    createLinearGradient: () => ({ addColorStop: () => undefined }) as unknown as CanvasGradient,
    drawImage(source: { readonly name?: string }) {
      this.record('drawImage', source.name ?? '?');
    },
  };
  return { ctx: ctx as unknown as ScenePaintable, ops };
}

const object = (raw: Record<string, unknown>) => ({ anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'content', z: 1, transform: {}, ...raw });

function sceneOf(objects: readonly Record<string, unknown>[]): CanvasScene {
  const scene = parseCanvasDocument({ v: 3, scenes: [{ id: 's', objects: objects.map(object) }] })?.scenes[0];
  if (scene === undefined) throw new Error('scène de témoin invalide');
  return scene;
}

const picture = (name: string, width = 100, height = 100) => ({ name, width, height, naturalWidth: width, naturalHeight: height });
const movie = (name: string) => ({ name, videoWidth: 1280, videoHeight: 720, readyState: 4 });

const assets: ExportAssets = {
  image: (src) => (src === 'https://cdn/photo.jpg' ? (picture('photo') as unknown as CanvasImageSource) : null),
  video: (src) => (src === 'https://cdn/bg.mp4' ? (movie('bg-video') as unknown as HTMLVideoElement) : null),
};

const carrier: SceneCarrier = { postId: 'p', media: [] };

const paint = (scene: CanvasScene, tSeconds: number, watermark: string | null = null) => {
  const { ctx, ops } = recordingContext();
  paintSceneFrame({
    ctx,
    width: 720,
    height: 1280,
    scene,
    carrier,
    tSeconds,
    assets,
    preferredLanguages: ['fr'],
    palette: { card: '#101010', scrim: 'rgba(0,0,0,0.4)', onMedia: '#FFFFFF', placeFill: '#EEF', placeInk: '#223', pin: '#F00', mediaBackdrop: '#000000', fontFamily: 'Inter' },
    labels: { placeHere: 'Ici' },
    watermark,
  });
  return ops;
};

const story = sceneOf([
  { id: 'bg', kind: 'media', plane: 'bg', z: 0, payload: { mediaType: 'video/mp4', mediaURL: 'https://cdn/bg.mp4', isBackground: true } },
  { id: 'txt', kind: 'text', z: 3, payload: { text: 'Hello', translations: { fr: 'Bonjour' } }, locale: 'en' },
  { id: 'stk', kind: 'sticker', z: 4, payload: { emoji: '🎉' } },
  { id: 'img', kind: 'media', z: 2, payload: { mediaType: 'image/jpeg', mediaURL: 'https://cdn/photo.jpg', aspectRatio: 1 } },
  { id: 'voice', kind: 'audio', z: 6, payload: { mediaURL: 'https://cdn/voice.m4a', label: 'Mon vocal' } },
  { id: 'music', kind: 'audio', z: 7, payload: { mediaURL: 'https://cdn/music.m4a', isBackground: true } },
  { id: 'late', kind: 'text', z: 8, timing: { start: 5 }, payload: { text: 'Plus tard' } },
  { id: 'draw', kind: 'drawing', z: 9, payload: { strokes: [{ points: [{ x: 0, y: 0 }, { x: 100, y: 100 }], colorHex: '00FF00', width: 6 }] } },
]);

describe('une image de l’export — tous les calques, dans l’ordre de la scène', () => {
  test('le fond vidéo, puis l’image posée, le texte servi, le sticker, la pastille du vocal, le dessin', () => {
    const ops = paint(story, 1);
    const sequence = ops.filter((op) => ['drawImage', 'fillText', 'stroke'].includes(op.op)).map((op) => `${op.op}:${op.detail}`);
    expect(sequence[0]).toBe('drawImage:bg-video');
    expect(sequence.indexOf('drawImage:photo')).toBeGreaterThan(0);
    expect(sequence.indexOf('fillText:Bonjour')).toBeGreaterThan(sequence.indexOf('drawImage:photo'));
    expect(sequence.indexOf('fillText:🎉')).toBeGreaterThan(sequence.indexOf('fillText:Bonjour'));
    expect(sequence.indexOf('stroke:#00FF00')).toBeGreaterThan(sequence.indexOf('fillText:🎉'));
    expect(sequence).not.toContain('fillText:Hello');
  });

  test('un objet hors de sa fenêtre ne se peint pas ; il entre à son heure', () => {
    expect(paint(story, 1).some((op) => op.detail === 'Plus tard')).toBe(false);
    expect(paint(story, 6).some((op) => op.detail === 'Plus tard')).toBe(true);
  });

  test('le son de fond ne produit aucun pixel ; le vocal posé montre sa pastille', () => {
    const ops = paint(story, 1);
    expect(ops.filter((op) => op.op === 'fill' && op.detail === 'rgba(0,0,0,0.4)')).toHaveLength(1);
  });

  test('une scène sans fond peint l’aplat de carte', () => {
    const ops = paint(sceneOf([{ id: 't', kind: 'text', payload: { text: 'Seul' } }]), 0);
    expect(ops[0]).toMatchObject({ op: 'fillRect', detail: '#101010:0,0,720,1280' });
  });

  test('une couleur de fond se peint telle que l’auteur l’a choisie', () => {
    const ops = paint(sceneOf([{ id: 'bg', kind: 'media', plane: 'bg', z: 0, payload: { background: 'FF0000', isBackground: true } }]), 0);
    expect(ops.some((op) => op.op === 'fillRect' && op.detail.startsWith('#FF0000'))).toBe(true);
  });

  test('l’opacité de l’objet se porte sur sa peinture', () => {
    const ops = paint(sceneOf([{ id: 't', kind: 'text', transform: { opacity: 0.5 }, payload: { text: 'Mi' } }]), 0);
    expect(ops.find((op) => op.detail === 'Mi')?.alpha).toBe(0.5);
  });

  test('le filigrane nomme l’auteur', () => {
    expect(paint(story, 1, '@ana').some((op) => op.op === 'fillText' && op.detail === '@ana')).toBe(true);
  });
});
