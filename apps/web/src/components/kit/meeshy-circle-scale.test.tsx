import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { kitMount } from '@/test-support/kit-mount';

import { MeeshyCircleScale, meeshyCircleScaleIntensity, meeshyCircleScaleRecipe } from './meeshy-circle-scale';

const { mount, render, act } = kitMount();

const LEVELS = ['Public', 'Communauté', 'Connaissance', 'Ami', 'Proche', 'Sang'].map((title) => ({ title, glyph: <i>{title[0]}</i> }));
const intensities = (of: number): number[] => Array.from({ length: of }, (_, level) => meeshyCircleScaleIntensity(level, of));

describe('MeeshyCircleScale — la loi d’intensité, comptée depuis le haut', () => {
  test('six niveaux : contour, 8, 18, 32, 52, 100 %', () => {
    expect(intensities(6)).toEqual([0, 0.08, 0.18, 0.32, 0.52, 1]);
  });

  test('le même nom a la même intensité, que l’hôte passe cinq niveaux ou six', () => {
    expect(intensities(5)).toEqual(intensities(6).slice(1));
    expect(intensities(8)).toEqual([0, 0, 0, 0.08, 0.18, 0.32, 0.52, 1]);
  });

  test('trois niveaux ou moins : un cran sur deux, 8 · 32 · 100', () => {
    expect(intensities(3)).toEqual([0.08, 0.32, 1]);
    expect(intensities(2)).toEqual([0.32, 1]);
  });

  test('un rang hors bornes est ramené', () => {
    expect(meeshyCircleScaleIntensity(99, 6)).toBe(1);
    expect(meeshyCircleScaleIntensity(-4, 6)).toBe(0);
  });
});

describe('MeeshyCircleScale — la recette en valeurs', () => {
  test('le niveau courant est ramené aux bornes, absent reste absent', () => {
    expect(meeshyCircleScaleRecipe({ count: 6, current: 9 }).current).toBe(5);
    expect(meeshyCircleScaleRecipe({ count: 6, current: -3 }).current).toBe(0);
    expect(meeshyCircleScaleRecipe({ count: 6 }).current).toBeNull();
  });

  test('moins de 2 ou plus de 8 niveaux : rien à rendre', () => {
    expect(meeshyCircleScaleRecipe({ count: 1 }).isRenderable).toBe(false);
    expect(meeshyCircleScaleRecipe({ count: 9 }).isRenderable).toBe(false);
    expect(meeshyCircleScaleRecipe({ count: 2 }).isRenderable).toBe(true);
  });

  test('mesures : pastille 58, pilule 26 · 34 · 44, crans de 12 écart 6, anneaux de 20, trait 1,5 puis 4', () => {
    expect(meeshyCircleScaleRecipe({ count: 6, form: 'dots' })).toMatchObject({ dot: 58, ringStep: 20, ringStroke: 1.5, currentStroke: 4, glow: 26 });
    expect(meeshyCircleScaleRecipe({ count: 6, form: 'dots', size: 'compact' })).toMatchObject({ dot: 12, gap: 6 });
    expect(['compact', 'regular', 'large'].map((size) => meeshyCircleScaleRecipe({ count: 6, form: 'pill', size: size as 'compact' }).pillHeight)).toEqual([26, 34, 44]);
  });

  test('chaque rang porte son intensité, le plus haut a l’encre sombre, le contour n’a pas de fond', () => {
    const { ranks } = meeshyCircleScaleRecipe({ count: 6, current: 4 });
    expect(ranks.map((rank) => rank.intensity)).toEqual([0, 0.08, 0.18, 0.32, 0.52, 1]);
    expect(ranks[0]?.isOutline).toBe(true);
    expect(ranks[5]?.ink).toBe('dark');
    expect(ranks[1]?.ink).toBe('theme');
    expect(ranks.filter((rank) => rank.isCurrent).length).toBe(1);
  });

  test('pressé : échelle 0,92 ; désactivé : 40 %', () => {
    expect(meeshyCircleScaleRecipe({ count: 6, isPressed: true }).pressedScale).toBe(0.92);
    expect(meeshyCircleScaleRecipe({ count: 6, isEnabled: false }).opacity).toBe(0.4);
  });
});

describe('MeeshyCircleScale — le composant', () => {
  test('sans onSelect : un seul élément qui dit « Proche, 5 / 6 »', () => {
    const container = mount(<MeeshyCircleScale levels={LEVELS} current={4} />);
    const root = container.querySelector('[data-kit-circle-scale]');
    expect(root?.getAttribute('role')).toBe('img');
    expect(root?.getAttribute('aria-label')).toBe('Proche, 5 / 6');
    expect(container.querySelectorAll('button').length).toBe(0);
  });

  test('valueFormat de l’hôte : « 5 sur 6 »', () => {
    const container = mount(<MeeshyCircleScale levels={LEVELS} current={4} valueFormat="%1 sur %2" />);
    expect(container.querySelector('[data-kit-circle-scale]')?.getAttribute('aria-label')).toBe('Proche, 5 sur 6');
  });

  test('les noms restent écrits : jamais la couleur seule', () => {
    const container = mount(<MeeshyCircleScale levels={LEVELS} current={3} />);
    for (const level of LEVELS) expect(container.textContent).toContain(level.title);
  });

  test('avec onSelect : un groupe de boutons radio nommés, le courant coché', () => {
    const picked: number[] = [];
    const container = mount(<MeeshyCircleScale levels={LEVELS} current={3} onSelect={(rank) => picked.push(rank)} />);
    const radios = [...container.querySelectorAll<HTMLElement>('[role="radio"]')];
    expect(radios.length).toBe(6);
    expect(radios.map((radio) => radio.getAttribute('aria-checked'))).toEqual(['false', 'false', 'false', 'true', 'false', 'false']);
    act(() => radios[4]?.click());
    expect(picked).toEqual([4]);
  });

  test('sans courant, aucun radio n’est coché (Mes cercles)', () => {
    const container = mount(<MeeshyCircleScale levels={LEVELS} onSelect={() => {}} />);
    expect([...container.querySelectorAll('[role="radio"]')].every((radio) => radio.getAttribute('aria-checked') === 'false')).toBe(true);
  });

  test('un compte est dit avec son niveau, zéro est une réponse', () => {
    const container = mount(<MeeshyCircleScale levels={LEVELS} counts={[128, 46, 31, 9, 0, 3]} countLabel={(count) => `${count} personnes`} onSelect={() => {}} />);
    const names = [...container.querySelectorAll('[role="radio"]')].map((radio) => radio.getAttribute('aria-label'));
    expect(names[4]).toBe('Proche, 0 personnes');
    expect(container.textContent).toContain('128');
  });

  test('des comptes de longueur différente sont ignorés', () => {
    const container = mount(<MeeshyCircleScale levels={LEVELS} counts={[1, 2]} />);
    expect(container.textContent).not.toContain('1 2');
    expect(container.querySelector('[data-kit-count]')).toBeNull();
  });

  test('une flèche déplace le choix d’un rang', () => {
    const picked: number[] = [];
    const container = mount(<MeeshyCircleScale levels={LEVELS} current={3} onSelect={(rank) => picked.push(rank)} />);
    const current = container.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]');
    act(() => current?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
    expect(picked).toEqual([4]);
  });

  test('pilule : le seul niveau courant, nommé, au glyphe du rang', () => {
    const container = mount(<MeeshyCircleScale levels={LEVELS} current={3} form="pill" />);
    expect(container.querySelector('[data-kit-circle-scale]')?.getAttribute('data-form')).toBe('pill');
    expect(container.textContent).toContain('Ami');
    expect(container.textContent).not.toContain('Sang');
  });

  test('anneaux : un par niveau, un seul allumé, le second rang en tirets', () => {
    const container = mount(<MeeshyCircleScale levels={LEVELS} current={4} other={5} form="rings" center={<b>AN</b>} marker={<b>LM</b>} />);
    expect(container.querySelectorAll('[data-kit-ring]').length).toBe(6);
    expect(container.querySelectorAll('[data-kit-ring][data-current]').length).toBe(1);
    expect(container.querySelectorAll('[data-kit-ring][data-other]').length).toBe(1);
    expect(container.textContent).toContain('AN');
  });

  test('un rang qui change ne re-rend que le courant : l’ancien perd data-current', () => {
    const container = mount(<MeeshyCircleScale levels={LEVELS} current={3} onSelect={() => {}} />);
    render(<MeeshyCircleScale levels={LEVELS} current={4} onSelect={() => {}} />);
    expect(container.querySelectorAll('[data-current]').length).toBe(1);
    expect(container.querySelector('[data-current]')?.getAttribute('aria-label')).toContain('Proche');
  });

  test('moins de 2 niveaux : aucune vue', () => {
    expect(mount(<MeeshyCircleScale levels={LEVELS.slice(0, 1)} current={0} />).children.length).toBe(0);
  });
});

describe('MeeshyCircleScale — pureté', () => {
  test('aucun type du domaine, aucun singleton, aucune couleur par niveau, aucune intensité hors recette', () => {
    const component = readFileSync(fileURLToPath(new URL('./meeshy-circle-scale.tsx', import.meta.url)), 'utf8');
    const recipe = readFileSync(fileURLToPath(new URL('./meeshy-circle-scale-recipe.ts', import.meta.url)), 'utf8');
    for (const text of [component, recipe]) expect(text).not.toMatch(/@meeshy\/shared|@\/stores|@\/lib\/api|backdrop-filter|box-shadow/);
    expect(component).not.toMatch(/0\.52|0\.32|0\.18/);
  });
});
