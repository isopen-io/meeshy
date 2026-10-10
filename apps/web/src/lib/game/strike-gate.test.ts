import { describe, expect, test } from 'bun:test';

import { CHOREOGRAPHY_DURATION_MS } from './choreography';
import { STRIKE_SETTLE_MS, createStrikeGate, registerStrikeStage } from './strike-gate';

/**
 * LA PORTE DE LA FRAPPE (#9537) — « le compteur de Meeshes ne s'incrémente
 * qu'APRÈS la fin de l'animation » : Mee et Meo frappent d'abord, le compteur
 * monte ensuite. La porte dit QUAND (la durée de la chorégraphie « mint »),
 * seulement quand une scène est à l'écran et que les animations ne sont pas
 * limitées ; sans scène, la frappe reste immédiate — aucune attente pour rien.
 */
const manualClock = () => {
  const jobs: { run: () => void; ms: number; cancelled: boolean }[] = [];
  return {
    schedule: (run: () => void, ms: number) => {
      const job = { run, ms, cancelled: false };
      jobs.push(job);
      return () => void (job.cancelled = true);
    },
    advance: () => jobs.filter((job) => !job.cancelled).forEach((job) => job.run()),
    jobs,
  };
};

const settled = async (promise: Promise<void>): Promise<boolean> => Promise.race([promise.then(() => true), Promise.resolve().then(() => Promise.resolve()).then(() => false)]);

describe('la durée', () => {
  test('la porte s’ouvre à la fin de la chorégraphie de la frappe, avec une marge pour la dernière image', () => {
    expect(STRIKE_SETTLE_MS).toBeGreaterThan(CHOREOGRAPHY_DURATION_MS.mint);
    expect(STRIKE_SETTLE_MS).toBeLessThanOrEqual(CHOREOGRAPHY_DURATION_MS.mint + 200);
  });
});

describe('sans scène à l’écran', () => {
  test('la frappe est immédiate : la porte est déjà ouverte', async () => {
    const clock = manualClock();
    const gate = createStrikeGate({ staged: () => false, reducedMotion: () => false, schedule: clock.schedule });
    gate.begin();
    expect(await settled(gate.opened())).toBe(true);
    expect(clock.jobs).toHaveLength(0);
  });
});

describe('animations limitées', () => {
  test('pas d’attente : un fondu ne retient pas le compteur', async () => {
    const clock = manualClock();
    const gate = createStrikeGate({ staged: () => true, reducedMotion: () => true, schedule: clock.schedule });
    gate.begin();
    expect(await settled(gate.opened())).toBe(true);
  });
});

describe('avec Mee et Meo à l’écran', () => {
  test('la porte reste fermée pendant le geste, puis s’ouvre à son terme', async () => {
    const clock = manualClock();
    const gate = createStrikeGate({ staged: () => true, reducedMotion: () => false, schedule: clock.schedule });
    gate.begin();
    expect(clock.jobs[0]?.ms).toBe(STRIKE_SETTLE_MS);
    expect(await settled(gate.opened())).toBe(false);
    clock.advance();
    expect(await settled(gate.opened())).toBe(true);
  });

  test('une annulation (la passerelle refuse) ouvre la porte tout de suite : rien ne reste suspendu', async () => {
    const clock = manualClock();
    const gate = createStrikeGate({ staged: () => true, reducedMotion: () => false, schedule: clock.schedule });
    gate.begin();
    gate.cancel();
    expect(await settled(gate.opened())).toBe(true);
    expect(clock.jobs[0]?.cancelled).toBe(true);
  });

  test('une nouvelle frappe pendant la précédente ouvre l’ancienne et repart de zéro', async () => {
    const clock = manualClock();
    const gate = createStrikeGate({ staged: () => true, reducedMotion: () => false, schedule: clock.schedule });
    gate.begin();
    const first = gate.opened();
    gate.begin();
    expect(await settled(first)).toBe(true);
    expect(await settled(gate.opened())).toBe(false);
  });
});

describe('les scènes se déclarent', () => {
  test('tant qu’une scène est montée, la porte la voit ; démontée, elle ne la voit plus', () => {
    const gate = createStrikeGate({ reducedMotion: () => false, schedule: manualClock().schedule });
    expect(gate.staged()).toBe(false);
    const leaveA = registerStrikeStage();
    const leaveB = registerStrikeStage();
    expect(gate.staged()).toBe(true);
    leaveA();
    expect(gate.staged()).toBe(true);
    leaveB();
    expect(gate.staged()).toBe(false);
  });
});
