import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { kitMount, spokenText } from '@/test-support/kit-mount';

import { contrastRatio } from './kit-color';
import { MeeshyLivingBanner, meeshyBannerParallax, meeshyBannerSensorRuns, meeshyLivingBannerRecipe } from './meeshy-living-banner';

const { mount, render, act } = kitMount();

describe('MeeshyLivingBanner — la recette en valeurs', () => {
  test('dégradé à 165°, trois arrêts : teinte à 72 %, teinte à 34 %, fond de l’écran', () => {
    const recipe = meeshyLivingBannerRecipe({ tint: '#A855F7' });
    expect(recipe.gradient.angle).toBe(165);
    expect(recipe.gradient.stops.map((stop) => stop.share)).toEqual([0.72, 0.34, 0]);
    expect(recipe.gradient.stops[2]?.color).toBe('ground');
  });

  test('orbe proche : 220, flou 28, 75 %, parallaxe 12 ; orbe lointaine : 180, 70 %, parallaxe 6 à contresens', () => {
    const recipe = meeshyLivingBannerRecipe({ tint: '#A855F7' });
    expect(recipe.orbs.near).toMatchObject({ diameter: 220, blur: 28, opacity: 0.75, parallax: 12 });
    expect(recipe.orbs.far).toMatchObject({ diameter: 180, opacity: 0.7, parallax: -6 });
  });

  test('l’orbe lointaine prend la teinte voisine, −30° sur la roue', () => {
    const recipe = meeshyLivingBannerRecipe({ tint: '#FF0000' });
    expect(recipe.orbs.near.color).toBe('#FF0000');
    expect(recipe.orbs.far.color).not.toBe('#FF0000');
  });

  test('fondu de 38 % de la hauteur : 120 sur 318', () => {
    const recipe = meeshyLivingBannerRecipe({ tint: '#A855F7' });
    expect(recipe.height).toBe(318);
    expect(recipe.fadeHeight).toBeCloseTo(120.84, 5);
  });

  test('clair : la teinte se mêle au blanc, 52 % puis 20 %, orbes à 50 et 40 %', () => {
    const recipe = meeshyLivingBannerRecipe({ tint: '#A855F7', scheme: 'light' });
    expect(recipe.gradient.stops.map((stop) => stop.share)).toEqual([0.52, 0.2, 0]);
    expect([recipe.orbs.near.opacity, recipe.orbs.far.opacity]).toEqual([0.5, 0.4]);
  });

  test('avec photo : les orbes s’effacent, un voile de 42 % tient le haut, le fondu reste', () => {
    const recipe = meeshyLivingBannerRecipe({ tint: '#A855F7', hasImage: true });
    expect(recipe).toMatchObject({ orbsVisible: false, veilOpacity: 0.42 });
    expect(recipe.fadeHeight).toBeGreaterThan(0);
  });

  test('atténué : gris, orbes figées, aucune parallaxe', () => {
    const recipe = meeshyLivingBannerRecipe({ tint: '#A855F7', isMuted: true });
    expect(recipe).toMatchObject({ isDesaturated: true, floats: false, sensorRuns: false });
  });

  test('les trois jalons de hauteur : barre 96, carte 130, héros 318 ; l’avancée replie hauteur, orbe lointaine et fondu', () => {
    const folded = meeshyLivingBannerRecipe({ tint: '#A855F7', collapse: 1 });
    expect(folded.height).toBe(96);
    expect(folded.orbs.far.opacity).toBe(0);
    expect(folded.fadeHeight).toBe(0);
    expect(meeshyLivingBannerRecipe({ tint: '#A855F7', height: 130 }).height).toBe(130);
  });

  test('ambient sans cadre ni fondu, veil transparent vers le bas, fill à une orbe et sans fondu', () => {
    expect(meeshyLivingBannerRecipe({ tint: '#A855F7', mode: 'ambient' })).toMatchObject({ fadeHeight: 0, orbCount: 2 });
    expect(meeshyLivingBannerRecipe({ tint: '#A855F7', mode: 'veil' }).fadeToTransparent).toBe(true);
    expect(meeshyLivingBannerRecipe({ tint: '#A855F7', mode: 'fill' })).toMatchObject({ orbCount: 1, fadeHeight: 0 });
  });

  test('l’encre du haut du dégradé tient 4,5:1 sur la teinte servie, en sombre comme en clair', () => {
    for (const scheme of ['dark', 'light'] as const) {
      for (const tint of ['#A855F7', '#4ECDC4', '#F8B500']) {
        const recipe = meeshyLivingBannerRecipe({ tint, scheme });
        expect(contrastRatio(recipe.inkOnTop, recipe.topColor)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe('MeeshyLivingBanner — la parallaxe et le capteur', () => {
  test('±15° donnent ±12 px et ±6 px à contresens, puis plafonnent ; à plat, nul', () => {
    expect(meeshyBannerParallax(15)).toEqual({ near: 12, far: -6 });
    expect(meeshyBannerParallax(-15)).toEqual({ near: -12, far: 6 });
    expect(meeshyBannerParallax(40)).toEqual({ near: 12, far: -6 });
    expect(meeshyBannerParallax(0)).toEqual({ near: 0, far: -0 });
  });

  test('le capteur ne tourne que si motion = on, bannière visible, non atténuée, sans mouvement réduit', () => {
    const base = { motion: 'on', isVisible: true, isMuted: false, reducedMotion: false } as const;
    expect(meeshyBannerSensorRuns(base)).toBe(true);
    expect(meeshyBannerSensorRuns({ ...base, motion: 'reduced' })).toBe(false);
    expect(meeshyBannerSensorRuns({ ...base, motion: 'off' })).toBe(false);
    expect(meeshyBannerSensorRuns({ ...base, isVisible: false })).toBe(false);
    expect(meeshyBannerSensorRuns({ ...base, isMuted: true })).toBe(false);
    expect(meeshyBannerSensorRuns({ ...base, reducedMotion: true })).toBe(false);
  });
});

describe('MeeshyLivingBanner — silence et emplacements', () => {
  test('dégradé, orbes et fondu sont masqués au lecteur ; seuls les emplacements parlent, dans l’ordre début, fin, bas', () => {
    const container = mount(<MeeshyLivingBanner tint="#A855F7" topLeading={<button type="button">Retour</button>} topTrailing={<button type="button">Plus</button>} bottom={<p>Niveau 24</p>} />);
    expect(container.querySelector('[data-kit-banner-decor]')?.getAttribute('aria-hidden')).toBe('true');
    expect(spokenText(container.firstElementChild as HTMLElement)).toBe('RetourPlusNiveau 24');
    expect(container.firstElementChild?.getAttribute('role')).toBeNull();
  });

  test('un emplacement vide ne rend rien', () => {
    const container = mount(<MeeshyLivingBanner tint="#A855F7" />);
    expect(container.querySelector('[data-kit-banner-top-leading]')).toBeNull();
    expect(container.querySelector('[data-kit-banner-bottom]')).toBeNull();
  });

  test('chargement : le squelette du kit, ni teinte, ni orbe, ni emplacement', () => {
    const container = mount(<MeeshyLivingBanner tint="#A855F7" isLoading topLeading={<button type="button">Retour</button>} />);
    expect(container.querySelector('[data-kit-skeleton]')).not.toBeNull();
    expect(container.querySelector('[data-kit-banner-orb]')).toBeNull();
    expect(container.querySelector('button')).toBeNull();
  });

  const tilt = (gamma: number): void => {
    act(() => {
      window.dispatchEvent(Object.assign(new Event('deviceorientation'), { gamma }));
    });
  };

  test('l’inclinaison déplace les orbes dès le montage', () => {
    const container = mount(<MeeshyLivingBanner tint="#A855F7" allowsDeviceTilt />);
    tilt(15);
    expect((container.firstElementChild as HTMLElement).style.getPropertyValue('--kit-banner-near-x')).toBe('12px');
  });

  test('une bannière montée en chargement s’anime une fois chargée : le capteur part avec le décor', () => {
    const container = mount(<MeeshyLivingBanner tint="#A855F7" allowsDeviceTilt isLoading />);
    render(<MeeshyLivingBanner tint="#A855F7" allowsDeviceTilt />);
    tilt(15);
    expect((container.firstElementChild as HTMLElement).style.getPropertyValue('--kit-banner-near-x')).toBe('12px');
  });

  test('l’image posée est celle de l’hôte, déjà résolue : les orbes s’effacent', () => {
    const container = mount(<MeeshyLivingBanner tint="#A855F7" image="blob:photo" />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:photo');
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('');
    expect(container.firstElementChild?.getAttribute('data-has-image')).toBe('');
  });

  test('motion off : rien ne bouge ; reduced : flotte sans capteur', () => {
    expect(mount(<MeeshyLivingBanner tint="#A855F7" motion="off" />).firstElementChild?.getAttribute('data-motion')).toBe('off');
    expect(mount(<MeeshyLivingBanner tint="#A855F7" motion="reduced" />).firstElementChild?.getAttribute('data-motion')).toBe('reduced');
  });
});

describe('MeeshyLivingBanner — pureté', () => {
  test('aucun type du domaine, aucun singleton, aucun chargement d’image', () => {
    for (const file of ['./meeshy-living-banner.tsx', './meeshy-living-banner-recipe.ts']) {
      const text = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
      expect(text).not.toMatch(/@meeshy\/shared|@\/stores|@\/lib\/api|new Image\(|fetch\(/);
    }
  });
});
