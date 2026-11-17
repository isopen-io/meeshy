import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { encodeQr } from '@/lib/qr';
import { kitMount, spokenText } from '@/test-support/kit-mount';

import { contrastRatio } from './kit-color';
import { encodeMeeshyCode, MeeshyCodeCard, MeeshyCodeMatrix, MeeshyCodePlate, meeshyCodeCardRecipe, meeshyCodeTilt } from './meeshy-code-card';

const { mount, act } = kitMount();

describe('MeeshyCodeCard — un seul encodeur', () => {
  test('encodeMeeshyCode rend la matrice de l’encodeur du produit, module pour module', () => {
    for (const payload of ['https://meeshy.me/@aissa', 'AISSA-7K2', 'x']) {
      const mine = encodeMeeshyCode(payload);
      const original = encodeQr(payload);
      expect(mine?.modules).toEqual(original?.modules ?? null as never);
      expect(mine?.size).toBe(original?.size);
    }
  });

  test('au-delà de 24 modules de côté, la miniature est refusée', () => {
    expect(meeshyCodeCardRecipe({ size: 72, modules: 25 }).isRefused).toBe(true);
    expect(meeshyCodeCardRecipe({ size: 72, modules: 21 }).isRefused).toBe(false);
    expect(meeshyCodeCardRecipe({ size: 220, modules: 25 }).isRefused).toBe(false);
  });
});

describe('MeeshyCodeCard — la recette en valeurs', () => {
  test('trois côtés : 72, 160, 220 ; largeur de la carte = côté + 98', () => {
    expect(meeshyCodeCardRecipe({ size: 220 })).toMatchObject({ side: 220, cardWidth: 318 });
    expect(meeshyCodeCardRecipe({ size: 160 })).toMatchObject({ side: 160, cardWidth: 258 });
  });

  test('carte de verre : rayon 34, plaque de rayon 28 et de marge 16 ; miniature : plaque 14, marge 6', () => {
    expect(meeshyCodeCardRecipe({ size: 220, style: 'glass' })).toMatchObject({ cardRadius: 34, plateRadius: 28, plateMargin: 16 });
    expect(meeshyCodeCardRecipe({ size: 72, style: 'plain' })).toMatchObject({ plateRadius: 14, plateMargin: 6 });
  });

  test('pastille de 25 % du côté (56 pour 220), absente sous 120 ; légende absente en miniature', () => {
    expect(meeshyCodeCardRecipe({ size: 220 }).centerSize).toBe(55);
    expect(meeshyCodeCardRecipe({ size: 72 }).showsCenter).toBe(false);
    expect(meeshyCodeCardRecipe({ size: 160 }).showsCenter).toBe(true);
    expect(meeshyCodeCardRecipe({ size: 72 }).showsCaption).toBe(false);
  });

  test('mini et plain forcent tilt none ; le reflet n’existe qu’en verre', () => {
    expect(meeshyCodeCardRecipe({ size: 72, tilt: 'device' }).tilt).toBe('none');
    expect(meeshyCodeCardRecipe({ size: 220, style: 'plain', tilt: 'device' }).tilt).toBe('none');
    expect(meeshyCodeCardRecipe({ size: 220, style: 'glass', tilt: 'device' }).tilt).toBe('device');
    expect(meeshyCodeCardRecipe({ size: 220, style: 'plain' }).hasGlint).toBe(false);
  });

  test('mouvement réduit : tilt none, aucun reflet, fondu de 200 ms à l’arrivée', () => {
    const recipe = meeshyCodeCardRecipe({ size: 220, reduceMotion: true, tilt: 'device' });
    expect(recipe).toMatchObject({ tilt: 'none', hasGlint: false, arrivalMs: 200 });
  });

  test('la plaque est claire dans les deux thèmes, l’encre des modules aussi', () => {
    const recipe = meeshyCodeCardRecipe({ size: 220 });
    expect([recipe.plateColor, recipe.inkColor]).toEqual(['#F5F3FF', '#1B1140']);
  });

  test('toute teinte servie atteint 4,5:1 sur la plaque', () => {
    for (const tint of ['#818CF8', '#FBBF24', '#34D399', '#4ECDC4', '#F8B500']) {
      const recipe = meeshyCodeCardRecipe({ size: 220, tint });
      expect(contrastRatio(recipe.tintColor, recipe.plateColor)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('meeshyCodeTilt — une fonction pure de l’angle', () => {
  test('pivot borné à ±16°, reflet de 112 % à −32 %, plaque ±7, pastille ±6 de plus à rebours', () => {
    const left = meeshyCodeTilt(-16);
    const flat = meeshyCodeTilt(0);
    const right = meeshyCodeTilt(16);
    expect([left.pivot, flat.pivot, right.pivot]).toEqual([-16, 0, 16]);
    expect([left.glint, right.glint]).toEqual([112, -32]);
    expect(Math.abs(left.plate)).toBe(7);
    expect(Math.abs(left.center)).toBe(13);
    expect(Math.sign(left.center)).toBe(Math.sign(left.plate));
    expect(meeshyCodeTilt(90).pivot).toBe(16);
    expect(meeshyCodeTilt(-90).pivot).toBe(-16);
  });

  test('à plat : reflet au centre, rien ne glisse', () => {
    const flat = meeshyCodeTilt(0);
    expect(flat.glint).toBe(40);
    expect(flat.plate).toBe(0);
    expect(flat.center).toBe(0);
  });
});

describe('MeeshyCodeMatrix et MeeshyCodePlate', () => {
  test('un seul tracé pour toute la matrice ; l’image est nommée par label, le payload n’apparaît dans aucun nom', () => {
    const container = mount(<MeeshyCodeMatrix payload="https://meeshy.me/@aissa" label="Code de ton profil" side={160} />);
    const image = container.querySelector('[role="img"]') as HTMLElement;
    expect(image.getAttribute('aria-label')).toBe('Code de ton profil');
    expect(container.innerHTML).not.toContain('meeshy.me/@aissa');
    expect(container.querySelectorAll('[data-kit-code-modules]').length).toBe(1);
  });

  test('trois yeux à la teinte', () => {
    const container = mount(<MeeshyCodeMatrix payload="AISSA-7K2" label="Code" side={160} tint="#4F46E5" />);
    expect(container.querySelectorAll('[data-kit-code-eye]').length).toBe(3);
  });

  test('la matrice ne se reflète jamais en arabe', () => {
    const container = mount(<MeeshyCodeMatrix payload="AISSA-7K2" label="Code" side={160} />);
    expect((container.querySelector('svg') as SVGElement).getAttribute('direction') ?? (container.firstElementChild as HTMLElement).getAttribute('dir')).toBe('ltr');
  });

  test('la plaque et sa matrice se posent à plat, sans carte', () => {
    const container = mount(<MeeshyCodePlate payload="AISSA-7K2" label="Code" side={72} />);
    expect(container.querySelector('[data-kit-code-plate]')).not.toBeNull();
    expect(container.querySelector('[data-kit-code-card]')).toBeNull();
  });
});

describe('MeeshyCodeCard — la carte', () => {
  test('sans payload : le squelette à la taille finale de la carte', () => {
    const container = mount(<MeeshyCodeCard label="Ma carte" />);
    expect(container.querySelector('[data-kit-skeleton]')).not.toBeNull();
    expect(container.querySelector('[data-kit-code-modules]')).toBeNull();
  });

  test('prêt : la matrice remplace le squelette, une image nommée dont la valeur est la légende', () => {
    const container = mount(<MeeshyCodeCard payload="https://meeshy.me/@aissa" label="Code de ton profil" caption="meeshy.me/@aissa" />);
    expect(container.querySelector('[data-kit-skeleton]')).toBeNull();
    const image = container.querySelector('[role="img"]') as HTMLElement;
    expect(image.getAttribute('aria-label')).toBe('Code de ton profil');
    expect(spokenText(container)).toContain('meeshy.me/@aissa');
  });

  test('l’en-tête et la légende suivent le sens ; la légende passe à la ligne sans élargir la carte', () => {
    const container = mount(<MeeshyCodeCard payload="x" label="Code" caption="meeshy.me/@aissa" header={<p data-header="">Aïssa</p>} />);
    expect(container.querySelector('[data-kit-code-header]')?.textContent).toBe('Aïssa');
    expect(container.querySelector('[data-kit-code-caption]')).not.toBeNull();
  });

  test('avec onPress : un bouton de 44, nommé', () => {
    let presses = 0;
    const container = mount(<MeeshyCodeCard payload="x" label="Code" size={72} style="plain" onPress={() => (presses += 1)} />);
    const button = container.querySelector('button') as HTMLElement;
    expect(button.getAttribute('aria-label')).toBe('Code');
    act(() => button.click());
    expect(presses).toBe(1);
  });

  test('visée : le cadre se pose sur l’image de l’hôte et dit son état', () => {
    const container = mount(<MeeshyCodeCard payload="x" label="Vise un code" style="reticle" reticleState="seeking" viewfinder={<video data-view="" />} />);
    expect(container.querySelector('[data-view]')).not.toBeNull();
    expect(container.querySelector('[data-kit-code-reticle]')?.getAttribute('data-state')).toBe('seeking');
  });

  test('verso sans code : l’en-tête seul sur la même carte', () => {
    const container = mount(<MeeshyCodeCard payload="x" label="Identité" face="identity" header={<p>Aïssa Ndiaye</p>} />);
    expect(container.querySelector('[data-kit-code-modules]')).toBeNull();
    expect(container.querySelector('[data-kit-code-header]')?.textContent).toBe('Aïssa Ndiaye');
  });
});

describe('MeeshyCodeCard — pureté', () => {
  test('aucun type du domaine, aucun singleton, aucun chargement d’image, le payload n’est jamais journalisé', () => {
    for (const file of ['./meeshy-code-card.tsx', './meeshy-code-card-recipe.ts']) {
      const text = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
      expect(text).not.toMatch(/@meeshy\/shared|@\/stores|@\/lib\/api|new Image\(|console\./);
    }
  });
});
