import { describe, expect, test } from 'bun:test';

import {
  MEESHY_TOGGLE_ROW,
  meeshyToggleRowAccessibilityLabel,
  meeshyToggleRowRecipe,
  meeshyToggleRowVisibleSubtitle,
  type MeeshyToggleRowAccessory,
  type MeeshyToggleRowRecipeInput,
} from './meeshy-toggle-row-recipe';

const input = (overrides: Partial<MeeshyToggleRowRecipeInput> = {}): MeeshyToggleRowRecipeInput => ({
  accessory: { type: 'none' },
  kind: 'normal',
  tone: 'deep',
  tint: null,
  isEnabled: true,
  ...overrides,
});

const toggleOn: MeeshyToggleRowAccessory = { type: 'toggle', isOn: true };
const toggleOff: MeeshyToggleRowAccessory = { type: 'toggle', isOn: false };

describe('la mesure de la ligne', () => {
  test('la hauteur minimale est de 46 pt et la case de 24', () => {
    expect(MEESHY_TOGGLE_ROW.minimumHeight).toBe(46);
    expect(MEESHY_TOGGLE_ROW.checkboxSide).toBe(24);
  });

  test('une ligne désactivée se rend à 62 % et ne répond à aucun voile', () => {
    const recipe = meeshyToggleRowRecipe(input({ isEnabled: false }));
    expect(recipe.contentOpacity).toBe(0.62);
    expect(recipe.pressedVeil).toBe(0);
    expect(recipe.hoveredVeil).toBe(0);
  });

  test('une ligne active se rend pleine et porte les voiles d’appui et de survol', () => {
    const recipe = meeshyToggleRowRecipe(input());
    expect(recipe.contentOpacity).toBe(1);
    expect(recipe.pressedVeil).toBe(0.15);
    expect(recipe.hoveredVeil).toBe(0.08);
  });
});

describe('le sous-titre et le libellé lu', () => {
  test('un sous-titre vide ou blanc n’existe pas', () => {
    expect(meeshyToggleRowVisibleSubtitle('   ')).toBeNull();
    expect(meeshyToggleRowVisibleSubtitle(undefined)).toBeNull();
    expect(meeshyToggleRowVisibleSubtitle('  Amis  ')).toBe('Amis');
  });

  test('le libellé est le titre seul sans sous-titre, sans virgule orpheline', () => {
    expect(meeshyToggleRowAccessibilityLabel({ title: 'Muet', subtitle: ' ' })).toBe('Muet');
    expect(meeshyToggleRowAccessibilityLabel({ title: 'Muet', subtitle: 'Son coupé' })).toBe('Muet, Son coupé');
  });
});

describe('l’accessoire', () => {
  test('une coche, une case cochée ou une bascule ouverte prennent l’encre de la piste', () => {
    const track = 'var(--ios-indigo-500)';
    expect(meeshyToggleRowRecipe(input({ accessory: toggleOn })).accessoryInk).toBe(track);
    expect(meeshyToggleRowRecipe(input({ accessory: { type: 'check', isSelected: true } })).accessoryInk).toBe(track);
    expect(meeshyToggleRowRecipe(input({ accessory: { type: 'checkbox', isChecked: true } })).accessoryInk).toBe(track);
  });

  test('un choix non retenu reste muet : pas de coche, bascule fermée sans encre de piste', () => {
    const recipe = meeshyToggleRowRecipe(input({ accessory: toggleOff }));
    expect(recipe.isChosen).toBe(false);
    expect(recipe.accessoryInk).not.toBe('var(--ios-indigo-500)');
  });

  test('la valeur lue porte l’état de la bascule et le texte de la valeur', () => {
    expect(meeshyToggleRowRecipe(input({ accessory: toggleOn })).value).toEqual({ type: 'toggle', isOn: true });
    expect(meeshyToggleRowRecipe(input({ accessory: { type: 'value', text: 'Wolof' } })).value).toEqual({ type: 'text', text: 'Wolof' });
    expect(meeshyToggleRowRecipe(input({ accessory: { type: 'chevron' } })).value).toEqual({ type: 'none' });
  });

  test('une teinte remplace la piste de marque', () => {
    expect(meeshyToggleRowRecipe(input({ accessory: toggleOn, tint: 'var(--conv-accent)' })).trackOn).toBe('var(--conv-accent)');
  });
});

describe('les variantes et le ton', () => {
  test('le destructif est rouge, et la variante du thème clair se tient au jeton du thème', () => {
    expect(meeshyToggleRowRecipe(input({ kind: 'destructive' })).titleInk).toBe('var(--ios-error)');
    expect(meeshyToggleRowRecipe(input({ kind: 'destructive', tone: 'theme' })).titleInk).toBe('var(--kit-row-destructive-theme)');
  });

  test('l’accent prend la teinte de mention, ou la teinte donnée', () => {
    expect(meeshyToggleRowRecipe(input({ kind: 'accent' })).titleInk).toBe('var(--kit-row-mention)');
    expect(meeshyToggleRowRecipe(input({ kind: 'accent', tint: 'var(--conv-accent)' })).titleInk).toBe('var(--conv-accent)');
  });

  test('le ton thème prend l’encre du thème pour le titre et le sous-titre', () => {
    const recipe = meeshyToggleRowRecipe(input({ tone: 'theme' }));
    expect(recipe.titleInk).toBe('var(--color-ios-ink)');
    expect(recipe.subtitleInk).toBe('var(--color-ios-ink-2)');
  });

  test('hors thème, le titre est blanc sur média et le sous-titre à 70 %', () => {
    const recipe = meeshyToggleRowRecipe(input({ tone: 'deep' }));
    expect(recipe.titleInk).toBe('var(--color-on-media)');
    expect(recipe.subtitleInk).toBe('var(--ios-on-media-3)');
  });
});
