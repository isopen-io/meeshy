import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { kitMount } from '@/test-support/kit-mount';

import { MeeshyMedallion, MeeshyMedallionRow, meeshyMedallionRecipe, type MeeshyMedallionSize } from './meeshy-medallion';

const { mount } = kitMount();

const SIZES: readonly MeeshyMedallionSize[] = [24, 36, 44, 52, 64, 96];

describe('MeeshyMedallion — la recette en valeurs', () => {
  test('six diamètres ; le glyphe fait la moitié du diamètre, 14 au moins', () => {
    expect(SIZES.map((size) => meeshyMedallionRecipe({ size }).diameter)).toEqual([...SIZES]);
    expect(SIZES.map((size) => meeshyMedallionRecipe({ size }).glyphSize)).toEqual([14, 18, 22, 26, 32, 48]);
  });

  test('une valeur s’écrit en 44 % du diamètre', () => {
    expect(meeshyMedallionRecipe({ size: 96 }).valueSize).toBeCloseTo(42.24, 2);
  });

  test('fond doux : la teinte à 18 % ; aplat : encre sombre ; jamais de bord, jamais d’ombre', () => {
    expect(meeshyMedallionRecipe({ fill: 'soft' })).toMatchObject({ background: 'soft', fillOpacity: 0.18, ink: 'tone', hasBorder: false, hasShadow: false });
    expect(meeshyMedallionRecipe({ fill: 'solid' })).toMatchObject({ background: 'solid', ink: 'dark', hasBorder: false, hasShadow: false });
  });

  test('courant impose l’aplat', () => {
    expect(meeshyMedallionRecipe({ fill: 'soft', state: 'current' }).background).toBe('solid');
  });

  test('carré arrondi : rayon à 34 % du côté (18 pour 52, 14 pour 40)', () => {
    expect(meeshyMedallionRecipe({ shape: 'squircle', size: 52 }).radius).toBe(18);
    expect(meeshyMedallionRecipe({ shape: 'squircle', size: 44 }).radius).toBe(15);
    expect(meeshyMedallionRecipe({ shape: 'disc', size: 52 }).radius).toBe(26);
  });

  test('scallop : neuf lobes, un tour en 22 s ; blob : 8 s sans tourner le contenu', () => {
    expect(meeshyMedallionRecipe({ shape: 'scallop' })).toMatchObject({ lobes: 9, motion: { kind: 'spin', seconds: 22 } });
    expect(meeshyMedallionRecipe({ shape: 'blob' })).toMatchObject({ motion: { kind: 'drift', seconds: 8 }, rotatesContent: false });
  });

  test('sans tracé de la plateforme : scallop et blob rendent un disque de même boîte', () => {
    const drawn = meeshyMedallionRecipe({ shape: 'scallop', size: 64 });
    const fallback = meeshyMedallionRecipe({ shape: 'scallop', size: 64, supportsShape: false });
    expect(fallback.shape).toBe('disc');
    expect([fallback.diameter, fallback.background, fallback.glyphSize]).toEqual([drawn.diameter, drawn.background, drawn.glyphSize]);
  });

  test('mouvement réduit : forme fixe, un seul anneau d’ondes, anneau pointillé immobile', () => {
    expect(meeshyMedallionRecipe({ shape: 'blob', reduceMotion: true })).toMatchObject({ shape: 'disc', motion: { kind: 'none' } });
    expect(meeshyMedallionRecipe({ decor: { waves: 3 }, reduceMotion: true }).waves).toBe(1);
    expect(meeshyMedallionRecipe({ decor: 'dashed', reduceMotion: true }).dashed).toMatchObject({ seconds: 0 });
  });

  test('les décors se mesurent en part du diamètre', () => {
    const size = 96;
    expect(meeshyMedallionRecipe({ size, decor: 'halo' }).halo).toEqual({ ring: size * 0.11, opacity: 0.07 });
    expect(meeshyMedallionRecipe({ size, decor: 'dashed' }).dashed).toEqual({ width: 2, inset: size * 0.11, seconds: 40 });
    expect(meeshyMedallionRecipe({ size, decor: 'struck' }).struck).toEqual({ width: 3, length: size * 0.64, angle: -45, cutout: 3 });
    expect(meeshyMedallionRecipe({ size, decor: { waves: 2 } }).waves).toBe(2);
  });

  test('un seul décor, sauf struck qui accepte l’anneau de dashed', () => {
    const both = meeshyMedallionRecipe({ size: 96, decor: ['struck', 'dashed'] });
    expect(both.struck).not.toBeNull();
    expect(both.dashed?.inset).toBeCloseTo(96 * 0.11, 5);
    expect(meeshyMedallionRecipe({ decor: ['halo', 'dashed'] }).dashed).toBeNull();
  });

  test('verrouillé : contour pointillé de 1,5 sans fond, ignore genre, fond et décor', () => {
    const locked = meeshyMedallionRecipe({ state: 'locked', kind: 'err', fill: 'solid', decor: 'halo' });
    expect(locked).toMatchObject({ background: 'none', borderWidth: 1.5, borderStyle: 'dashed', halo: null, showsLock: true, opacity: 0.35 });
  });

  test('jamais interactif : aucun rôle, aucune cible, aucun état pressé', () => {
    expect(meeshyMedallionRecipe({})).toMatchObject({ isInteractive: false, targetSide: 0 });
  });

  test('la teinte libre remplace la couleur du genre', () => {
    expect(meeshyMedallionRecipe({ kind: 'ok', tint: '#f59e0b' }).tone).toBe('tint');
    expect(meeshyMedallionRecipe({ kind: 'ok' }).tone).toBe('ok');
    expect(meeshyMedallionRecipe({ kind: 'neutral' }).tone).toBe('neutral');
  });
});

describe('MeeshyMedallion — le composant', () => {
  test('sans label : absent de l’arbre d’accessibilité', () => {
    const container = mount(<MeeshyMedallion glyph={<i>g</i>} />);
    const node = container.querySelector('[data-kit-medallion]');
    expect(node?.getAttribute('aria-hidden')).toBe('true');
    expect(node?.getAttribute('role')).toBeNull();
  });

  test('avec label : une image nommée ; verrouillé le dit', () => {
    const container = mount(<MeeshyMedallion glyph={<i>g</i>} label="Trophée Or" />);
    const node = container.querySelector('[data-kit-medallion]');
    expect(node?.getAttribute('role')).toBe('img');
    expect(node?.getAttribute('aria-label')).toBe('Trophée Or');
    const locked = mount(<MeeshyMedallion glyph={<i>g</i>} label="Trophée Or" state="locked" lockedName="verrouillé" />);
    expect(locked.querySelector('[data-kit-medallion]')?.getAttribute('aria-label')).toBe('Trophée Or, verrouillé');
  });

  test('une valeur remplace le glyphe', () => {
    const container = mount(<MeeshyMedallion value="24" />);
    expect(container.querySelector('[data-kit-medallion-value]')?.textContent).toBe('24');
    expect(container.querySelector('[data-kit-medallion-glyph]')).toBeNull();
  });

  test('aucun bouton, aucun focus, aucun geste', () => {
    const container = mount(<MeeshyMedallion glyph={<i>g</i>} label="x" decor={{ waves: 2 }} />);
    expect(container.querySelector('button, a, [tabindex], [onclick]')).toBeNull();
  });

  test('la rangée de récompenses se dit en une phrase, un seul élément', () => {
    const container = mount(
      <MeeshyMedallionRow earned={3} total={5} caption="3 trophées sur 5">
        <MeeshyMedallion glyph={<i>a</i>} />
        <MeeshyMedallion glyph={<i>b</i>} state="locked" />
      </MeeshyMedallionRow>,
    );
    const row = container.querySelector('[data-kit-medallion-row]');
    expect(row?.getAttribute('role')).toBe('group');
    expect(row?.getAttribute('aria-label')).toBe('3 trophées sur 5');
    expect(row?.getAttribute('data-earned')).toBe('3');
  });
});

describe('MeeshyMedallion — pureté', () => {
  test('ni Button, ni onClick, ni type du domaine, ni singleton', () => {
    for (const file of ['./meeshy-medallion.tsx', './meeshy-medallion-recipe.ts']) {
      const text = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
      expect(text).not.toMatch(/<button|onClick|clickable|@meeshy\/shared|@\/stores|@\/lib\/api|backdrop-filter|box-shadow/);
    }
  });
});
