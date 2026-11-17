import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { kitMount } from '@/test-support/kit-mount';

import { MeeshyMeter, meeshyMeterFraction, meeshyMeterRecipe, type MeeshyMeterKind } from './meeshy-meter';

const { mount, render } = kitMount();

const bar = (container: HTMLElement): HTMLElement => {
  const found = container.querySelector<HTMLElement>('[role="progressbar"]');
  if (found === null) throw new Error('jauge absente');
  return found;
};

describe('MeeshyMeter — la loi de la fraction', () => {
  test('négative rend 0, au-delà de total rend 1, total nul ne rend rien', () => {
    expect(meeshyMeterFraction(-4, 50)).toBe(0);
    expect(meeshyMeterFraction(80, 50)).toBe(1);
    expect(meeshyMeterFraction(23, 50)).toBeCloseTo(0.46, 5);
    expect(meeshyMeterFraction(5, 0)).toBeNull();
    expect(meeshyMeterFraction(5, -2)).toBeNull();
    expect(meeshyMeterFraction(Number.NaN, 50)).toBeNull();
  });

  test('le total vaut 1 par défaut', () => {
    expect(meeshyMeterFraction(0.25)).toBe(0.25);
  });
});

describe('MeeshyMeter — la recette en valeurs', () => {
  test('trois hauteurs de piste, remplissage à la hauteur au minimum dès que la valeur dépasse zéro', () => {
    expect([5, 8, 12].map((size) => meeshyMeterRecipe({ form: 'continuous', size, fraction: 0.5 }).trackHeight)).toEqual([5, 8, 12]);
    expect(meeshyMeterRecipe({ form: 'continuous', size: 8, fraction: 0.01 }).minFill).toBe(8);
    expect(meeshyMeterRecipe({ form: 'continuous', size: 8, fraction: 0 }).minFill).toBe(0);
  });

  test('à zéro : la piste seule, jamais un point de couleur', () => {
    expect(meeshyMeterRecipe({ form: 'continuous', size: 8, fraction: 0 }).showsFill).toBe(false);
  });

  test('à 1, fullKind s’applique ; périmé l’emporte sur tout genre', () => {
    expect(meeshyMeterRecipe({ form: 'continuous', size: 8, fraction: 1, kind: 'accent', fullKind: 'err' }).kind).toBe('err');
    expect(meeshyMeterRecipe({ form: 'continuous', size: 8, fraction: 0.5, kind: 'accent', fullKind: 'err' }).kind).toBe('accent');
    expect(meeshyMeterRecipe({ form: 'continuous', size: 8, fraction: 1, kind: 'ok', fullKind: 'err', isStale: true })).toMatchObject({ kind: 'stale', opacity: 0.6 });
  });

  test('stepped : N capsules égales, écart de 6, le plein se compte en crans', () => {
    const recipe = meeshyMeterRecipe({ form: { stepped: 3 }, size: 12, fraction: 2 / 3 });
    expect(recipe).toMatchObject({ stepCount: 3, stepGap: 6, filledSteps: 2 });
    expect(meeshyMeterRecipe({ form: { stepped: 3 }, size: 12, fraction: 0.5 }).filledSteps).toBe(2);
  });

  test('indéterminée : barre haute de 4, un segment de 38 % voyage', () => {
    expect(meeshyMeterRecipe({ form: 'indeterminate', size: 8, fraction: null })).toMatchObject({ trackHeight: 4, segmentShare: 0.38, isMoving: true });
  });

  test('en RTL le remplissage part de la droite', () => {
    expect(meeshyMeterRecipe({ form: 'continuous', size: 8, fraction: 0.5, isRtl: true }).origin).toBe('end');
    expect(meeshyMeterRecipe({ form: 'continuous', size: 8, fraction: 0.5 }).origin).toBe('start');
  });

  test('les quatre genres tiennent 3:1 de contraste annoncé : chaque genre a une encre', () => {
    const kinds: readonly MeeshyMeterKind[] = ['accent', 'ok', 'warn', 'err'];
    for (const kind of kinds) expect(meeshyMeterRecipe({ form: 'continuous', size: 8, fraction: 0.4, kind }).tone).toBe(kind);
  });
});

describe('MeeshyMeter — le composant', () => {
  test('un seul élément : barre de progression nommée, valeur « 23 sur 50 »', () => {
    const container = mount(<MeeshyMeter value={23} total={50} label="Arrivées par ce lien" spokenValue="23 sur 50" />);
    const node = bar(container);
    expect(node.getAttribute('aria-label')).toBe('Arrivées par ce lien');
    expect(node.getAttribute('aria-valuetext')).toBe('23 sur 50');
    expect(node.getAttribute('aria-valuenow')).toBe('23');
    expect(node.getAttribute('aria-valuemax')).toBe('50');
    expect(container.querySelectorAll('[role="progressbar"]').length).toBe(1);
  });

  test('sans spokenValue : le pourcentage écrit par la locale', () => {
    const container = mount(<MeeshyMeter value={1} total={4} label="Batterie" />);
    expect(bar(container).getAttribute('aria-valuetext')).toMatch(/25/);
  });

  test('la valeur dite est la vraie dès le premier rendu et ne se touche pas', () => {
    const container = mount(<MeeshyMeter value={23} total={50} label="Quota" />);
    const node = bar(container);
    expect(node.getAttribute('aria-valuenow')).toBe('23');
    expect(node.getAttribute('tabindex')).toBeNull();
    expect(node.querySelector('button, a, [tabindex]')).toBeNull();
  });

  test('total nul : aucune vue', () => {
    const container = mount(<MeeshyMeter value={3} total={0} label="Quota" />);
    expect(container.children.length).toBe(0);
  });

  test('le remplissage se pose en largeur proportionnelle, bornée à la piste', () => {
    const container = mount(<MeeshyMeter value={999} total={50} label="Quota" />);
    expect(container.querySelector<HTMLElement>('[data-kit-meter-fill]')?.style.getPropertyValue('--kit-meter-fraction')).toBe('1');
  });

  test('en-tête et légendes de bord ne sont pas relus', () => {
    const container = mount(<MeeshyMeter value={23} total={50} label="Quota" title="Entrées" valueText="23 / 50" startCaption="46 %" endCaption="encore 27" />);
    for (const part of ['title', 'value', 'start-caption', 'end-caption']) {
      expect(container.querySelector(`[data-kit-meter-${part}]`)?.getAttribute('aria-hidden')).toBe('true');
    }
  });

  test('une valeur qui change ne rend pas ce qui ne change pas : la voix suit la valeur', () => {
    const container = mount(<MeeshyMeter value={10} total={50} label="Quota" />);
    render(<MeeshyMeter value={30} total={50} label="Quota" />);
    expect(bar(container).getAttribute('aria-valuenow')).toBe('30');
  });

  test('indéterminée : une barre sans valeur dite', () => {
    const container = mount(<MeeshyMeter value={0} label="Chargement" form="indeterminate" />);
    expect(bar(container).getAttribute('aria-valuenow')).toBeNull();
    expect(bar(container).getAttribute('data-form')).toBe('indeterminate');
  });
});

describe('MeeshyMeter — pureté', () => {
  test('ni <progress>, ni type du domaine, ni singleton, ni ombre ni flou', () => {
    for (const file of ['./meeshy-meter.tsx', './meeshy-meter-recipe.ts']) {
      const text = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
      expect(text).not.toMatch(/<progress|backdrop-filter|box-shadow|@meeshy\/shared|@\/stores|@\/lib\/api/);
    }
  });
});
