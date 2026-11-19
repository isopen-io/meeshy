import { afterEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { installHapticsDriver } from '@/lib/view/haptics';
import { kitMount, spokenText } from '@/test-support/kit-mount';

import { MeeshyButton, MeeshyButtonPair, meeshyButtonHold, meeshyButtonRecipe, meeshyButtonStyle, type MeeshyButtonKind, type MeeshyButtonSize } from './meeshy-button';

const { mount, render, act } = kitMount();

afterEach(() => installHapticsDriver(null));

const KINDS: readonly MeeshyButtonKind[] = ['primary', 'accent', 'tinted', 'glass', 'outline', 'danger', 'text'];
const SIZES: readonly MeeshyButtonSize[] = [56, 50, 44, 36];

const recordHaptics = (): string[] => {
  const played: string[] = [];
  installHapticsDriver({ cue: (name) => (played.push(name), true), pattern: () => true });
  return played;
};

const button = (container: HTMLElement): HTMLButtonElement => {
  const found = container.querySelector<HTMLButtonElement>('button');
  if (found === null) throw new Error('bouton absent');
  return found;
};

describe('MeeshyButton — la recette en valeurs', () => {
  test('quatre hauteurs, marges, glyphe, corps et écart de la fiche', () => {
    const measured = SIZES.map((size) => {
      const recipe = meeshyButtonRecipe({ kind: 'primary', size });
      return [recipe.height, recipe.paddingInline, recipe.glyphSize, recipe.fontSize, recipe.gap, recipe.fontWeight];
    });
    expect(measured).toEqual([
      [56, 26, 22, 16, 8, 700],
      [50, 22, 22, 15, 8, 700],
      [44, 16, 16, 13.5, 8, 700],
      [36, 12, 16, 12.5, 8, 700],
    ]);
  });

  test('la cible ne descend jamais sous 44 : en 36 elle déborde de 4 de chaque côté', () => {
    for (const size of SIZES) expect(meeshyButtonRecipe({ kind: 'text', size }).targetHeight).toBeGreaterThanOrEqual(44);
    expect(meeshyButtonRecipe({ kind: 'primary', size: 36 }).hitSlack).toBe(4);
    expect(meeshyButtonRecipe({ kind: 'primary', size: 50 }).hitSlack).toBe(0);
  });

  test('pressé : échelle 0,94 ; désactivé : 45 % ni action ni tic ; focus : anneau de 2 décalé de 3', () => {
    expect(meeshyButtonRecipe({ kind: 'primary', size: 50, isPressed: true }).scale).toBe(0.94);
    expect(meeshyButtonRecipe({ kind: 'primary', size: 50 }).scale).toBe(1);
    const off = meeshyButtonRecipe({ kind: 'primary', size: 50, isEnabled: false });
    expect(off).toMatchObject({ opacity: 0.45, isActionEnabled: false, playsHaptic: false });
    expect(meeshyButtonRecipe({ kind: 'primary', size: 50, isFocused: true }).focusRing).toEqual({ width: 2, offset: 3 });
    expect(meeshyButtonRecipe({ kind: 'primary', size: 50 }).focusRing).toBeNull();
  });

  test('occupé : ni action ni tic, mais la largeur ne bouge pas, pour chaque genre et chaque taille', () => {
    for (const kind of KINDS) {
      for (const size of SIZES) {
        const rest = meeshyButtonRecipe({ kind, size });
        const busy = meeshyButtonRecipe({ kind, size, isPending: true });
        expect(busy).toMatchObject({ isActionEnabled: false, playsHaptic: false });
        expect([busy.height, busy.paddingInline, busy.glyphSize]).toEqual([rest.height, rest.paddingInline, rest.glyphSize]);
      }
    }
  });

  test('différé : l’action part encore', () => {
    expect(meeshyButtonRecipe({ kind: 'primary', size: 50, isDeferred: true })).toMatchObject({ isActionEnabled: true, playsHaptic: true });
  });

  test('round : disque de 56 à glyphe de 28 ; hold : disque de 96 à glyphe de 36', () => {
    expect(meeshyButtonRecipe({ kind: 'primary', shape: 'round' })).toMatchObject({ height: 56, width: 56, glyphSize: 28 });
    expect(meeshyButtonRecipe({ kind: 'accent', shape: 'hold' })).toMatchObject({ height: 96, width: 96, glyphSize: 36 });
  });

  test('round et hold n’acceptent que primary, accent et tinted', () => {
    expect(meeshyButtonRecipe({ kind: 'danger', shape: 'round' }).kind).toBe('primary');
    expect(meeshyButtonRecipe({ kind: 'glass', shape: 'hold' }).kind).toBe('primary');
    expect(meeshyButtonRecipe({ kind: 'tinted', shape: 'round' }).kind).toBe('tinted');
  });

  test('l’encre du danger est rouge sur son fond doux ; le texte destructif prend l’encre rouge', () => {
    expect(meeshyButtonRecipe({ kind: 'danger', size: 50 })).toMatchObject({ background: 'err13', ink: 'err' });
    expect(meeshyButtonRecipe({ kind: 'text', size: 50, isDestructive: true }).ink).toBe('err');
    expect(meeshyButtonRecipe({ kind: 'text', size: 50 }).background).toBe('none');
  });

  test('en thème clair le teinté et le danger passent à l’encre foncée, le blanc ne se pose que sur l’indigo', () => {
    expect(meeshyButtonRecipe({ kind: 'tinted', size: 50, scheme: 'light' }).ink).toBe('accentDeep');
    expect(meeshyButtonRecipe({ kind: 'danger', size: 50, scheme: 'light' }).ink).toBe('errDeep');
    for (const kind of KINDS) {
      const recipe = meeshyButtonRecipe({ kind, size: 50, scheme: 'light' });
      expect(recipe.ink === 'onBrand' ? recipe.background : 'brand').toBe('brand');
    }
  });
});

describe('MeeshyButton — la teinte', () => {
  const styleOf = (kind: MeeshyButtonKind, extra: { readonly isDestructive?: boolean } = {}) =>
    meeshyButtonStyle(meeshyButtonRecipe({ kind, size: 50, ...extra }), '#2BAE66', 'fit') as Record<string, string>;

  test('accent prend la teinte reçue pour fond, pas seulement celle de l’hôte', () => {
    expect(styleOf('accent')['--kit-button-fill']).toContain('var(--kit-button-tint');
  });

  test('texte : l’encre est la teinte reçue, neutre sans elle, rouge quand il détruit', () => {
    expect(styleOf('text')['--kit-button-ink']).toContain('var(--kit-button-tint');
    expect(styleOf('text')['--kit-button-ink']).toContain('var(--color-ios-ink)');
    expect(styleOf('text', { isDestructive: true })['--kit-button-ink']).toBe('var(--color-error)');
  });
});

describe('MeeshyButton — le composant', () => {
  test('un toucher part une fois, avec un tic léger', () => {
    const played = recordHaptics();
    const calls: string[] = [];
    const container = mount(<MeeshyButton title="Écrire" onPress={() => calls.push('press')} />);
    act(() => button(container).click());
    expect(calls).toEqual(['press']);
    expect(played).toEqual(['light']);
  });

  test('occupé ou désactivé : ni action ni tic, et le bouton reste atteignable', () => {
    const played = recordHaptics();
    const calls: string[] = [];
    const busy = mount(<MeeshyButton title="Envoyer" isPending onPress={() => calls.push('x')} />);
    act(() => button(busy).click());
    expect(button(busy).getAttribute('aria-busy')).toBe('true');
    const off = mount(<MeeshyButton title="Envoyer" disabled onPress={() => calls.push('x')} />);
    act(() => button(off).click());
    expect(button(off).getAttribute('aria-disabled')).toBe('true');
    expect(button(off).disabled).toBe(false);
    expect(calls).toEqual([]);
    expect(played).toEqual([]);
  });

  test('le nom est le titre, jamais le nom du glyphe ; le glyphe et la fin sont muets', () => {
    const container = mount(<MeeshyButton title="Lui écrire" glyph={<i data-glyph>g</i>} trailing={<b data-trailing>›</b>} onPress={() => {}} />);
    const node = button(container);
    expect(node.textContent).toContain('Lui écrire');
    expect(node.querySelector('[data-glyph]')?.parentElement?.getAttribute('aria-hidden')).toBe('true');
    expect(node.querySelector('[data-trailing]')?.parentElement?.getAttribute('aria-hidden')).toBe('true');
    expect(node.getAttribute('type')).toBe('button');
  });

  test('désactivé avec sa raison : la phrase est montrée et lue après le nom', () => {
    const container = mount(<MeeshyButton title="Demander" disabled disabledReason="Sofia n’accepte pas de nouvelles demandes" onPress={() => {}} />);
    const describedBy = button(container).getAttribute('aria-describedby');
    expect(describedBy).not.toBeNull();
    expect(container.querySelector(`[id="${describedBy}"]`)?.textContent).toBe('Sofia n’accepte pas de nouvelles demandes');
  });

  test('le nom dit reste le titre : raison, attente et différé sont lus en description, jamais dans le nom', () => {
    const off = mount(<MeeshyButton title="Demander" disabled disabledReason="Sofia n’accepte pas de nouvelles demandes" onPress={() => {}} />);
    expect(spokenText(button(off))).toBe('Demander');
    const busy = mount(<MeeshyButton title="Envoyer" isPending pendingLabel="en cours" onPress={() => {}} />);
    expect(spokenText(button(busy))).toBe('Envoyer');
    const later = mount(<MeeshyButton title="Envoyer" isDeferred deferredLabel="sera envoyé" onPress={() => {}} />);
    expect(spokenText(button(later))).toBe('Envoyer');
    const describedBy = button(later).getAttribute('aria-describedby') ?? '';
    expect(later.querySelector(`[id="${describedBy}"]`)?.textContent).toBe('sera envoyé');
  });

  test('différé : le bouton reste actif et pose la pastille horloge, annoncée', () => {
    const calls: string[] = [];
    const container = mount(<MeeshyButton title="Envoyer" isDeferred deferredLabel="sera envoyé" onPress={() => calls.push('x')} />);
    act(() => button(container).click());
    expect(calls).toEqual(['x']);
    expect(container.querySelector('[data-kit-button-deferred]')).not.toBeNull();
    expect(button(container).getAttribute('aria-describedby')).not.toBeNull();
  });

  test('une touche de raccourci se dit par aria-keyshortcuts', () => {
    const container = mount(<MeeshyButton title="Copier" shortcut="Meta+C" onPress={() => {}} />);
    expect(button(container).getAttribute('aria-keyshortcuts')).toBe('Meta+C');
  });

  test('round et hold exigent un nom dit et un glyphe', () => {
    const container = mount(<MeeshyButton title="Nouveau message" shape="round" glyph={<i>+</i>} onPress={() => {}} />);
    expect(button(container).getAttribute('aria-label')).toBe('Nouveau message');
    expect(button(container).getAttribute('data-shape')).toBe('round');
  });

  test('la paire : une ligne, parts 1,6 et 1, même hauteur', () => {
    const container = mount(<MeeshyButtonPair primary={<MeeshyButton title="Accepter" onPress={() => {}} />} secondary={<MeeshyButton title="Refuser" kind="outline" onPress={() => {}} />} />);
    const pair = container.querySelector<HTMLElement>('[data-kit-button-pair]');
    expect(pair).not.toBeNull();
    expect(pair?.style.getPropertyValue('--kit-button-pair-primary')).toBe('1.6');
    expect(pair?.style.getPropertyValue('--kit-button-pair-secondary')).toBe('1');
  });
});

describe('MeeshyButton — le maintien', () => {
  test('true au doigt posé, false au doigt levé ; jamais deux true de suite', () => {
    const events: boolean[] = [];
    const hold = meeshyButtonHold((held) => events.push(held));
    hold.down();
    hold.down();
    hold.up();
    hold.up();
    hold.down();
    hold.cancel();
    expect(events).toEqual([true, false, true, false]);
  });

  test('le doigt qui sort, ou le bouton qui disparaît pendant le maintien, relâche', () => {
    const events: boolean[] = [];
    const container = mount(<MeeshyButton title="Parler" shape="hold" glyph={<i>m</i>} holdState="idle" onHoldChange={(held) => events.push(held)} />);
    const node = button(container);
    act(() => {
      node.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }));
    });
    act(() => {
      node.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 }));
    });
    expect(events).toEqual([true, false]);
  });

  test('le bouton qui disparaît pendant le maintien relâche', () => {
    const events: boolean[] = [];
    const container = mount(<MeeshyButton title="Parler" shape="hold" glyph={<i>m</i>} holdState="idle" onHoldChange={(held) => events.push(held)} />);
    act(() => {
      button(container).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }));
    });
    render(<span />);
    expect(events).toEqual([true, false]);
  });

  test('l’appui long du maintien n’ouvre pas le menu du système, qui volerait le pointeur', () => {
    const container = mount(<MeeshyButton title="Parler" shape="hold" glyph={<i>m</i>} holdState="idle" onHoldChange={() => {}} />);
    const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    act(() => {
      button(container).dispatchEvent(menu);
    });
    expect(menu.defaultPrevented).toBe(true);
    const plain = mount(<MeeshyButton title="Écrire" onPress={() => {}} />);
    const ordinary = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    act(() => {
      button(plain).dispatchEvent(ordinary);
    });
    expect(ordinary.defaultPrevented).toBe(false);
  });

  test('le maintien ne cède pas le geste au défilement ni à la bulle du système', () => {
    const css = readFileSync(fileURLToPath(new URL('../../styles/kit-button.css', import.meta.url)), 'utf8');
    const holdRules = [...css.matchAll(/\.kit-button\[data-shape='hold'\]\s*\{([^}]*)\}/g)].map((match) => match[1] ?? '').join('');
    expect(holdRules).toContain('touch-action: none;');
    expect(holdRules).toContain('-webkit-touch-callout: none;');
  });

  test('une alternative à deux touchers existe : Espace tenue au clavier', () => {
    const events: boolean[] = [];
    const container = mount(<MeeshyButton title="Parler" shape="hold" glyph={<i>m</i>} holdState="idle" onHoldChange={(held) => events.push(held)} />);
    const node = button(container);
    act(() => {
      node.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    });
    act(() => {
      node.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
    });
    expect(events).toEqual([true, false]);
    expect(node.getAttribute('data-hold-state')).toBe('idle');
  });
});

describe('MeeshyButton — pureté', () => {
  const source = (file: string): string => readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');

  test('aucun verre dessiné, aucun type du domaine, aucun singleton dans les fichiers de K40', () => {
    for (const file of ['./meeshy-button.tsx', './meeshy-button-recipe.ts']) {
      const text = source(file);
      expect(text).not.toMatch(/backdrop-filter|blur\(/);
      expect(text).not.toMatch(/@meeshy\/shared|@\/stores|@\/lib\/api|\.shared\b/);
    }
  });
});
