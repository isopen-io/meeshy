import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { PrestigeScene } from './prestige-scene';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, rerender } = createActMounter();

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/me/progression/prestige' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
afterEach(unmountAll);

const scene = (patch: Partial<Parameters<typeof PrestigeScene>[0]> = {}) => (
  <PrestigeScene level={1} tier="etincelle" progress={0} stars={2} plate="PRESTIGE 2" size={96} {...patch} />
);

/**
 * LA SCÈNE DU PRESTIGE (#9389) — l’anneau aux étoiles, le trophée couronné par
 * Mee et Meo. Décorative : l’écran dit ce qu’elle montre.
 */
describe('PrestigeScene', () => {
  test('l’anneau porte autant d’étoiles que de Prestiges, et le trophée porte sa plaque', () => {
    const html = renderToStaticMarkup(scene());
    expect((html.match(/data-game-prestige-star/g) ?? []).length).toBe(2);
    expect(html).toContain('data-game-trophy="prestige"');
    expect(html).toContain('>PRESTIGE 2<');
  });

  test('Mee et Meo, couronnés, tiennent le trophée', () => {
    const html = renderToStaticMarkup(scene());
    expect(html).toContain('data-game-bird="meeCrown"');
    expect(html).toContain('data-game-bird="meoCrown"');
  });

  test('sans étoile : l’anneau seul, pas de trophée', () => {
    const html = renderToStaticMarkup(scene({ stars: 0 }));
    expect(html).not.toContain('data-game-prestige-trophy');
    expect(html).not.toContain('data-game-prestige-star');
  });

  test('la scène est décorative', () => {
    expect(renderToStaticMarkup(scene())).toContain('aria-hidden="true"');
  });

  test('changer la clé de lecture joue la chorégraphie du Prestige', async () => {
    const plays: string[] = [];
    const options = { reducedMotion: false, haptics: false, schedule: (run: () => void) => { plays.push('scheduled'); void run; return () => undefined; } } as const;
    const host = await mount(scene({ playKey: 0, playOptions: options }));
    expect(plays).toEqual([]);
    await rerender(host, scene({ playKey: 1, playOptions: options }));
    expect(plays.length).toBeGreaterThan(0);
  });
});
