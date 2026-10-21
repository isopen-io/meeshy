/**
 * LA CÉRÉMONIE DE LA FRAPPE (#11177) — conception de l'épopée, § 7 ; maquette validée
 * `docs/product/epopee/frappe-ceremonie.html` (sa fonction `plan()`).
 *
 * « Des milliers d'étincelles de ma lumière tissent un cercle, avant de prendre des poussières d'argent [et] un
 * peu d'or » pour former le flan ; Mee pose le coin, Meo frappe ; la frappe arrive EN DERNIER. Cette loi dit
 * QUAND chaque chose arrive, pour une édition (argent, or, prisme), un mode (normal, réduit, refus) et l'instant
 * où la passerelle a répondu. Le web (Canvas 2D) et iOS (SwiftUI) la rejouent sur les mêmes vecteurs
 * (`fixtures/reading-modes/mint-ceremony.vectors.json`) : le déroulé ne peut pas diverger d'une plateforme à
 * l'autre. Elle ne touche à aucune règle du jeu : ni prix, ni numéro, ni gloire.
 *
 * Les instants sont des millisecondes entières depuis le toucher. La scène part AU TOUCHER (optimiste) : la
 * passerelle répond pendant le tissage, et si elle n'a pas répondu quand Meo a levé le marteau, il le garde
 * levé jusqu'à sa réponse — l'attente se cache dans le geste, jamais dans un indicateur de chargement.
 */

import type { MeeshEdition } from './mint.js';

export type MintCeremonyMode = 'normal' | 'reduced' | 'refused';

export type MintCeremonySpan = { readonly fromMs: number; readonly toMs: number };

/**
 * Les phases, dans l'ordre du récit : la scène s'ouvre (`open`), les étincelles quittent ta lumière (`emit`) et
 * tissent le cercle en deux brins croisés (`braid`), qui se resserrent en anneau (`tighten`) ; Mee et Meo y sèment
 * la poussière (`dust`) ; le flan se fige (`blank`) et descend sur l'enclume (`descent`) ; Mee et Meo prennent
 * place (`places`), Mee pose le coin (`die`) ; Meo lève le marteau (`windup`) et le garde levé tant que la
 * passerelle n'a pas répondu (`hold`) ; les coups (`strikes`) gravent l'avers (`engrave`) ; Mee retire le coin
 * (`dieOff`), la pièce se lève et montre son revers (`reveal`) ; à l'or et au prisme les aïeux se manifestent
 * (`ancestors`) ; Mee et Meo la fêtent (`celebrate`), elle file dans l'Héritage (`flight`) et la gloire monte
 * (`glory`).
 */
export const MINT_CEREMONY_PHASES = [
  'open',
  'emit',
  'braid',
  'tighten',
  'dust',
  'blank',
  'descent',
  'places',
  'die',
  'windup',
  'hold',
  'strikes',
  'engrave',
  'dieOff',
  'reveal',
  'ancestors',
  'celebrate',
  'flight',
  'glory',
] as const;

export type MintCeremonyPhase = (typeof MINT_CEREMONY_PHASES)[number];

export type MintCeremonyHitter = 'mee' | 'meo';

/** Un coup : le marteau part à `atMs`, touche le coin à `impactMs`. Le dernier est `final` (la vibration la plus forte). */
export type MintCeremonyStrike = {
  readonly atMs: number;
  readonly impactMs: number;
  readonly hitters: readonly MintCeremonyHitter[];
  readonly final: boolean;
};

export type MintCeremonyDustMaterial = 'silver' | 'gold' | 'diamond';

/** Une poussière : qui la sème, de quelle matière, combien de grains. */
export type MintCeremonyDust = { readonly from: MintCeremonyHitter; readonly material: MintCeremonyDustMaterial; readonly count: number };

/** Combien de particules : le tissage, les poussières, une gerbe par coup, le petit nuage de la descente. */
export type MintCeremonyParticles = {
  readonly weave: number;
  readonly dust: readonly MintCeremonyDust[];
  readonly bursts: readonly number[];
  readonly puff: number;
};

/**
 * Le refus : à `atMs`, une Ombre voile le cercle (`shadowIn`, puis `shadowOut`) ; pendant `rewind`, la scène
 * remonte le temps jusqu'à `rewindToMs` (le départ des premières étincelles) — tout ce qui avait été tissé se
 * dénoue et revient à ta lumière, rien n'est perdu ; à `sayMs`, Mee dit ce qui bloque.
 */
export type MintCeremonyRefusal = {
  readonly atMs: number;
  readonly rewind: MintCeremonySpan;
  readonly rewindToMs: number;
  readonly shadowIn: MintCeremonySpan;
  readonly shadowOut: MintCeremonySpan;
  readonly sayMs: number;
};

export type MintCeremonyPlan = {
  readonly edition: MeeshEdition;
  readonly mode: MintCeremonyMode;
  /** L'or et le prisme : trois coups, les rayons et les aïeux. */
  readonly grand: boolean;
  readonly particles: MintCeremonyParticles;
  readonly phases: Readonly<Record<MintCeremonyPhase, MintCeremonySpan | null>>;
  readonly strikes: readonly MintCeremonyStrike[];
  readonly refusal: MintCeremonyRefusal | null;
  readonly endMs: number;
};

export type MintCeremonyInput = {
  /** La LOI de la pièce (`meeshEdition`) : les coups, les aïeux, la nuit du prisme. */
  readonly edition: MeeshEdition;
  /**
   * Le DESSIN de la pièce (`meeshDisplayEdition`, #11483) : la matière des poussières. Absent : celui de la loi. Le
   * n° 247, frappé après le n° 100, se frappe d'un seul coup dans la poussière d'or (porteur, 2026-10-21).
   */
  readonly look?: MeeshEdition;
  readonly mode: MintCeremonyMode;
  /** L'instant où la passerelle a répondu (confirmé ou refusé), depuis le toucher. Absent : à temps. */
  readonly answeredAtMs?: number;
  /** Un appareil modeste : moitié moins de particules. */
  readonly modest?: boolean;
};

/** L'instant où le marteau peut tomber si la passerelle a déjà répondu. */
export const MINT_CEREMONY_STRIKE_READY_MS = 4800;

/** Au plus autant de particules à l'écran en même temps (tissage et poussières ; les gerbes viennent après). */
export const MINT_CEREMONY_PARTICLE_BUDGET = 4500;

const span = (fromMs: number, toMs: number): MintCeremonySpan => ({ fromMs, toMs });

const OPEN = span(0, 400);
const EMIT = span(350, 1400);
const BRAID = span(350, 2200);
const TIGHTEN = span(2000, 2550);
const DUST = span(2200, 2900);
const BLANK = span(3300, 3800);
const DESCENT = span(3800, 4200);
const PLACES = span(3950, 4300);
const DIE = span(4150, 4450);
const WINDUP = span(4400, 4750);

const IMPACT_AFTER_MS = 90;
const ENGRAVE_MS = 180;
const WEAVE = 2600;
const PUFF = 70;

const STRIKE_OFFSETS: Readonly<Record<MeeshEdition, readonly number[]>> = { silver: [0], gold: [0, 580, 1250], prism: [0, 580, 1300] };

const DUST_OF: Readonly<Record<MeeshEdition, readonly MintCeremonyDust[]>> = {
  silver: [
    { from: 'mee', material: 'silver', count: 1500 },
    { from: 'meo', material: 'gold', count: 170 },
  ],
  gold: [{ from: 'meo', material: 'gold', count: 1500 }],
  prism: [
    { from: 'meo', material: 'gold', count: 900 },
    { from: 'mee', material: 'diamond', count: 950 },
  ],
};

/** Le premier refus se dit quand les étincelles ont commencé à tisser : la lumière part, puis l'Ombre la ramène. */
const REFUSAL_EARLIEST_MS = 1500;
const REWIND_MAX_MS = 1200;
const REDUCED_FADE_MS = 260;
const REDUCED_HOLD_MS = 2600;

const half = (count: number, modest: boolean): number => (modest ? Math.round(count / 2) : count);

const sanitizeMs = (value: number | undefined): number => (value !== undefined && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0);

const isGrand = (edition: MeeshEdition): boolean => edition !== 'silver';

const NO_PHASES: Readonly<Record<MintCeremonyPhase, null>> = Object.fromEntries(MINT_CEREMONY_PHASES.map((phase) => [phase, null])) as Readonly<
  Record<MintCeremonyPhase, null>
>;

const particlesOf = (edition: MeeshEdition, look: MeeshEdition, strikes: number, modest: boolean): MintCeremonyParticles => {
  const finalBurst = isGrand(edition) ? 420 : 320;
  return {
    weave: half(WEAVE, modest),
    dust: DUST_OF[look].map((dust) => ({ ...dust, count: half(dust.count, modest) })),
    bursts: Array.from({ length: strikes }, (_, index) => half(index === strikes - 1 ? finalBurst : 120, modest)),
    puff: half(PUFF, modest),
  };
};

const strikesOf = (edition: MeeshEdition, firstMs: number): readonly MintCeremonyStrike[] => {
  const offsets = STRIKE_OFFSETS[edition];
  return offsets.map((offset, index) => {
    const final = index === offsets.length - 1;
    return {
      atMs: firstMs + offset,
      impactMs: firstMs + offset + IMPACT_AFTER_MS,
      hitters: final && edition === 'prism' ? ['mee', 'meo'] : ['meo'],
      final,
    };
  });
};

const normalPlan = (edition: MeeshEdition, look: MeeshEdition, answeredAtMs: number, modest: boolean): MintCeremonyPlan => {
  const grand = isGrand(edition);
  const firstStrike = Math.max(MINT_CEREMONY_STRIKE_READY_MS, answeredAtMs);
  const strikes = strikesOf(edition, firstStrike);
  const first = strikes[0]?.impactMs ?? firstStrike;
  const last = strikes.at(-1)?.impactMs ?? firstStrike;
  const reveal = span(last + 250, last + (grand ? 1500 : 1050));
  const flight = span(reveal.toMs + (grand ? 1200 : 650), reveal.toMs + (grand ? 1200 : 650) + 650);
  const glory = span(flight.toMs - 200, flight.toMs + 650);
  return {
    edition,
    mode: 'normal',
    grand,
    particles: particlesOf(edition, look, strikes.length, modest),
    phases: {
      open: OPEN,
      emit: EMIT,
      braid: BRAID,
      tighten: TIGHTEN,
      dust: DUST,
      blank: BLANK,
      descent: DESCENT,
      places: PLACES,
      die: DIE,
      windup: WINDUP,
      hold: span(WINDUP.toMs, firstStrike),
      strikes: span(firstStrike, last),
      engrave: span(first, first + ENGRAVE_MS),
      dieOff: span(last + 120, last + 420),
      reveal,
      ancestors: grand ? span(last + 500, last + 1000) : null,
      celebrate: span(reveal.toMs, flight.fromMs),
      flight,
      glory,
    },
    strikes,
    refusal: null,
    endMs: glory.toMs + 150,
  };
};

/** Une phase qui n'avait pas commencé au refus n'a pas lieu ; celle qui avait commencé se dénoue avec le reste. */
const startedBefore = (phases: MintCeremonyPlan['phases'], atMs: number): MintCeremonyPlan['phases'] =>
  Object.fromEntries(MINT_CEREMONY_PHASES.map((phase) => [phase, (phases[phase]?.fromMs ?? Infinity) < atMs ? phases[phase] : null])) as MintCeremonyPlan['phases'];

const refusedPlan = (edition: MeeshEdition, look: MeeshEdition, answeredAtMs: number, modest: boolean): MintCeremonyPlan => {
  const atMs = Math.max(REFUSAL_EARLIEST_MS, answeredAtMs);
  const woven = normalPlan(edition, look, Math.max(atMs, MINT_CEREMONY_STRIKE_READY_MS), modest);
  const rewind = span(atMs, atMs + Math.min(REWIND_MAX_MS, atMs - EMIT.fromMs));
  const sayMs = atMs + 1300;
  const shadowOut = span(atMs + 1650, atMs + 2250);
  const phases = { ...startedBefore(woven.phases, atMs), strikes: null, engrave: null, dieOff: null, reveal: null, ancestors: null, celebrate: null, flight: null, glory: null };
  return {
    edition,
    mode: 'refused',
    grand: woven.grand,
    particles: { ...woven.particles, bursts: [] },
    phases,
    strikes: [],
    refusal: { atMs, rewind, rewindToMs: EMIT.fromMs, shadowIn: span(atMs, atMs + 700), shadowOut, sayMs },
    endMs: sayMs + 2500,
  };
};

const reducedPlan = (edition: MeeshEdition, answeredAtMs: number): MintCeremonyPlan => {
  const reveal = span(answeredAtMs, answeredAtMs + REDUCED_FADE_MS);
  const endMs = reveal.fromMs + REDUCED_HOLD_MS;
  return {
    edition,
    mode: 'reduced',
    grand: isGrand(edition),
    particles: { weave: 0, dust: [], bursts: [], puff: 0 },
    phases: { ...NO_PHASES, open: span(0, REDUCED_FADE_MS), reveal, celebrate: span(reveal.toMs, endMs) },
    strikes: [{ atMs: reveal.fromMs, impactMs: reveal.fromMs, hitters: edition === 'prism' ? ['mee', 'meo'] : ['meo'], final: true }],
    refusal: null,
    endMs,
  };
};

/** Le déroulé de la cérémonie. Une fonction pure : mêmes entrées, mêmes instants, sur toutes les plateformes. */
export function mintCeremonyPlan(input: MintCeremonyInput): MintCeremonyPlan {
  const answeredAtMs = sanitizeMs(input.answeredAtMs);
  const modest = input.modest === true;
  const look = input.look ?? input.edition;
  switch (input.mode) {
    case 'normal':
      return normalPlan(input.edition, look, answeredAtMs, modest);
    case 'refused':
      return refusedPlan(input.edition, look, answeredAtMs, modest);
    case 'reduced':
      return reducedPlan(input.edition, answeredAtMs);
  }
}

/** Toucher passe la scène : l'état final s'applique d'un coup, à tout instant. */
export const mintCeremonySkip = (plan: MintCeremonyPlan, atMs: number): number => Math.max(plan.endMs, sanitizeMs(atMs));

/** Ce que Mee dit d'un refus : l'Ombre, l'Héritage qui attend un rang, la lumière qui manque, le réseau, le reste. */
export type MintRefusalReason = 'shadow' | 'locked' | 'light' | 'offline' | 'other';

const REFUSAL_REASONS: Readonly<Record<string, MintRefusalReason>> = {
  MINT_BLOCKED_BY_DEBT: 'shadow',
  TREASURY_LOCKED: 'locked',
  INSUFFICIENT_POINTS: 'light',
  NETWORK: 'offline',
};

export const mintRefusalReason = (code: string | null | undefined): MintRefusalReason => (code === null || code === undefined ? 'other' : REFUSAL_REASONS[code] ?? 'other');
