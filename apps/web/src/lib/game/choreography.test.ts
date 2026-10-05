import { describe, expect, test } from 'bun:test';

import { CHOREOGRAPHY_DURATION_MS, choreographyPlan, endOfStep, reducedPlan, type ChoreographyKind, type ChoreographyPlan } from './choreography';

const KINDS = Object.keys(CHOREOGRAPHY_DURATION_MS) as readonly ChoreographyKind[];
const ALLOWED = new Set(['transform', 'opacity', 'offset', 'easing']);
const plan = (kind: ChoreographyKind, rewards?: number): ChoreographyPlan => choreographyPlan(kind, rewards === undefined ? {} : { rewards });
const stepsOn = (p: ChoreographyPlan, target: string) => p.steps.filter((s) => s.target === target);

/**
 * LES CHORÉGRAPHIES DU JEU (#9381) — l'inventaire que la conception, partie V,
 * écrit en tableau : une durée et un geste par moment. Ici, la forme des PLANS ;
 * `choreography-play.test.ts` rejoue ces plans sur des éléments.
 */
describe('durées — celles de la conception', () => {
  test('frappe 1,2 s · rang 1,6 s · niveau 0,6 s · niveau perdu 0,8 s · badge 0,7 s · coffre 1,4 s', () => {
    expect(CHOREOGRAPHY_DURATION_MS).toEqual({ mint: 1200, rank: 1600, levelGain: 600, levelLoss: 800, badgeLight: 700, badgeExtinguish: 700, chest: 1400 });
    for (const kind of KINDS) expect(plan(kind, 3).durationMs).toBe(CHOREOGRAPHY_DURATION_MS[kind]);
  });
});

describe('chaque plan est jouable et tient dans sa durée', () => {
  test('aucun geste ne déborde de la durée annoncée', () => {
    for (const kind of KINDS) {
      for (const step of plan(kind, 3).steps) {
        expect(step.durationMs).toBeGreaterThan(0);
        expect(step.delayMs).toBeGreaterThanOrEqual(0);
        expect(endOfStep(step)).toBeLessThanOrEqual(CHOREOGRAPHY_DURATION_MS[kind]);
      }
    }
  });

  test('seulement `transform` et `opacity` : aucune propriété de mise en page animée', () => {
    for (const kind of KINDS) {
      for (const step of plan(kind, 3).steps) {
        expect(step.keyframes.length).toBeGreaterThanOrEqual(2);
        for (const frame of step.keyframes) for (const key of Object.keys(frame)) expect(ALLOWED.has(key)).toBe(true);
      }
    }
  });

  test('les repères (beats) et l’haptique restent dans la durée, en ordre', () => {
    for (const kind of KINDS) {
      const p = plan(kind, 3);
      for (const beat of p.beats) expect(beat.atMs).toBeLessThanOrEqual(p.durationMs);
      for (const h of p.haptics) expect(h.atMs).toBeLessThanOrEqual(p.durationMs);
      expect(p.haptics.map((h) => h.atMs)).toEqual([...p.haptics.map((h) => h.atMs)].sort((a, b) => a - b));
    }
  });

  test('un geste qui démarre caché le dit (`fill: both`) ; les autres tiennent leur fin (`forwards`)', () => {
    for (const kind of KINDS) for (const step of plan(kind, 3).steps) expect(['both', 'forwards']).toContain(step.fill);
  });
});

describe('la frappe — Mee pose, Meo frappe, « tchak », la pièce se retourne sur son numéro', () => {
  const p = plan('mint');

  test('Mee, Meo, la face, le revers et l’onde ont chacun leur geste', () => {
    for (const target of ['[data-game-actor="mee"]', '[data-game-actor="meo"]', '[data-game-face-wrap="obverse"]', '[data-game-face-wrap="reverse"]', '[data-game-shockwave]']) {
      expect(stepsOn(p, target).length).toBeGreaterThan(0);
    }
  });

  test('le « tchak » est un repère unique, à mi-parcours, qui porte le choc haptique', () => {
    const strikes = p.beats.filter((b) => b.name === 'strike');
    expect(strikes).toHaveLength(1);
    const at = strikes[0]?.atMs ?? 0;
    expect(at).toBeGreaterThan(400);
    expect(at).toBeLessThan(800);
    expect(p.haptics).toContainEqual({ atMs: at, haptic: 'shock' });
  });

  test('l’onde part au moment du choc, et la pièce ne se retourne qu’APRÈS lui', () => {
    const at = p.beats.find((b) => b.name === 'strike')?.atMs ?? 0;
    expect(stepsOn(p, '[data-game-shockwave]')[0]?.delayMs).toBe(at);
    expect(Math.min(...stepsOn(p, '[data-game-face-wrap="reverse"]').map((s) => s.delayMs))).toBeGreaterThanOrEqual(at);
  });

  test('Mee pose avant que Meo ne frappe', () => {
    const mee = stepsOn(p, '[data-game-actor="mee"]')[0];
    const meo = stepsOn(p, '[data-game-actor="meo"]')[0];
    expect(mee?.delayMs).toBeLessThan(meo?.delayMs ?? 0);
  });

  test('le revers apparaît caché (both), la face revient à son état final (forwards, transparente)', () => {
    expect(stepsOn(p, '[data-game-face-wrap="reverse"]')[0]?.fill).toBe('both');
    const out = stepsOn(p, '[data-game-face-wrap="obverse"]').at(-1);
    expect(out?.fill).toBe('forwards');
    expect(out?.keyframes.at(-1)?.opacity).toBe(0);
  });
});

describe('le rang — l’écu monte, la Signature se grave trait par trait, les tenants se posent', () => {
  const p = plan('rank');

  test('l’écu monte d’abord', () => {
    const shield = stepsOn(p, '[data-game-shield]')[0];
    expect(shield?.delayMs).toBe(0);
    expect(String(shield?.keyframes[0]?.transform)).toContain('translateY(');
  });

  test('un geste par trait, du premier au troisième, de plus en plus tard', () => {
    const dashes = [0, 1, 2].map((i) => stepsOn(p, `[data-game-dash="${i}"]`)[0]);
    expect(dashes.every((d) => d !== undefined)).toBe(true);
    const delays = dashes.map((d) => d?.delayMs ?? 0);
    expect(delays).toEqual([...delays].sort((a, b) => a - b));
    expect(new Set(delays).size).toBe(3);
    expect(String(dashes[0]?.keyframes[0]?.transform)).toContain('scaleX(0)');
  });

  test('trois tapes, une par trait', () => {
    const taps = p.haptics.filter((h) => h.haptic === 'tap').map((h) => h.atMs);
    expect(taps).toEqual([0, 1, 2].map((i) => stepsOn(p, `[data-game-dash="${i}"]`)[0]?.delayMs));
  });

  test('les tenants se posent APRÈS la gravure, l’un après l’autre', () => {
    const tenants = stepsOn(p, '[data-game-pose]')[0];
    const lastDash = Math.max(...[0, 1, 2].map((i) => stepsOn(p, `[data-game-dash="${i}"]`)[0]?.delayMs ?? 0));
    expect(tenants?.delayMs).toBeGreaterThan(lastDash);
    expect(tenants?.staggerMs).toBeGreaterThan(0);
    expect(tenants?.count).toBe(2);
  });

  test('le reflet sur la matière est un repère, pour le moteur d’effets', () => {
    expect(p.beats.map((b) => b.name)).toContain('shine');
  });
});

describe('niveau gagné et niveau perdu', () => {
  test('gagné : l’anneau se remplit, le chiffre roule, une tape légère', () => {
    const p = plan('levelGain');
    expect(stepsOn(p, '[data-game-ring-sweep]')).toHaveLength(1);
    expect(stepsOn(p, '[data-game-level-text]')).toHaveLength(1);
    expect(p.haptics.map((h) => h.haptic)).toEqual(['tapLight']);
  });

  test('perdu : l’anneau se vide calmement (plus lent), aucune haptique, et le repère du record RESTE', () => {
    const gain = plan('levelGain');
    const loss = plan('levelLoss');
    expect(loss.durationMs).toBeGreaterThan(gain.durationMs);
    expect(loss.haptics).toEqual([]);
    for (const step of stepsOn(loss, '[data-game-record]')) for (const frame of step.keyframes) expect(frame.opacity === undefined || Number(frame.opacity) === 1).toBe(true);
  });
});

describe('le badge', () => {
  test('rallumé : la matière remonte du bas, tape légère, repère d’allumage pour le reflet', () => {
    const p = plan('badgeLight');
    expect(String(stepsOn(p, '[data-game-badge-body]')[0]?.keyframes[0]?.transform)).toMatch(/translateY\([1-9]/);
    expect(p.haptics.map((h) => h.haptic)).toEqual(['tapLight']);
    expect(p.beats.map((b) => b.name)).toEqual(['ignite']);
  });

  test('éteint : la matière se retire, puis l’empreinte en pointillé se pose — sans haptique', () => {
    const p = plan('badgeExtinguish');
    expect(p.haptics).toEqual([]);
    const swap = p.beats.find((b) => b.name === 'swap');
    expect(swap).toBeDefined();
    const imprint = stepsOn(p, '[data-game-imprint]')[0];
    expect(imprint?.late).toBe(true);
    expect(imprint?.delayMs).toBe(swap?.atMs);
  });
});

describe('le coffre — le couvercle s’ouvre, les récompenses montent une à une', () => {
  test('les récompenses montent l’une après l’autre, une tape par récompense', () => {
    const p = plan('chest', 3);
    const rewards = stepsOn(p, '[data-game-reward]')[0];
    expect(rewards?.count).toBe(3);
    expect(rewards?.staggerMs).toBeGreaterThan(0);
    const taps = p.haptics.map((h) => h.atMs);
    expect(taps).toEqual([0, 1, 2].map((i) => (rewards?.delayMs ?? 0) + i * (rewards?.staggerMs ?? 0)));
    for (const h of p.haptics) expect(h.haptic).toBe('tap');
  });

  test('sans récompense, le couvercle s’ouvre seul', () => {
    const p = plan('chest', 0);
    expect(stepsOn(p, '[data-game-reward]')).toEqual([]);
    expect(p.haptics).toEqual([]);
    expect(stepsOn(p, '[data-game-lid-open]').length).toBeGreaterThan(0);
  });

  test('plus de trois récompenses : le plan se borne à trois (il tient dans 1,4 s)', () => {
    expect(stepsOn(plan('chest', 9), '[data-game-reward]')[0]?.count).toBe(3);
  });

  test('le couvercle ouvre avant que la première récompense ne monte', () => {
    const p = plan('chest', 2);
    const open = p.beats.find((b) => b.name === 'open')?.atMs ?? Number.POSITIVE_INFINITY;
    expect(open).toBeLessThan(stepsOn(p, '[data-game-reward]')[0]?.delayMs ?? 0);
  });
});

describe('prefers-reduced-motion — un fondu, rien d’autre', () => {
  test('un seul geste : l’opacité de la racine, 0 → 1, court', () => {
    for (const kind of KINDS) {
      const r = reducedPlan(plan(kind, 3));
      expect(r.steps).toHaveLength(1);
      expect(r.steps[0]?.target).toBe('&');
      expect(r.steps[0]?.keyframes.map((f) => Object.keys(f))).toEqual([['opacity'], ['opacity']]);
      expect(r.durationMs).toBeLessThanOrEqual(240);
      expect(r.beats).toEqual([]);
    }
  });

  test('la première tape seulement : on ne rejoue pas une rafale de vibrations', () => {
    expect(reducedPlan(plan('rank')).haptics).toEqual([{ atMs: 0, haptic: 'tap' }]);
    expect(reducedPlan(plan('levelLoss')).haptics).toEqual([]);
  });
});
