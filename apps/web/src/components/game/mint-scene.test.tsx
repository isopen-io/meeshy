import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { EffectEnv } from '@/lib/game/gl/effect-runner';
import type { GameGl } from '@/lib/game/gl/engine';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { MintScene } from './mint-scene';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/game' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => mounter.unmountAll());

/**
 * LA SCÈNE DE LA FRAPPE (#9381) — la pièce, Mee qui pose, Meo qui frappe,
 * l'onde. Un objet que l'écran de frappe pose tel quel, puis déclenche en
 * incrémentant `playKey` après avoir posé la face finale.
 */
describe('MintScene — la structure', () => {
  const html = renderToStaticMarkup(<MintScene size={120} face="obverse" number={13} year={2026} />);

  test('la pièce à deux faces, Mee à gauche, Meo à droite et retourné', () => {
    expect(html).toContain('data-game-coin-flip');
    expect(html).toMatch(/data-game-actor="mee"/);
    expect(html).toMatch(/data-game-actor="meo"/);
    expect(html).toMatch(/data-game-actor="meo"[^>]*>(?:(?!<\/span>).)*scale\(-1 1\)/);
  });

  test('l’anneau de l’onde, et les calques d’effets du reflet et de l’onde', () => {
    expect(html).toContain('data-game-shockwave');
    expect(html).toContain('data-game-effect="sheen"');
    expect(html).toContain('data-game-effect="shockwave"');
  });

  test('l’irisation n’est sur la pièce que pour l’édition prisme', () => {
    expect(html).not.toContain('data-game-effect="iridescence"');
    expect(renderToStaticMarkup(<MintScene size={120} face="reverse" edition="prism" number={1000} year={2026} />)).toContain('data-game-effect="iridescence"');
  });

  test('la scène est décorative', () => {
    expect(html).toContain('aria-hidden="true"');
  });

  test('la face au repos est celle que l’hôte demande', () => {
    expect(renderToStaticMarkup(<MintScene size={120} face="reverse" number={7} year={2026} />)).toMatch(/opacity:1" data-game-face-wrap="reverse"/);
  });
});

const fakeEnv = (): EffectEnv => {
  const gl: GameGl = { programCount: 3, render: () => undefined, clear: () => undefined, resize: () => undefined, dispose: () => undefined };
  return { reducedMotion: false, createGl: () => gl, raf: () => 1, cancelRaf: () => undefined, observeVisibility: () => () => undefined, observeOrientation: () => null };
};

const animatable = (el: Element): { count: number } => {
  const record = { count: 0 };
  Object.assign(el, {
    animate: () => {
      record.count += 1;
      return { finished: Promise.resolve(), cancel: () => undefined };
    },
  });
  return record;
};

describe('MintScene — le déclenchement', () => {
  test('playKey qui change joue la chorégraphie de frappe ; au montage, rien ne joue', async () => {
    const playOptions = { reducedMotion: false, haptics: false, schedule: () => () => undefined };
    const host = await mounter.mount(<MintScene size={120} face="obverse" playKey={0} createEnv={fakeEnv} playOptions={playOptions} />);
    const meo = animatable(host.querySelector('[data-game-actor="meo"]') as Element);
    expect(meo.count).toBe(0);
    await mounter.rerender(host, <MintScene size={120} face="reverse" playKey={1} createEnv={fakeEnv} playOptions={playOptions} />);
    expect(meo.count).toBeGreaterThan(0);
  });

  test('le « tchak » appelle onStrike, au moment du repère du plan', async () => {
    const jobs: { readonly at: number; readonly run: () => void }[] = [];
    const playOptions = { reducedMotion: false, haptics: false, schedule: (run: () => void, at: number) => (jobs.push({ at, run }), () => undefined) };
    let strikes = 0;
    const host = await mounter.mount(<MintScene size={120} face="obverse" playKey={0} createEnv={fakeEnv} playOptions={playOptions} onStrike={() => void (strikes += 1)} />);
    await mounter.rerender(host, <MintScene size={120} face="reverse" playKey={1} createEnv={fakeEnv} playOptions={playOptions} onStrike={() => void (strikes += 1)} />);
    expect(strikes).toBe(0);
    await act(async () => {
      for (const job of jobs.filter((j) => j.at === 640)) job.run();
    });
    expect(strikes).toBe(1);
  });
});
