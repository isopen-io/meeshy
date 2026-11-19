import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { kitMount } from '@/test-support/kit-mount';

import { MeeshySkeleton, meeshySkeletonClockOffset, meeshySkeletonLineRatio, meeshySkeletonRecipe, meeshySkeletonShows } from './meeshy-skeleton';

const { mount } = kitMount();

describe('MeeshySkeleton — la loi : seulement si le cache est vide', () => {
  test('un cache, même périmé, se peint tout de suite', () => {
    expect(meeshySkeletonShows({ isLoading: true, hasCachedData: true })).toBe(false);
    expect(meeshySkeletonShows({ isLoading: true, hasCachedData: false })).toBe(true);
    expect(meeshySkeletonShows({ isLoading: false, hasCachedData: false })).toBe(false);
  });
});

describe('MeeshySkeleton — la recette des cinq formes', () => {
  test('ligne : hauteur du corps, rayon plein, largeur en part', () => {
    expect(meeshySkeletonRecipe({ kind: 'line', widthRatio: 0.55 })).toMatchObject({ height: 13, widthRatio: 0.55, radius: 'full' });
    expect(meeshySkeletonRecipe({ kind: 'line', widthRatio: 0.55, height: 11 }).height).toBe(11);
  });

  test('la part d’une ligne vient d’une suite fixe entre 40 et 70 %', () => {
    const ratios = Array.from({ length: 12 }, (_, index) => meeshySkeletonLineRatio(index));
    expect(Math.min(...ratios)).toBeGreaterThanOrEqual(0.4);
    expect(Math.max(...ratios)).toBeLessThanOrEqual(0.7);
    expect(meeshySkeletonLineRatio(3)).toBe(meeshySkeletonLineRatio(3));
  });

  test('rond : le diamètre du vrai, ni anneau ni point', () => {
    expect(meeshySkeletonRecipe({ kind: 'circle', diameter: 60 })).toMatchObject({ width: 60, height: 60, radius: 'full' });
  });

  test('carte : le rapport et le rayon donnés', () => {
    expect(meeshySkeletonRecipe({ kind: 'card', aspect: 4 / 3, radius: 18 })).toMatchObject({ aspect: 4 / 3, radius: 18 });
  });

  test('pilule et billet portent leur largeur, leur encoche', () => {
    expect(meeshySkeletonRecipe({ kind: 'pill', width: 96 })).toMatchObject({ width: 96, radius: 'full' });
    expect(meeshySkeletonRecipe({ kind: 'ticket', height: 120, cut: 14 })).toMatchObject({ height: 120, cut: 14 });
  });

  test('une seule horloge : deux squelettes montés au même instant ont le même décalage', () => {
    expect(meeshySkeletonClockOffset(10_000)).toBe(meeshySkeletonClockOffset(10_000));
    expect(meeshySkeletonClockOffset(1_600)).toBe(0);
    expect(meeshySkeletonClockOffset(2_000)).toBe(-400);
  });
});

describe('MeeshySkeleton — le composant', () => {
  test('décoratif : caché à la voix, sans texte ni icône', () => {
    const container = mount(<MeeshySkeleton shape={{ kind: 'card', aspect: 1, radius: 12 }} />);
    const node = container.querySelector<HTMLElement>('[data-kit-skeleton]');
    expect(node?.getAttribute('aria-hidden')).toBe('true');
    expect(node?.textContent).toBe('');
    expect(node?.getAttribute('data-shape')).toBe('card');
  });

  test('la forme se pose en variables, jamais en géométrie animée', () => {
    const container = mount(<MeeshySkeleton shape={{ kind: 'circle', diameter: 44 }} />);
    const node = container.querySelector<HTMLElement>('[data-kit-skeleton]');
    expect(node?.style.getPropertyValue('--kit-skeleton-w')).toBe('2.75rem');
    expect(node?.style.getPropertyValue('--kit-skeleton-h')).toBe('2.75rem');
  });

  test('le reflet part avec l’horloge commune', () => {
    const container = mount(<MeeshySkeleton shape={{ kind: 'line', widthRatio: 0.5 }} />);
    expect(container.querySelector<HTMLElement>('[data-kit-skeleton]')?.style.getPropertyValue('--kit-skeleton-delay')).toMatch(/^-?\d+ms$/);
  });
});

describe('MeeshySkeleton — pureté', () => {
  test('aucun type du domaine, aucun flou, aucune ombre', () => {
    for (const file of ['./meeshy-skeleton.tsx', './meeshy-skeleton-recipe.ts']) {
      expect(readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8')).not.toMatch(/@meeshy\/shared|@\/stores|@\/lib\/api|backdrop-filter|box-shadow/);
    }
  });
});
