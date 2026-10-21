import { describe, expect, it } from 'vitest';
import {
  MINT_CEREMONY_PARTICLE_BUDGET,
  MINT_CEREMONY_STRIKE_READY_MS,
  mintCeremonyPlan,
  mintCeremonySkip,
  mintRefusalReason,
  type MintCeremonyPlan,
} from '../../utils/game/mint-ceremony.js';

const span = (plan: MintCeremonyPlan, phase: keyof MintCeremonyPlan['phases']) => {
  const value = plan.phases[phase];
  if (value === null) throw new Error(`phase ${phase} absente`);
  return value;
};

const lastStrike = (plan: MintCeremonyPlan) => {
  const last = plan.strikes.at(-1);
  if (last === undefined) throw new Error('aucun coup');
  return last;
};

describe('la cérémonie de la frappe : la frappe arrive en dernier', () => {
  for (const edition of ['silver', 'gold', 'prism'] as const) {
    it(`${edition} : le dernier coup suit le flan et précède la révélation`, () => {
      const plan = mintCeremonyPlan({ edition, mode: 'normal' });
      expect(lastStrike(plan).impactMs).toBeGreaterThan(span(plan, 'blank').toMs);
      expect(lastStrike(plan).impactMs).toBeGreaterThan(span(plan, 'descent').toMs);
      expect(lastStrike(plan).impactMs).toBeLessThan(span(plan, 'reveal').fromMs);
      expect(span(plan, 'reveal').toMs).toBeLessThanOrEqual(span(plan, 'celebrate').fromMs);
      expect(span(plan, 'flight').toMs).toBeLessThan(plan.endMs);
    });

    it(`${edition} : les phases se suivent dans l'ordre du récit`, () => {
      const plan = mintCeremonyPlan({ edition, mode: 'normal' });
      const order = ['open', 'emit', 'tighten', 'dust', 'blank', 'descent', 'die', 'windup', 'hold', 'strikes', 'reveal', 'celebrate', 'flight', 'glory'] as const;
      const starts = order.map((phase) => span(plan, phase).fromMs);
      expect([...starts].sort((a, b) => a - b)).toEqual(starts);
    });

    it(`${edition} : la gravure apparaît au premier coup`, () => {
      const plan = mintCeremonyPlan({ edition, mode: 'normal' });
      expect(span(plan, 'engrave').fromMs).toBe(plan.strikes[0]?.impactMs);
    });
  }

  it('argent : un coup ; or et prisme : trois', () => {
    expect(mintCeremonyPlan({ edition: 'silver', mode: 'normal' }).strikes).toHaveLength(1);
    expect(mintCeremonyPlan({ edition: 'gold', mode: 'normal' }).strikes).toHaveLength(3);
    expect(mintCeremonyPlan({ edition: 'prism', mode: 'normal' }).strikes).toHaveLength(3);
  });

  it('seul le dernier coup est final', () => {
    const plan = mintCeremonyPlan({ edition: 'gold', mode: 'normal' });
    expect(plan.strikes.map((strike) => strike.final)).toEqual([false, false, true]);
  });

  it('au prisme, Mee prend un marteau pour le dernier coup : il est commun à Mee et Meo', () => {
    const plan = mintCeremonyPlan({ edition: 'prism', mode: 'normal' });
    expect(plan.strikes.map((strike) => strike.hitters)).toEqual([['meo'], ['meo'], ['mee', 'meo']]);
    expect(mintCeremonyPlan({ edition: 'gold', mode: 'normal' }).strikes.every((strike) => strike.hitters.join() === 'meo')).toBe(true);
    expect(mintCeremonyPlan({ edition: 'silver', mode: 'normal' }).strikes[0]?.hitters).toEqual(['meo']);
  });

  it('or et prisme : les aïeux se manifestent après le dernier coup ; pas à l’argent', () => {
    for (const edition of ['gold', 'prism'] as const) {
      const plan = mintCeremonyPlan({ edition, mode: 'normal' });
      expect(span(plan, 'ancestors').fromMs).toBeGreaterThan(lastStrike(plan).impactMs);
    }
    expect(mintCeremonyPlan({ edition: 'silver', mode: 'normal' }).phases.ancestors).toBeNull();
  });

  it('les durées de la maquette : argent ≈ 8 s, l’or rejoint l’Héritage vers 9,5 s, le prisme vers 10 s', () => {
    expect(mintCeremonyPlan({ edition: 'silver', mode: 'normal' }).endMs).toBe(8040);
    expect(span(mintCeremonyPlan({ edition: 'gold', mode: 'normal' }), 'flight').toMs).toBe(9490);
    expect(span(mintCeremonyPlan({ edition: 'prism', mode: 'normal' }), 'flight').toMs).toBe(9540);
  });
});

describe('l’attente de la passerelle se cache dans le geste', () => {
  it('une réponse avant le marteau levé ne change rien', () => {
    expect(mintCeremonyPlan({ edition: 'silver', mode: 'normal', answeredAtMs: 300 })).toEqual(mintCeremonyPlan({ edition: 'silver', mode: 'normal' }));
  });

  it('une réponse tardive allonge le marteau levé et décale toute la suite d’autant', () => {
    const late = MINT_CEREMONY_STRIKE_READY_MS + 1200;
    const quick = mintCeremonyPlan({ edition: 'gold', mode: 'normal' });
    const slow = mintCeremonyPlan({ edition: 'gold', mode: 'normal', answeredAtMs: late });
    expect(span(slow, 'hold').toMs - span(slow, 'hold').fromMs).toBe(span(quick, 'hold').toMs - span(quick, 'hold').fromMs + 1200);
    expect(span(slow, 'windup')).toEqual(span(quick, 'windup'));
    expect(span(slow, 'blank')).toEqual(span(quick, 'blank'));
    expect(slow.strikes.map((strike) => strike.atMs)).toEqual(quick.strikes.map((strike) => strike.atMs + 1200));
    expect(span(slow, 'reveal').fromMs).toBe(span(quick, 'reveal').fromMs + 1200);
    expect(slow.endMs).toBe(quick.endMs + 1200);
  });

  it('le marteau ne tombe jamais avant la réponse', () => {
    const plan = mintCeremonyPlan({ edition: 'silver', mode: 'normal', answeredAtMs: 7000 });
    expect(plan.strikes[0]?.atMs).toBeGreaterThanOrEqual(7000);
  });
});

describe('le refus : une ombre voile le cercle, les étincelles reviennent à ta lumière', () => {
  const refused = mintCeremonyPlan({ edition: 'silver', mode: 'refused', answeredAtMs: 900 });

  it('ni coup, ni gravure, ni pièce révélée, ni envol', () => {
    expect(refused.strikes).toEqual([]);
    for (const phase of ['engrave', 'reveal', 'ancestors', 'celebrate', 'flight', 'glory'] as const) expect(refused.phases[phase]).toBeNull();
  });

  it('le refus se dit une fois les étincelles parties, jamais avant', () => {
    const refusal = refused.refusal;
    expect(refusal).not.toBeNull();
    expect(refusal?.atMs).toBeGreaterThanOrEqual(span(refused, 'emit').fromMs);
    expect(refusal?.shadowIn.fromMs).toBe(refusal?.atMs);
  });

  it('les étincelles remontent le temps jusqu’à leur départ : rien n’est perdu', () => {
    expect(refused.refusal?.rewindToMs).toBe(span(refused, 'emit').fromMs);
    expect(refused.refusal?.rewind.fromMs).toBe(refused.refusal?.atMs);
  });

  it('un refus tardif remonte plus vite, jamais plus longtemps', () => {
    const late = mintCeremonyPlan({ edition: 'gold', mode: 'refused', answeredAtMs: 6000 });
    const rewind = late.refusal?.rewind;
    expect(rewind === undefined ? Infinity : rewind.toMs - rewind.fromMs).toBeLessThanOrEqual(1200);
    expect(late.phases.blank).not.toBeNull();
  });

  it('Mee parle sous l’ombre, puis la scène se ferme', () => {
    const refusal = refused.refusal;
    expect(refusal?.sayMs).toBeGreaterThan(refusal?.atMs ?? Infinity);
    expect(refused.endMs).toBeGreaterThan(refusal?.shadowOut.toMs ?? Infinity);
  });

  it('une phase qui n’avait pas commencé au refus n’a pas lieu', () => {
    expect(refused.phases.blank).toBeNull();
    expect(refused.phases.hold).toBeNull();
    expect(refused.phases.dust).toBeNull();
  });
});

describe('réduire les animations : un fondu, sans particules', () => {
  const reduced = mintCeremonyPlan({ edition: 'gold', mode: 'reduced' });

  it('aucune particule, aucune tresse, aucune poussière', () => {
    expect(reduced.particles).toEqual({ weave: 0, dust: [], bursts: [], puff: 0 });
    for (const phase of ['emit', 'braid', 'tighten', 'dust', 'descent', 'windup', 'hold'] as const) expect(reduced.phases[phase]).toBeNull();
  });

  it('une seule vibration, quand la pièce apparaît frappée', () => {
    expect(reduced.strikes).toHaveLength(1);
    expect(reduced.strikes[0]?.final).toBe(true);
    expect(reduced.strikes[0]?.atMs).toBe(span(reduced, 'reveal').fromMs);
  });

  it('la pièce attend la réponse de la passerelle pour apparaître', () => {
    expect(span(mintCeremonyPlan({ edition: 'silver', mode: 'reduced', answeredAtMs: 900 }), 'reveal').fromMs).toBe(900);
  });
});

describe('les particules', () => {
  it('les poussières de chaque édition : argent et un peu d’or, or pur, or et diamant', () => {
    const dust = (edition: 'silver' | 'gold' | 'prism') =>
      mintCeremonyPlan({ edition, mode: 'normal' }).particles.dust.map((d) => [d.from, d.material]);
    expect(dust('silver')).toEqual([['mee', 'silver'], ['meo', 'gold']]);
    expect(dust('gold')).toEqual([['meo', 'gold']]);
    expect(dust('prism')).toEqual([['meo', 'gold'], ['mee', 'diamond']]);
  });

  it('à l’argent, l’or reste « un peu » : moins d’un cinquième de la poussière', () => {
    const [silver, gold] = mintCeremonyPlan({ edition: 'silver', mode: 'normal' }).particles.dust;
    expect((gold?.count ?? 0) * 5).toBeLessThan(silver?.count ?? 0);
  });

  it('jamais plus de particules à l’écran que le budget', () => {
    for (const edition of ['silver', 'gold', 'prism'] as const) {
      const { weave, dust } = mintCeremonyPlan({ edition, mode: 'normal' }).particles;
      expect(weave + dust.reduce((sum, d) => sum + d.count, 0)).toBeLessThanOrEqual(MINT_CEREMONY_PARTICLE_BUDGET);
    }
  });

  it('une gerbe par coup, la plus forte au dernier', () => {
    const { bursts } = mintCeremonyPlan({ edition: 'prism', mode: 'normal' }).particles;
    expect(bursts).toHaveLength(3);
    expect(Math.max(...bursts)).toBe(bursts.at(-1));
  });

  it('un appareil modeste : moitié moins de particules', () => {
    const full = mintCeremonyPlan({ edition: 'prism', mode: 'normal' }).particles;
    const modest = mintCeremonyPlan({ edition: 'prism', mode: 'normal', modest: true }).particles;
    expect(modest.weave).toBe(full.weave / 2);
    expect(modest.dust.map((d) => d.count)).toEqual(full.dust.map((d) => Math.round(d.count / 2)));
    expect(modest.bursts).toEqual(full.bursts.map((n) => Math.round(n / 2)));
  });
});

describe('toucher passe la scène', () => {
  it('l’état final s’applique d’un coup, à tout instant', () => {
    const plan = mintCeremonyPlan({ edition: 'gold', mode: 'normal' });
    expect(mintCeremonySkip(plan, 1200)).toBe(plan.endMs);
    expect(mintCeremonySkip(plan, plan.endMs + 50)).toBe(plan.endMs + 50);
  });
});

describe('ce que Mee dit d’un refus', () => {
  it('l’Ombre, l’Héritage fermé, la lumière qui manque, le réseau, le reste', () => {
    expect(mintRefusalReason('MINT_BLOCKED_BY_DEBT')).toBe('shadow');
    expect(mintRefusalReason('TREASURY_LOCKED')).toBe('locked');
    expect(mintRefusalReason('INSUFFICIENT_POINTS')).toBe('light');
    expect(mintRefusalReason('NETWORK')).toBe('offline');
    expect(mintRefusalReason('PRICE_CHANGED')).toBe('other');
    expect(mintRefusalReason(undefined)).toBe('other');
  });
});
