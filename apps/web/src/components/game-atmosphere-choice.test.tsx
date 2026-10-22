import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { GloryAtmosphere } from '@meeshy/shared/types/glory-atmospheres';

import { atmosphereTilesOf } from '@/lib/game/atmosphere';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { GameAtmosphereChoice } from './game-atmosphere-choice';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click } = createActMounter();

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/me/progression' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
afterEach(unmountAll);

const tiles = atmosphereTilesOf({ catalogue: [], installed: [], origin: 'https://gate.example' });

/**
 * L'ÉCRAN E1 (#10163) : sept radios dans l'ordre fermé, l'Afrique éternelle cochée par défaut, « Continuer avec
 * <nom> » suit la radio, « Choisir plus tard » n'existe que si l'hôte l'offre, la présence se lit sur la tuile.
 */
describe('le choix d’atmosphère', () => {
  test('sept radios, l’Afrique éternelle d’abord et cochée sans atmosphère ; continuer choisit la radio cochée', async () => {
    const chosen: GloryAtmosphere[] = [];
    const host = await mount(<GameAtmosphereChoice current={null} tiles={tiles} onChoose={(a) => chosen.push(a)} onLater={() => undefined} onClose={() => undefined} />);
    const radios = [...host.querySelectorAll<HTMLElement>('[role="radio"]')];
    expect(radios.map((radio) => radio.dataset['atmosphereOption'])).toEqual(['afrique', 'egypte', 'olympe', 'celeste', 'nord', 'abysses', 'neon']);
    expect(radios[0]?.getAttribute('aria-checked')).toBe('true');
    expect(host.querySelector('[data-atmosphere-continue]')?.textContent).toContain('Afrique éternelle');
    await click(host.querySelector<HTMLElement>('[data-atmosphere-option="olympe"]'));
    expect(host.querySelector('[data-atmosphere-continue]')?.textContent).toContain('Olympe');
    await click(host.querySelector<HTMLElement>('[data-atmosphere-continue]'));
    expect(chosen).toEqual(['olympe']);
  });

  test('l’atmosphère du compte est précochée ; sans `onLater` (réglages), aucun « Choisir plus tard »', async () => {
    const host = await mount(<GameAtmosphereChoice current="neon" tiles={tiles} onChoose={() => undefined} onClose={() => undefined} />);
    expect(host.querySelector('[data-atmosphere-option="neon"]')?.getAttribute('aria-checked')).toBe('true');
    expect(host.querySelector('[data-atmosphere-later]')).toBeNull();
  });

  test('« Choisir plus tard » et « Fermer » appellent leurs gestes ; la présence se lit : incluse, installée, poids à télécharger', async () => {
    const log: string[] = [];
    const rich = tiles.map((tile) => (tile.atmosphere === 'olympe' ? { ...tile, downloadBytes: 2_300_000 } : tile.atmosphere === 'neon' ? { ...tile, installed: true } : tile));
    const host = await mount(<GameAtmosphereChoice current={null} tiles={rich} onChoose={() => undefined} onLater={() => log.push('later')} onClose={() => log.push('close')} />);
    await click(host.querySelector<HTMLElement>('[data-atmosphere-later]'));
    await click(host.querySelector<HTMLElement>('[data-atmosphere-close]'));
    expect(log).toEqual(['later', 'close']);
    expect(host.querySelector('[data-atmosphere-presence="afrique"]')?.textContent).toBe('Incluse');
    expect(host.querySelector('[data-atmosphere-presence="neon"]')?.textContent).toBe('Installée');
    expect(host.querySelector('[data-atmosphere-presence="olympe"]')?.textContent).toMatch(/2,3/);
    expect(host.querySelector('[data-atmosphere-presence="egypte"]')).toBeNull();
  });
});
