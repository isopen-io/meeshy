import {
  demonEyesOf,
  FROZEN_T,
  glowBucket,
  haloOf,
  hornsOf,
  lavaGlow,
  nextEffectLoad,
  risingParticles,
  sparklesOf,
  toadOf,
  type Box,
  type EffectLoad,
  type Horn,
  type Particle,
} from './face-effects';
import { createFaceTracker, type FaceDetectorPort } from './face-tracker';
import type { FaceLayer, FaceTarget } from './video-effects-pipeline';
import type { FaceEffect } from './video-effects';

/**
 * **LE CALQUE DES EFFETS DE VISAGE** (#8551) — la couche MINCE : elle trace ce
 * que `face-effects.ts` calcule, sur l'image que le traitement vient de
 * dessiner. Aucun calcul de position ici ; seulement des tracés.
 *
 * Ce qu'une image coûte (#9100) : le lissage ne floute que le rectangle du
 * visage, à demi-résolution ; les lueurs (halo, éclat, yeux du démon, lave)
 * et les cornes sont des SPRITES dessinés une fois, par taille quantifiée,
 * puis posés d'un `drawImage` — plus d'ombre floue ni de dégradé par image.
 * Sans surface de travail (aucun canevas hors écran), les mêmes tracés se
 * font en direct, toujours bornés au visage.
 *
 * Le coût est mesuré sur le temps RÉEL d'une image : une image sur
 * `FACE_COST_SAMPLE_EVERY`, les tracés sont vidés (`flush`) avant de lire
 * l'horloge. Quand la moyenne glissante dépasse le budget, les ornements
 * (particules, étincelles, fumée) sont abandonnés et l'effet garde sa forme et
 * sa couleur. Sous `prefers-reduced-motion`, le temps est figé et les
 * ornements partent.
 */

type Surface2D = FaceTarget['context'];

export type SpriteSurface = { readonly canvas: CanvasImageSource; readonly context: Surface2D };

/** Une surface de travail de `width` × `height`, ou `null` là où aucun canevas hors écran n'existe. */
export type SurfacePort = (width: number, height: number) => SpriteSurface | null;

export type FaceLayerOptions = {
  readonly surface?: SurfacePort;
  readonly reducedMotion?: () => boolean;
  readonly clock?: () => number;
  readonly flush?: (context: Surface2D) => void;
};

export const FACE_COST_SAMPLE_EVERY = 10;

const SPRITES_KEPT = 12;

export function browserSurface(): SurfacePort {
  if (typeof OffscreenCanvas === 'function') {
    return (width, height) => {
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext('2d');
      return context === null ? null : { canvas, context };
    };
  }
  if (typeof document === 'undefined') return () => null;
  return (width, height) => {
    const canvas = Object.assign(document.createElement('canvas'), { width, height });
    const context = canvas.getContext('2d');
    return context === null ? null : { canvas, context };
  };
}

/** `prefers-reduced-motion`, lu à chaque image sur une requête ouverte UNE fois ; dans un Worker (sans `matchMedia`), à passer par l'hôte. */
export function browserReducedMotion(): () => boolean {
  const query = typeof globalThis.matchMedia === 'function' ? globalThis.matchMedia('(prefers-reduced-motion: reduce)') : null;
  return () => query?.matches === true;
}

const browserClock = (): number => (typeof performance === 'undefined' ? Date.now() : performance.now());

const readOnePixel = (context: Surface2D): void => void context.getImageData(0, 0, 1, 1);

type Sprites = {
  readonly get: (key: string, width: number, height: number, paint: (context: Surface2D) => void) => CanvasImageSource | null;
  readonly scratch: (width: number, height: number) => SpriteSurface | null;
};

function sprites(surface: SurfacePort): Sprites {
  const cache = new Map<string, CanvasImageSource>();
  let work: { readonly surface: SpriteSurface; readonly width: number; readonly height: number } | null = null;
  return {
    get: (key, width, height, paint) => {
      const known = cache.get(key);
      if (known !== undefined) return known;
      const made = surface(Math.ceil(width), Math.ceil(height));
      if (made === null) return null;
      paint(made.context);
      if (cache.size >= SPRITES_KEPT) cache.delete(cache.keys().next().value ?? key);
      cache.set(key, made.canvas);
      return made.canvas;
    },
    scratch: (width, height) => {
      if (work !== null && work.width >= width && work.height >= height) return work.surface;
      const size = { width: Math.ceil(Math.max(width, work?.width ?? 0) / 64) * 64, height: Math.ceil(Math.max(height, work?.height ?? 0) / 64) * 64 };
      const made = surface(size.width, size.height);
      work = made === null ? null : { surface: made, ...size };
      return made;
    },
  };
}

type Scene = { readonly target: FaceTarget; readonly face: Box; readonly rich: boolean; readonly sprites: Sprites };

type Draw = (scene: Scene) => void;

function dots(context: Surface2D, particles: readonly Particle[], fill: (alpha: number) => string, opacity = 1): void {
  particles.forEach((particle) => {
    context.globalAlpha = particle.alpha * opacity;
    context.fillStyle = fill(particle.alpha);
    context.beginPath();
    context.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2);
    context.fill();
  });
  context.globalAlpha = 1;
}

/** Une lueur ronde : `rgb` plein jusqu'à `inner` (fraction du rayon), puis transparente au bord. */
function glow(scene: Scene, { rgb, inner, cx, cy, radius, alpha }: { readonly rgb: string; readonly inner: number; readonly cx: number; readonly cy: number; readonly radius: number; readonly alpha: number }): void {
  const { context } = scene.target;
  const size = glowBucket(radius * 2);
  const paint = (into: Surface2D, x: number, y: number, r: number): void => {
    const gradient = into.createRadialGradient(x, y, r * inner, x, y, r);
    gradient.addColorStop(0, `rgba(${rgb}, 1)`);
    gradient.addColorStop(1, `rgba(${rgb}, 0)`);
    into.fillStyle = gradient;
    into.fillRect(x - r, y - r, r * 2, r * 2);
  };
  const sprite = scene.sprites.get(`glow:${rgb}:${inner}:${size}`, size, size, (into) => paint(into, size / 2, size / 2, size / 2));
  context.globalAlpha = alpha;
  if (sprite === null) paint(context, cx, cy, radius);
  else context.drawImage(sprite, cx - radius, cy - radius, radius * 2, radius * 2);
  context.globalAlpha = 1;
}

const smoothing: Draw = ({ target: { context, source, width, height }, face, sprites: cache }) => {
  const cx = face.x + face.width / 2;
  const cy = face.y + face.height / 2;
  const blur = Math.max(2, Math.round(face.width * 0.018));
  const margin = blur * 2;
  const x0 = Math.max(0, Math.floor(cx - face.width * 0.55 - margin));
  const y0 = Math.max(0, Math.floor(cy - face.height * 0.62 - margin));
  const rw = Math.min(width, Math.ceil(cx + face.width * 0.55 + margin)) - x0;
  const rh = Math.min(height, Math.ceil(cy + face.height * 0.62 + margin)) - y0;
  if (rw <= 0 || rh <= 0) return;
  const half = { width: rw / 2, height: rh / 2 };
  const work = cache.scratch(half.width, half.height);
  if (work !== null) {
    work.context.clearRect(0, 0, half.width + 1, half.height + 1);
    work.context.filter = `blur(${blur / 2}px) brightness(1.04)`;
    work.context.drawImage(source, x0, y0, rw, rh, 0, 0, half.width, half.height);
    work.context.filter = 'none';
  }
  context.save();
  context.beginPath();
  context.ellipse(cx, cy, face.width * 0.55, face.height * 0.62, 0, 0, Math.PI * 2);
  context.clip();
  context.globalAlpha = 0.75;
  if (work === null) {
    context.filter = `blur(${blur}px) brightness(1.04)`;
    context.drawImage(source, x0, y0, rw, rh, x0, y0, rw, rh);
  } else context.drawImage(work.canvas, 0, 0, half.width, half.height, x0, y0, rw, rh);
  context.restore();
};

const toad: Draw = ({ target: { context }, face, rich }) => {
  const shape = toadOf(face);
  context.save();
  context.globalCompositeOperation = 'multiply';
  context.fillStyle = 'rgba(120, 200, 80, 0.55)';
  context.beginPath();
  context.ellipse(face.x + face.width / 2, face.y + face.height / 2, face.width * 0.62, face.height * 0.66, 0, 0, Math.PI * 2);
  context.fill();
  context.globalCompositeOperation = 'source-over';
  shape.cheeks.forEach((cheek) => {
    context.fillStyle = 'rgba(150, 210, 90, 0.7)';
    context.beginPath();
    context.ellipse(cheek.cx, cheek.cy, cheek.rx, cheek.ry, 0, 0, Math.PI * 2);
    context.fill();
  });
  shape.eyes.forEach((eye) => {
    context.fillStyle = '#6fbf3f';
    context.beginPath();
    context.arc(eye.cx, eye.cy, eye.r * 1.12, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#fbf6d8';
    context.beginPath();
    context.arc(eye.cx, eye.cy, eye.r, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#1b1b10';
    context.beginPath();
    context.ellipse(eye.cx, eye.cy, eye.pupil, eye.pupil * 0.55, 0, 0, Math.PI * 2);
    context.fill();
  });
  if (rich) {
    context.fillStyle = 'rgba(90, 140, 50, 0.85)';
    shape.warts.forEach((wart) => {
      context.beginPath();
      context.arc(wart.x, wart.y, wart.r, 0, Math.PI * 2);
      context.fill();
    });
  }
  context.restore();
};

const HALO_GOLD = '#ffd666';

function strokeHalo(into: Surface2D, ring: { readonly cx: number; readonly cy: number; readonly rx: number; readonly ry: number; readonly lineWidth: number }, blur: number): void {
  if (blur > 0) {
    into.shadowColor = 'rgba(255, 214, 102, 0.9)';
    into.shadowBlur = blur;
  }
  into.strokeStyle = HALO_GOLD;
  into.lineWidth = ring.lineWidth;
  into.beginPath();
  into.ellipse(ring.cx, ring.cy, ring.rx, ring.ry, 0, 0, Math.PI * 2);
  into.stroke();
}

const angel: Draw = (scene) => {
  const { target, face, rich } = scene;
  const { context, t } = target;
  const halo = haloOf(face, t);
  context.save();
  context.globalCompositeOperation = 'screen';
  glow(scene, { rgb: '255, 244, 214', inner: 0.18, cx: halo.cx, cy: face.y + face.height / 2, radius: face.width * 1.1, alpha: 0.35 * halo.glow });
  context.globalCompositeOperation = 'source-over';
  const rx = glowBucket(halo.rx);
  const ring = { rx, ry: rx * (halo.ry / halo.rx), lineWidth: halo.lineWidth * (rx / halo.rx) };
  const pad = Math.ceil(ring.lineWidth * 4);
  const sprite = scene.sprites.get(`halo:${rx}:${Math.round(ring.lineWidth)}`, rx * 2 + pad * 2, ring.ry * 2 + pad * 2, (into) => strokeHalo(into, { cx: rx + pad, cy: ring.ry + pad, ...ring }, ring.lineWidth * 3));
  if (sprite === null) strokeHalo(context, halo, 0);
  else {
    const scale = halo.rx / rx;
    context.globalAlpha = 0.6 + 0.4 * halo.glow;
    context.drawImage(sprite, halo.cx - (rx + pad) * scale, halo.cy - (ring.ry + pad) * scale, (rx + pad) * 2 * scale, (ring.ry + pad) * 2 * scale);
    context.globalAlpha = 1;
  }
  if (rich) dots(context, sparklesOf(face, t), () => 'rgb(255, 250, 220)');
  context.restore();
};

function fillHorn(into: Surface2D, horn: Horn): void {
  const gradient = into.createLinearGradient(horn.base[0].x, horn.base[0].y, horn.tip.x, horn.tip.y);
  gradient.addColorStop(0, '#5a0d0d');
  gradient.addColorStop(1, '#d9301f');
  into.fillStyle = gradient;
  into.beginPath();
  into.moveTo(horn.base[0].x, horn.base[0].y);
  into.quadraticCurveTo(horn.control.x, horn.control.y, horn.tip.x, horn.tip.y);
  into.lineTo(horn.base[1].x, horn.base[1].y);
  into.closePath();
  into.fill();
}

/** Les cornes ne dépendent que de la boîte du visage, de façon affine : un sprite pour un visage de référence, étiré au visage suivi. */
const HORN_FACE = { width: 256, height: 320, pad: 2 } as const;

const hornFace: Box = { x: HORN_FACE.pad + HORN_FACE.width * 0.02, y: HORN_FACE.pad + HORN_FACE.height * 0.32, width: HORN_FACE.width, height: HORN_FACE.height };

const horns = (scene: Scene): void => {
  const { context } = scene.target;
  const { face } = scene;
  const size = { width: HORN_FACE.width * 1.04 + HORN_FACE.pad * 2, height: HORN_FACE.height * 0.46 + HORN_FACE.pad * 2 };
  const sprite = scene.sprites.get('horns', size.width, size.height, (into) => {
    const shape = hornsOf(hornFace);
    fillHorn(into, shape.left);
    fillHorn(into, shape.right);
  });
  if (sprite === null) {
    const shape = hornsOf(face);
    fillHorn(context, shape.left);
    fillHorn(context, shape.right);
    return;
  }
  const sx = face.width / HORN_FACE.width;
  const sy = face.height / HORN_FACE.height;
  context.drawImage(sprite, face.x - hornFace.x * sx, face.y - hornFace.y * sy, Math.ceil(size.width) * sx, Math.ceil(size.height) * sy);
};

const demon: Draw = (scene) => {
  const { target, face, rich } = scene;
  const { context, width, height, t } = target;
  context.save();
  context.globalCompositeOperation = 'multiply';
  context.fillStyle = 'rgba(210, 40, 30, 0.28)';
  context.fillRect(0, 0, width, height);
  context.globalCompositeOperation = 'source-over';
  horns(scene);
  demonEyesOf(face, t).forEach((eye) => {
    glow(scene, { rgb: '255, 60, 20', inner: 0.25, cx: eye.cx, cy: eye.cy, radius: eye.r * 4, alpha: eye.glow });
    context.globalAlpha = 0.55 + 0.35 * eye.glow;
    context.fillStyle = 'rgb(255, 70, 30)';
    context.beginPath();
    context.arc(eye.cx, eye.cy, eye.r, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 1;
  });
  if (rich) dots(context, risingParticles({ seed: 7, t, count: 18, area: { x: 0, y: height * 0.4, width, height: height * 0.6 } }), () => 'rgb(255, 110, 40)');
  context.restore();
};

/** La lave monte du bas jusqu'à 35 % de la hauteur : un dégradé vertical, en sprite d'un pixel de large, étiré. */
const LAVA_STEPS = 256;

function paintLava(into: Surface2D, x: number, top: number, width: number, bottom: number): void {
  const lava = into.createLinearGradient(0, bottom, 0, top);
  lava.addColorStop(0, 'rgba(255, 90, 0, 0.75)');
  lava.addColorStop(0.45, 'rgba(255, 140, 20, 0.35)');
  lava.addColorStop(1, 'rgba(255, 140, 20, 0)');
  into.fillStyle = lava;
  into.fillRect(x, top, width, bottom - top);
}

const SPARKS = [0, 1, 2, 3, 4].map((level) => `rgb(255, ${150 + Math.round((level / 4) * 80)}, 40)`);

const volcano: Draw = (scene) => {
  const { target, rich } = scene;
  const { context, width, height, t } = target;
  context.save();
  context.globalCompositeOperation = 'screen';
  context.globalAlpha = lavaGlow(t);
  const sprite = scene.sprites.get('lava', 1, LAVA_STEPS, (into) => paintLava(into, 0, 0, 1, LAVA_STEPS));
  if (sprite === null) paintLava(context, 0, height * 0.35, width, height);
  else context.drawImage(sprite, 0, height * 0.35, width, height * 0.65);
  context.globalAlpha = 1;
  context.globalCompositeOperation = 'source-over';
  if (rich) {
    dots(context, risingParticles({ seed: 3, t, count: 12, area: { x: 0, y: 0, width, height: height * 0.5 }, size: width * 0.03, period: 5200 }), () => 'rgb(60, 50, 45)', 0.25);
    dots(context, risingParticles({ seed: 11, t, count: 28, area: { x: 0, y: 0, width, height } }), (alpha) => SPARKS[Math.round(alpha * 4)] ?? 'rgb(255, 230, 40)');
  }
  context.restore();
};

const DRAW: Readonly<Record<Exclude<FaceEffect, 'none'>, Draw>> = { smoothing, toad, angel, demon, volcano };

/** Le calque du traitement des images : le visage suivi, le coût surveillé, l'effet tracé. */
export function createFaceLayer(detector: FaceDetectorPort | null, options: FaceLayerOptions = {}): FaceLayer {
  const tracker = createFaceTracker(detector);
  const cache = sprites(options.surface ?? browserSurface());
  const reducedMotion = options.reducedMotion ?? browserReducedMotion();
  const clock = options.clock ?? browserClock;
  const flush = options.flush ?? readOnePixel;
  let frameIndex = 0;
  let load: EffectLoad = { ema: 0, degraded: false };
  return (target, effects) => {
    if (effects.faceEffect === 'none') return;
    const sampled = frameIndex % FACE_COST_SAMPLE_EVERY === FACE_COST_SAMPLE_EVERY - 1;
    const started = sampled ? clock() : 0;
    const face = tracker.next(target.source, target, frameIndex);
    frameIndex += 1;
    const still = reducedMotion();
    DRAW[effects.faceEffect]({ target: still ? { ...target, t: FROZEN_T } : target, face, rich: !still && !load.degraded, sprites: cache });
    if (!sampled) return;
    flush(target.context);
    load = nextEffectLoad(load, clock() - started);
  };
}
