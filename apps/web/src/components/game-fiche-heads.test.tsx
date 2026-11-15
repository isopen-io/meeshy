import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';

import { createStrikeGate, type StrikeGate } from '@/lib/game/strike-gate';
import { loadGameCatalog } from '@/lib/i18n-game-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { HeritageHead, type HeritageHeadProps } from './game-fiche-heads';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/me/progression/concept/meesh' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadGameCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => mounter.unmountAll());

/**
 * LA TÊTE DE L'HÉRITAGE (#11482, #11483) — elle montre la DERNIÈRE pièce frappée, son revers et son numéro, dessinée
 * dans la plus haute édition atteinte (« le n° 247 dessiné en or ») ; et pendant toute la cérémonie de la frappe,
 * attente de la passerelle comprise, elle garde le compte et la pièce d'AVANT. À la fin (la scène va au bout, ou un
 * toucher la passe), le compte monte d'une Meesh et la nouvelle pièce prend la tête ; un refus ne change rien.
 */

const before: HeritageHeadProps = { balance: 88, tier: 'escarcelle', next: { key: 'coffret', minHeld: 100 }, minted: 91 };
const after: HeritageHeadProps = { ...before, balance: 89, minted: 92 };

const stagedGate = (reducedMotion = false): StrikeGate => createStrikeGate({ staged: () => true, reducedMotion: () => reducedMotion, schedule: () => () => undefined });

const flush = () => act(async () => new Promise<void>((resolve) => setTimeout(resolve, 0)));

type Shown = { readonly held: string | null; readonly coin: string | null; readonly edition: string | null; readonly face: string | null; readonly arrived: string | null };

const shown = (host: HTMLElement): Shown => {
  const coin = host.querySelector('[data-heritage-coin] [data-game-coin]');
  return {
    held: host.querySelector('[data-fact="meesh_held"]')?.textContent ?? null,
    coin: coin?.querySelector('[data-game-number]')?.getAttribute('data-game-number') ?? null,
    edition: coin?.getAttribute('data-game-edition') ?? null,
    face: coin?.getAttribute('data-game-face') ?? null,
    arrived: host.querySelector('[data-heritage-arrival]')?.getAttribute('data-heritage-arrival') ?? null,
  };
};

const head = (props: HeritageHeadProps, gate: StrikeGate, reducedMotion = false) => <HeritageHead {...props} gate={gate} reducedMotion={reducedMotion} />;

describe('la tête montre la dernière pièce frappée, dans son édition dessinée (#11483)', () => {
  const coinFor = async (minted: number | null) => shown(await mounter.mount(head({ ...before, minted }, stagedGate())));

  test('son revers et son numéro : le compte des Meeshes frappées depuis toujours', async () => {
    expect(await coinFor(91)).toMatchObject({ coin: '91', face: 'reverse', edition: 'silver' });
  });

  test('le n° 247, frappé après les n° 100 et 200, se dessine en or', async () => {
    expect(await coinFor(247)).toMatchObject({ coin: '247', edition: 'gold' });
  });

  test('le n° 100 en or, le n° 1000 et le n° 1500 en prisme', async () => {
    expect((await coinFor(100)).edition).toBe('gold');
    expect((await coinFor(1000)).edition).toBe('prism');
    expect((await coinFor(1500)).edition).toBe('prism');
  });

  test('sans aucune pièce : le flan nu, sans numéro', async () => {
    for (const minted of [0, null]) {
      const host = await mounter.mount(head({ ...before, minted }, stagedGate()));
      expect(host.querySelector('[data-heritage-coin]')?.getAttribute('data-heritage-coin')).toBe('blank');
      expect(shown(host)).toMatchObject({ coin: null, face: 'obverse', edition: 'silver' });
    }
  });
});

describe('le compte et la pièce changent quand la frappe se termine, jamais avant (#11482)', () => {
  test('pendant toute la cérémonie, attente de la passerelle comprise, la tête garde le compte et la pièce d’avant', async () => {
    const gate = stagedGate();
    const host = await mounter.mount(head(before, gate));
    await act(async () => gate.begin());
    await mounter.rerender(host, head(after, gate));
    expect(shown(host)).toMatchObject({ held: '88 Meeshes', coin: '91', arrived: null });
    await act(async () => gate.confirm({ number: 92, edition: 'silver' }));
    await flush();
    expect(shown(host)).toMatchObject({ held: '88 Meeshes', coin: '91', arrived: null });
  });

  test('à la fin de la scène, le compte monte d’une Meesh et la nouvelle pièce prend la tête, avec un mouvement court, une seule fois', async () => {
    const gate = stagedGate();
    const host = await mounter.mount(head(before, gate));
    await act(async () => gate.begin());
    await mounter.rerender(host, head(after, gate));
    await act(async () => gate.confirm({ number: 92, edition: 'silver' }));
    await act(async () => gate.settle());
    await flush();
    expect(shown(host)).toMatchObject({ held: '89 Meeshes', coin: '92', arrived: '1' });
    await act(async () => gate.settle());
    await flush();
    expect(shown(host).arrived).toBe('1');
  });

  test('un toucher qui passe la scène AVANT la réponse : la tête attend la confirmation, puis monte une seule fois', async () => {
    const gate = stagedGate();
    const host = await mounter.mount(head(before, gate));
    await act(async () => gate.begin());
    await act(async () => gate.settle());
    await mounter.rerender(host, head(after, gate));
    await flush();
    expect(shown(host)).toMatchObject({ held: '88 Meeshes', coin: '91' });
    await act(async () => gate.confirm());
    await flush();
    expect(shown(host)).toMatchObject({ held: '89 Meeshes', coin: '92', arrived: '1' });
  });

  test('un refus ne change ni le compte ni la pièce', async () => {
    const gate = stagedGate();
    const host = await mounter.mount(head(before, gate));
    await act(async () => gate.begin());
    await act(async () => gate.settle());
    await mounter.rerender(host, head(after, gate));
    await act(async () => gate.refuse('INSUFFICIENT_POINTS'));
    await mounter.rerender(host, head(before, gate));
    await flush();
    expect(shown(host)).toMatchObject({ held: '88 Meeshes', coin: '91', arrived: null });
  });

  test('avec « Réduire les animations », le changement se fait sans mouvement', async () => {
    const gate = stagedGate(true);
    const host = await mounter.mount(head(before, gate, true));
    await act(async () => gate.begin());
    await mounter.rerender(host, head(after, gate, true));
    expect(shown(host)).toMatchObject({ held: '88 Meeshes', coin: '91' });
    await act(async () => gate.confirm());
    await flush();
    expect(shown(host)).toMatchObject({ held: '89 Meeshes', coin: '92', arrived: null });
  });

  test('sans frappe, la tête suit ce que le serveur sert', async () => {
    const gate = stagedGate();
    const host = await mounter.mount(head(before, gate));
    await mounter.rerender(host, head(after, gate));
    expect(shown(host)).toMatchObject({ held: '89 Meeshes', coin: '92', arrived: null });
  });
});
