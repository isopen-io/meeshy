import type { MintCeremonyDustMaterial, MintCeremonyPlan, MintCeremonySpan } from '@meeshy/shared/utils/game/mint-ceremony';

/**
 * LA CÉRÉMONIE DE LA FRAPPE, IMAGE PAR IMAGE (#11177, épopée § 7) — ce que la scène plein écran montre à chaque
 * instant, calculé depuis la loi partagée (`@meeshy/shared/utils/game/mint-ceremony`, qui dit QUAND) et la maquette
 * validée (`docs/product/epopee/frappe-ceremonie.html`, ses fonctions `build()`, `draw()` et `dom()`, qui disent
 * COMMENT). Rien ici ne touche le DOM : la scène (`components/game/mint-ceremony.tsx`) applique ces valeurs, en
 * `transform` et `opacity` seulement, et le canevas reçoit les particules.
 *
 * Le repère est celui de la maquette : une scène de 360 × 640, mise à l'échelle de l'écran sans déformation. Le
 * temps est en SECONDES depuis le toucher (la loi parle en millisecondes, la géométrie en secondes).
 *
 * LE REFUS REMONTE LE TEMPS : passé l'instant du refus, tout ce qui avait été tissé (étincelles, poussière, flan)
 * se rejoue à l'envers, plus vite si le refus est tardif, jusqu'au départ des étincelles — elles reviennent à ta
 * lumière par le chemin qu'elles avaient pris (`sceneTime`). Mee et Meo, eux, restent là.
 */

export const SCENE = { width: 360, height: 640 } as const;

const C = { x: 180, y: 300 };
const R = 84;
const ORB = { x: 180, y: 96 };
const FORM = 168;
const ANVIL = 116;
const ANVIL_C = { x: 180, y: 543 - ANVIL / 2 + 3 };
const DIE_ON = { x: 180 - 13, y: ANVIL_C.y - ANVIL / 2 - 46 };
const MEE_HOME = { x: 10, y: 244 };
const MEO_HOME = { x: 258, y: 244 };
const MEE_STRIKE = { x: 14, y: 404 };
const MEO_STRIKE = { x: 252, y: 394 };
const MEE_END = { x: 12, y: 262 };
const MEO_END = { x: 256, y: 262 };
const MEE_SOW = { x: 96, y: 296 };
const MEO_SOW = { x: 264, y: 296 };
const REST = 12;
const WIND = 62;
const HIT = -54;
const REST_M = -12;
const WIND_M = -62;
const HIT_M = 50;
const COIN_BOX = 150;

/** Le centre du cercle tissé et l'enclume, pour les calques de la scène. */
export const SCENE_MARKS = { circle: C, radius: R, orb: ORB, anvil: ANVIL_C, coinBox: COIN_BOX, bird: 92 } as const;

const clamp = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
/** La progression de `t` entre `a` et `b`, de 0 à 1 ; une phase qui ne commence jamais (`Infinity`) reste à 0. */
const seg = (t: number, a: number, b: number): number => {
  if (a === Infinity) return 0;
  if (b <= a) return t >= a ? 1 : 0;
  return clamp((t - a) / (b - a));
};
const lerp = (a: number, b: number, x: number): number => a + (b - a) * x;
const eOut = (x: number): number => 1 - Math.pow(1 - x, 3);
const eIn = (x: number): number => x * x * x;
const eIO = (x: number): number => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const eSine = (x: number): number => -(Math.cos(Math.PI * x) - 1) / 2;
const bump = (t: number, at: number, len: number): number => {
  const x = (t - at) / len;
  return x < 0 || x > 1 ? 0 : Math.sin(Math.PI * x);
};

/** Une phase de la loi, en secondes ; une phase absente ne commence jamais. */
type Seconds = { readonly from: number; readonly to: number };
const NEVER: Seconds = { from: Infinity, to: Infinity };
const sec = (value: MintCeremonySpan | null): Seconds => (value === null ? NEVER : { from: value.fromMs / 1000, to: value.toMs / 1000 });

/** Le générateur de la maquette (mulberry32) : la même pièce tisse toujours le même cercle. */
const rng = (seed: number): (() => number) => {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * LE TEMPS DE LA SCÈNE — égal au temps du toucher, sauf après un refus : la scène remonte alors jusqu'au départ des
 * étincelles, à la vitesse que la loi fixe (`rewind`), et reste là.
 */
export function sceneTime(plan: MintCeremonyPlan, t: number): number {
  const refusal = plan.refusal;
  if (refusal === null) return t;
  const at = refusal.atMs / 1000;
  if (t <= at) return t;
  const length = (refusal.rewind.toMs - refusal.rewind.fromMs) / 1000;
  const back = refusal.rewindToMs / 1000;
  if (length <= 0) return back;
  return Math.max(back - 0.001, at - ((t - at) * (at - back)) / length);
}

type Weave = { s: number; d: number; phi0: number; delta: number; r0: number; dir: number; j: number; tw: number; big: boolean; tone: number };
type Grain = { s: number; d: number; ox: number; oy: number; tx: number; ty: number; cx: number; cy: number; rho: number; psi: number; size: number; material: MintCeremonyDustMaterial; tone: number };
type Spark = { strike: number; x: number; y: number; vx: number; vy: number; life: number; size: number; tone: number };
type Puff = { x: number; y: number; vx: number; vy: number; life: number };

export type CeremonyParticles = {
  readonly weave: readonly Weave[];
  readonly dust: readonly Grain[];
  readonly bursts: readonly Spark[];
  readonly puff: readonly Puff[];
};

/**
 * LES PARTICULES — tirées UNE fois par frappe, depuis le numéro de la pièce. Les instants de départ viennent des
 * phases de la loi ; les gerbes sont posées RELATIVEMENT à leur coup, si bien qu'une réponse tardive de la
 * passerelle (qui décale les coups) n'oblige pas à les retirer. Une poussière que le refus a devancée n'est pas
 * semée.
 */
export function buildCeremonyParticles(plan: MintCeremonyPlan, seed: number): CeremonyParticles {
  const r = rng(seed * 7919 + 3);
  const emit = sec(plan.phases.emit);
  const dust = sec(plan.phases.dust);
  const weave = Array.from({ length: plan.particles.weave }, (_, i): Weave => {
    const ox = ORB.x + (r() - 0.5) * 22;
    const oy = ORB.y + (r() - 0.5) * 22;
    const s = lerp(emit.from, emit.to, Math.pow(r(), 0.9));
    const d = 0.55 + r() * 0.3;
    const th = r() * Math.PI * 2;
    const dir = i % 2 === 1 ? 1 : -1;
    const phi0 = Math.atan2(oy - C.y, ox - C.x);
    const r0 = Math.hypot(ox - C.x, oy - C.y);
    const raw = th - phi0;
    const wrapped = dir > 0 ? ((raw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) : -((((-raw) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI));
    const delta = wrapped + dir * Math.PI * (0.3 + r() * 0.5);
    return { s, d, phi0, delta, r0, dir, j: (r() - 0.5) * 3.2, tw: r() * 6.28, big: r() < 0.12, tone: Math.floor((th / (2 * Math.PI)) * 7) % 7 };
  }).sort((a, b) => a.tone - b.tone);
  const sown = plan.phases.dust === null ? [] : plan.particles.dust;
  const grains = sown.flatMap((group) =>
    Array.from({ length: group.count }, (_, j): Grain => {
      const mee = group.from === 'mee';
      const home = mee ? MEE_SOW : MEO_SOW;
      const ox = home.x + (r() - 0.5) * 18;
      const oy = home.y + (r() - 0.5) * 26;
      const rho = (R - 8) * Math.sqrt(r());
      const psi = r() * Math.PI * 2;
      const tx = C.x + rho * Math.cos(psi);
      const ty = C.y + rho * Math.sin(psi);
      return {
        s: lerp(dust.from, dust.to, r()),
        d: 0.45 + r() * 0.3,
        ox,
        oy,
        tx,
        ty,
        cx: (ox + tx) / 2 + (mee ? 10 : -10),
        cy: Math.min(oy, ty) - 50 - r() * 40,
        rho,
        psi,
        size: 0.9 + r() * 0.9,
        material: group.material,
        tone: j,
      };
    }),
  );
  const bursts = plan.particles.bursts.flatMap((count, strike) => {
    const final = strike === plan.particles.bursts.length - 1;
    const power = final ? (plan.grand ? 1.5 : 1.1) : 0.55;
    return Array.from({ length: count }, (_, b): Spark => {
      const angle = -Math.PI * (0.08 + 0.84 * r());
      const speed = (120 + 260 * r()) * power;
      return { strike, x: 180 + (r() - 0.5) * 20, y: ANVIL_C.y - ANVIL / 2 - 4, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0.45 + r() * 0.6, size: 1.2 + r() * 1.6, tone: b };
    });
  });
  const puff = Array.from({ length: plan.particles.puff }, (_, m): Puff => {
    const side = m % 2 === 1 ? 1 : -1;
    return { x: 180 + side * (30 + r() * 30), y: 541, vx: side * (40 + r() * 90), vy: -(10 + r() * 40), life: 0.4 + r() * 0.35 };
  });
  const byShade = (g: Grain): string => `${g.material}${g.material === 'diamond' ? (g.tone % 7 === 0 ? 'i' : g.tone % 2) : g.tone % 12}`;
  return { weave, dust: [...grains].sort((a, b) => (byShade(a) < byShade(b) ? -1 : byShade(a) > byShade(b) ? 1 : 0)), bursts, puff };
}

/** Les couleurs du canevas, lues dans les jetons de la scène (`styles/game-ceremony.css`) : aucune n'est écrite ici. */
export type CeremonyPalette = {
  /** Les fils du tissage de l'édition (argent, or) ; le prisme prend les sept couleurs de `iris`. */
  readonly weave: readonly string[];
  readonly iris: readonly string[];
  readonly silver: readonly string[];
  readonly gold: readonly string[];
  readonly diamond: readonly string[];
  readonly spark: readonly string[];
  readonly ash: string;
};

/** Le peu du contexte 2D que la scène emploie : un témoin le remplace par un enregistreur. */
export type CeremonyCanvas = {
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  arc(x: number, y: number, r: number, start: number, end: number): void;
  fill(): void;
  globalAlpha: number;
  globalCompositeOperation: string;
  fillStyle: string | CanvasGradient | CanvasPattern;
};

const pick = (list: readonly string[], index: number): string => list[((index % list.length) + list.length) % list.length] ?? '';

/** La position d'un fil du tissage, `null` avant son départ. Les deux brins tournent en sens opposés et se croisent. */
function weavePos(plan: MintCeremonyPlan, w: Weave, tt: number): readonly [number, number, number] | null {
  if (tt < w.s) return null;
  const tighten = sec(plan.phases.tighten);
  const amplitude = 9 * (1 - seg(tt, tighten.from, tighten.to));
  const x = (tt - w.s) / w.d;
  if (x < 1) {
    const phi = w.phi0 + w.delta * eSine(x);
    const rr = lerp(w.r0, R + w.dir * amplitude * Math.sin(6 * phi) + w.j, eOut(x));
    return [C.x + rr * Math.cos(phi), C.y + rr * Math.sin(phi), seg(tt, w.s, w.s + 0.12)];
  }
  const phi = w.phi0 + w.delta + w.dir * 1.3 * (tt - w.s - w.d);
  const rr = R + w.dir * amplitude * Math.sin(6 * phi) + w.j;
  return [C.x + rr * Math.cos(phi), C.y + rr * Math.sin(phi), seg(tt, w.s, w.s + 0.12)];
}

/** Le rayon d'un fil autour du centre du cercle, pour les témoins (`null` avant son départ). */
export const weaveRadius = (plan: MintCeremonyPlan, particles: CeremonyParticles, index: number, t: number): number | null => {
  const w = particles.weave[index];
  const pos = w === undefined ? null : weavePos(plan, w, sceneTime(plan, t));
  return pos === null ? null : Math.hypot(pos[0] - C.x, pos[1] - C.y);
};

/**
 * Peint les particules de l'instant `t` (en secondes) ; rend le nombre de particules peintes. `scale` est le facteur
 * qui porte la scène de 360 × 640 dans le canevas (échelle de l'écran × densité de pixels plafonnée à 2). `stride` 2
 * ne peint qu'un fil et un grain sur deux : la scène y passe d'elle-même quand les images tardent.
 */
export function drawCeremonyParticles(
  ctx: CeremonyCanvas,
  plan: MintCeremonyPlan,
  particles: CeremonyParticles,
  palette: CeremonyPalette,
  t: number,
  scale: number,
  stride: 1 | 2 = 1,
): number {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, SCENE.width, SCENE.height);
  const tt = sceneTime(plan, t);
  const blank = sec(plan.phases.blank);
  const prism = plan.edition === 'prism';
  const shift = Math.floor(t * 2);
  let painted = 0;
  let style = '';
  const paint = (next: string): void => {
    if (next === style) return;
    style = next;
    ctx.fillStyle = next;
  };
  ctx.globalCompositeOperation = 'lighter';
  const fadeWeave = 1 - seg(tt, blank.from, blank.to + 0.15);
  if (fadeWeave > 0) {
    for (let i = 0; i < particles.weave.length; i += stride) {
      const w = particles.weave[i];
      if (w === undefined) continue;
      const pos = weavePos(plan, w, tt);
      if (pos === null) continue;
      const a = pos[2] * fadeWeave * (0.62 + 0.38 * Math.sin(t * 13 + w.tw));
      if (a < 0.02) continue;
      paint(prism ? pick(palette.iris, w.tone + shift) : pick(palette.weave, w.tone));
      ctx.globalAlpha = a * 0.2;
      ctx.fillRect(pos[0] - 2.4, pos[1] - 2.4, 4.8, 4.8);
      ctx.globalAlpha = a;
      const size = w.big ? 2.2 : 1.5;
      ctx.fillRect(pos[0] - size / 2, pos[1] - size / 2, size, size);
      painted += 1;
    }
  }
  const fadeDust = 1 - seg(tt, blank.from + 0.1, blank.to);
  if (fadeDust > 0) {
    for (let i = 0; i < particles.dust.length; i += stride) {
      const g = particles.dust[i];
      if (g === undefined) continue;
      if (tt < g.s) continue;
      const a = seg(tt, g.s, g.s + 0.08) * fadeDust;
      if (a < 0.02) continue;
      const x = (tt - g.s) / g.d;
      let px: number;
      let py: number;
      if (x < 1) {
        const e = eIO(x);
        const u = 1 - e;
        px = u * u * g.ox + 2 * u * e * g.cx + e * e * g.tx;
        py = u * u * g.oy + 2 * u * e * g.cy + e * e * g.ty;
      } else {
        const angle = g.psi + 0.55 * (tt - g.s - g.d);
        px = C.x + g.rho * Math.cos(angle);
        py = C.y + g.rho * Math.sin(angle);
      }
      ctx.globalAlpha = g.material === 'diamond' ? a : a * 0.9;
      paint(g.material === 'diamond' ? (g.tone % 7 === 0 ? pick(palette.iris, g.tone + shift) : pick(palette.diamond, g.tone)) : pick(g.material === 'gold' ? palette.gold : palette.silver, g.tone));
      ctx.fillRect(px - g.size / 2, py - g.size / 2, g.size, g.size);
      if (g.material === 'diamond' && g.tone % 9 === 0) {
        ctx.globalAlpha = a * (0.55 + 0.45 * Math.sin(t * 17 + g.tone));
        ctx.fillRect(px - 3.2, py - 0.4, 6.4, 0.8);
        ctx.fillRect(px - 0.4, py - 3.2, 0.8, 6.4);
      }
      painted += 1;
    }
  }
  for (const b of particles.bursts) {
    const at = (plan.strikes[b.strike]?.impactMs ?? Infinity) / 1000;
    const dt = t - at;
    if (dt < 0 || dt > b.life) continue;
    const a = 1 - dt / b.life;
    const x = b.x + b.vx * dt;
    const y = b.y + b.vy * dt + 300 * dt * dt;
    paint(prism ? pick(palette.iris, b.tone + shift) : pick(palette.spark, b.tone));
    ctx.globalAlpha = a;
    ctx.fillRect(x - b.size / 2, y - b.size / 2, b.size, b.size);
    ctx.globalAlpha = a * 0.25;
    ctx.fillRect(x - 2.5, y - 2.5, 5, 5);
    painted += 1;
  }
  ctx.globalCompositeOperation = 'source-over';
  const landed = sec(plan.phases.descent).to;
  for (const p of particles.puff) {
    const dp = tt - landed;
    if (dp < 0 || dp > p.life) continue;
    ctx.globalAlpha = 0.55 * (1 - dp / p.life);
    paint(palette.ash);
    ctx.beginPath();
    ctx.arc(p.x + p.vx * dp, p.y + p.vy * dp, 2 + dp * 9, 0, 6.283);
    ctx.fill();
    painted += 1;
  }
  ctx.globalAlpha = 1;
  return painted;
}

export type CeremonyPose = 'rest' | 'party' | 'courage';

export type ActorFrame = { readonly x: number; readonly y: number; readonly rotate: number; readonly scale: number; readonly pose: CeremonyPose };
export type HammerFrame = { readonly x: number; readonly y: number; readonly angle: number; readonly opacity: number };

/** Tout ce que la scène pose hors du canevas, à un instant. Des nombres, que la scène écrit en `transform` et `opacity`. */
export type CeremonyFrame = {
  readonly backdrop: number;
  readonly shake: { readonly x: number; readonly y: number };
  readonly orb: number;
  readonly mee: ActorFrame;
  readonly meo: ActorFrame;
  readonly die: { readonly x: number; readonly y: number; readonly squash: number; readonly opacity: number };
  readonly hammerMeo: HammerFrame;
  readonly hammerMee: HammerFrame;
  /** La pièce : centre, échelle (1 = 150 unités), écrasement, rotation (degrés), et la gravure (0 flan, 1 avers frappé). */
  readonly coin: { readonly x: number; readonly y: number; readonly scale: number; readonly squash: number; readonly rotateY: number; readonly opacity: number; readonly engraved: number };
  readonly glow: { readonly x: number; readonly y: number; readonly scale: number; readonly opacity: number };
  readonly flash: number;
  readonly ring: { readonly scale: number; readonly opacity: number };
  readonly tchak: { readonly opacity: number; readonly scale: number; readonly final: boolean };
  readonly rays: { readonly opacity: number; readonly rotate: number; readonly scale: number };
  readonly sign: number;
  readonly say: number;
  readonly shadow: { readonly opacity: number; readonly scale: number };
  readonly glory: { readonly opacity: number; readonly rise: number };
};

/** Où la pièce file à la fin : le centre du contenant, dans le repère de la scène, et son échelle (1 = 150 unités). */
export type CeremonyTarget = { readonly x: number; readonly y: number; readonly scale: number };

const strikePower = (plan: MintCeremonyPlan, index: number): number => (index === plan.strikes.length - 1 ? (plan.grand ? 1.6 : 1.1) : 0.55);

function reducedFrame(plan: MintCeremonyPlan, t: number): CeremonyFrame {
  const open = sec(plan.phases.open);
  const reveal = sec(plan.phases.reveal);
  const appear = seg(t, reveal.from, reveal.to);
  const actor = (home: { readonly x: number; readonly y: number }): ActorFrame => ({ x: home.x, y: home.y + 18, rotate: 0, scale: 1, pose: appear > 0 ? 'party' : 'rest' });
  return {
    backdrop: seg(t, open.from, open.to) * (1 - seg(t, plan.endMs / 1000 - 0.26, plan.endMs / 1000)),
    shake: { x: 0, y: 0 },
    orb: 1,
    mee: actor(MEE_END),
    meo: actor(MEO_END),
    die: { x: DIE_ON.x, y: DIE_ON.y, squash: 1, opacity: 0 },
    hammerMeo: { x: 0, y: 0, angle: REST, opacity: 0 },
    hammerMee: { x: 0, y: 0, angle: REST_M, opacity: 0 },
    coin: { x: C.x, y: C.y, scale: 1, squash: 1, rotateY: 180, opacity: appear * (1 - seg(t, plan.endMs / 1000 - 0.26, plan.endMs / 1000)), engraved: 1 },
    glow: { x: C.x, y: C.y, scale: 1, opacity: 0.6 * appear },
    flash: 0,
    ring: { scale: 0, opacity: 0 },
    tchak: { opacity: 0, scale: 1, final: true },
    rays: { opacity: 0, rotate: 0, scale: 1 },
    sign: 0,
    say: seg(t, reveal.to, reveal.to + 0.3),
    shadow: { opacity: 0, scale: 1 },
    glory: { opacity: 0, rise: 0 },
  };
}

type Strike = { readonly at: number; readonly impact: number; readonly mee: boolean };

/** L'instant et ce que la loi en dit, lus une fois par image et partagés par les calques. */
type Moment = {
  readonly plan: MintCeremonyPlan;
  readonly t: number;
  /** Le temps de la scène : `t`, remonté après un refus (`sceneTime`). */
  readonly tt: number;
  readonly p: Readonly<Record<'open' | 'emit' | 'dust' | 'blank' | 'descent' | 'places' | 'die' | 'windup' | 'dieOff' | 'engrave' | 'reveal' | 'ancestors' | 'celebrate' | 'flight' | 'glory', Seconds>>;
  readonly strikes: readonly Strike[];
  readonly lastImpact: number;
  readonly exitFade: number;
};

const momentOf = (plan: MintCeremonyPlan, t: number): Moment => {
  const phases = plan.phases;
  const p = {
    open: sec(phases.open),
    emit: sec(phases.emit),
    dust: sec(phases.dust),
    blank: sec(phases.blank),
    descent: sec(phases.descent),
    places: sec(phases.places),
    die: sec(phases.die),
    windup: sec(phases.windup),
    dieOff: sec(phases.dieOff),
    engrave: sec(phases.engrave),
    reveal: sec(phases.reveal),
    ancestors: sec(phases.ancestors),
    celebrate: sec(phases.celebrate),
    flight: sec(phases.flight),
    glory: sec(phases.glory),
  };
  const strikes = plan.strikes.map((s) => ({ at: s.atMs / 1000, impact: s.impactMs / 1000, mee: s.hitters.includes('mee') }));
  const end = plan.endMs / 1000;
  const exitFade = plan.refusal === null ? 1 - seg(t, p.flight.from, p.flight.to) : 1 - seg(t, end - 0.45, end);
  return { plan, t, tt: sceneTime(plan, t), p, strikes, lastImpact: strikes.at(-1)?.impact ?? Infinity, exitFade };
};

/** Le tremblement : chaque coup, plus fort au dernier, et le flan qui se pose. */
const shakeOf = ({ plan, t, tt, p, strikes }: Moment): { readonly x: number; readonly y: number } => {
  const fromStrikes = strikes.reduce(
    (acc, s, index) => {
      const x = t - s.impact;
      if (x < 0 || x >= 0.26) return acc;
      const power = strikePower(plan, index);
      return { x: acc.x + power * 4.5 * (1 - x / 0.26) * Math.sin(x * 95), y: acc.y + power * 2 * (1 - x / 0.26) * Math.cos(x * 80) };
    },
    { x: 0, y: 0 },
  );
  const landed = tt - p.descent.to;
  return landed >= 0 && landed < 0.18 ? { x: fromStrikes.x, y: fromStrikes.y + 2.2 * (1 - landed / 0.18) * Math.sin(landed * 120) } : fromStrikes;
};

/** Mee et Meo : ils arrivent des côtés, sèment la poussière, prennent place à l'enclume, reculent pour la fête. */
const actorsOf = ({ plan, t, tt, p }: Moment): { readonly mee: ActorFrame; readonly meo: ActorFrame } => {
  const enter = eOut(seg(t, 0.05, 0.6));
  const move = eIO(seg(tt, p.places.from, p.places.to));
  const back = eIO(seg(t, p.dieOff.to, p.reveal.to));
  const path = (from: number, home: { readonly x: number; readonly y: number }, strike: { readonly x: number; readonly y: number }, rest: { readonly x: number; readonly y: number }) => ({
    x: lerp(lerp(lerp(from, home.x, enter), strike.x, move), rest.x, back),
    y: lerp(lerp(home.y, strike.y, move), rest.y, back),
  });
  const mee = path(-110, MEE_HOME, MEE_STRIKE, MEE_END);
  const meo = path(380, MEO_HOME, MEO_STRIKE, MEO_END);
  const refusal = plan.refusal;
  const sowing = refusal === null && t > p.dust.from - 0.1 && t < p.dust.to + 0.3 ? Math.sin(t * 24) * 7 : 0;
  const party = t >= p.celebrate.from;
  const courage = refusal !== null && t >= refusal.sayMs / 1000;
  return {
    mee: { x: mee.x, y: mee.y + Math.sin(t * 4.3) * 3, rotate: sowing, scale: 1 + 0.14 * bump(t, p.celebrate.from, 0.38), pose: courage ? 'courage' : party ? 'party' : 'rest' },
    meo: { x: meo.x, y: meo.y + Math.sin(t * 4.3 + 1.7) * 3, rotate: -sowing, scale: 1 + 0.14 * bump(t, p.celebrate.from + 0.12, 0.38), pose: party ? 'party' : 'rest' },
  };
};

/** Le coin : Mee le tient sous l'aile, le pose sur le flan, il s'écrase un peu à chaque coup, puis Mee le retire. */
const dieOf = ({ t, tt, p, strikes }: Moment, mee: ActorFrame): CeremonyFrame['die'] => {
  const wing = { x: mee.x + 72, y: mee.y + 42 };
  const place = eIO(seg(tt, p.die.from, p.die.to));
  const lift = eIO(seg(t, p.dieOff.from, p.dieOff.to));
  return {
    x: lerp(lerp(wing.x, DIE_ON.x, place), wing.x, lift),
    y: lerp(lerp(wing.y, DIE_ON.y, place), wing.y, lift),
    squash: strikes.reduce((sq, s) => sq - 0.1 * bump(t, s.impact, 0.1), 1),
    opacity: seg(tt, p.die.from - 0.2, p.die.from) * (1 - seg(t, p.dieOff.to, p.dieOff.to + 0.2)),
  };
};

/** L'angle d'un marteau qui frappe à `at` : il tombe, rebondit, puis se relève (ou se repose au dernier coup). */
const swing = (t: number, at: number, last: boolean, wind: number, hit: number, rest: number): number => {
  if (t < at + 0.15) return lerp(wind, hit, eIn(seg(t, at, at + 0.09)));
  return lerp(hit, last ? rest : wind, eIO(seg(t, at + 0.15, at + (last ? 0.55 : 0.42))));
};

/** Les marteaux : Meo lève le sien, le GARDE levé tant que la passerelle n'a pas répondu, frappe ; au prisme, Mee prend le sien pour le dernier coup. */
const hammersOf = ({ plan, t, tt, p, strikes, lastImpact }: Moment, mee: ActorFrame, meo: ActorFrame): { readonly hammerMeo: HammerFrame; readonly hammerMee: HammerFrame } => {
  const firstStrike = strikes[0]?.at ?? Infinity;
  const waiting = plan.refusal === null && t > p.windup.to && t < firstStrike && firstStrike - p.windup.to > 0.06;
  const raised = waiting ? WIND + Math.sin(t * 30) * 2.5 : lerp(REST, WIND, eIO(seg(tt, p.windup.from, p.windup.to)));
  const angle = strikes.reduce((current, s, index) => (t < s.at ? current : swing(t, s.at, index === strikes.length - 1, WIND, HIT, REST)), raised);
  const away = 1 - seg(t, lastImpact + 0.45, lastImpact + 0.75);
  const together = strikes.at(-1)?.mee === true ? strikes.at(-1) : undefined;
  const angleMee = together === undefined ? REST_M : t < together.at ? lerp(REST_M, WIND_M, eIO(seg(t, together.at - 0.45, together.at - 0.1))) : swing(t, together.at, true, WIND_M, HIT_M, REST_M);
  return {
    hammerMeo: { x: meo.x + 8, y: meo.y - 46, angle, opacity: seg(tt, p.places.from, p.places.to) * away },
    hammerMee: { x: mee.x + 76, y: mee.y - 46, angle: angleMee, opacity: together === undefined ? 0 : seg(t, together.at - 0.6, together.at - 0.4) * away },
  };
};

/** La pièce : le flan se fige dans le cercle, descend sur l'enclume, prend la gravure au coup, se lève en montrant son revers, puis file dans l'Héritage. */
const coinOf = ({ t, tt, p, strikes }: Moment, target: CeremonyTarget): CeremonyFrame['coin'] => {
  const descend = seg(tt, p.descent.from, p.descent.to);
  const rv = seg(t, p.reveal.from, p.reveal.to);
  const ex = seg(t, p.flight.from, p.flight.to);
  const rising = eOut(rv);
  const flying = eIO(ex);
  const resting = { x: C.x, y: rv > 0 ? lerp(ANVIL_C.y, C.y, rising) : lerp(C.y, ANVIL_C.y, eIn(descend)), scale: rv > 0 ? lerp(ANVIL / COIN_BOX, 1, rising) : lerp(FORM / COIN_BOX, ANVIL / COIN_BOX, eIO(descend)) };
  const at =
    ex > 0
      ? { x: lerp(C.x, target.x, flying), y: lerp(C.y, target.y, flying) - 70 * Math.sin(Math.PI * flying), scale: lerp(1, target.scale, flying), rotateY: 540 + 180 * flying }
      : { ...resting, rotateY: 540 * eIO(rv) };
  return {
    ...at,
    squash: strikes.reduce((sq, s) => sq - 0.07 * bump(t, s.impact, 0.1), 1 - 0.05 * bump(tt, p.descent.to, 0.12)),
    opacity: seg(tt, p.blank.from, p.blank.to) * (1 - seg(t, p.flight.to - 0.05, p.flight.to)),
    engraved: seg(t, p.engrave.from, p.engrave.to),
  };
};

/** Ce que chaque coup allume : l'éclair, l'onde, le « tchak » (le grand au dernier coup de l'or et du prisme). */
const impactsOf = ({ plan, t, strikes }: Moment): Pick<CeremonyFrame, 'flash' | 'ring' | 'tchak'> =>
  strikes.reduce<Pick<CeremonyFrame, 'flash' | 'ring' | 'tchak'>>(
    (acc, s, index) => {
      const x = t - s.impact;
      const final = index === strikes.length - 1;
      const flash = x >= 0 && x < 0.32 ? Math.min(0.95, acc.flash + (final ? (plan.grand ? 1 : 0.85) : 0.45) * (1 - x / 0.32)) : acc.flash;
      if (x < 0 || x >= 0.7) return { ...acc, flash };
      const power = strikePower(plan, index);
      return {
        flash,
        ring: { opacity: Math.max(0, 0.95 * (1 - x / 0.55)), scale: 0.3 + (2 + 1.6 * power) * eOut(Math.min(1, x / 0.55)) },
        tchak: { opacity: x < 0.08 ? x / 0.08 : Math.max(0, 1 - (x - 0.08) / 0.6), scale: 0.8 + 0.35 * power * eOut(Math.min(1, x / 0.2)), final: final && plan.grand },
      };
    },
    { flash: 0, ring: { scale: 0.3, opacity: 0 }, tchak: { opacity: 0, scale: 1, final: false } },
  );

/** Les rayons et le signe des aïeux (or, prisme), la phrase de Mee, l'Ombre du refus, la gloire qui monte. */
const voicesOf = ({ plan, t, p, lastImpact, exitFade }: Moment): Pick<CeremonyFrame, 'rays' | 'sign' | 'say' | 'shadow' | 'glory'> => {
  const refusal = plan.refusal;
  const g = seg(t, p.glory.from, p.glory.to);
  return {
    rays: plan.grand ? { opacity: 0.95 * seg(t, lastImpact, lastImpact + 0.5) * exitFade, rotate: t * 16, scale: lerp(0.5, 1, seg(t, lastImpact, lastImpact + 0.8)) } : { opacity: 0, rotate: 0, scale: 1 },
    sign: seg(t, p.ancestors.from, p.ancestors.to) * exitFade,
    say: refusal === null ? seg(t, p.celebrate.from, p.celebrate.from + 0.3) * (1 - seg(t, p.flight.from, p.flight.to)) : seg(t, refusal.sayMs / 1000, refusal.sayMs / 1000 + 0.3) * exitFade,
    shadow:
      refusal === null
        ? { opacity: 0, scale: 1 }
        : {
            opacity: 0.95 * seg(t, refusal.shadowIn.fromMs / 1000, refusal.shadowIn.fromMs / 1000 + 0.3) * (1 - seg(t, refusal.shadowOut.fromMs / 1000, refusal.shadowOut.toMs / 1000)),
            scale: lerp(0.3, 1.25, eOut(seg(t, refusal.shadowIn.fromMs / 1000, refusal.shadowIn.toMs / 1000))),
          },
    glory: { opacity: g > 0 && g < 1 ? Math.sin(Math.PI * g) : 0, rise: eIO(g) },
  };
};

/**
 * L'IMAGE DE L'INSTANT `t` (en secondes depuis le toucher). Tant que la passerelle n'a pas répondu, l'hôte passe un
 * plan dont les coups sont encore devant : Meo garde le marteau levé.
 */
export function ceremonyFrame(plan: MintCeremonyPlan, t: number, target: CeremonyTarget): CeremonyFrame {
  if (plan.mode === 'reduced') return reducedFrame(plan, t);
  const moment = momentOf(plan, t);
  const { p, tt, lastImpact, exitFade } = moment;
  const { mee, meo } = actorsOf(moment);
  const coin = coinOf(moment, target);
  const shining = t > p.emit.from && t < (plan.refusal === null ? p.emit.to + 0.4 : plan.endMs / 1000);
  return {
    backdrop: seg(t, p.open.from, p.open.to) * exitFade,
    shake: shakeOf(moment),
    orb: 1 + 0.18 * Math.sin(t * 9) * (shining ? 1 : 0),
    mee,
    meo,
    die: dieOf(moment, mee),
    ...hammersOf(moment, mee, meo),
    coin,
    glow: {
      x: coin.x,
      y: coin.y,
      scale: 0.6 + 0.5 * coin.scale,
      opacity: 0.35 * seg(tt, p.blank.from, p.blank.to) * (1 - seg(tt, p.descent.from, p.descent.to)) + 0.9 * seg(t, lastImpact, lastImpact + 0.3) * (1 - seg(t, p.flight.from, p.flight.from + 0.3)),
    },
    ...impactsOf(moment),
    ...voicesOf(moment),
  };
}

/** Le contenant de l'Héritage, s'il n'est pas à l'écran : la pièce file vers le haut de la scène. */
export const DEFAULT_TARGET: CeremonyTarget = { x: C.x, y: 40, scale: 0.3 };
