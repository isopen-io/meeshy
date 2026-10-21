import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';

import { createStrikeGate, type StrikeGate } from '@/lib/game/strike-gate';
import { loadGameCatalogParts } from '@/lib/i18n-game-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { MintStrike, loadMintCeremony } from './game-mint-strike';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/me/progression' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadGameCatalogParts('fr', ['frappe']);
  await loadMintCeremony();
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => mounter.unmountAll());

/**
 * LA FRAPPE OUVRE SA CÉRÉMONIE (#11177) — le geste de frappe (`strikeKey`) ouvre la scène plein écran ; une seule
 * scène la joue même si deux scènes de frappe sont à l'écran ; la passer la referme et ouvre la porte.
 */

const gateFor = (): StrikeGate => createStrikeGate({ staged: () => true, reducedMotion: () => false, schedule: () => () => undefined });
const next = { number: 92, edition: 'silver' as const };
const ceremonies = (): number => document.body.querySelectorAll('[data-game-ceremony]').length;
const flush = () => act(async () => new Promise<void>((resolve) => setTimeout(resolve, 10)));

describe('le geste de frappe', () => {
  test('au montage, aucune cérémonie : la scène attend le geste', async () => {
    await mounter.mount(<MintStrike size={56} strikeKey={0} next={next} gate={gateFor()} />);
    expect(ceremonies()).toBe(0);
  });

  test('le geste ouvre la cérémonie en plein écran ; la passer la referme et ouvre la porte', async () => {
    const gate = gateFor();
    const host = await mounter.mount(<MintStrike size={56} strikeKey={0} next={next} gate={gate} />);
    gate.begin();
    await mounter.rerender(host, <MintStrike size={56} strikeKey={1} next={next} gate={gate} />);
    await flush();
    expect(ceremonies()).toBe(1);
    expect(document.body.querySelector('[data-game-ceremony]')?.getAttribute('data-edition')).toBe('silver');
    await act(async () => void document.body.querySelector('[data-game-ceremony]')?.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    expect(ceremonies()).toBe(0);
    expect(await Promise.race([gate.opened().then(() => true), Promise.resolve().then(() => Promise.resolve()).then(() => false)])).toBe(true);
  });

  test('deux scènes de frappe à l’écran : une seule cérémonie', async () => {
    const gate = gateFor();
    const two = (key: number) => (
      <>
        <MintStrike size={56} strikeKey={key} next={next} gate={gate} />
        <MintStrike size={64} strikeKey={key} next={next} gate={gate} />
      </>
    );
    const host = await mounter.mount(two(0));
    gate.begin();
    await mounter.rerender(host, two(1));
    await flush();
    expect(ceremonies()).toBe(1);
  });

  test('la pièce file vers la scène au repos, qui montre ensuite son revers', async () => {
    const gate = gateFor();
    const host = await mounter.mount(<MintStrike size={56} strikeKey={0} next={next} gate={gate} />);
    gate.begin();
    await mounter.rerender(host, <MintStrike size={56} strikeKey={1} next={next} gate={gate} />);
    await flush();
    expect(host.querySelector('[data-game-strike-stage] [data-game-face-wrap="reverse"]')?.getAttribute('style')).toMatch(/opacity: ?1/);
  });
});
