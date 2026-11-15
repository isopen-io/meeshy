import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { loadColorAliasMap, loadIosSchemes, loadKitGlassTones, resolveColor, wcagContrastRatio, type RGBA } from '../../../scripts/lib/glass-contrast.mjs';
import { installHapticsDriver, type HapticCue } from '@/lib/view/haptics';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import {
  MEESHY_GLASS_BUTTON_SIZES,
  MeeshyGlassButton,
  MeeshyGlassButtonFace,
  meeshyGlassButtonAccessibility,
  meeshyGlassButtonRecipe,
  meeshyGlassButtonStyle,
  meeshyGlassPressReport,
  performMeeshyGlassButtonTrigger,
  type MeeshyGlassButtonActivation,
  type MeeshyGlassButtonKind,
  type MeeshyGlassButtonSize,
} from './meeshy-glass-button';
import { MeeshyGlass, MeeshyGlassScope, type MeeshyGlassTone } from './meeshy-glass-tone';

const ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const APP = fileURLToPath(new URL('../../../', import.meta.url));
const KIT = join(APP, 'src', 'components', 'kit');

type MatterVector = {
  readonly kind: MeeshyGlassButtonKind;
  readonly material: 'liquid' | 'drawn' | 'opaque';
  readonly nested: boolean;
  readonly fill: 'none' | 'white' | 'red' | 'veil';
  readonly glass: 'none' | 'neutral' | 'red';
  readonly restFill: number;
  readonly pressedFill: number;
  readonly hoveredFill: number;
  readonly pressedVeil: number;
  readonly hoveredVeil: number;
};

type Vectors = {
  readonly disabledOpacity: number;
  readonly toneFadeMs: number;
  readonly shadowActive: { readonly opacity: number; readonly blur: number; readonly y: number };
  readonly tapTarget: { readonly web: number };
  readonly longPress: { readonly durationMs: number; readonly maxMovement: number };
  readonly sizes: readonly { readonly size: string; readonly diameter: number; readonly glyph: number; readonly target: number; readonly slack: number }[];
  readonly matter: readonly MatterVector[];
  readonly ink: readonly { readonly kind: MeeshyGlassButtonKind; readonly tone: MeeshyGlassTone; readonly glyphTint: boolean; readonly ink: string }[];
  readonly activeThemeFill: string;
  readonly contrast: { readonly glyphMin: number; readonly active: number; readonly destructive: number; readonly tolerance: number };
  readonly activation: readonly { readonly activation: string; readonly impliedKind: MeeshyGlassButtonKind; readonly toggle: boolean; readonly selected: boolean; readonly toggleOn: boolean | null }[];
  readonly states: readonly { readonly enabled: boolean; readonly action: boolean; readonly haptic: boolean; readonly touchResponse: boolean; readonly opacity: number }[];
  readonly pressReport: readonly { readonly from: boolean; readonly to: boolean | null; readonly report: boolean | null }[];
};

const vectors = JSON.parse(readFileSync(join(ROOT, 'docs', 'product', 'kit', 'K02-MeeshyGlassButton.vectors.json'), 'utf8')) as Vectors;
const css = readFileSync(join(APP, 'src', 'styles', 'kit-glass-button.css'), 'utf8');

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

const button = (container: HTMLElement): HTMLButtonElement => {
  const found = container.querySelector<HTMLButtonElement>('button');
  if (found === null) throw new Error('bouton absent');
  return found;
};

const Glyph = () => (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16">
    <path d="M8 0l1.8 5.2L15 7l-5.2 1.8L8 14l-1.8-5.2L1 7l5.2-1.8z" />
  </svg>
);

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

const pointer = (type: string, init: { readonly clientX?: number; readonly clientY?: number } = {}): Event => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { clientX: init.clientX ?? 0, clientY: init.clientY ?? 0, pointerType: 'touch', button: 0 });
  return event;
};

const tap = (target: HTMLElement): void => {
  act(() => {
    target.dispatchEvent(pointer('pointerdown'));
    target.dispatchEvent(pointer('pointerup'));
    target.click();
  });
};

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const materialsOfTheWeb = vectors.matter.filter((row) => row.material !== 'liquid');
const FILL_NAMES: Readonly<Record<MatterVector['fill'], string>> = { none: 'clear', white: 'light', red: 'red', veil: 'veil' };
const fillOf = (name: MatterVector['fill']): string => FILL_NAMES[name];

describe('la recette, lue comme des valeurs (vecteurs de parité)', () => {
  materialsOfTheWeb.forEach((row) =>
    test(`${row.kind} · ${row.material}${row.nested ? ' · emboîté' : ''} : fond, verre demandé, appui et survol`, () => {
      const base = { kind: row.kind, size: 44, material: row.material as 'drawn' | 'opaque', isNested: row.nested } as const;
      const rest = meeshyGlassButtonRecipe(base);
      const pressed = meeshyGlassButtonRecipe({ ...base, isPressed: true });
      const hovered = meeshyGlassButtonRecipe({ ...base, isHovered: true });
      expect(rest.fill).toBe(fillOf(row.fill));
      expect(rest.glass).toBe(row.glass);
      expect(rest.fillOpacity).toBe(row.restFill);
      expect(pressed.fillOpacity).toBe(row.pressedFill);
      expect(hovered.fillOpacity).toBe(row.hoveredFill);
      expect(rest.pressVeilOpacity).toBe(0);
      expect(pressed.pressVeilOpacity).toBe(row.pressedVeil);
      expect(hovered.pressVeilOpacity).toBe(row.hoveredVeil);
    }),
  );

  test('le web n’a jamais de Liquid Glass : seules les matières dessinée et pleine sont lues, le rouge de verre n’est jamais demandé', () => {
    expect(materialsOfTheWeb.length).toBeGreaterThan(0);
    expect(materialsOfTheWeb.every((row) => row.material === 'drawn' || row.material === 'opaque')).toBe(true);
    expect(materialsOfTheWeb.every((row) => row.glass !== 'red')).toBe(true);
  });

  test('l’appui l’emporte sur le survol quand les deux sont vrais', () => {
    expect(meeshyGlassButtonRecipe({ kind: 'active', size: 44, isPressed: true, isHovered: true }).fillOpacity).toBe(0.78);
  });

  test('l’ombre de l’actif est celle de la planche, et aucun autre état n’en porte', () => {
    expect(meeshyGlassButtonRecipe({ kind: 'active', size: 44 }).shadow).toEqual({ opacity: vectors.shadowActive.opacity, blur: vectors.shadowActive.blur, y: vectors.shadowActive.y });
    (['normal', 'destructive', 'soft'] as const).forEach((kind) => expect(meeshyGlassButtonRecipe({ kind, size: 44 }).shadow).toBeNull());
  });

  test('le fond de l’actif suit le ton : clair partout, encre du thème sous le ton theme', () => {
    expect(meeshyGlassButtonRecipe({ kind: 'active', size: 44, tone: 'deep' }).fill).toBe('light');
    expect(meeshyGlassButtonRecipe({ kind: 'active', size: 44, tone: 'theme' }).fill).toBe(vectors.activeThemeFill);
  });

  test('un bouton désactivé ne répond ni à l’appui ni au survol', () => {
    const rest = meeshyGlassButtonRecipe({ kind: 'active', size: 44, isEnabled: false });
    expect(meeshyGlassButtonRecipe({ kind: 'active', size: 44, isEnabled: false, isPressed: true })).toEqual(rest);
    expect(meeshyGlassButtonRecipe({ kind: 'active', size: 44, isEnabled: false, isHovered: true })).toEqual(rest);
  });

  vectors.states.forEach((expected) =>
    test(`${expected.enabled ? 'activé' : 'désactivé'} : action ${String(expected.action)}, haptique ${String(expected.haptic)}, réponse au toucher ${String(expected.touchResponse)}, opacité ${expected.opacity}`, () => {
      const recipe = meeshyGlassButtonRecipe({ kind: 'normal', size: 44, isEnabled: expected.enabled });
      expect(recipe.isActionEnabled).toBe(expected.action);
      expect(recipe.playsHaptic).toBe(expected.haptic);
      expect(recipe.respondsToTouch).toBe(expected.touchResponse);
      expect(recipe.opacity).toBe(expected.opacity);
    }),
  );

  test('les durées et le seuil de l’appui long sont ceux des vecteurs', () => {
    expect(vectors.longPress.durationMs).toBe(500);
    expect(vectors.longPress.maxMovement).toBe(10);
    expect(vectors.toneFadeMs).toBe(200);
    expect(vectors.disabledOpacity).toBe(0.4);
  });
});

describe('les quatre tailles', () => {
  test('exactement quatre diamètres, ceux de la planche', () => {
    expect([...MEESHY_GLASS_BUTTON_SIZES]).toEqual([36, 40, 44, 48]);
  });

  vectors.sizes.forEach((expected) =>
    test(`${expected.size} : disque ${expected.diameter}, glyphe ${expected.glyph}, cible ${vectors.tapTarget.web} px au moins, débord ${expected.slack}`, () => {
      const recipe = meeshyGlassButtonRecipe({ kind: 'normal', size: expected.diameter as MeeshyGlassButtonSize });
      expect(recipe.diameter).toBe(expected.diameter);
      expect(recipe.glyphSize).toBe(expected.glyph);
      expect(recipe.targetSide).toBe(Math.max(expected.diameter, vectors.tapTarget.web));
      expect(recipe.targetSide).toBeGreaterThanOrEqual(44);
      expect(recipe.hitSlack).toBe((recipe.targetSide - recipe.diameter) / 2);
      expect(recipe.hitSlack).toBe(expected.slack);
    }),
  );
});

describe('l’encre du glyphe', () => {
  vectors.ink.forEach((expected) =>
    test(`${expected.kind} · ton ${expected.tone}${expected.glyphTint ? ' · encre de l’hôte' : ''} ⇒ ${expected.ink}`, () => {
      const recipe = meeshyGlassButtonRecipe({ kind: expected.kind, size: 44, tone: expected.tone, glyphTint: expected.glyphTint ? 'var(--ios-warning)' : null });
      expect(recipe.ink).toBe(expected.ink);
    }),
  );
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
  const solid = (kind: MeeshyGlassButtonKind) => {
    const style = meeshyGlassButtonStyle({ kind, size: 44 }) as Readonly<Record<string, unknown>>;
    return { fill: colorOf(tokenOf(String(style['--kit-btn-fill']))), ink: colorOf(tokenOf(String(style['--kit-btn-ink']))) };
  };

  test('actif : l’encre sombre sur le disque blanc', () => {
    const { fill, ink } = solid('active');
    expect(Math.abs(wcagContrastRatio(ink, fill) - vectors.contrast.active)).toBeLessThan(vectors.contrast.tolerance);
  });

  test('destructif : le glyphe blanc sur le rouge plein', () => {
    const { fill, ink } = solid('destructive');
    expect(Math.abs(wcagContrastRatio(ink, fill) - vectors.contrast.destructive)).toBeLessThan(vectors.contrast.tolerance);
    expect(wcagContrastRatio(ink, fill)).toBeGreaterThanOrEqual(vectors.contrast.glyphMin);
  });

  test('doux : le glyphe blanc sur le voile posé sur un verre dense du kit, au plancher commun', () => {
    const tones = loadKitGlassTones();
    const white = colorOf('--ios-on-media');
    const veil = { ...white, a: meeshyGlassButtonRecipe({ kind: 'soft', size: 44 }).fillOpacity };
    const worst = [tones.deep.dense, tones.onLight.regular].map((tone) => {
      const base = tone.fill === 'light' ? white : colorOf('--ios-media-backdrop');
      const glass = over({ ...base, a: tone.alpha / 100 }, { r: 255, g: 255, b: 255, a: 1 });
      return wcagContrastRatio(white, over(veil, glass));
    });
    expect(Math.min(...worst)).toBeGreaterThanOrEqual(vectors.contrast.glyphMin);
  });
});

describe('ce que le bouton dit au lecteur d’écran', () => {
  const parse = (name: string): MeeshyGlassButtonActivation | undefined => {
    const match = /^(toggle|selected|expanded)\((true|false)\)$/.exec(name);
    if (match === null) return undefined;
    const on = match[2] === 'true';
    if (match[1] === 'toggle') return { toggle: on };
    if (match[1] === 'selected') return { selected: on };
    return { expanded: on };
  };

  vectors.activation.forEach((expected) =>
    test(`${expected.activation} ⇒ tenue ${expected.impliedKind}, bascule ${String(expected.toggle)}, sélection ${String(expected.selected)}`, () => {
      const activation = parse(expected.activation);
      const said = meeshyGlassButtonAccessibility({ label: 'Mettre en forme', activation });
      expect(meeshyGlassButtonRecipe({ activation, size: 44 }).kind).toBe(expected.impliedKind);
      if (expected.toggle) expect(said['aria-pressed']).toBe(expected.toggleOn);
      else if (expected.activation.startsWith('selected')) expect(said['aria-pressed']).toBe(expected.selected);
      else expect(said['aria-pressed']).toBeUndefined();
    }),
  );

  test('un kind imposé l’emporte sur la tenue déduite', () => {
    expect(meeshyGlassButtonRecipe({ kind: 'destructive', activation: { toggle: true }, size: 44 }).kind).toBe('destructive');
    expect(meeshyGlassButtonRecipe({ size: 44 }).kind).toBe('normal');
  });

  test('déplié : aria-expanded, aria-controls et aria-haspopup, jamais aria-pressed', () => {
    const said = meeshyGlassButtonAccessibility({ label: 'Plus', activation: { expanded: true, controls: 'menu-1', popup: 'menu' } });
    expect(said['aria-expanded']).toBe(true);
    expect(said['aria-controls']).toBe('menu-1');
    expect(said['aria-haspopup']).toBe('menu');
    expect(said['aria-pressed']).toBeUndefined();
  });

  test('le nom est l’étiquette, doublé de l’infobulle ; la valeur et l’aide forment la description', () => {
    const said = meeshyGlassButtonAccessibility({ label: 'Sortie audio', hint: 'Choisit le haut-parleur', value: 'AirPods' });
    expect(said['aria-label']).toBe('Sortie audio');
    expect(said.title).toBe('Sortie audio');
    expect(said['aria-description']).toBe('AirPods. Choisit le haut-parleur');
    expect(meeshyGlassButtonAccessibility({ label: 'Fermer' })['aria-description']).toBeUndefined();
  });

  test('l’appui long est toujours une action nommée : l’étiquette dédiée, sinon le nom du bouton', () => {
    const named = meeshyGlassButtonAccessibility({ label: 'Micro', hasLongPress: true, longPressLabel: 'Choisir le micro' });
    expect(named['data-long-press-action']).toBe('Choisir le micro');
    expect(named['aria-keyshortcuts']).toBe('ContextMenu Shift+F10');
    expect(meeshyGlassButtonAccessibility({ label: 'Micro', hasLongPress: true })['data-long-press-action']).toBe('Micro');
    expect(meeshyGlassButtonAccessibility({ label: 'Micro', hasLongPress: true, longPressLabel: '' })['data-long-press-action']).toBe('Micro');
    expect(meeshyGlassButtonAccessibility({ label: 'Micro' })['data-long-press-action']).toBeUndefined();
  });
});

describe('les lois pures du geste', () => {
  vectors.pressReport.forEach((expected) =>
    test(`doigt ${String(expected.from)} ⇒ ${String(expected.to)} : on dit ${String(expected.report)}`, () => {
      expect(meeshyGlassPressReport(expected.from, expected.to)).toBe(expected.report);
    }),
  );

  test('activé : un impact léger, puis l’action, une seule fois', () => {
    const calls: string[] = [];
    const done = performMeeshyGlassButtonTrigger({ isEnabled: true, haptic: 'light', play: (haptic) => calls.push(`haptique:${haptic}`), action: () => calls.push('action') });
    expect(done).toBe(true);
    expect(calls).toEqual(['haptique:light', 'action']);
  });

  test('haptic none laisse l’hôte jouer le sien', () => {
    const calls: string[] = [];
    performMeeshyGlassButtonTrigger({ isEnabled: true, haptic: 'none', play: () => calls.push('haptique'), action: () => calls.push('action') });
    expect(calls).toEqual(['action']);
  });

  test('désactivé : ni haptique ni action', () => {
    const calls: string[] = [];
    const done = performMeeshyGlassButtonTrigger({ isEnabled: false, haptic: 'light', play: () => calls.push('haptique'), action: () => calls.push('action') });
    expect(done).toBe(false);
    expect(calls).toEqual([]);
  });
});

describe('le bouton, monté', () => {
  test('un bouton natif, nommé, sans texte visible : le glyphe est muet', () => {
    const container = mount(<MeeshyGlassButton label="Fermer" glyph={<Glyph />} onPress={() => {}} />);
    const node = button(container);
    expect(node.getAttribute('type')).toBe('button');
    expect(node.getAttribute('aria-label')).toBe('Fermer');
    expect(node.getAttribute('title')).toBe('Fermer');
    expect(node.textContent).toBe('');
    expect(container.querySelector('.kit-btn__glyph')?.getAttribute('aria-hidden')).toBe('true');
  });

  test('l’action part une fois, avec un seul impact léger par le site unique', () => {
    const played = recordHaptics();
    const calls: string[] = [];
    const container = mount(<MeeshyGlassButton label="Annuler" glyph={<Glyph />} onPress={() => calls.push('action')} />);
    tap(button(container));
    expect(calls).toEqual(['action']);
    expect(played).toEqual(['light']);
  });

  test('haptic none : l’action part, aucun impact', () => {
    const played = recordHaptics();
    const calls: string[] = [];
    const container = mount(<MeeshyGlassButton label="Annuler" glyph={<Glyph />} haptic="none" onPress={() => calls.push('action')} />);
    tap(button(container));
    expect(calls).toEqual(['action']);
    expect(played).toEqual([]);
  });

  test('désactivé : ni action ni haptique, opacité de la recette', () => {
    const played = recordHaptics();
    const calls: string[] = [];
    const container = mount(<MeeshyGlassButton label="Annuler" glyph={<Glyph />} disabled onPress={() => calls.push('action')} />);
    const node = button(container);
    tap(node);
    expect(node.disabled).toBe(true);
    expect(calls).toEqual([]);
    expect(played).toEqual([]);
    expect(node.style.opacity).toBe(String(vectors.disabledOpacity));
  });

  test('la bascule se dit par aria-pressed et fait passer la tenue à actif', () => {
    const on = button(mount(<MeeshyGlassButton label="Flash" glyph={<Glyph />} activation={{ toggle: true }} onPress={() => {}} />));
    expect(on.getAttribute('aria-pressed')).toBe('true');
    expect(on.getAttribute('data-kit-btn-kind')).toBe('active');
    const off = button(mount(<MeeshyGlassButton label="Flash" glyph={<Glyph />} activation={{ toggle: false }} onPress={() => {}} />));
    expect(off.getAttribute('aria-pressed')).toBe('false');
    expect(off.getAttribute('data-kit-btn-kind')).toBe('normal');
  });

  test('déplié : aria-expanded, aria-controls et aria-haspopup', () => {
    const node = button(mount(<MeeshyGlassButton label="Afficher les actions" glyph={<Glyph />} activation={{ expanded: false, controls: 'actions', popup: 'menu' }} onPress={() => {}} />));
    expect(node.getAttribute('aria-expanded')).toBe('false');
    expect(node.getAttribute('aria-controls')).toBe('actions');
    expect(node.getAttribute('aria-haspopup')).toBe('menu');
    expect(node.hasAttribute('aria-pressed')).toBe(false);
  });

  test('sans activation, aucun état n’est dit', () => {
    const node = button(mount(<MeeshyGlassButton label="Fermer" glyph={<Glyph />} onPress={() => {}} />));
    ['aria-pressed', 'aria-expanded', 'aria-haspopup', 'aria-description', 'aria-keyshortcuts', 'data-long-press-action'].forEach((name) => expect(node.hasAttribute(name)).toBe(false));
  });

  test('chaque taille pose son disque, son glyphe et sa cible sans changer l’encombrement', () => {
    MEESHY_GLASS_BUTTON_SIZES.forEach((size) => {
      const node = button(mount(<MeeshyGlassButton label="Ajouter" glyph={<Glyph />} size={size} onPress={() => {}} />));
      const recipe = meeshyGlassButtonRecipe({ kind: 'normal', size });
      expect(node.style.getPropertyValue('--kit-btn-d')).toBe(`${size}px`);
      expect(node.style.getPropertyValue('--kit-btn-glyph')).toBe(`${recipe.glyphSize}px`);
      expect(node.style.getPropertyValue('--kit-btn-slack')).toBe(`${recipe.hitSlack}px`);
      expect(size + 2 * recipe.hitSlack).toBeGreaterThanOrEqual(44);
    });
  });

  test('normal, seul : le verre du kit, interactif, au ton de l’hôte', () => {
    const node = button(mount(<MeeshyGlassButton label="Fermer" glyph={<Glyph />} tone="plain" onPress={() => {}} />));
    const classes = node.className.split(' ');
    expect(classes).toContain('glass-tone');
    expect(classes).toContain('glass-touch');
    expect(node.getAttribute('data-glass-tone')).toBe('plain');
    expect(node.hasAttribute('data-glass-nested')).toBe(false);
  });

  test('normal, dans un verre du kit : aucune matière, le glyphe seul, le voile d’appui', () => {
    const container = mount(
      <MeeshyGlass tone="deep">
        <MeeshyGlassButton label="Annuler" glyph={<Glyph />} size={40} onPress={() => {}} />
      </MeeshyGlass>,
    );
    const node = button(container);
    expect(node.hasAttribute('data-glass-nested')).toBe(true);
    expect(node.style.getPropertyValue('--kit-btn-veil-pressed')).toBe('0.22');
    expect(node.style.getPropertyValue('--kit-btn-veil-hover')).toBe('0.11');
  });

  test('le ton de l’hôte est celui du bouton quand il n’en pose pas, et celui qu’il pose l’emporte', () => {
    const inherited = mount(
      <MeeshyGlassScope tone="onLight">
        <MeeshyGlassButton label="Fermer" glyph={<Glyph />} onPress={() => {}} />
      </MeeshyGlassScope>,
    );
    expect(button(inherited).getAttribute('data-glass-tone')).toBe('onLight');
    const own = mount(
      <MeeshyGlassScope tone="onLight">
        <MeeshyGlassButton label="Fermer" glyph={<Glyph />} tone="plain" onPress={() => {}} />
      </MeeshyGlassScope>,
    );
    expect(button(own).getAttribute('data-glass-tone')).toBe('plain');
  });

  test('actif, destructif, doux : un fond plein, aucune matière de verre, aucune échelle', () => {
    (['active', 'destructive', 'soft'] as const).forEach((kind) => {
      const node = button(mount(<MeeshyGlassButton label="Retirer" glyph={<Glyph />} kind={kind} onPress={() => {}} />));
      const classes = node.className.split(' ');
      expect(classes).not.toContain('glass-tone');
      expect(classes).not.toContain('glass-touch');
      expect(node.getAttribute('data-kit-btn-kind')).toBe(kind);
      expect(node.getAttribute('data-kit-btn-glass')).toBe('none');
    });
  });

  test('changer de tenue ne remplace pas le bouton : le focus du clavier survit à la bascule', () => {
    const view = (on: boolean): ReactElement => <MeeshyGlassButton label="Flash" glyph={<Glyph />} activation={{ toggle: on }} onPress={() => {}} />;
    const container = mount(view(false));
    const before = button(container);
    act(() => before.focus());
    act(() => mounted?.root.render(view(true)));
    expect(button(container)).toBe(before);
    expect(document.activeElement).toBe(before);
  });

  test('le teint passe au kit, l’encre de l’hôte au glyphe', () => {
    const tinted = button(mount(<MeeshyGlassButton label="Coller" glyph={<Glyph />} tint="accent" onPress={() => {}} />));
    expect(tinted.getAttribute('data-glass-tint')).toBe('accent');
    const inked = button(mount(<MeeshyGlassButton label="Pause" glyph={<Glyph />} glyphTint="var(--ios-warning)" onPress={() => {}} />));
    expect(inked.style.getPropertyValue('--kit-btn-ink')).toBe('var(--ios-warning)');
  });

  test('la pastille occupe son emplacement, muette pour le lecteur d’écran', () => {
    const container = mount(<MeeshyGlassButton label="Notifications" value="3" glyph={<Glyph />} badge={<i data-dot="" />} onPress={() => {}} />);
    const badge = container.querySelector('.kit-btn__badge');
    expect(badge?.getAttribute('aria-hidden')).toBe('true');
    expect(badge?.querySelector('[data-dot]')).not.toBeNull();
    expect(button(container).getAttribute('aria-description')).toBe('3');
  });

  test('sans pastille, aucun emplacement', () => {
    expect(mount(<MeeshyGlassButton label="Fermer" glyph={<Glyph />} onPress={() => {}} />).querySelector('.kit-btn__badge')).toBeNull();
  });

  test('l’hôte place le bouton par sa classe et lit ses sondes data-*', () => {
    const node = button(mount(<MeeshyGlassButton label="Fermer" glyph={<Glyph />} className="absolute" data={{ 'data-probe': 'k02' }} onPress={() => {}} />));
    expect(node.className.split(' ')).toContain('absolute');
    expect(node.getAttribute('data-probe')).toBe('k02');
  });

  test('le glyphe de texte (« Aa ») reçoit l’encre comme une icône', () => {
    const container = mount(<MeeshyGlassButton label="Style du texte" glyph="Aa" onPress={() => {}} />);
    expect(container.querySelector('.kit-btn__glyph')?.textContent).toBe('Aa');
    expect(button(container).getAttribute('aria-label')).toBe('Style du texte');
  });
});

describe('le disque seul', () => {
  test('un span qui ne se dit pas : ni bouton, ni nom, ni action', () => {
    const container = mount(<MeeshyGlassButtonFace glyph={<Glyph />} />);
    expect(container.querySelector('button')).toBeNull();
    const face = container.querySelector<HTMLElement>('.kit-btn');
    expect(face?.tagName).toBe('SPAN');
    expect(face?.hasAttribute('aria-label')).toBe(false);
    expect(face?.hasAttribute('role')).toBe(false);
  });

  test('figé sous le doigt pour le catalogue : data-pressed, sans bouton', () => {
    const face = mount(<MeeshyGlassButtonFace kind="active" pressed glyph={<Glyph />} />).querySelector('.kit-btn');
    expect(face?.hasAttribute('data-pressed')).toBe(true);
    expect(face?.getAttribute('data-kit-btn-kind')).toBe('active');
  });

  test('libellé d’un hôte désactivé : le disque s’éteint à l’opacité de la recette et ne répond plus au toucher', () => {
    const face = mount(<MeeshyGlassButtonFace disabled pressed glyph={<Glyph />} />).querySelector<HTMLElement>('.kit-btn');
    expect(face?.style.opacity).toBe(String(vectors.disabledOpacity));
    expect(face?.className.split(' ')).not.toContain('glass-touch');
    expect(face?.hasAttribute('data-pressed')).toBe(false);
  });

  test('un bouton désactivé ne porte pas la réponse au toucher du verre', () => {
    const node = button(mount(<MeeshyGlassButton label="Marqueur" glyph={<Glyph />} disabled onPress={() => {}} />));
    expect(node.className.split(' ')).not.toContain('glass-touch');
    expect(node.className.split(' ')).toContain('glass-tone');
  });

  test('libellé d’un bouton hôte : la réponse de l’hôte pressé passe par le CSS, sans état', () => {
    expect(css).toContain(":where(button,[role='button'],a[href],label,summary):active:not(.kit-btn) > .kit-btn");
  });
});

describe('le doigt posé, levé, disparu', () => {
  test('onPressChange : vrai au doigt posé, faux au doigt levé, rien de plus', () => {
    const reports: boolean[] = [];
    const node = button(mount(<MeeshyGlassButton label="Micro" glyph={<Glyph />} onPress={() => {}} onPressChange={(pressed) => reports.push(pressed)} />));
    act(() => {
      node.dispatchEvent(pointer('pointerdown'));
    });
    expect(reports).toEqual([true]);
    act(() => {
      node.dispatchEvent(pointer('pointerup'));
    });
    expect(reports).toEqual([true, false]);
    act(() => {
      node.dispatchEvent(pointer('pointerleave'));
    });
    expect(reports).toEqual([true, false]);
  });

  test('le bouton disparaît doigt posé : faux, une fois', () => {
    const reports: boolean[] = [];
    const node = button(mount(<MeeshyGlassButton label="Micro" glyph={<Glyph />} onPress={() => {}} onPressChange={(pressed) => reports.push(pressed)} />));
    act(() => {
      node.dispatchEvent(pointer('pointerdown'));
    });
    unmount();
    expect(reports).toEqual([true, false]);
  });

  test('disparaître au repos ne dit rien', () => {
    const reports: boolean[] = [];
    mount(<MeeshyGlassButton label="Micro" glyph={<Glyph />} onPress={() => {}} onPressChange={(pressed) => reports.push(pressed)} />);
    unmount();
    expect(reports).toEqual([]);
  });

  test('au clavier, Espace pose puis lève le doigt', () => {
    const reports: boolean[] = [];
    const node = button(mount(<MeeshyGlassButton label="Micro" glyph={<Glyph />} onPress={() => {}} onPressChange={(pressed) => reports.push(pressed)} />));
    act(() => {
      node.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      node.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
    });
    expect(reports).toEqual([true, false]);
  });
});

describe('l’appui long', () => {
  const holdMs = vectors.longPress.durationMs + 80;

  test('maintenu 500 ms : l’appui long part avec un impact, et le relâcher n’active pas l’action', async () => {
    const played = recordHaptics();
    const calls: string[] = [];
    const node = button(mount(<MeeshyGlassButton label="Micro" glyph={<Glyph />} onPress={() => calls.push('action')} onLongPress={() => calls.push('long')} />));
    act(() => {
      node.dispatchEvent(pointer('pointerdown', { clientX: 20, clientY: 20 }));
    });
    await act(async () => wait(holdMs));
    expect(calls).toEqual(['long']);
    act(() => {
      node.dispatchEvent(pointer('pointerup', { clientX: 20, clientY: 20 }));
      node.click();
    });
    expect(calls).toEqual(['long']);
    expect(played).toEqual(['light']);
    tap(node);
    expect(calls).toEqual(['long', 'action']);
  });

  test('levé avant 500 ms : un simple toucher', async () => {
    const calls: string[] = [];
    const node = button(mount(<MeeshyGlassButton label="Micro" glyph={<Glyph />} onPress={() => calls.push('action')} onLongPress={() => calls.push('long')} />));
    act(() => {
      node.dispatchEvent(pointer('pointerdown'));
    });
    await act(async () => wait(100));
    act(() => {
      node.dispatchEvent(pointer('pointerup'));
      node.click();
    });
    await act(async () => wait(holdMs));
    expect(calls).toEqual(['action']);
  });

  test('un doigt qui glisse de plus de 10 pt annule l’appui long', async () => {
    const calls: string[] = [];
    const node = button(mount(<MeeshyGlassButton label="Micro" glyph={<Glyph />} onPress={() => {}} onLongPress={() => calls.push('long')} />));
    act(() => {
      node.dispatchEvent(pointer('pointerdown', { clientX: 0, clientY: 0 }));
      node.dispatchEvent(pointer('pointermove', { clientX: vectors.longPress.maxMovement + 5, clientY: 0 }));
    });
    await act(async () => wait(holdMs));
    expect(calls).toEqual([]);
  });

  test('un tremblement de moins de 10 pt ne l’annule pas', async () => {
    const calls: string[] = [];
    const node = button(mount(<MeeshyGlassButton label="Micro" glyph={<Glyph />} onPress={() => {}} onLongPress={() => calls.push('long')} />));
    act(() => {
      node.dispatchEvent(pointer('pointerdown', { clientX: 0, clientY: 0 }));
      node.dispatchEvent(pointer('pointermove', { clientX: 4, clientY: 3 }));
    });
    await act(async () => wait(holdMs));
    expect(calls).toEqual(['long']);
  });

  test('au clavier et à la souris, la touche menu ou le clic droit offrent la même action nommée', () => {
    const calls: string[] = [];
    const node = button(mount(<MeeshyGlassButton label="Micro" glyph={<Glyph />} longPressLabel="Choisir le micro" onPress={() => calls.push('action')} onLongPress={() => calls.push('long')} />));
    const event = new Event('contextmenu', { bubbles: true, cancelable: true });
    act(() => {
      node.dispatchEvent(event);
    });
    expect(calls).toEqual(['long']);
    expect(event.defaultPrevented).toBe(true);
    expect(node.getAttribute('data-long-press-action')).toBe('Choisir le micro');
    expect(node.getAttribute('aria-keyshortcuts')).toBe('ContextMenu Shift+F10');
  });

  test('doigt posé, le menu contextuel du système fait l’appui long : le relâcher n’active pas l’action, le minuteur ne la rejoue pas', async () => {
    const played = recordHaptics();
    const calls: string[] = [];
    const node = button(mount(<MeeshyGlassButton label="Micro" glyph={<Glyph />} onPress={() => calls.push('action')} onLongPress={() => calls.push('long')} />));
    act(() => {
      node.dispatchEvent(pointer('pointerdown', { clientX: 20, clientY: 20 }));
      node.dispatchEvent(new Event('contextmenu', { bubbles: true, cancelable: true }));
      node.dispatchEvent(pointer('pointerup', { clientX: 20, clientY: 20 }));
      node.click();
    });
    await act(async () => wait(holdMs));
    expect(calls).toEqual(['long']);
    expect(played).toEqual(['light']);
    tap(node);
    expect(calls).toEqual(['long', 'action']);
  });

  test('après le menu contextuel au clavier, une activation sans doigt posé (lecteur d’écran) part', () => {
    const calls: string[] = [];
    const node = button(mount(<MeeshyGlassButton label="Micro" glyph={<Glyph />} onPress={() => calls.push('action')} onLongPress={() => calls.push('long')} />));
    act(() => {
      node.dispatchEvent(new Event('contextmenu', { bubbles: true, cancelable: true }));
      node.click();
    });
    expect(calls).toEqual(['long', 'action']);
  });

  test('sans appui long, le menu contextuel du navigateur reste', () => {
    const node = button(mount(<MeeshyGlassButton label="Micro" glyph={<Glyph />} onPress={() => {}} />));
    const event = new Event('contextmenu', { bubbles: true, cancelable: true });
    act(() => {
      node.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(false);
  });
});

describe('la feuille de style : des jetons, une réponse dessinée, aucune matière', () => {
  const sources = [
    ['meeshy-glass-button.tsx', readFileSync(join(KIT, 'meeshy-glass-button.tsx'), 'utf8')],
    ['meeshy-glass-button-recipe.ts', readFileSync(join(KIT, 'meeshy-glass-button-recipe.ts'), 'utf8')],
    ['kit-glass-button.css', css],
  ] as const;
  const code = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, ' ');

  sources.forEach(([name, text]) =>
    test(`${name} : ni flou d’arrière-plan, ni Liquid Glass, ni classe de verre en dur`, () => {
      expect(code(text)).not.toMatch(/backdrop-filter|backdropFilter|backdrop-blur|glassEffect|adaptiveGlass/);
      expect(code(text)).not.toMatch(/['"`]glass['"`]|[\s'"`.]glass-(?:prominent|card|accent|call[\w-]*|tone|touch|scope|group)\b/);
    }),
  );

  sources.forEach(([name, text]) =>
    test(`${name} : aucune couleur ni rayon en dur`, () => {
      expect(code(text)).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/);
      if (name.endsWith('.css')) expect(code(text)).not.toMatch(/\b(?:white|black)\b(?!-)/);
      expect(code(text)).not.toMatch(/border-radius:\s*[\d.]+(?:px|rem|%)/);
    }),
  );

  test('seules des propriétés de composition s’animent', () => {
    const transitions = [...code(css).matchAll(/transition(?:-property)?:\s*([^;}]+)[;}]/g)].flatMap((match) => (match[1] ?? '').split(',').map((part) => part.trim().split(/\s+/)[0] ?? ''));
    expect(transitions.length).toBeGreaterThan(0);
    transitions.filter((name) => name !== 'none').forEach((name) => expect(['opacity', 'color', 'background-color', 'transform']).toContain(name));
  });

  test('l’appui, le survol et le focus clavier sont dessinés en CSS, sans état', () => {
    expect(css).toContain('.kit-btn:active');
    expect(css).toContain('.kit-btn:hover');
    expect(css).toContain('.kit-btn[data-pressed]');
    expect(css).toContain('@media (hover: hover)');
    expect(css).toContain(':focus-visible');
  });

  test('« réduire les animations » retire les fondus, jamais le voile d’appui', () => {
    const reduced = /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
    expect(reduced).toContain('transition: none');
    expect(reduced).not.toContain('veil');
  });

  test('la cible déborde le disque sans changer l’encombrement', () => {
    expect(code(css)).toMatch(/\.kit-btn::before\s*\{[^}]*inset:\s*calc\(-1 \* var\(--kit-btn-slack\)\)/);
    expect(code(css)).toMatch(/inline-size:\s*var\(--kit-btn-d\)/);
  });

  test('le style d’un état ne dépend pas de ce qui l’a déduit : une bascule active et un actif forcé partagent le même objet', () => {
    const base = { size: 44, tone: 'deep', material: 'drawn', isNested: false, isEnabled: true, glyphTint: null } as const;
    const forced = meeshyGlassButtonStyle({ ...base, kind: 'active' });
    expect(meeshyGlassButtonStyle({ ...base, activation: { toggle: true } })).toBe(forced);
    expect(meeshyGlassButtonStyle({ ...base, activation: { expanded: true, controls: 'feuille-1' } })).toBe(forced);
  });

  test('la mémoire des styles est bornée : un hôte qui fait varier l’encre ne la fait pas grandir', () => {
    const input = { kind: 'normal', size: 44, tone: 'deep', material: 'drawn', isNested: false, isEnabled: true } as const;
    const first = meeshyGlassButtonStyle({ ...input, glyphTint: 'var(--k02-probe-first)' });
    Array.from({ length: 512 }, (_, index) => meeshyGlassButtonStyle({ ...input, glyphTint: `var(--k02-probe-${index})` }));
    expect(meeshyGlassButtonStyle({ ...input, glyphTint: 'var(--k02-probe-first)' })).not.toBe(first);
    expect(meeshyGlassButtonStyle({ ...input, glyphTint: 'var(--k02-probe-first)' })).toEqual(first);
  });

  test('le style d’un même état est le même objet : aucun rendu inutile', () => {
    const input = { kind: 'active', size: 44, tone: 'deep', material: 'drawn', isNested: false, isEnabled: true, glyphTint: null } as const;
    expect(meeshyGlassButtonStyle(input)).toBe(meeshyGlassButtonStyle({ ...input }));
  });
});
