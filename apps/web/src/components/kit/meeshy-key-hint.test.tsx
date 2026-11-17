import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { kitMount } from '@/test-support/kit-mount';

import {
  MeeshyKeyHint,
  MeeshyKeyLegend,
  meeshyKeyHintGlyphs,
  meeshyKeyHintRecipe,
  meeshyKeyHintShortcut,
  meeshyKeyHintShown,
  meeshyKeyHintSpoken,
  type MeeshyKey,
} from './meeshy-key-hint';

const { mount } = kitMount();

const COMMAND_M: readonly MeeshyKey[] = ['primary', { character: 'm' }];

describe('MeeshyKeyHint — la loi pure', () => {
  test('primary rend la boucle de Commande sur Apple et « Ctrl » ailleurs, depuis la même entrée', () => {
    expect(meeshyKeyHintGlyphs(COMMAND_M, 'apple')).toEqual(['⌘', 'M']);
    expect(meeshyKeyHintGlyphs(COMMAND_M, 'other')).toEqual(['Ctrl', 'M']);
  });

  test('une lettre s’écrit en capitale, les noms courts sont nommés, les flèches ont un glyphe', () => {
    expect(meeshyKeyHintGlyphs(['escape'], 'other')).toEqual(['Échap']);
    expect(meeshyKeyHintGlyphs(['space'], 'other')).toEqual(['Espace']);
    expect(meeshyKeyHintGlyphs(['enter', 'tab', 'delete'], 'apple')).toEqual(['↵', '⇥', '⌫']);
    expect(meeshyKeyHintGlyphs(['up', 'down'], 'apple')).toEqual(['↑', '↓']);
  });

  test('en lecture de droite à gauche, gauche et droite s’échangent ; haut et bas jamais', () => {
    expect(meeshyKeyHintGlyphs(['left', 'right'], 'apple', { isRtl: true })).toEqual(['→', '←']);
    expect(meeshyKeyHintGlyphs(['left', 'right'], 'apple')).toEqual(['←', '→']);
    expect(meeshyKeyHintGlyphs(['up', 'down'], 'apple', { isRtl: true })).toEqual(['↑', '↓']);
  });

  test('l’ordre de frappe d’une combinaison ne s’inverse jamais, même en RTL', () => {
    expect(meeshyKeyHintGlyphs(COMMAND_M, 'apple', { isRtl: true })).toEqual(['⌘', 'M']);
  });

  test('la voix dit « raccourci : Commande M » ou « raccourci : Ctrl M »', () => {
    expect(meeshyKeyHintSpoken(COMMAND_M, 'apple')).toBe('raccourci : Commande M');
    expect(meeshyKeyHintSpoken(COMMAND_M, 'other')).toBe('raccourci : Ctrl M');
    expect(meeshyKeyHintSpoken(COMMAND_M, 'apple', { prefix: 'shortcut' })).toBe('shortcut : Commande M');
  });

  test('aria-keyshortcuts sort de la même valeur que le dessin', () => {
    expect(meeshyKeyHintShortcut(COMMAND_M, 'apple')).toBe('Meta+M');
    expect(meeshyKeyHintShortcut(COMMAND_M, 'other')).toBe('Control+M');
    expect(meeshyKeyHintShortcut(['shift', { character: 'k' }], 'other')).toBe('Shift+K');
  });

  test('sans clavier, ou commande désactivée : rien n’est montré', () => {
    expect(meeshyKeyHintShown({ hasKeyboard: true, isEnabled: true })).toBe(true);
    expect(meeshyKeyHintShown({ hasKeyboard: false, isEnabled: true })).toBe(false);
    expect(meeshyKeyHintShown({ hasKeyboard: true, isEnabled: false })).toBe(false);
  });

  test('une combinaison compte de 1 à 3 touches', () => {
    expect(meeshyKeyHintGlyphs([], 'apple')).toEqual([]);
    expect(meeshyKeyHintGlyphs(['shift', 'option', 'control', { character: 'a' }], 'apple').length).toBe(3);
  });
});

describe('MeeshyKeyHint — la recette en valeurs', () => {
  test('touche de 26, rayon 8, marge 6, lèvre de 2,5, glyphe de 12, caractère 12,5, écart 4', () => {
    expect(meeshyKeyHintRecipe({ size: 'regular' })).toMatchObject({ side: 26, radius: 8, padding: 6, lip: 2.5, glyphSize: 12, fontSize: 12.5, gap: 4, borderWidth: 1 });
  });

  test('compacte : 20, rayon 6, lèvre 2, caractère 10,5, écart 3', () => {
    expect(meeshyKeyHintRecipe({ size: 'compact' })).toMatchObject({ side: 20, radius: 6, lip: 2, fontSize: 10.5, gap: 3 });
  });

  test('la touche ne reçoit ni toucher, ni survol, ni focus : aucune cible', () => {
    expect(meeshyKeyHintRecipe({})).toMatchObject({ targetSide: 0, isInteractive: false });
  });

  test('enfoncée : la teinte change, sans translation, et la lèvre reste', () => {
    const rest = meeshyKeyHintRecipe({});
    const pressed = meeshyKeyHintRecipe({ isPressed: true });
    expect(pressed.shade).not.toBe(rest.shade);
    expect(pressed.translate).toBe(0);
    expect(pressed.lip).toBe(rest.lip);
  });

  test('la légende : filet de 1 sur 18, écart de 10 de part et d’autre, barre de 44 de rayon 14', () => {
    expect(meeshyKeyHintRecipe({ context: 'legend' }).legend).toMatchObject({ rule: { width: 1, height: 18, gap: 10 }, pairGap: 6, labelSize: 13, labelWeight: 600, barHeight: 44, barRadius: 14 });
  });

  test('la surface se force ou se lit de l’hôte', () => {
    expect(meeshyKeyHintRecipe({ surface: 'onGlass' }).surface).toBe('onGlass');
    expect(meeshyKeyHintRecipe({}).surface).toBe('auto');
  });
});

describe('MeeshyKeyHint — le composant', () => {
  test('sans clavier : aucun nœud, aucune place réservée', () => {
    const container = mount(<MeeshyKeyHint keys={COMMAND_M} platform="apple" hasKeyboard={false} />);
    expect(container.children.length).toBe(0);
  });

  test('désactivée : aucun nœud', () => {
    const container = mount(<MeeshyKeyHint keys={COMMAND_M} platform="apple" hasKeyboard isEnabled={false} />);
    expect(container.children.length).toBe(0);
  });

  test('aucune touche : aucun nœud', () => {
    const container = mount(<MeeshyKeyHint keys={[]} platform="apple" hasKeyboard />);
    expect(container.children.length).toBe(0);
  });

  test('la combinaison est masquée à la voix, l’hôte la dit par aria-keyshortcuts', () => {
    const container = mount(<MeeshyKeyHint keys={COMMAND_M} platform="apple" hasKeyboard />);
    const node = container.querySelector('[data-kit-key-hint]');
    expect(node?.getAttribute('aria-hidden')).toBe('true');
    expect(node?.textContent).toBe('⌘M');
    expect(node?.querySelectorAll('[data-kit-key]').length).toBe(2);
    expect(node?.getAttribute('data-shortcut')).toBe('Meta+M');
  });

  test('Ctrl en toutes lettres : la touche s’élargit, sa hauteur ne change pas', () => {
    const container = mount(<MeeshyKeyHint keys={COMMAND_M} platform="other" hasKeyboard />);
    expect(container.querySelector('[data-kit-key-hint]')?.textContent).toBe('CtrlM');
  });

  test('aucun écouteur de clavier : ni focus ni tabindex', () => {
    const container = mount(<MeeshyKeyHint keys={COMMAND_M} platform="apple" hasKeyboard />);
    expect(container.querySelector('[tabindex], button, a')).toBeNull();
  });

  test('la légende : paires touche et libellé, filet seulement entre deux groupes, jamais en tête', () => {
    const container = mount(
      <MeeshyKeyLegend
        platform="apple"
        hasKeyboard
        items={[
          { id: 'map', combos: [[{ character: 'm' }]], title: 'Carte' },
          { id: 'write', combos: [['primary', 'enter']], title: 'Écrire', startsGroup: true },
          { id: 'first', combos: [[{ character: 'x' }]], title: 'Premier', startsGroup: true },
        ]}
      />,
    );
    expect(container.querySelectorAll('[data-kit-key-pair]').length).toBe(3);
    expect(container.querySelectorAll('[data-kit-key-rule]').length).toBe(2);
    const first = container.querySelector('[data-kit-key-legend] > :first-child');
    expect(first?.hasAttribute('data-kit-key-rule')).toBe(false);
  });

  test('zéro entrée : ni conteneur ni verre', () => {
    const container = mount(<MeeshyKeyLegend platform="apple" hasKeyboard items={[]} container="glassBar" />);
    expect(container.children.length).toBe(0);
  });

  test('une suite de touches partage un seul libellé', () => {
    const container = mount(<MeeshyKeyLegend platform="other" hasKeyboard items={[{ id: 'faces', combos: [[{ character: '1' }], [{ character: '2' }], [{ character: '3' }]], title: 'faces' }]} />);
    expect(container.querySelectorAll('[data-kit-key-pair]').length).toBe(1);
    expect(container.querySelectorAll('[data-kit-key]').length).toBe(3);
  });
});

describe('MeeshyKeyHint — pureté', () => {
  test('aucun écouteur de clavier, aucun type du domaine, aucun verre dessiné', () => {
    for (const file of ['./meeshy-key-hint.tsx', './meeshy-key-hint-recipe.ts']) {
      const text = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
      expect(text).not.toMatch(/addEventListener\(\s*['"]key|onKey(Down|Up|Press)|backdrop-filter|@meeshy\/shared|@\/stores|@\/lib\/api/);
    }
  });
});
