import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';

import { choreographyPlan } from '@/lib/game/choreography';

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

/**
 * UN GESTE SVG GARDE SON ORIGINE (#9389) — une forme SVG qu'on met à l'échelle
 * ou qu'on fait pivoter sans `transform-box: fill-box` part du coin (0, 0) du
 * dessin, pas de son propre centre : « les étoiles s'allument une à une »
 * deviendrait cinq étoiles qui fondent du coin haut-gauche de l'anneau. Chaque
 * cible SVG du passage en Prestige qui bouge par `scale` ou `rotate` doit donc
 * trouver sa boîte dans `game.css`.
 */
describe('le passage en Prestige : chaque forme SVG animée tourne et grandit sur elle-même', () => {
  const CSS = readFileSync(new URL('../../styles/game.css', import.meta.url), 'utf8');
  const SVG_TAGS = new Set(['path', 'g', 'circle', 'rect', 'text', 'ellipse', 'polygon', 'line', 'use']);
  const fillBoxed = (selector: string): boolean =>
    [...CSS.matchAll(/([^{}]+)\{([^}]*)\}/g)].some(([, selectors = '', body = '']) => selectors.split(',').map((part) => part.trim()).includes(selector) && /transform-box:\s*fill-box/.test(body));

  test('aucune cible SVG qui se transforme n’est laissée à l’origine du dessin', () => {
    const markup = renderToStaticMarkup(scene({ stars: 5 }));
    const orphans = choreographyPlan('prestige')
      .steps.filter((step) => step.keyframes.some((frame) => /scale|rotate/.test(String(frame.transform ?? ''))))
      .map((step) => step.target)
      .filter((target) => {
        const attribute = /^\[([a-z-]+)/.exec(target)?.[1];
        if (attribute === undefined) return false;
        const tags = [...markup.matchAll(new RegExp(`<([a-zA-Z]+)[^>]*\\s${attribute}[=\\s>]`, 'g'))].map((m) => m[1] ?? '');
        return tags.some((tag) => SVG_TAGS.has(tag)) && !fillBoxed(target);
      });
    expect(orphans).toEqual([]);
  });
});

