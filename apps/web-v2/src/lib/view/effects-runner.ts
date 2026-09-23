import {
  confettiFrame,
  confettiSeeds,
  effectPlaybackPlanOf,
  ENTRANCE_OVERLAY_DURATION_MS,
  ENTRANCE_SURFACE_ANIMATIONS,
  fireworkFrame,
  fireworkSeeds,
  GLOW_SHADOW,
  glowLayerAnimation,
  PULSE_ANIMATION,
  RAINBOW_COMET_ARC,
  RAINBOW_SPECTRUM,
  rainbowCometAnimation,
  REDUCED_MOTION_FLASH,
  SPARKLE_FRAME_INTERVAL_MS,
  sparkleDots,
  type ParticleFrame,
  type SurfaceAnimation,
} from '@/lib/effects-playback';

/**
 * L'EXÉCUTION DES EFFETS D'UN MESSAGE À L'ÉCRAN (#7596) — la moitié
 * IMPÉRATIVE de `lib/effects-playback.ts` : elle prend un hôte déjà à l'écran,
 * joue ce que le plan dit, et rend la fonction qui ARRÊTE tout.
 *
 * Pourquoi impératif et pas un rendu React : un effet est une décoration de
 * passage. Le monter en état ferait re-rendre la rangée (et, en liste
 * virtualisée, remesurer sa hauteur) à chaque début et fin d'animation. Ici
 * rien ne re-rend : la Web Animations API anime la surface, les calques sont
 * des nœuds `aria-hidden` ajoutés puis retirés, et le virtualiseur ne voit
 * jamais changer la hauteur (tout est en `position: absolute` ou en
 * `transform`).
 *
 * **Ce qui tourne s'ARRÊTE quand la bulle quitte l'écran** : `stop()` annule
 * chaque animation, coupe chaque boucle `requestAnimationFrame`, retire chaque
 * calque. Une liste qui défile ne laisse aucune particule tourner hors champ —
 * c'est la loi d'iOS (« un effet persistant s'anime tant que son message est À
 * L'ÉCRAN », `MessageEffectModifiers.swift`).
 */

type Cleanup = () => void;

const SURFACE_SELECTOR = '[data-effects-surface]';
const PARTICLE_MARGIN = 80;
const DEFAULT_FLAT_RADIUS = 12;

export function prefersReducedMotion(): boolean {
  const media = typeof globalThis.matchMedia === 'function' ? globalThis.matchMedia('(prefers-reduced-motion: reduce)') : null;
  return media?.matches === true;
}

function animate(element: Element, spec: SurfaceAnimation, cleanups: Cleanup[]): void {
  if (typeof element.animate !== 'function') return;
  const animation = element.animate([...spec.keyframes], spec.options);
  cleanups.push(() => animation.cancel());
}

function radiusOf(surface: HTMLElement, host: HTMLElement): number {
  const declared = Number.parseFloat(globalThis.getComputedStyle?.(surface).borderTopLeftRadius ?? '');
  if (Number.isFinite(declared) && declared > 0) return declared;
  return surface === host ? DEFAULT_FLAT_RADIUS : 18;
}

/** Un calque posé EXACTEMENT sur la surface, dans le repère de l'hôte (`position: relative`). */
function layerOver(host: HTMLElement, surface: HTMLElement, marker: string, cleanups: Cleanup[]): HTMLDivElement {
  const layer = document.createElement('div');
  layer.setAttribute('aria-hidden', 'true');
  layer.setAttribute(marker.split('=')[0] ?? marker, marker.split('=')[1] ?? '');
  const hostBox = host.getBoundingClientRect();
  const box = surface.getBoundingClientRect();
  Object.assign(layer.style, {
    position: 'absolute',
    pointerEvents: 'none',
    zIndex: '1',
    top: `${box.top - hostBox.top}px`,
    left: `${box.left - hostBox.left}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
    borderRadius: `${radiusOf(surface, host)}px`,
  });
  host.appendChild(layer);
  cleanups.push(() => layer.remove());
  return layer;
}

type Particles = {
  readonly frameAt: (elapsedMs: number, width: number, height: number) => readonly (ParticleFrame & { size: number; color: string; shape: 'rect' | 'dot' })[];
  readonly durationMs: number | null;
  readonly intervalMs: number;
};

/**
 * UNE BOUCLE DE PARTICULES SUR UN CANEVAS — un seul `<canvas>` par effet,
 * débordant de la surface (les gerbes sortent de la bulle, comme sur iOS),
 * redessiné par `requestAnimationFrame` et coupé à la fin de sa durée ou par
 * `stop()`. La densité est plafonnée à 2 : au-delà, le coût de remplissage
 * grimpe sans gain visible.
 */
function runParticles(
  host: HTMLElement,
  surface: HTMLElement,
  name: string,
  particles: Particles,
  cleanups: Cleanup[],
): void {
  const layer = layerOver(host, surface, `data-effect-particles=${name}`, cleanups);
  layer.style.overflow = 'visible';
  const canvas = document.createElement('canvas');
  const width = Number.parseFloat(layer.style.width) || 0;
  const height = Number.parseFloat(layer.style.height) || 0;
  const ratio = Math.min(globalThis.devicePixelRatio || 1, 2);
  canvas.width = Math.round((width + PARTICLE_MARGIN * 2) * ratio);
  canvas.height = Math.round((height + PARTICLE_MARGIN * 2) * ratio);
  Object.assign(canvas.style, {
    position: 'absolute',
    top: `${-PARTICLE_MARGIN}px`,
    left: `${-PARTICLE_MARGIN}px`,
    width: `${width + PARTICLE_MARGIN * 2}px`,
    height: `${height + PARTICLE_MARGIN * 2}px`,
  });
  layer.appendChild(canvas);

  const context = canvas.getContext?.('2d') ?? null;
  const raf = globalThis.requestAnimationFrame;
  if (context === null || typeof raf !== 'function') return;

  let handle = 0;
  let started = -1;
  let lastPaint = -Infinity;
  const tick = (now: number) => {
    if (started < 0) started = now;
    const elapsed = now - started;
    if (particles.durationMs !== null && elapsed > particles.durationMs) {
      layer.remove();
      return;
    }
    if (now - lastPaint >= particles.intervalMs) {
      lastPaint = now;
      context.setTransform(ratio, 0, 0, ratio, ratio * PARTICLE_MARGIN, ratio * PARTICLE_MARGIN);
      context.clearRect(-PARTICLE_MARGIN, -PARTICLE_MARGIN, width + PARTICLE_MARGIN * 2, height + PARTICLE_MARGIN * 2);
      for (const p of particles.frameAt(elapsed, width, height)) {
        context.globalAlpha = Math.max(0, Math.min(1, p.opacity));
        context.fillStyle = p.color;
        if (p.shape === 'rect') context.fillRect(p.x - p.size / 2, p.y - p.size * 0.3, p.size, p.size * 0.6);
        else {
          context.beginPath();
          context.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
          context.fill();
        }
      }
    }
    handle = raf(tick);
  };
  handle = raf(tick);
  cleanups.push(() => globalThis.cancelAnimationFrame?.(handle));
}

function confettiParticles(): Particles {
  const seeds = confettiSeeds();
  return {
    durationMs: ENTRANCE_OVERLAY_DURATION_MS.confetti,
    intervalMs: 0,
    frameAt: (elapsed, width, height) =>
      seeds.map((seed) => ({ ...confettiFrame(seed, elapsed, width, height), size: seed.size, color: seed.color, shape: 'rect' as const })),
  };
}

function fireworkParticles(): Particles {
  const seeds = fireworkSeeds();
  return {
    durationMs: ENTRANCE_OVERLAY_DURATION_MS.fireworks,
    intervalMs: 0,
    frameAt: (elapsed, width, height) =>
      seeds.map((seed) => ({ ...fireworkFrame(seed, elapsed, width, height), size: 4, color: seed.color, shape: 'dot' as const })),
  };
}

function sparkleParticles(): Particles {
  return {
    durationMs: null,
    intervalMs: SPARKLE_FRAME_INTERVAL_MS,
    frameAt: (elapsed, width, height) =>
      sparkleDots(elapsed / 1000, width, height).map((dot) => ({ ...dot, color: '#FFFFFF', shape: 'dot' as const })),
  };
}

/** Retire un calque d'apparition à la fin de sa durée — l'arrêt anticipé le retire aussi. */
function expireAfter(layer: HTMLElement, durationMs: number, cleanups: Cleanup[]): void {
  const timer = globalThis.setTimeout(() => layer.remove(), durationMs);
  cleanups.push(() => globalThis.clearTimeout(timer));
}

function explodeBurst(host: HTMLElement, surface: HTMLElement, cleanups: Cleanup[]): void {
  const layer = layerOver(host, surface, 'data-effect-overlay=explode', cleanups);
  const burst = document.createElement('div');
  Object.assign(burst.style, {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: '120px',
    height: '120px',
    margin: '-60px 0 0 -60px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(99, 102, 241, 0.4), transparent 70%)',
  });
  layer.appendChild(burst);
  animate(
    burst,
    {
      keyframes: [
        { offset: 0, transform: 'scale(0.3)', opacity: 1 },
        { offset: 0.5, opacity: 1 },
        { offset: 1, transform: 'scale(2.5)', opacity: 0 },
      ],
      options: { duration: ENTRANCE_OVERLAY_DURATION_MS.explode, easing: 'ease-out', fill: 'forwards' },
    },
    cleanups,
  );
  expireAfter(layer, ENTRANCE_OVERLAY_DURATION_MS.explode, cleanups);
}

function waooStar(host: HTMLElement, surface: HTMLElement, cleanups: Cleanup[]): void {
  const layer = layerOver(host, surface, 'data-effect-overlay=waoo', cleanups);
  const star = document.createElement('span');
  star.textContent = '★';
  Object.assign(star.style, {
    position: 'absolute',
    left: '50%',
    top: '50%',
    fontSize: '30px',
    lineHeight: '1',
    transform: 'translate(-50%, -50%)',
    background: 'linear-gradient(#FACC15, #F97316)',
    webkitBackgroundClip: 'text',
    backgroundClip: 'text',
    color: 'transparent',
  });
  layer.appendChild(star);
  animate(
    star,
    {
      keyframes: [
        { offset: 0, transform: 'translate(-50%, -50%) scale(0.5)', opacity: 1 },
        { offset: 0.4, transform: 'translate(-50%, -50%) scale(1.5)', opacity: 1 },
        { offset: 0.625, transform: 'translate(-50%, -50%) scale(1.5)', opacity: 1 },
        { offset: 1, transform: 'translate(-50%, -50%) scale(0)', opacity: 0 },
      ],
      options: { duration: ENTRANCE_OVERLAY_DURATION_MS.waoo, easing: 'ease-out', fill: 'forwards' },
    },
    cleanups,
  );
  expireAfter(layer, ENTRANCE_OVERLAY_DURATION_MS.waoo, cleanups);
}

function glowLayer(host: HTMLElement, surface: HTMLElement, animated: boolean, cleanups: Cleanup[]): void {
  const layer = layerOver(host, surface, 'data-effect-overlay=glow', cleanups);
  layer.style.boxShadow = GLOW_SHADOW;
  layer.style.zIndex = '0';
  const spec = glowLayerAnimation(animated);
  if (spec !== null) animate(layer, spec, cleanups);
}

/** Un anneau au dégradé conique, découpé par un masque : le liseré (1 px) et le halo flouté (5 px). */
function spectrumRing(radius: number, width: number, blur: number, opacity: number): HTMLDivElement {
  const ring = document.createElement('div');
  const gradient = `conic-gradient(${RAINBOW_SPECTRUM.join(', ')})`;
  const mask = 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)';
  Object.assign(ring.style, {
    position: 'absolute',
    inset: `${-width / 2}px`,
    padding: `${width}px`,
    borderRadius: `${radius + width / 2}px`,
    background: gradient,
    opacity: String(opacity),
    filter: blur > 0 ? `blur(${blur}px)` : '',
  });
  ring.style.setProperty('mask', mask);
  ring.style.setProperty('mask-composite', 'exclude');
  ring.style.setProperty('-webkit-mask', mask);
  ring.style.setProperty('-webkit-mask-composite', 'xor');
  return ring;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function cometRect(radius: number, stroke: string, width: number, blur: number): SVGRectElement {
  const rect = document.createElementNS(SVG_NS, 'rect');
  const attributes: Record<string, string> = {
    x: '0',
    y: '0',
    width: '100%',
    height: '100%',
    rx: String(radius),
    fill: 'none',
    stroke,
    'stroke-width': String(width),
    'stroke-linecap': 'round',
    pathLength: '1',
    'stroke-dasharray': `${RAINBOW_COMET_ARC} ${1 - RAINBOW_COMET_ARC}`,
    'stroke-dashoffset': String(RAINBOW_COMET_ARC),
    opacity: '0',
  };
  for (const [key, value] of Object.entries(attributes)) rect.setAttribute(key, value);
  if (blur > 0) rect.style.filter = `blur(${blur}px)`;
  return rect;
}

/**
 * L'AURORE (`RainbowEffect`) — spectre POSÉ (halo + liseré, fixes), et une
 * comète qui parcourt le PÉRIMÈTRE puis se repose. La comète ne naît que si le
 * mouvement est permis ; le spectre reste sous « réduire les animations ».
 */
function rainbowAurora(host: HTMLElement, surface: HTMLElement, animated: boolean, cleanups: Cleanup[]): void {
  const layer = layerOver(host, surface, 'data-effect-overlay=rainbow', cleanups);
  const radius = radiusOf(surface, host);
  layer.appendChild(spectrumRing(radius, 5, 6, 0.35));
  layer.appendChild(spectrumRing(radius, 1, 0, 0.75));
  if (!animated) return;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  Object.assign(svg.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', overflow: 'visible' });
  const glow = cometRect(radius, '#E879F9', 6, 4);
  const core = cometRect(radius, '#FFFFFF', 1.5, 0.5);
  svg.appendChild(glow);
  svg.appendChild(core);
  layer.appendChild(svg);
  const comet = rainbowCometAnimation();
  animate(glow, comet, cleanups);
  animate(core, comet, cleanups);
}

/**
 * JOUE les effets de `effectFlags` sur `host` (l'hôte vient d'entrer à
 * l'écran) et rend la fonction qui arrête TOUT. `data-effects-playing` dit, à
 * qui l'inspecte, ce qui est en cours — jamais au lecteur d'écran : un effet
 * est une décoration, l'information du message n'en dépend pas.
 */
export function playMessageEffects(host: HTMLElement, effectFlags: number): () => void {
  const plan = effectPlaybackPlanOf(effectFlags, prefersReducedMotion());
  const surface = host.querySelector<HTMLElement>(SURFACE_SELECTOR) ?? host;
  const cleanups: Cleanup[] = [];

  if (plan.flash) animate(surface, REDUCED_MOTION_FLASH, cleanups);
  for (const effect of plan.appearance) {
    const spec = ENTRANCE_SURFACE_ANIMATIONS[effect];
    if (spec !== undefined) animate(surface, spec, cleanups);
    if (effect === 'confetti') runParticles(host, surface, 'confetti', confettiParticles(), cleanups);
    if (effect === 'fireworks') runParticles(host, surface, 'fireworks', fireworkParticles(), cleanups);
    if (effect === 'explode') explodeBurst(host, surface, cleanups);
    if (effect === 'waoo') waooStar(host, surface, cleanups);
  }
  for (const effect of plan.persistent) {
    if (effect === 'glow') glowLayer(host, surface, plan.animatesPersistent, cleanups);
    if (effect === 'pulse') animate(surface, PULSE_ANIMATION, cleanups);
    if (effect === 'rainbow') rainbowAurora(host, surface, plan.animatesPersistent, cleanups);
    if (effect === 'sparkle') runParticles(host, surface, 'sparkle', sparkleParticles(), cleanups);
  }

  const playing = [...plan.appearance, ...plan.persistent, ...(plan.flash ? ['flash'] : [])];
  host.setAttribute('data-effects-playing', playing.join(' '));

  return () => {
    for (const cleanup of cleanups.reverse()) cleanup();
    host.setAttribute('data-effects-playing', '');
  };
}
