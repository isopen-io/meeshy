import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, useState, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { loadColorAliasMap, loadIosSchemes, resolveColor, wcagContrastRatio, type RGBA } from '../../../scripts/lib/glass-contrast.mjs';
import { installHapticsDriver, type HapticCue } from '@/lib/view/haptics';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { MeeshyChipRow, type MeeshyChip, type MeeshyChipRowProps } from './meeshy-chip-row';
import { meeshyChipRecipe, meeshyChipRowStyle, meeshyChipStyle, meeshyChipSize } from './meeshy-chip-row';

const APP = fileURLToPath(new URL('../../../', import.meta.url));
const KIT = join(APP, 'src', 'components', 'kit');
const css = readFileSync(join(APP, 'src', 'styles', 'kit-chip-row.css'), 'utf8');

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/kit' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let mounted: { readonly container: HTMLDivElement; readonly root: Root } | null = null;

const unmount = (): void => {
  act(() => mounted?.root.unmount());
  mounted?.container.remove();
  mounted = null;
};

afterEach(() => {
  unmount();
  installHapticsDriver(null);
});

const mount = (element: ReactElement): HTMLElement => {
  unmount();
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(element));
  mounted = { container, root };
  return container;
};

const rerender = (element: ReactElement): void => {
  act(() => mounted?.root.render(element));
};

const recordHaptics = (): HapticCue[] => {
  const played: HapticCue[] = [];
  installHapticsDriver({
    cue: (name) => {
      played.push(name);
      return true;
    },
    pattern: () => true,
  });
  return played;
};

const chips = (...ids: readonly string[]): readonly MeeshyChip[] => ids.map((id) => ({ id, title: id.toUpperCase() }));

type Change = { readonly next: readonly string[]; readonly tapped: string };

const harness = (over: Partial<MeeshyChipRowProps> = {}) => {
  const changes: Change[] = [];
  const actions: string[] = [];
  const props: MeeshyChipRowProps = {
    chips: chips('a', 'b', 'c'),
    selection: ['a'],
    label: 'Effets',
    onChange: (next, tapped) => changes.push({ next, tapped }),
    onAction: (id) => actions.push(id),
    ...over,
  };
  return { changes, actions, props };
};

const cells = (container: HTMLElement): readonly HTMLButtonElement[] => [...container.querySelectorAll<HTMLButtonElement>('[data-kit-chip]')];
const cell = (container: HTMLElement, id: string): HTMLButtonElement => {
  const found = cells(container).find((node) => node.dataset['kitChip'] === id);
  if (found === undefined) throw new Error(`puce ${id} absente`);
  return found;
};
const group = (container: HTMLElement): HTMLElement => {
  const found = container.querySelector<HTMLElement>('.kit-chip-row');
  if (found === null) throw new Error('rangée absente');
  return found;
};
const click = (node: HTMLElement): void => {
  act(() => node.click());
};
const key = (node: HTMLElement, name: string): Event => {
  const event = new Event('keydown', { bubbles: true, cancelable: true });
  Object.assign(event, { key: name });
  act(() => {
    node.dispatchEvent(event);
  });
  return event;
};

describe('le toucher', () => {
  test('choix simple : une autre puce part une fois, avec un seul light', () => {
    const played = recordHaptics();
    const { changes, props } = harness();
    const view = mount(<MeeshyChipRow {...props} />);
    click(cell(view, 'b'));
    expect(changes).toEqual([{ next: ['b'], tapped: 'b' }]);
    expect(played).toEqual(['light']);
  });

  test('choix simple : la courante ne répond pas, ni rappel ni haptique', () => {
    const played = recordHaptics();
    const { changes, props } = harness();
    click(cell(mount(<MeeshyChipRow {...props} />), 'a'));
    expect(changes).toEqual([]);
    expect(played).toEqual([]);
  });

  test('choix simple ou aucun : la courante se retire', () => {
    const { changes, props } = harness({ mode: 'singleOrNone' });
    click(cell(mount(<MeeshyChipRow {...props} />), 'a'));
    expect(changes).toEqual([{ next: [], tapped: 'a' }]);
  });

  test('choix multiple : le toucher bascule', () => {
    const { changes, props } = harness({ mode: 'multiple', selection: ['a', 'b'] });
    const view = mount(<MeeshyChipRow {...props} />);
    click(cell(view, 'c'));
    click(cell(view, 'a'));
    expect(changes).toEqual([
      { next: ['a', 'b', 'c'], tapped: 'c' },
      { next: ['b'], tapped: 'a' },
    ]);
  });

  test('action et menu ne sont jamais dans la sélection : onAction, un seul light', () => {
    const played = recordHaptics();
    const { changes, actions, props } = harness({ chips: [{ id: 'a', title: 'A' }, { id: 'menu', title: 'Langue', kind: 'menu', trailing: 'chevron' }, { id: 'go', title: 'Go', kind: 'action' }] });
    const view = mount(<MeeshyChipRow {...props} />);
    click(cell(view, 'menu'));
    click(cell(view, 'go'));
    expect(actions).toEqual(['menu', 'go']);
    expect(changes).toEqual([]);
    expect(played).toEqual(['light', 'light']);
    expect(cell(view, 'menu').getAttribute('aria-haspopup')).toBe('menu');
    expect(cell(view, 'menu').hasAttribute('data-selected')).toBe(false);
  });

  test('mode actions : aucune puce n’est courante', () => {
    const { actions, props } = harness({ mode: 'actions', selection: ['a'] });
    const view = mount(<MeeshyChipRow {...props} />);
    expect(cells(view).some((node) => node.hasAttribute('data-selected'))).toBe(false);
    click(cell(view, 'a'));
    expect(actions).toEqual(['a']);
  });

  test('haptic none : l’hôte joue le sien', () => {
    const played = recordHaptics();
    const { changes, props } = harness({ haptic: 'none' });
    click(cell(mount(<MeeshyChipRow {...props} />), 'b'));
    expect(changes).toHaveLength(1);
    expect(played).toEqual([]);
  });

  test('une rangée désactivée est annoncée et ne répond pas', () => {
    const played = recordHaptics();
    const { changes, props } = harness({ disabled: true });
    const view = mount(<MeeshyChipRow {...props} />);
    expect(group(view).getAttribute('aria-disabled')).toBe('true');
    expect(cells(view).every((node) => node.disabled)).toBe(true);
    click(cell(view, 'b'));
    expect(changes).toEqual([]);
    expect(played).toEqual([]);
  });

  test('une puce désactivée ne répond pas, les autres si', () => {
    const { changes, props } = harness({ chips: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B', disabled: true }, { id: 'c', title: 'C' }] });
    const view = mount(<MeeshyChipRow {...props} />);
    click(cell(view, 'b'));
    expect(changes).toEqual([]);
    click(cell(view, 'c'));
    expect(changes).toHaveLength(1);
  });
});

describe('ce que le lecteur d’écran entend', () => {
  test('choix simple : radiogroup nommé, radio, aria-checked', () => {
    const view = mount(<MeeshyChipRow {...harness().props} />);
    expect(group(view).getAttribute('role')).toBe('radiogroup');
    expect(group(view).getAttribute('aria-label')).toBe('Effets');
    expect(cell(view, 'a').getAttribute('role')).toBe('radio');
    expect(cell(view, 'a').getAttribute('aria-checked')).toBe('true');
    expect(cell(view, 'b').getAttribute('aria-checked')).toBe('false');
  });

  test('choix multiple : groupe, bascule aria-pressed', () => {
    const view = mount(<MeeshyChipRow {...harness({ mode: 'multiple' }).props} />);
    expect(group(view).getAttribute('role')).toBe('group');
    expect(cell(view, 'a').getAttribute('aria-pressed')).toBe('true');
    expect(cell(view, 'b').getAttribute('aria-pressed')).toBe('false');
    expect(cell(view, 'a').getAttribute('role')).toBeNull();
  });

  test('onglets : tablist, tab, aria-selected', () => {
    const view = mount(<MeeshyChipRow {...harness({ semantics: 'tabs' }).props} />);
    expect(group(view).getAttribute('role')).toBe('tablist');
    expect(cell(view, 'a').getAttribute('role')).toBe('tab');
    expect(cell(view, 'a').getAttribute('aria-selected')).toBe('true');
  });

  test('le nom est l’accessibilityLabel, sinon le titre ; l’aide devient la description', () => {
    const view = mount(<MeeshyChipRow {...harness({ chips: [{ id: 'a', title: 'Amis', accessibilityLabel: 'Amis (3)', hint: 'retire le hashtag' }, { id: 'b', title: 'Tous' }, { id: 's', title: '', icon: <svg />, accessibilityLabel: 'Recherche' }] }).props} />);
    expect(cell(view, 'a').getAttribute('aria-label')).toBe('Amis (3)');
    expect(cell(view, 'a').getAttribute('aria-description')).toBe('retire le hashtag');
    expect(cell(view, 'b').getAttribute('aria-label')).toBeNull();
    expect(cell(view, 'b').textContent).toBe('Tous');
    expect(cell(view, 's').getAttribute('aria-label')).toBe('Recherche');
    expect(cell(view, 's').hasAttribute('data-glyph-only')).toBe(true);
  });

  test('le ✕ de retrait n’est que sur une puce courante, le chevron toujours', () => {
    const view = mount(<MeeshyChipRow {...harness({ mode: 'multiple', selection: ['a'], chips: [{ id: 'a', title: 'A', trailing: 'remove' }, { id: 'b', title: 'B', trailing: 'remove' }, { id: 'c', title: 'C', trailing: 'chevron', kind: 'menu' }] }).props} />);
    expect(cell(view, 'a').querySelector('[data-kit-chip-trailing="remove"]')).not.toBeNull();
    expect(cell(view, 'b').querySelector('[data-kit-chip-trailing]')).toBeNull();
    expect(cell(view, 'c').querySelector('[data-kit-chip-trailing="chevron"]')).not.toBeNull();
  });

  test('les glyphes sont masqués au lecteur d’écran', () => {
    const view = mount(<MeeshyChipRow {...harness({ chips: [{ id: 'a', title: 'A', icon: <svg />, trailing: 'remove' }] }).props} />);
    expect(view.querySelector('.kit-chip__glyph')?.getAttribute('aria-hidden')).toBe('true');
    expect(view.querySelector('.kit-chip__trailing')?.getAttribute('aria-hidden')).toBe('true');
  });

  test('un groupe sans nom ou une puce sans nom est refusé', () => {
    expect(() => mount(<MeeshyChipRow {...harness({ label: '' }).props} />)).toThrow();
    expect(() => mount(<MeeshyChipRow {...harness({ chips: [{ id: 'a', title: '' }] }).props} />)).toThrow();
  });

  test('sans puce, la rangée ne rend rien', () => {
    expect(mount(<MeeshyChipRow {...harness({ chips: [] }).props} />).innerHTML).toBe('');
  });
});

describe('le clavier', () => {
  test('un seul arrêt de tabulation : la courante, sinon la première', () => {
    const view = mount(<MeeshyChipRow {...harness({ selection: ['b'] }).props} />);
    expect(cells(view).map((node) => node.tabIndex)).toEqual([-1, 0, -1]);
    rerender(<MeeshyChipRow {...harness({ selection: [] }).props} />);
    expect(cells(view).map((node) => node.tabIndex)).toEqual([0, -1, -1]);
  });

  test('une puce désactivée n’est jamais l’arrêt', () => {
    const view = mount(<MeeshyChipRow {...harness({ selection: [], chips: [{ id: 'a', title: 'A', disabled: true }, { id: 'b', title: 'B' }] }).props} />);
    expect(cells(view).map((node) => node.tabIndex)).toEqual([-1, 0]);
  });

  test('→ passe à la voisine et la coche en choix simple, en boucle', () => {
    const { changes, props } = harness();
    const view = mount(<MeeshyChipRow {...props} />);
    cell(view, 'a').focus();
    const event = key(cell(view, 'a'), 'ArrowRight');
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(cell(view, 'b'));
    expect(changes).toEqual([{ next: ['b'], tapped: 'b' }]);
    expect(cell(view, 'b').tabIndex).toBe(0);
    expect(cell(view, 'a').tabIndex).toBe(-1);
    key(cell(view, 'b'), 'End');
    expect(document.activeElement).toBe(cell(view, 'c'));
    key(cell(view, 'c'), 'ArrowRight');
    expect(document.activeElement).toBe(cell(view, 'a'));
  });

  test('choix multiple : les flèches ne font que déplacer le focus, Entrée bascule', () => {
    const { changes, props } = harness({ mode: 'multiple' });
    const view = mount(<MeeshyChipRow {...props} />);
    cell(view, 'a').focus();
    key(cell(view, 'a'), 'ArrowRight');
    expect(document.activeElement).toBe(cell(view, 'b'));
    expect(changes).toEqual([]);
    key(cell(view, 'b'), 'Home');
    expect(document.activeElement).toBe(cell(view, 'a'));
  });

  test('les puces désactivées sont sautées', () => {
    const view = mount(<MeeshyChipRow {...harness({ mode: 'multiple', chips: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B', disabled: true }, { id: 'c', title: 'C' }] }).props} />);
    cell(view, 'a').focus();
    key(cell(view, 'a'), 'ArrowRight');
    expect(document.activeElement).toBe(cell(view, 'c'));
  });
});

describe('les bords et la courante en vue', () => {
  const metrics = (element: HTMLElement, sizes: { readonly scrollWidth: number; readonly clientWidth: number; readonly scrollLeft: number }): void => {
    Object.defineProperty(element, 'scrollWidth', { configurable: true, value: sizes.scrollWidth });
    Object.defineProperty(element, 'clientWidth', { configurable: true, value: sizes.clientWidth });
    element.scrollLeft = sizes.scrollLeft;
  };

  test('tout tient : aucun bord, aucun masque', () => {
    const view = mount(<MeeshyChipRow {...harness().props} />);
    const row = group(view);
    expect(row.hasAttribute('data-overflow')).toBe(false);
    expect(row.hasAttribute('data-edge-low')).toBe(false);
    expect(row.hasAttribute('data-edge-high')).toBe(false);
  });

  test('ça déborde : le bord de fin seul au début, puis les deux, puis le bord de début seul au bout', () => {
    const view = mount(<MeeshyChipRow {...harness().props} />);
    const row = group(view);
    const scrollTo = (scrollLeft: number): void => {
      metrics(row, { scrollWidth: 800, clientWidth: 390, scrollLeft });
      act(() => {
        row.dispatchEvent(new Event('scroll'));
      });
    };
    scrollTo(0);
    expect([row.hasAttribute('data-overflow'), row.hasAttribute('data-edge-low'), row.hasAttribute('data-edge-high')]).toEqual([true, false, true]);
    scrollTo(200);
    expect([row.hasAttribute('data-edge-low'), row.hasAttribute('data-edge-high')]).toEqual([true, true]);
    scrollTo(410);
    expect([row.hasAttribute('data-edge-low'), row.hasAttribute('data-edge-high')]).toEqual([true, false]);
  });

  test('défiler ne redessine aucune puce : les bords sont des attributs, pas un état', () => {
    let renders = 0;
    const props = harness({ chipLabel: (chip) => (renders += 1, chip.title) }).props;
    const view = mount(<MeeshyChipRow {...props} />);
    const before = renders;
    const row = group(view);
    metrics(row, { scrollWidth: 800, clientWidth: 390, scrollLeft: 120 });
    act(() => {
      row.dispatchEvent(new Event('scroll'));
    });
    expect(renders).toBe(before);
  });

  test('en wrap, ni défilement ni masque', () => {
    const view = mount(<MeeshyChipRow {...harness({ layout: 'wrap' }).props} />);
    const row = group(view);
    expect(row.getAttribute('data-layout')).toBe('wrap');
    metrics(row, { scrollWidth: 800, clientWidth: 390, scrollLeft: 0 });
    act(() => {
      row.dispatchEvent(new Event('scroll'));
    });
    expect(row.hasAttribute('data-overflow')).toBe(false);
  });

  test('la courante est centrée à l’apparition, sans animation', () => {
    const calls: ScrollToOptions[] = [];
    const original = HTMLElement.prototype.scrollBy;
    const rectOf = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.scrollBy = function (options?: ScrollToOptions | number): void {
      if (typeof options === 'object') calls.push(options);
    } as typeof HTMLElement.prototype.scrollBy;
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement): DOMRect {
      const isRow = this.classList.contains('kit-chip-row');
      const index = ['a', 'b', 'c'].indexOf(this.dataset['kitChip'] ?? '');
      const left = isRow ? 0 : 100 * index;
      const width = isRow ? 200 : 80;
      return { left, right: left + width, top: 0, bottom: 36, width, height: 36, x: left, y: 0, toJSON: () => ({}) };
    };
    try {
      const { props } = harness({ selection: ['c'] });
      const view = mount(<MeeshyChipRow {...props} />);
      expect(calls).toEqual([{ left: 140, behavior: 'auto' }]);
      calls.length = 0;
      rerender(<MeeshyChipRow {...props} selection={['b']} />);
      expect(calls).toHaveLength(1);
      expect(calls[0]?.left).toBe(40);
      expect(view.querySelector('[data-selected]')?.getAttribute('data-kit-chip')).toBe('b');
      calls.length = 0;
      rerender(<MeeshyChipRow {...props} selection={['b']} />);
      expect(calls).toEqual([]);
    } finally {
      HTMLElement.prototype.scrollBy = original;
      HTMLElement.prototype.getBoundingClientRect = rectOf;
    }
  });

  test('revealsSelection false : la rangée ne bouge pas', () => {
    const calls: ScrollToOptions[] = [];
    const original = HTMLElement.prototype.scrollBy;
    HTMLElement.prototype.scrollBy = function (options?: ScrollToOptions | number): void {
      if (typeof options === 'object') calls.push(options);
    } as typeof HTMLElement.prototype.scrollBy;
    try {
      mount(<MeeshyChipRow {...harness({ selection: ['c'], revealsSelection: false }).props} />);
      expect(calls).toEqual([]);
    } finally {
      HTMLElement.prototype.scrollBy = original;
    }
  });

  test('la molette verticale fait défiler une rangée qui déborde, et rend la main au bout', () => {
    const view = mount(<MeeshyChipRow {...harness().props} />);
    const row = group(view);
    metrics(row, { scrollWidth: 800, clientWidth: 390, scrollLeft: 0 });
    const wheel = (deltaY: number): Event => {
      const event = new Event('wheel', { bubbles: true, cancelable: true });
      Object.assign(event, { deltaX: 0, deltaY });
      act(() => {
        row.dispatchEvent(event);
      });
      return event;
    };
    const down = wheel(50);
    expect(down.defaultPrevented).toBe(true);
    expect(row.scrollLeft).toBe(50);
    metrics(row, { scrollWidth: 800, clientWidth: 390, scrollLeft: 0 });
    expect(wheel(-50).defaultPrevented).toBe(false);
  });
});

describe('la performance', () => {
  test('changer la sélection ne redessine que les puces dont l’état change', () => {
    const drawn: string[] = [];
    const chipLabel = (chip: MeeshyChip): string => {
      drawn.push(chip.id);
      return chip.title;
    };
    const base = harness({ chips: chips('a', 'b', 'c', 'd', 'e'), chipLabel }).props;
    const stable = base.chips;
    mount(<MeeshyChipRow {...base} />);
    drawn.length = 0;
    rerender(<MeeshyChipRow {...base} chips={stable.map((chip) => ({ ...chip }))} selection={['c']} />);
    expect([...drawn].sort()).toEqual(['a', 'c']);
  });

  test('un parent qui se redessine sans rien changer ne redessine aucune puce', () => {
    let renders = 0;
    const chipLabel = (chip: MeeshyChip): string => (renders += 1, chip.title);
    const base = harness({ chipLabel }).props;
    mount(<MeeshyChipRow {...base} />);
    const before = renders;
    rerender(<MeeshyChipRow {...base} />);
    expect(renders).toBe(before);
  });

  test('la sélection est celle de l’hôte : un hôte qui la garde la fait suivre tout de suite', () => {
    function Host() {
      const [selection, setSelection] = useState<readonly string[]>(['a']);
      return <MeeshyChipRow {...harness().props} selection={selection} onChange={(next) => setSelection(next)} />;
    }
    const view = mount(<Host />);
    click(cell(view, 'b'));
    expect(cell(view, 'b').getAttribute('aria-checked')).toBe('true');
    expect(cell(view, 'a').getAttribute('aria-checked')).toBe('false');
  });
});

describe('les dispositions', () => {
  test('equal : les puces se partagent la largeur', () => {
    expect(css).toMatch(/\[data-layout='equal'\][^{]*\{[^}]*flex:\s*1 1 0/);
    expect(group(mount(<MeeshyChipRow {...harness({ layout: 'equal' }).props} />)).getAttribute('data-layout')).toBe('equal');
  });

  test('wrap : une puce plus large que la rangée s’y borne et se coupe en fin', () => {
    expect(css).toMatch(/\.kit-chip\s*\{[^}]*max-inline-size:\s*100%/);
    expect(css).toMatch(/\.kit-chip__title\s*\{[^}]*text-overflow:\s*ellipsis/);
  });
});

describe('la recette posée sur la puce', () => {
  test('les mesures sont posées en rem, depuis la recette', () => {
    const style = meeshyChipRowStyle({ size: 'regular', inset: 16 }) as Readonly<Record<string, string>>;
    const regular = meeshyChipSize('regular');
    expect(style['--kit-chip-h']).toBe(`${regular.height / 16}rem`);
    expect(style['--kit-chip-pad']).toBe(`${regular.padding / 16}rem`);
    expect(style['--kit-chip-font']).toBe(`${regular.font / 16}rem`);
    expect(style['--kit-chip-inset']).toBe('1rem');
    expect(style['--kit-chip-fade']).toBe('2.75rem');
    expect((meeshyChipRowStyle({ size: 'compact', inset: 0 }) as Readonly<Record<string, string>>)['--kit-chip-h']).toBe('1.75rem');
  });

  test('repos ≠ pressé, et la courante se pose en blanc à encre sombre', () => {
    const rest = meeshyChipStyle({ surface: 'onMedia', isSelected: false, isEnabled: true, tint: undefined }) as Readonly<Record<string, unknown>>;
    expect(rest['--kit-chip-fill-rest']).toBe(0.08);
    expect(rest['--kit-chip-fill-pressed']).toBe(0.15);
    expect(rest['--kit-chip-fill-rest']).not.toBe(rest['--kit-chip-fill-pressed']);
    const current = meeshyChipStyle({ surface: 'onMedia', isSelected: true, isEnabled: true, tint: undefined }) as Readonly<Record<string, unknown>>;
    expect(current['--kit-chip-fill']).toBe('var(--color-on-media)');
    expect(current['--kit-chip-ink']).toBe('var(--ios-indigo-950)');
    expect(current['--kit-chip-fill-rest']).toBe(1);
    expect(current['--kit-chip-fill-pressed']).toBe(0.85);
  });

  test('désactivée : tout le contenu à 40 %', () => {
    const style = meeshyChipStyle({ surface: 'onMedia', isSelected: false, isEnabled: false, tint: undefined }) as Readonly<Record<string, unknown>>;
    expect(style['opacity']).toBeUndefined();
    expect(style['--kit-chip-opacity']).toBe(0.4);
  });

  test('teintée : la courante prend la teinte de l’hôte, l’encre reste claire', () => {
    const style = meeshyChipStyle({ surface: 'theme', isSelected: true, isEnabled: true, tint: 'var(--ios-indigo-500)' }) as Readonly<Record<string, unknown>>;
    expect(style['--kit-chip-fill']).toBe('var(--ios-indigo-500)');
    expect(style['--kit-chip-ink']).toBe('var(--color-on-media)');
  });
});

describe('le contraste, calculé depuis la recette et les jetons', () => {
  const dark = loadIosSchemes().dark;
  const aliases = loadColorAliasMap();
  const colorOf = (token: string): RGBA => resolveColor(`var(${aliases[token] ?? token})`, dark);
  const tokenOf = (cssValue: string): string => /var\((--[\w-]+)\)/.exec(cssValue)?.[1] ?? '';
  const over = (top: RGBA, below: RGBA): RGBA => {
    const alpha = top.a + below.a * (1 - top.a);
    const mix = (a: number, b: number): number => Math.round((a * top.a + b * below.a * (1 - top.a)) / alpha);
    return { r: mix(top.r, below.r), g: mix(top.g, below.g), b: mix(top.b, below.b), a: alpha };
  };
  const ratio = (isSelected: boolean, sheet: string): number => {
    const style = meeshyChipStyle({ surface: 'onMedia', isSelected, isEnabled: true, tint: undefined }) as Readonly<Record<string, unknown>>;
    const fill = colorOf(tokenOf(String(style['--kit-chip-fill'])));
    const ink = colorOf(tokenOf(String(style['--kit-chip-ink'])));
    const covered = over({ ...fill, a: Number(style['--kit-chip-fill-rest']) }, { ...colorOf(sheet), a: 1 });
    return wcagContrastRatio(ink, covered);
  };

  test('la courante : l’encre sombre sur le blanc plein, au-dessus de 4,5:1', () => {
    expect(ratio(true, '--ios-media-backdrop')).toBeGreaterThanOrEqual(4.5);
  });

  test('au repos : l’encre claire sur le voile de 8 %, sur une feuille sombre, au-dessus de 4,5:1', () => {
    expect(ratio(false, '--ios-media-backdrop')).toBeGreaterThanOrEqual(4.5);
    expect(ratio(false, '--ios-indigo-950')).toBeGreaterThanOrEqual(4.5);
  });

  test('le voile d’appui reste lisible', () => {
    const recipe = meeshyChipRecipe({ surface: 'onMedia', isSelected: false, isPressed: true });
    const covered = over({ ...colorOf('--ios-on-media'), a: recipe.fillOpacity }, { ...colorOf('--ios-indigo-950'), a: 1 });
    expect(wcagContrastRatio(colorOf('--ios-on-media'), covered)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('la feuille de style : des jetons, une réponse dessinée, aucune matière', () => {
  const sources = [
    ['meeshy-chip-row.tsx', readFileSync(join(KIT, 'meeshy-chip-row.tsx'), 'utf8')],
    ['meeshy-chip-row-rule.ts', readFileSync(join(KIT, 'meeshy-chip-row-rule.ts'), 'utf8')],
    ['meeshy-chip-row-style.ts', readFileSync(join(KIT, 'meeshy-chip-row-style.ts'), 'utf8')],
    ['kit-chip-row.css', css],
  ] as const;
  const code = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, ' ');

  sources.forEach(([name, text]) =>
    test(`${name} : ni flou, ni Liquid Glass, ni classe de verre`, () => {
      expect(code(text)).not.toMatch(/backdrop-filter|backdropFilter|backdrop-blur|glassEffect|adaptiveGlass/);
      expect(code(text)).not.toMatch(/['"`]glass['"`]|[\s'"`.]glass-(?:prominent|card|accent|call[\w-]*|tone|touch|scope|group)\b/);
      expect(code(text)).not.toMatch(/meeshy-glass|MeeshyGlass/);
    }),
  );

  sources.forEach(([name, text]) =>
    test(`${name} : aucune couleur ni rayon en dur`, () => {
      expect(code(text)).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/);
      if (name.endsWith('.css')) expect(code(text)).not.toMatch(/\b(?:white|black)\b(?!-)/);
      expect(code(text)).not.toMatch(/border-radius:\s*[\d.]+(?:px|rem|%)/);
    }),
  );

  test('seuls l’opacité, la couleur et la largeur du dégradé s’animent', () => {
    const transitions = [...code(css).matchAll(/transition(?:-property)?:\s*([^;}]+)[;}]/g)].flatMap((match) => (match[1] ?? '').split(',').map((part) => part.trim().split(/\s+/)[0] ?? ''));
    expect(transitions.length).toBeGreaterThan(0);
    transitions.filter((name) => name !== 'none').forEach((name) => expect(['opacity', 'color', '--kit-chip-fade-low', '--kit-chip-fade-high']).toContain(name));
  });

  test('l’appui, le survol et le focus clavier sont dessinés en CSS, sans état', () => {
    expect(css).toContain('.kit-chip:active');
    expect(css).toContain('.kit-chip:hover');
    expect(css).toContain('.kit-chip[data-pressed]');
    expect(css).toContain('@media (hover: hover)');
    expect(css).toContain(':focus-visible');
    expect(css).not.toMatch(/scale\(/);
  });

  test('« réduire les animations » retire les fondus, jamais le voile d’appui', () => {
    const reduced = /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
    expect(reduced).toContain('transition: none');
    expect(reduced).toContain('--kit-chip-fill-pressed');
  });

  test('la cible déborde la capsule sans changer l’encombrement, et le masque ne prend aucun toucher', () => {
    expect(css).toContain('var(--target-min)');
    expect(css).toMatch(/\.kit-chip::before/);
    expect(css).not.toMatch(/pointer-events:\s*auto/);
  });
});
