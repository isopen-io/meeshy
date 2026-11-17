import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { kitMount } from '@/test-support/kit-mount';

import { MeeshyCollapsingHero, meeshyCollapsingHeroRecipe } from './meeshy-collapsing-hero';

const { mount, act } = kitMount();

const at = (progress: number) => meeshyCollapsingHeroRecipe({ progress });
const r = (value: number): number => Math.round(value);

describe('MeeshyCollapsingHero — la recette à 0, 35, 70 et 100 %', () => {
  test('hauteur 318 · 240 · 163 · 96', () => {
    expect([0, 0.35, 0.7, 1].map((p) => r(at(p).height))).toEqual([318, 240, 163, 96]);
  });

  test('avatar 112 · 64 · 36 · 36, fini à 55 %', () => {
    expect([0, 0.35, 0.7, 1].map((p) => r(at(p).avatar.size))).toEqual([112, 64, 36, 36]);
  });

  test('titre 36 · 24 · 17 · 17, sous-titre 15 → 12', () => {
    expect([0, 0.35, 0.7, 1].map((p) => r(at(p).title.size))).toEqual([36, 24, 17, 17]);
    expect([0, 1].map((p) => r(at(p).subtitle.size))).toEqual([15, 12]);
  });

  test('bannière 100 % · 100 % · 60 % · 0 ; verre 0 · 0 · 40 % · 100 %', () => {
    expect([0, 0.35, 0.7, 1].map((p) => Math.round(at(p).bannerOpacity * 100))).toEqual([100, 100, 60, 0]);
    expect([0, 0.35, 0.7, 1].map((p) => Math.round(at(p).glassOpacity * 100))).toEqual([0, 0, 40, 100]);
  });

  test('l’identité est portée par le héros sous 50 %, par la barre au-delà : jamais les deux', () => {
    expect(at(0.49).barOwnsIdentity).toBe(false);
    expect(at(0.5).barOwnsIdentity).toBe(false);
    expect(at(0.51).barOwnsIdentity).toBe(true);
  });

  test('le disque de verre des commandes s’efface avant 70 %, les commandes ne bougent pas de plus de 6', () => {
    expect(at(0.7).controlsDiscOpacity).toBe(0);
    expect(at(0).controlsDiscOpacity).toBe(1);
    expect(Math.abs(at(1).controls.shift)).toBeLessThanOrEqual(6);
    expect(at(0).controls.target).toBe(44);
  });

  test('distance de défilement : 450 − 96 = 354 ; le héros déplié occupe 450', () => {
    expect(at(0).scrollDistance).toBe(354);
    expect(at(0).expandedWithIdentity).toBe(450);
  });

  test('bornée et monotone ; au-delà de 1 rien ne bouge', () => {
    const heights = [0, 0.2, 0.4, 0.6, 0.8, 1].map((p) => at(p).height);
    for (let i = 1; i < heights.length; i += 1) expect(heights[i]).toBeLessThanOrEqual(heights[i - 1] ?? 0);
    expect(at(2)).toEqual(at(1));
  });

  test('tiré vers le bas : seule la bannière s’étire, rien ne grossit', () => {
    const pulled = at(-0.3);
    expect(pulled.bannerStretch).toBeGreaterThan(0);
    expect(pulled.avatar.size).toBe(112);
    expect(pulled.title.size).toBe(36);
    expect(at(0).bannerStretch).toBe(0);
  });

  test('sans avatar : le titre se range à 66 du bord ; hauteurs paramétrables', () => {
    expect(meeshyCollapsingHeroRecipe({ progress: 1, hasAvatar: false }).title.start).toBe(66);
    expect(meeshyCollapsingHeroRecipe({ progress: 0, expandedHeight: 400, collapsedHeight: 80 }).height).toBe(400);
    expect(meeshyCollapsingHeroRecipe({ progress: 1, expandedHeight: 400, collapsedHeight: 80 }).height).toBe(80);
  });
});

describe('MeeshyCollapsingHero — une seule identité', () => {
  test('un seul titre de niveau 1, un seul avatar, du début à la fin', () => {
    for (const progress of [0, 0.4, 0.8, 1]) {
      const container = mount(<MeeshyCollapsingHero progress={progress} title="Léo Marchetti" subtitle="Proche · en ligne" avatar={(size) => <i data-avatar={size} />} />);
      expect(container.querySelectorAll('h1').length).toBe(1);
      expect(container.querySelectorAll('[data-avatar]').length).toBe(1);
    }
  });

  test('l’avatar reçoit sa taille courante', () => {
    const container = mount(<MeeshyCollapsingHero progress={1} title="Léo" avatar={(size) => <i data-avatar={size} />} />);
    expect(container.querySelector('[data-avatar]')?.getAttribute('data-avatar')).toBe('36');
  });

  test('le titre et son sous-titre se lisent une fois, ensemble', () => {
    const container = mount(<MeeshyCollapsingHero progress={0} title="Léo Marchetti" subtitle="Proche · en ligne" />);
    expect(container.querySelector('h1')?.textContent).toContain('Léo Marchetti');
    expect(container.querySelector('h1')?.textContent).toContain('Proche · en ligne');
  });

  test('replié, la barre est un bouton nommé qui rend la main à l’hôte ; déplié, aucun bouton de barre', () => {
    let taps = 0;
    const open = mount(<MeeshyCollapsingHero progress={0} title="Léo" backToTopLabel="Revenir en haut" onCollapsedTap={() => (taps += 1)} />);
    expect(open.querySelector('[data-kit-hero-bar-hit]')).toBeNull();
    const folded = mount(<MeeshyCollapsingHero progress={1} title="Léo" backToTopLabel="Revenir en haut" onCollapsedTap={() => (taps += 1)} />);
    const hit = folded.querySelector('[data-kit-hero-bar-hit]') as HTMLElement;
    expect(hit.getAttribute('aria-label')).toBe('Revenir en haut');
    act(() => hit.click());
    expect(taps).toBe(1);
  });

  test('sans nom à dire, la barre repliée ne pose aucun bouton muet', () => {
    const folded = mount(<MeeshyCollapsingHero progress={1} title="Léo" onCollapsedTap={() => {}} />);
    expect(folded.querySelector('[data-kit-hero-bar-hit]')).toBeNull();
    const empty = mount(<MeeshyCollapsingHero progress={1} title="Léo" backToTopLabel="" onCollapsedTap={() => {}} />);
    expect(empty.querySelector('[data-kit-hero-bar-hit]')).toBeNull();
  });

  test('leading et trailing gardent leur cible de 44 à tous les crans', () => {
    for (const progress of [0, 0.5, 1]) {
      const container = mount(<MeeshyCollapsingHero progress={progress} title="Léo" leading={<button type="button">Retour</button>} trailing={<button type="button">Plus</button>} />);
      expect((container.querySelector('[data-kit-hero-leading]') as HTMLElement).style.getPropertyValue('--kit-hero-target')).toBe(`${44 / 16}rem`);
    }
  });

  test('le titre vide est refusé ; chargement : squelette, leading reste vivant', () => {
    expect(() => mount(<MeeshyCollapsingHero progress={0} title="" />)).toThrow();
    const container = mount(<MeeshyCollapsingHero progress={0} title="Léo" isLoading leading={<button type="button">Retour</button>} />);
    expect(container.querySelector('[data-kit-skeleton]')).not.toBeNull();
    expect(container.querySelector('button')?.textContent).toBe('Retour');
  });

  test('variante bar : la barre seule, sans héros ; capsule : ajustée au contenu', () => {
    expect(mount(<MeeshyCollapsingHero variant="bar" progress={0} title="Mes adresses" />).firstElementChild?.getAttribute('data-variant')).toBe('bar');
    expect(mount(<MeeshyCollapsingHero variant="capsule" progress={0} title="Léo" />).firstElementChild?.getAttribute('data-variant')).toBe('capsule');
  });
});

describe('MeeshyCollapsingHero — pureté', () => {
  test('aucun type du domaine, aucun singleton, aucun verre dessiné ici', () => {
    for (const file of ['./meeshy-collapsing-hero.tsx', './meeshy-collapsing-hero-recipe.ts']) {
      const text = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
      expect(text).not.toMatch(/@meeshy\/shared|@\/stores|@\/lib\/api|backdrop-filter/);
    }
  });
});
