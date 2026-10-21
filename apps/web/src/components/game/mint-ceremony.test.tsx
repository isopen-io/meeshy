import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';

import { mintCeremonyPlan } from '@meeshy/shared/utils/game/mint-ceremony';
import type { MeeshEdition } from '@meeshy/shared/utils/game/mint';

import type { HapticName } from '@/lib/game/haptics';
import { createStrikeGate, type StrikeGate } from '@/lib/game/strike-gate';
import { loadGameCatalogParts, translateGame } from '@/lib/i18n-game-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { MintCeremony, isModestDevice, type CeremonyClock } from './mint-ceremony';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/me/progression' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadGameCatalogParts('fr', ['frappe']);
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => mounter.unmountAll());

/**
 * LA CÉRÉMONIE DE LA FRAPPE (#11177) — la scène plein écran, pilotée par une horloge de témoin : elle part au
 * toucher, attend la passerelle le marteau levé, frappe en dernier, ouvre la porte quand la pièce arrive dans
 * l'Héritage, se passe d'un toucher, dit le refus par la voix de Mee et se réduit à un fondu.
 */

const manualClock = () => {
  let time = 0;
  let next = 1;
  const frames = new Map<number, () => void>();
  const clock: CeremonyClock = {
    now: () => time,
    frame: (run) => {
      const id = next++;
      frames.set(id, run);
      return id;
    },
    cancel: (id) => void frames.delete(id),
  };
  const advanceTo = async (ms: number): Promise<void> => {
    await act(async () => {
      while (time < ms) {
        time = Math.min(ms, time + 50);
        const due = [...frames.values()];
        frames.clear();
        due.forEach((run) => run());
      }
    });
  };
  return { clock, advanceTo, now: () => time };
};

const stagedGate = (): StrikeGate => createStrikeGate({ staged: () => true, reducedMotion: () => false, schedule: () => () => undefined });

const isOpen = async (gate: StrikeGate): Promise<boolean> =>
  Promise.race([gate.opened().then(() => true), Promise.resolve().then(() => Promise.resolve()).then(() => false)]);

type Bench = { readonly edition?: MeeshEdition; readonly reduced?: boolean };

async function bench({ edition = 'silver', reduced = false }: Bench = {}) {
  const gate = stagedGate();
  const time = manualClock();
  const haptics: HapticName[] = [];
  const done = { count: 0 };
  gate.begin();
  gate.claim();
  await mounter.mount(
    <MintCeremony edition={edition} number={92} gate={gate} onDone={() => void (done.count += 1)} reducedMotion={reduced} modest={false} clock={time.clock} haptic={(name) => void haptics.push(name)} />,
  );
  const scene = (): HTMLElement | null => document.body.querySelector('[data-game-ceremony]');
  return { gate, time, haptics, done, scene };
}

const ms = (edition: MeeshEdition, phase: 'flight' | 'reveal', edge: 'fromMs' | 'toMs' = 'toMs'): number => mintCeremonyPlan({ edition, mode: 'normal' }).phases[phase]?.[edge] ?? NaN;

describe('la scène part au toucher, en plein écran', () => {
  test('posée sur la page entière, décorative, à la couleur de son édition', async () => {
    const { scene } = await bench({ edition: 'prism' });
    expect(scene()?.parentElement).toBe(document.body);
    expect(scene()?.getAttribute('aria-hidden')).toBe('true');
    expect(scene()?.getAttribute('data-edition')).toBe('prism');
    expect(scene()?.querySelector('[data-ceremony-canvas]')).not.toBeNull();
  });

  test('ta lumière en haut, Mee et Meo, l’enclume, le coin et les deux marteaux', async () => {
    const { scene } = await bench();
    const root = scene();
    expect(root?.querySelector('[data-ceremony-orb-label]')?.textContent).toBe(translateGame('fr', 'game.frappe.light'));
    expect(root?.querySelectorAll('[data-ceremony-actor]')).toHaveLength(2);
    expect(root?.querySelector('[data-ceremony-anvil]')).not.toBeNull();
    expect(root?.querySelector('[data-ceremony-die]')).not.toBeNull();
    expect(root?.querySelectorAll('[data-ceremony-hammer]')).toHaveLength(2);
  });

  test('le flan est la vraie pièce, sans gravure ; l’avers et le revers attendent la frappe', async () => {
    const { scene } = await bench();
    const face = (name: string) => scene()?.querySelector(`[data-ceremony-face="${name}"] [data-game-coin]`);
    expect(face('blank')?.querySelector('[data-game-signature], text')).toBeNull();
    expect(face('obverse')?.getAttribute('data-game-face')).toBe('obverse');
    expect(face('reverse')?.getAttribute('data-game-face')).toBe('reverse');
  });
});

describe('la frappe arrive en dernier', () => {
  test('la passerelle confirme pendant le tissage : un coup, une vibration forte, puis la pièce rejoint l’Héritage et la porte s’ouvre', async () => {
    const { gate, time, haptics, done } = await bench();
    await time.advanceTo(500);
    gate.confirm({ number: 92, edition: 'silver' });
    await time.advanceTo(ms('silver', 'flight') - 100);
    expect(haptics).toEqual(['shock']);
    expect(await isOpen(gate)).toBe(false);
    await time.advanceTo(ms('silver', 'flight') + 100);
    expect(await isOpen(gate)).toBe(true);
    expect(done.count).toBe(0);
    await time.advanceTo(mintCeremonyPlan({ edition: 'silver', mode: 'normal' }).endMs + 100);
    expect(done.count).toBe(1);
  });

  test('à l’or, trois coups : tchak, tchak, TCHAK', async () => {
    const { gate, time, haptics } = await bench({ edition: 'gold' });
    gate.confirm();
    await time.advanceTo(ms('gold', 'reveal', 'fromMs'));
    expect(haptics).toEqual(['tap', 'tap', 'shock']);
  });

  test('tant que la passerelle n’a pas répondu, Meo garde le marteau levé et rien ne se termine', async () => {
    const { gate, time, haptics, done, scene } = await bench();
    await time.advanceTo(9000);
    expect(haptics).toEqual([]);
    expect(done.count).toBe(0);
    const angle = Number(/rotate\((-?[\d.]+)deg\)/.exec(scene()?.querySelector<HTMLElement>('[data-ceremony-hammer="meo"]')?.style.transform ?? '')?.[1]);
    expect(angle).toBeGreaterThan(55);
    gate.confirm();
    await time.advanceTo(9300);
    expect(haptics).toEqual(['shock']);
  });

  test('Mee dit la phrase de la fête, avec le numéro que la passerelle a confirmé', async () => {
    const { gate, time, scene } = await bench();
    gate.confirm({ number: 93, edition: 'silver' });
    await time.advanceTo(ms('silver', 'reveal') + 400);
    expect(scene()?.querySelector('[data-ceremony-say]')?.textContent).toBe(translateGame('fr', 'game.frappe.say.silver', { number: '93' }));
    expect(scene()?.querySelector('[data-ceremony-face="reverse"] [data-game-number]')?.getAttribute('data-game-number')).toBe('93');
  });
});

describe('le refus', () => {
  test('l’Ombre voile le cercle, aucune vibration, Mee dit ce qui bloque, puis la scène se ferme', async () => {
    const { gate, time, haptics, done, scene } = await bench();
    await time.advanceTo(2000);
    gate.refuse('MINT_BLOCKED_BY_DEBT');
    await time.advanceTo(2100);
    expect(scene()?.getAttribute('data-mode')).toBe('refused');
    expect(scene()?.querySelector('[data-ceremony-say]')?.textContent).toBe(translateGame('fr', 'game.frappe.refused.shadow'));
    await time.advanceTo(2900);
    expect(Number(scene()?.querySelector<HTMLElement>('[data-ceremony-ombre]')?.style.opacity)).toBeGreaterThan(0.9);
    await time.advanceTo(9000);
    expect(haptics).toEqual([]);
    expect(done.count).toBe(1);
  });

  test('un réseau absent : Mee le dit', async () => {
    const { gate, time, scene } = await bench();
    gate.refuse('NETWORK');
    await time.advanceTo(100);
    expect(scene()?.querySelector('[data-ceremony-say]')?.textContent).toBe(translateGame('fr', 'game.frappe.refused.offline'));
  });
});

describe('toucher passe la scène', () => {
  test('un toucher : l’état final d’un coup, la porte s’ouvre', async () => {
    const { gate, time, done, scene } = await bench();
    await time.advanceTo(1200);
    await act(async () => void scene()?.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    expect(done.count).toBe(1);
    expect(await isOpen(gate)).toBe(true);
  });

  test('Échap aussi', async () => {
    const { done } = await bench();
    await act(async () => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(done.count).toBe(1);
  });
});

describe('réduire les animations', () => {
  test('ni canevas ni particules : la pièce apparaît frappée en fondu, une seule vibration', async () => {
    const { gate, time, haptics, done, scene } = await bench({ edition: 'gold', reduced: true });
    expect(scene()?.querySelector('[data-ceremony-canvas]')).toBeNull();
    expect(scene()?.getAttribute('data-mode')).toBe('reduced');
    await time.advanceTo(300);
    gate.confirm();
    await time.advanceTo(800);
    expect(Number(scene()?.querySelector<HTMLElement>('[data-ceremony-coin]')?.style.opacity)).toBe(1);
    expect(haptics).toEqual(['shock']);
    await time.advanceTo(3500);
    expect(done.count).toBe(1);
  });

  test('un refus en animations réduites ferme la scène tout de suite', async () => {
    const { gate, done } = await bench({ reduced: true });
    await act(async () => gate.refuse('TREASURY_LOCKED'));
    expect(done.count).toBe(1);
  });
});

describe('un appareil modeste', () => {
  test('quatre cœurs ou moins', () => {
    expect(isModestDevice({ hardwareConcurrency: 4 })).toBe(true);
    expect(isModestDevice({ hardwareConcurrency: 8 })).toBe(false);
    expect(isModestDevice({})).toBe(false);
    expect(isModestDevice(undefined)).toBe(false);
  });
});
