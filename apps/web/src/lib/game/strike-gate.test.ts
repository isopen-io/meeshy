import { describe, expect, test } from 'bun:test';

import { mintCeremonyPlan } from '@meeshy/shared/utils/game/mint-ceremony';

import { STRIKE_SETTLE_MS, createStrikeGate, registerStrikeStage, type StrikeAnswer } from './strike-gate';

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
  test('la porte ne s’ouvre d’elle-même qu’après la plus longue cérémonie : c’est la scène qui l’ouvre, à l’arrivée de la pièce', () => {
    const longest = Math.max(...(['silver', 'gold', 'prism'] as const).map((edition) => mintCeremonyPlan({ edition, mode: 'normal' }).endMs));
    expect(STRIKE_SETTLE_MS).toBeGreaterThan(longest);
    expect(STRIKE_SETTLE_MS).toBeLessThanOrEqual(longest + 6000);
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

/**
 * LA CÉRÉMONIE (#11177) — la scène part au toucher ; la passerelle répond pendant le tissage. La porte porte cette
 * réponse jusqu'à la scène (le marteau reste levé tant qu'elle n'est pas venue), et c'est la scène qui l'ouvre quand
 * la pièce arrive dans l'Héritage. Un refus l'ouvre tout de suite : rien n'a changé à l'écran.
 */
describe('la réponse de la passerelle', () => {
  const stagedGate = () => {
    const clock = manualClock();
    return { clock, gate: createStrikeGate({ staged: () => true, reducedMotion: () => false, schedule: clock.schedule }) };
  };

  test('au toucher, la réponse est attendue', () => {
    const { gate } = stagedGate();
    gate.begin();
    expect(gate.answer()).toEqual({ kind: 'pending' });
  });

  test('la confirmation arrive à la scène, avec la pièce frappée, sans ouvrir la porte', async () => {
    const { gate } = stagedGate();
    const heard: StrikeAnswer[] = [];
    gate.onAnswer((answer) => heard.push(answer));
    gate.begin();
    gate.confirm({ number: 101, edition: 'silver' });
    expect(heard).toEqual([{ kind: 'pending' }, { kind: 'confirmed', coin: { number: 101, edition: 'silver' } }]);
    expect(await settled(gate.opened())).toBe(false);
  });

  test('la scène ouvre la porte quand la pièce arrive', async () => {
    const { gate } = stagedGate();
    gate.begin();
    gate.confirm();
    gate.settle();
    expect(await settled(gate.opened())).toBe(true);
  });

  test('un refus arrive à la scène avec son code et ouvre la porte', async () => {
    const { gate } = stagedGate();
    const heard: StrikeAnswer[] = [];
    gate.begin();
    gate.onAnswer((answer) => heard.push(answer));
    gate.refuse('MINT_BLOCKED_BY_DEBT');
    expect(heard.at(-1)).toEqual({ kind: 'refused', code: 'MINT_BLOCKED_BY_DEBT' });
    expect(await settled(gate.opened())).toBe(true);
  });

  test('qui apprend le début d’une frappe attend la fin de CETTE frappe, jamais celle d’avant (#11482)', async () => {
    const { gate } = stagedGate();
    const ends: Promise<void>[] = [];
    gate.onAnswer((answer) => {
      if (answer.kind === 'pending') ends.push(gate.opened());
    });
    gate.begin();
    expect(ends).toHaveLength(1);
    expect(await settled(ends[0] ?? Promise.resolve())).toBe(false);
    gate.settle();
    expect(await settled(ends[0] ?? Promise.reject(new Error('aucune frappe')))).toBe(true);
  });

  test('un abonné qui arrive tard lit la réponse déjà venue', () => {
    const { gate } = stagedGate();
    gate.begin();
    gate.confirm();
    const heard: StrikeAnswer[] = [];
    const leave = gate.onAnswer((answer) => heard.push(answer));
    expect(heard).toEqual([{ kind: 'confirmed' }]);
    leave();
    gate.begin();
    expect(heard).toHaveLength(1);
  });

  test('une seule scène joue la cérémonie d’une frappe, même si deux sont montées', () => {
    const { gate } = stagedGate();
    gate.begin();
    expect(gate.claim()).toBe(true);
    expect(gate.claim()).toBe(false);
    gate.begin();
    expect(gate.claim()).toBe(true);
  });

  test('sans frappe en cours, personne ne réclame de cérémonie', () => {
    const { gate } = stagedGate();
    expect(gate.claim()).toBe(false);
  });
});
