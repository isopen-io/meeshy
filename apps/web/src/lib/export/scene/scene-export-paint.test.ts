import { describe, expect, test } from 'bun:test';

import type { SceneCarrier } from '@/lib/canvas/carrier';
import { parseCanvasDocument, type CanvasScene } from '@/lib/canvas/document';

import { paintSceneFrame, type ExportAssets, type ScenePaintable } from './scene-export-paint';

type Op = { readonly op: string; readonly detail: string; readonly alpha: number; readonly filter: string; readonly composite: string };

/** Un contexte 2D qui ENREGISTRE ce qu'on lui peint, dans l'ordre. */
function recordingContext() {
  const ops: Op[] = [];
  const stack: { alpha: number; filter: string; composite: string }[] = [];
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
    globalCompositeOperation: 'source-over',
    shadowColor: 'transparent',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    record(op: string, detail = '') {
      ops.push({ op, detail, alpha: this.globalAlpha, filter: this.filter, composite: this.globalCompositeOperation });
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
    arc(_x: number, _y: number, radius: number) {
      this.record('arc', String(Math.round(radius)));
    },
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
      stack.push({ alpha: this.globalAlpha, filter: this.filter, composite: this.globalCompositeOperation });
    },
    restore() {
      const top = stack.pop();
      this.globalAlpha = top?.alpha ?? 1;
      this.filter = top?.filter ?? 'none';
      this.globalCompositeOperation = top?.composite ?? 'source-over';
    },
    translate(x: number, y: number) {
      this.record('translate', `${Math.round(x)},${Math.round(y)}`);
    },
    rotate: () => undefined,
    scale(x: number) {
      this.record('scale', String(Math.round(x * 1000) / 1000));
    },
    setTransform: () => undefined,
    createLinearGradient: () => ({ addColorStop: () => undefined }) as unknown as CanvasGradient,
    createRadialGradient: () => ({ addColorStop: () => undefined }) as unknown as CanvasGradient,
    createPattern: () => null,
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

const paint = (scene: CanvasScene, tSeconds: number, watermark: string | null = null, slideDurationMs?: number) => {
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
    ...(slideDurationMs === undefined ? {} : { slideDurationMs }),
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

function transitionScene(extra: Record<string, unknown>, objects: readonly Record<string, unknown>[]): CanvasScene {
  const scene = parseCanvasDocument({ v: 3, scenes: [{ id: 's', objects: objects.map(object), ...extra }] })?.scenes[0];
  if (scene === undefined) throw new Error('scène de témoin invalide');
  return scene;
}

describe('l’export peint les transitions de la scène (#13880)', () => {
  const titled = (extra: Record<string, unknown>) => transitionScene(extra, [{ id: 't', kind: 'text', payload: { text: 'Titre' } }]);

  test('ouverture en fondu : à mi-course, toute la scène est peinte à moitié, sur le fond noir du lecteur', () => {
    const ops = paint(titled({ opening: { type: 'fade' } }), 0.6, null, 6000);
    expect(ops[0]).toMatchObject({ op: 'fillRect', detail: '#000000:0,0,720,1280' });
    expect(ops.find((op) => op.detail === 'Titre')?.alpha).toBeCloseTo(0.5);
  });

  test('fermeture en zoom : la scène grossit vers 1,08 sur la dernière 1,2 s', () => {
    const ops = paint(titled({ closing: { type: 'zoom' } }), 6, null, 6000);
    expect(ops.some((op) => op.op === 'scale' && op.detail === '1.08')).toBe(true);
  });

  test('ouverture en révélation : un cercle au centre masque la scène', () => {
    const ops = paint(titled({ opening: { type: 'reveal' } }), 0.6, null, 6000);
    const radius = Math.round((0.5 * Math.hypot(720, 1280)) / 2);
    expect(ops.some((op) => op.op === 'arc' && op.detail === String(radius))).toBe(true);
    expect(ops.findIndex((op) => op.op === 'clip')).toBeLessThan(ops.findIndex((op) => op.detail === 'Titre'));
  });

  test('le filigrane reste hors de la transition : il ne s’efface pas avec la scène', () => {
    const ops = paint(titled({ opening: { type: 'fade' } }), 0, '@ana', 6000);
    expect(ops.find((op) => op.detail === '@ana')?.alpha).toBeCloseTo(0.85);
  });

  test('sans durée de slide connue, rien ne transite', () => {
    const ops = paint(titled({ opening: { type: 'fade' } }), 0);
    expect(ops.find((op) => op.detail === 'Titre')?.alpha).toBe(1);
  });

  test('un fondu enchaîné entre deux clips porte l’opacité des deux pendant la transition', () => {
    const scene = transitionScene({ clipTransitions: [{ id: 'x', fromClipId: 'a', toClipId: 'b', kind: 'crossfade', duration: 1 }] }, [
      { id: 'a', kind: 'text', timing: { start: 0, end: 4 }, payload: { text: 'Avant' } },
      { id: 'b', kind: 'text', timing: { start: 3, end: 8 }, payload: { text: 'Après' } },
    ]);
    const ops = paint(scene, 3.5, null, 8000);
    expect(ops.find((op) => op.detail === 'Avant')?.alpha).toBeCloseTo(0.5);
    expect(ops.find((op) => op.detail === 'Après')?.alpha).toBeCloseTo(0.5);
  });
});

describe('l’export peint l’aspect d’un média comme le lecteur (#13880)', () => {
  const posed = (payload: Record<string, unknown>) =>
    sceneOf([{ id: 'img', kind: 'media', z: 2, payload: { mediaType: 'image/jpeg', mediaURL: 'https://cdn/photo.jpg', aspectRatio: 1, ...payload } }]);

  test('le filtre de l’auteur puis ses réglages, sur le média seul', () => {
    const ops = paint(posed({ filter: 'bw', adjustments: { saturation: 0.5 } }), 0);
    expect(ops.find((op) => op.op === 'drawImage' && op.detail === 'photo')?.filter).toBe('grayscale(1) contrast(1.1) saturate(0.5)');
  });

  test('le bloom repeint le média en halo, fondu en « screen »', () => {
    const draws = paint(posed({ adjustments: { bloom: 0.6 } }), 0).filter((op) => op.op === 'drawImage' && op.detail === 'photo');
    expect(draws.map((op) => op.composite)).toEqual(['source-over', 'screen']);
    expect(draws[1]?.filter).toContain('brightness(0.6)');
  });

  test('la teinte se pose dans la boîte du média, en lumière douce', () => {
    const tint = paint(posed({ adjustments: { temperature: 1 } }), 0).find((op) => op.op === 'fillRect' && op.detail.startsWith('rgba(255, 138, 0'));
    expect(tint?.composite).toBe('soft-light');
  });

  test('le fond aussi reçoit ses réglages', () => {
    const scene = sceneOf([{ id: 'bg', kind: 'media', plane: 'bg', z: 0, payload: { mediaType: 'video/mp4', mediaURL: 'https://cdn/bg.mp4', isBackground: true, adjustments: { contrast: 1.3 } } }]);
    expect(paint(scene, 0).find((op) => op.detail === 'bg-video')?.filter).toBe('contrast(1.3)');
  });
});
