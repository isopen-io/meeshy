/**
 * **LA PLUIE DE L'EMOJI D'UNE HUMEUR** (#10813) — le MOTEUR, sans DOM : qui naît,
 * où, comment il se tient à l'instant `now`, et quand il disparaît.
 *
 * Une instance naît à une place aléatoire de la vue, grossit en se balançant,
 * et pâlit À MESURE qu'elle grossit : son opacité est le complément exact de sa
 * croissance, si bien qu'elle est TOTALEMENT transparente à l'instant où sa
 * taille atteint la moitié de la largeur de la vue — et c'est cet instant qui
 * la retire. Le moteur ne garde rien d'autre que les instances vivantes, et
 * leur nombre est BORNÉ (`maxParticles`) : une borne nulle (mouvement réduit)
 * ne fait naître personne.
 *
 * La pose n'utilise que `transform` et `opacity` — les deux propriétés que le
 * compositeur anime sans relayout ni repeinture (dimension 4, 60 fps).
 */
export type RainViewport = { readonly width: number; readonly height: number };

export type RainParticle = {
  readonly id: number;
  /** Centre de naissance, en pixels CSS de la vue. */
  readonly x: number;
  readonly y: number;
  readonly bornAt: number;
  readonly lifeMs: number;
  readonly swayPx: number;
  readonly swayHz: number;
  readonly phase: number;
  readonly tiltDeg: number;
};

export type RainPose = {
  readonly transform: string;
  readonly opacity: number;
  readonly sizePx: number;
  readonly dx: number;
};

/** La taille de police du glyphe : le grandissement est une `scale`, pas une police qui change (aucun relayout). */
export const RAIN_GLYPH_PX = 96;

/** La taille de naissance — un petit emoji, déjà lisible. */
const START_PX = 28;

/** Où la croissance s'arrête : la moitié de la largeur de la vue. */
const END_RATIO = 0.5;

/** Une croissance douce au départ : l'instance reste lisible avant de s'étendre et de s'effacer. */
const easeIn = (t: number): number => t * t;

export function rainPose(particle: RainParticle, now: number, viewport: RainViewport): RainPose | null {
  const elapsed = now - particle.bornAt;
  if (elapsed >= particle.lifeMs) return null;
  const t = Math.max(0, elapsed / particle.lifeMs);
  const endPx = Math.max(START_PX, viewport.width * END_RATIO);
  const growth = easeIn(t);
  const sizePx = START_PX + (endPx - START_PX) * growth;
  const opacity = Math.max(0, 1 - growth);
  const wave = Math.sin(2 * Math.PI * particle.swayHz * (elapsed / 1000) + particle.phase);
  const dx = particle.swayPx * wave;
  const half = RAIN_GLYPH_PX / 2;
  const transform =
    `translate3d(${(particle.x + dx - half).toFixed(2)}px, ${(particle.y - half).toFixed(2)}px, 0) ` +
    `scale(${(sizePx / RAIN_GLYPH_PX).toFixed(4)}) rotate(${(particle.tiltDeg * wave).toFixed(2)}deg)`;
  return { transform, opacity, sizePx, dx };
}

export type RainEngineOptions = {
  readonly viewport: () => RainViewport;
  readonly random: () => number;
  readonly maxParticles: number;
  readonly spawnEveryMs: number;
  readonly lifeMs: number;
};

export type RainTick = { readonly born: readonly RainParticle[]; readonly retired: readonly number[] };

export type RainEngine = {
  readonly tick: (now: number) => RainTick;
  readonly live: () => readonly RainParticle[];
};

/** La cadence par défaut : une naissance tous les ~0,3 s, quatre secondes de vie, quatorze au plus. */
export const RAIN_DEFAULTS = { maxParticles: 14, spawnEveryMs: 300, lifeMs: 4000 } as const;

export function createRainEngine(options: RainEngineOptions): RainEngine {
  let live: readonly RainParticle[] = [];
  let lastSpawn = Number.NEGATIVE_INFINITY;
  let nextId = 1;

  const spawn = (now: number): RainParticle => {
    const { width, height } = options.viewport();
    const r = options.random;
    const particle: RainParticle = {
      id: nextId,
      x: r() * width,
      y: r() * height,
      bornAt: now,
      lifeMs: options.lifeMs * (0.8 + r() * 0.4),
      swayPx: 10 + r() * 22,
      swayHz: 0.35 + r() * 0.5,
      phase: r() * 2 * Math.PI,
      tiltDeg: 6 + r() * 14,
    };
    nextId += 1;
    return particle;
  };

  const tick = (now: number): RainTick => {
    const retired = live.filter((p) => now - p.bornAt >= p.lifeMs).map((p) => p.id);
    const survivors = retired.length === 0 ? live : live.filter((p) => now - p.bornAt < p.lifeMs);
    const due = survivors.length < options.maxParticles && now - lastSpawn >= options.spawnEveryMs;
    if (!due) {
      live = survivors;
      return { born: [], retired };
    }
    const born = spawn(now);
    lastSpawn = now;
    live = [...survivors, born];
    return { born: [born], retired };
  };

  return { tick, live: () => live };
}
