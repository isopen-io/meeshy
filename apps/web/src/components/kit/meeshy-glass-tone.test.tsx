import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, useState, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { kitGlassFocusRingContrast, kitGlassToneContrast, loadGlassDensities, loadKitGlassTones } from '../../../scripts/lib/glass-contrast.mjs';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import {
  MeeshyGlass,
  MeeshyGlassGroup,
  MeeshyGlassScope,
  meeshyGlassRecipe,
  resolveMeeshyGlassTone,
  type MeeshyGlassTone,
} from './meeshy-glass-tone';

const ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const APP = fileURLToPath(new URL('../../../', import.meta.url));

type DrawnVector = {
  readonly tone: 'plain' | 'deep' | 'onLight';
  readonly density: 'regular' | 'dense';
  readonly fill: 'light' | 'dark';
  readonly fillOpacity: number;
  readonly rim: number;
};

type Vectors = {
  readonly tone: {
    readonly plainCeiling: number;
    readonly deepCeiling: number;
    readonly hysteresis: number;
    readonly cases: readonly { readonly luminance: number | null; readonly previous: MeeshyGlassTone | null; readonly tone: MeeshyGlassTone }[];
  };
  readonly recipe: {
    readonly blurRadius: number;
    readonly saturation: number;
    readonly pressScale: number;
    readonly pressSheenFactor: number;
    readonly hoverSheenFactor: number;
    readonly toneFadeMs: number;
    readonly topLight: number;
    readonly shadowOpacity: number;
    readonly shadowOffsetY: number;
    readonly drawn: readonly DrawnVector[];
  };
};

const vectors = JSON.parse(readFileSync(join(ROOT, 'docs', 'product', 'kit', 'K01-MeeshyGlassTone.vectors.json'), 'utf8')) as Vectors;
const glassCss = readFileSync(join(APP, 'src', 'styles', 'glass-kit.css'), 'utf8');

const percent = (fraction: number): number => Math.round(fraction * 10000) / 100;

const bodiesOf = (css: string, opener: RegExp): readonly string[] => {
  const flags = opener.flags.includes('g') ? opener.flags : `${opener.flags}g`;
  return [...css.matchAll(new RegExp(opener.source, flags))].map((match) => {
    const open = css.indexOf('{', match.index);
    const close = [...css.slice(open)].reduce(
      (state, char, offset) => {
        if (state.end !== -1) return state;
        const depth = state.depth + (char === '{' ? 1 : char === '}' ? -1 : 0);
        return depth === 0 ? { depth, end: open + offset } : { ...state, depth };
      },
      { depth: 0, end: -1 },
    ).end;
    return css.slice(open + 1, close).replace(/\s+/g, ' ').trim();
  });
};

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

afterEach(() => {
  act(() => mounted?.root.unmount());
  mounted?.container.remove();
  mounted = null;
});

const mount = (element: ReactElement): HTMLElement => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(element));
  mounted = { container, root };
  return container;
};

const surface = (container: HTMLElement, index = 0): HTMLElement => {
  const found = container.querySelectorAll<HTMLElement>('.glass-tone');
  const element = found[index];
  if (element === undefined) throw new Error('surface absente');
  return element;
};

describe('la loi du ton', () => {
  test('les seuils sont ceux des vecteurs de parité', () => {
    expect(resolveMeeshyGlassTone(vectors.tone.plainCeiling - 0.001)).toBe('plain');
    expect(resolveMeeshyGlassTone(vectors.tone.plainCeiling + 0.001)).toBe('deep');
    expect(resolveMeeshyGlassTone(vectors.tone.deepCeiling - 0.001)).toBe('deep');
    expect(resolveMeeshyGlassTone(vectors.tone.deepCeiling + 0.001)).toBe('onLight');
  });

  vectors.tone.cases.forEach((entry, index) => {
    test(`vecteur ${index} : luminance ${String(entry.luminance)}, après ${String(entry.previous)} ⇒ ${entry.tone}`, () => {
      expect(resolveMeeshyGlassTone(entry.luminance, entry.previous)).toBe(entry.tone);
    });
  });

  test('luminance inconnue ⇒ deep, quel que soit le ton précédent', () => {
    expect(resolveMeeshyGlassTone(null)).toBe('deep');
    expect(resolveMeeshyGlassTone(undefined, 'onLight')).toBe('deep');
  });

  test('le ton theme n’est jamais élu par la luminance et ne se tient pas', () => {
    expect(resolveMeeshyGlassTone(0.5, 'theme')).toBe('deep');
  });
});

describe('la recette, lue comme des valeurs', () => {
  const rest = { isInteractive: false, isPressed: false, material: 'drawn', reduceMotion: false } as const;

  vectors.recipe.drawn.forEach((expected) => test(`verre dessiné ${expected.tone} ${expected.density} : remplissage et liseré de la planche`, () => {
    const recipe = meeshyGlassRecipe({ tone: expected.tone, density: expected.density, ...rest });
    expect(recipe.material).toBe('drawn');
    expect(recipe.fill).toBe(expected.fill);
    expect(recipe.fillOpacity).toBe(expected.fillOpacity);
    expect(recipe.rim).toBe(expected.rim);
    expect(recipe.blurRadius).toBe(vectors.recipe.blurRadius);
    expect(recipe.saturation).toBe(vectors.recipe.saturation);
    expect(recipe.topLight).toBe(vectors.recipe.topLight);
    expect(recipe.shadowOpacity).toBe(vectors.recipe.shadowOpacity);
    expect(recipe.shadowY).toBe(vectors.recipe.shadowOffsetY);
  }));

  test('la matière web est dessinée ou pleine : aucun Liquid Glass, aucun paramètre ne force autre chose', () => {
    expect(meeshyGlassRecipe({ tone: 'deep', ...rest }).material).toBe('drawn');
    expect(meeshyGlassRecipe({ tone: 'deep', ...rest, material: 'opaque' }).material).toBe('opaque');
  });

  test('« réduire la transparence » : fond plein, ni flou ni reflet ni ombre', () => {
    const recipe = meeshyGlassRecipe({ tone: 'deep', ...rest, material: 'opaque' });
    expect(recipe.fillOpacity).toBe(1);
    expect(recipe.blurRadius).toBe(0);
    expect(recipe.topLight).toBe(0);
    expect(recipe.shadowOpacity).toBe(0);
    expect(recipe.attributes['data-glass-material']).toBe('opaque');
  });

  test('une surface qui se touche : la recette pressée diffère de celle du repos', () => {
    const resting = meeshyGlassRecipe({ tone: 'deep', ...rest, isInteractive: true });
    const pressed = meeshyGlassRecipe({ tone: 'deep', ...rest, isInteractive: true, isPressed: true });
    expect(pressed).not.toEqual(resting);
    expect(resting.scale).toBe(1);
    expect(pressed.scale).toBe(vectors.recipe.pressScale);
    expect(pressed.topLight).toBe(vectors.recipe.topLight * vectors.recipe.pressSheenFactor);
    expect(pressed.glow).toBe(vectors.recipe.pressSheenFactor - 1);
    expect(pressed.attributes['data-pressed']).toBe('');
  });

  test('une surface qui ne se touche pas ne répond pas', () => {
    const resting = meeshyGlassRecipe({ tone: 'deep', ...rest });
    const pressed = meeshyGlassRecipe({ tone: 'deep', ...rest, isPressed: true });
    expect(pressed).toEqual(resting);
    expect(resting.className.split(' ')).not.toContain('glass-touch');
  });

  test('le survol éclaire le reflet à mi-chemin de l’appui, sans échelle', () => {
    const hovered = meeshyGlassRecipe({ tone: 'plain', ...rest, isInteractive: true, isHovered: true });
    expect(hovered.scale).toBe(1);
    expect(hovered.glow).toBe(vectors.recipe.hoverSheenFactor - 1);
  });

  test('« réduire les animations » : l’échelle reste à 1, le reflet répond', () => {
    const pressed = meeshyGlassRecipe({ tone: 'deep', ...rest, isInteractive: true, isPressed: true, reduceMotion: true });
    expect(pressed.scale).toBe(1);
    expect(pressed.glow).toBe(vectors.recipe.pressSheenFactor - 1);
  });

  test('pleine, la surface pressée grandit sans reflet', () => {
    const pressed = meeshyGlassRecipe({ tone: 'deep', ...rest, material: 'opaque', isInteractive: true, isPressed: true });
    expect(pressed.scale).toBe(vectors.recipe.pressScale);
    expect(pressed.glow).toBe(0);
  });

  test('jamais de verre sur du verre : une surface imbriquée ne porte aucune matière et garde sa réponse', () => {
    const nested = meeshyGlassRecipe({ tone: 'deep', ...rest, isNested: true, isInteractive: true, isPressed: true, isTinted: true });
    expect(nested.fillOpacity).toBe(0);
    expect(nested.blurRadius).toBe(0);
    expect(nested.topLight).toBe(0);
    expect(nested.shadowOpacity).toBe(0);
    expect(nested.rim).toBe(0);
    expect(nested.tintWash).toBeGreaterThan(0);
    expect(nested.scale).toBe(vectors.recipe.pressScale);
    expect(nested.attributes['data-glass-nested']).toBe('');
  });

  test('le ton theme redonne la matière actuelle des listes, nichée ou non', () => {
    const regular = meeshyGlassRecipe({ tone: 'theme', ...rest });
    const dense = meeshyGlassRecipe({ tone: 'theme', density: 'dense', ...rest });
    const densities = loadGlassDensities();
    expect(percent(regular.fillOpacity)).toBe(densities.glass);
    expect(percent(dense.fillOpacity)).toBe(densities['glass-prominent']);
    expect(regular.rim).toBe(0);
    expect(regular.shadowOpacity).toBe(0);
    expect(meeshyGlassRecipe({ tone: 'theme', ...rest, isNested: true }).fillOpacity).toBe(regular.fillOpacity);
  });

  test('la teinte lave le fond, plus fort en sombre qu’en clair', () => {
    const light = meeshyGlassRecipe({ tone: 'deep', ...rest, isTinted: true, isDark: false });
    const dark = meeshyGlassRecipe({ tone: 'deep', ...rest, isTinted: true, isDark: true });
    expect(light.tintWash).toBe(0.16);
    expect(dark.tintWash).toBe(0.22);
    expect(meeshyGlassRecipe({ tone: 'deep', ...rest }).tintWash).toBe(0);
  });
});

describe('la matière de glass.css porte les valeurs de la recette', () => {
  const tones = loadKitGlassTones();

  vectors.recipe.drawn.forEach((expected) =>
    test(`${expected.tone} ${expected.density} : fond et liseré lus dans la feuille`, () => {
      const found = tones[expected.tone][expected.density];
      expect(found.fill).toBe(expected.fill);
      expect(found.alpha).toBe(percent(expected.fillOpacity));
      expect(found.rim).toBe(percent(expected.rim));
    }),
  );

  test('flou, saturation, reflet, ombre : une seule valeur, celle de la planche', () => {
    expect(tones.blur).toBe(vectors.recipe.blurRadius);
    expect(tones.saturate).toBe(percent(vectors.recipe.saturation));
    expect(tones.topLight).toBe(percent(vectors.recipe.topLight));
    expect(tones.shadowAlpha).toBe(percent(vectors.recipe.shadowOpacity));
    expect(tones.shadowOffsetY).toBe(vectors.recipe.shadowOffsetY);
    expect(tones.pressScale).toBe(vectors.recipe.pressScale);
    expect(tones.toneFadeMs).toBe(vectors.recipe.toneFadeMs);
  });

  test('le reflet de survol et d’appui sont dérivés des facteurs de la recette', () => {
    expect(tones.hoverGlow).toBe(vectors.recipe.hoverSheenFactor - 1);
    expect(tones.pressGlow).toBe(vectors.recipe.pressSheenFactor - 1);
  });

  test('le ton theme est le verre actuel : mêmes densités que .glass et .glass-prominent', () => {
    const densities = loadGlassDensities();
    expect(tones.theme.regular.alpha).toBe(densities.glass);
    expect(tones.theme.dense.alpha).toBe(densities['glass-prominent']);
  });

  test('le ton theme enveloppe la matière de glass.css au lieu de la recopier', () => {
    const [theme] = bodiesOf(glassCss, /\.glass-tone\[data-glass-tone='theme'\] \{/);
    expect(theme).not.toMatch(/--glass-alpha|background|backdrop-filter/);
    expect(glassCss).not.toMatch(/\[data-glass-tone='theme'\]\[data-glass-density='dense'\]/);
    const [base] = bodiesOf(glassCss, /\.glass-tone \{/);
    expect(base).not.toMatch(/(?:^|; )(?:background-color|backdrop-filter|box-shadow):/);
    const [toned] = bodiesOf(glassCss, /\.glass-tone:not\(\[data-glass-tone='theme'\]\) \{/);
    expect(toned).toContain('backdrop-filter');
  });

  test('le ton theme ne fond pas sa teinte : le verre actuel ne s’animait pas', () => {
    const [theme] = bodiesOf(glassCss, /\.glass-tone\[data-glass-tone='theme'\] \{/);
    expect(theme).toContain('--glass-tone-fade: 0ms');
  });

  test('réduire les animations coupe l’échelle, le ressort et le fondu', () => {
    const blocks = bodiesOf(glassCss, /@media \(prefers-reduced-motion: reduce\)/).filter((body) => body.includes('.glass-touch'));
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toContain('transform: none');
    expect(blocks[0]).toContain('transition: none');
    expect(blocks[0]).toContain('.glass-tone { transition: none; }');
  });

  test('réduire la transparence : fond plein sans flou, par le réglage du système et par la matière posée', () => {
    const blocks = bodiesOf(glassCss, /@media \(prefers-reduced-transparency: reduce\)/).filter((body) => body.includes('.glass-tone'));
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toContain('backdrop-filter: none');
    expect(blocks[0]).toContain('color-mix(in srgb, var(--glass-fill) 100%, transparent)');
    const [forced] = bodiesOf(glassCss, /\.glass-tone\[data-glass-material='opaque'\]\[data-glass-tone\] \{/);
    expect(forced).toContain('backdrop-filter: none');
    expect(forced).toContain('color-mix(in srgb, var(--glass-fill) 100%, transparent)');
  });

  test('l’appui n’anime que transform et opacity ; le fondu de ton n’anime que la teinte', () => {
    const [touch] = bodiesOf(glassCss, /\.glass-touch \{/);
    expect(touch).toContain('transition: transform');
    expect(touch).not.toMatch(/blur|box-shadow|filter|width|height/);
    const [glow] = bodiesOf(glassCss, /\.glass-touch::after \{/);
    expect(glow).toContain('transition: opacity');
    expect(glow).not.toMatch(/transition:[^;]*(?:blur|filter|width|height)/);
  });

  test('l’appui d’un verre hôte ne descend pas dans la surface posée dedans', () => {
    expect(glassCss).not.toMatch(/(?:^|[\s,]):active > \.glass-touch/m);
    expect(glassCss.match(/:active:not\(\.glass-touch\) > \.glass-touch/g)).toHaveLength(3);
  });

  test('un contrôle désactivé ne répond pas : ni échelle, ni reflet, ni main', () => {
    const [disabled] = bodiesOf(glassCss, /\.glass-touch:disabled,\s*\.glass-touch\[aria-disabled='true'\] \{/);
    expect(disabled).toContain('cursor: default');
    expect(disabled).toContain('transform: none');
    const [glow] = bodiesOf(glassCss, /\.glass-touch:disabled::after,\s*\.glass-touch\[aria-disabled='true'\]::after \{/);
    expect(glow).toContain('opacity: 0');
    const order = ['.glass-touch[data-pressed]::after', '.glass-touch:disabled::after'].map((needle) => glassCss.indexOf(needle));
    expect(order[0]).toBeGreaterThan(-1);
    expect(order[1]).toBeGreaterThan(order[0] ?? 0);
  });

  test('le focus clavier est visible sur les quatre tons : contour de 2 px décalé de 2 px', () => {
    expect(glassCss).toMatch(/\.glass-touch:focus-visible\s*\{[^}]*outline: 2px solid var\(--glass-focus-ring\)[^}]*outline-offset: 2px/);
  });

  test('le contour du focus prend la couleur que le contenu de son ton laisse lisible, à 3:1 sur toute la bande', () => {
    const rings = kitGlassFocusRingContrast();
    expect(rings.map((entry) => entry.tone)).toEqual(['plain', 'deep', 'onLight']);
    for (const entry of rings) expect(entry.ratio).toBeGreaterThanOrEqual(3);
    expect(bodiesOf(glassCss, /\.glass-tone\[data-glass-tone='theme'\] \{/)[0]).toContain('--glass-focus-ring: currentColor');
  });

  test('posée dans un verre, la surface trace son focus sur le verre de l’hôte, à l’encre de la planche', () => {
    expect(bodiesOf(glassCss, /\.glass-tone\[data-glass-nested\]\[data-glass-tone\] \{/)[0]).toContain('--glass-focus-ring: var(--ios-on-media)');
    expect(kitGlassToneContrast().every((entry) => entry.ratio >= 3)).toBe(true);
  });

  test('ce que l’appelant pose en utilitaire l’emporte : la position de la surface et la disposition du groupe vivent sous la couche des utilitaires', () => {
    const [layer] = bodiesOf(glassCss, /@layer components \{/);
    expect(layer).toContain('.glass-tone { position: relative; }');
    expect(layer).toMatch(/\.glass-group \{ display: flex;/);
    const unlayered = glassCss.replace(/@layer components \{[\s\S]*?\n\}/, '');
    expect(unlayered).not.toMatch(/position:\s*relative/);
    expect(unlayered).not.toMatch(/\.glass-group\s*\{/);
  });
});

describe('le contraste de chaque ton, flou coupé, contre son pire fond', () => {
  const results = kitGlassToneContrast();

  test('encre blanche ≥ 4,5:1 sur dense et onLight', () => {
    for (const entry of results.filter((candidate) => candidate.tone === 'onLight' || candidate.density === 'dense')) {
      expect(entry.ratio).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('un glyphe ≥ 3:1 sur plain et deep', () => {
    for (const entry of results.filter((candidate) => candidate.tone === 'plain' || candidate.tone === 'deep')) {
      expect(entry.ratio).toBeGreaterThanOrEqual(3);
    }
  });

  test('plain tient 4,5:1 sur un contenu noir, sa limite haute est la luminance du seuil', () => {
    const plain = results.filter((candidate) => candidate.tone === 'plain');
    expect(plain.every((entry) => entry.passes)).toBe(true);
    expect(plain.some((entry) => entry.ratio >= 4.5)).toBe(true);
  });

  test('chaque couple de la recette est couvert', () => {
    expect(results.map((entry) => `${entry.tone}/${entry.density}`).sort()).toEqual([
      'deep/dense',
      'deep/regular',
      'onLight/dense',
      'onLight/regular',
      'plain/dense',
      'plain/regular',
    ]);
  });
});

describe('MeeshyGlass', () => {
  test('rend sa surface : classes, ton et densité en attributs, aucun fond en ligne', () => {
    const container = mount(
      <MeeshyGlass tone="plain" density="dense">
        <span>contenu</span>
      </MeeshyGlass>,
    );
    const element = surface(container);
    expect(element.tagName).toBe('DIV');
    expect(element.classList.contains('glass-tone')).toBe(true);
    expect(element.getAttribute('data-glass-tone')).toBe('plain');
    expect(element.getAttribute('data-glass-density')).toBe('dense');
    expect(element.getAttribute('style')).toBeNull();
    expect(element.textContent).toBe('contenu');
  });

  test('sans ton, prend celui de l’hôte, deep par défaut', () => {
    const container = mount(
      <div>
        <MeeshyGlass>
          <span>a</span>
        </MeeshyGlass>
        <MeeshyGlassScope tone="onLight">
          <MeeshyGlass>
            <span>b</span>
          </MeeshyGlass>
          <MeeshyGlass tone="plain">
            <span>c</span>
          </MeeshyGlass>
        </MeeshyGlassScope>
      </div>,
    );
    expect(surface(container, 0).getAttribute('data-glass-tone')).toBe('deep');
    expect(container.querySelector('[data-glass-scope]')?.getAttribute('data-glass-tone')).toBe('onLight');
    const tones = [...container.querySelectorAll('.glass-tone')].map((element) => element.getAttribute('data-glass-tone'));
    expect(tones).toEqual(['deep', 'onLight', 'plain']);
  });

  test('ne se touche pas : ni classe de réponse ni état pressé', () => {
    const container = mount(<MeeshyGlass pressed>x</MeeshyGlass>);
    const element = surface(container);
    expect(element.classList.contains('glass-touch')).toBe(false);
    expect(element.hasAttribute('data-pressed')).toBe(false);
  });

  test('se touche : la classe de réponse, et l’état pressé figé pour le catalogue', () => {
    const container = mount(
      <div>
        <MeeshyGlass interactive>repos</MeeshyGlass>
        <MeeshyGlass interactive pressed>
          pressé
        </MeeshyGlass>
      </div>,
    );
    expect(surface(container, 0).classList.contains('glass-touch')).toBe(true);
    expect(surface(container, 0).hasAttribute('data-pressed')).toBe(false);
    expect(surface(container, 1).getAttribute('data-pressed')).toBe('');
  });

  test('une surface posée dans un verre dessiné ne porte pas de seconde matière et garde sa réponse', () => {
    const container = mount(
      <MeeshyGlass tone="deep">
        <MeeshyGlass interactive tint="accent">
          <button type="button">ok</button>
        </MeeshyGlass>
      </MeeshyGlass>,
    );
    const outer = surface(container, 0);
    const inner = surface(container, 1);
    expect(outer.hasAttribute('data-glass-nested')).toBe(false);
    expect(inner.getAttribute('data-glass-nested')).toBe('');
    expect(inner.classList.contains('glass-touch')).toBe(true);
    expect(inner.getAttribute('data-glass-tint')).toBe('accent');
  });

  test('le ton theme posé dans un verre dessiné garde sa matière', () => {
    const container = mount(
      <MeeshyGlass tone="deep">
        <MeeshyGlass tone="theme">x</MeeshyGlass>
      </MeeshyGlass>,
    );
    expect(surface(container, 1).hasAttribute('data-glass-nested')).toBe(false);
  });

  test('le ton d’un verre dessiné descend à ses surfaces, qui n’ont plus de matière à elles', () => {
    const container = mount(
      <MeeshyGlassScope tone="theme">
        <MeeshyGlass tone="deep">
          <MeeshyGlass>x</MeeshyGlass>
        </MeeshyGlass>
      </MeeshyGlassScope>,
    );
    expect(surface(container, 1).getAttribute('data-glass-tone')).toBe('deep');
    expect(surface(container, 1).hasAttribute('data-glass-nested')).toBe(true);
  });

  test('le scope peut poser la matière pleine, comme « réduire la transparence »', () => {
    const container = mount(
      <MeeshyGlassScope tone="deep" opaque>
        <MeeshyGlass>x</MeeshyGlass>
      </MeeshyGlassScope>,
    );
    expect(surface(container).getAttribute('data-glass-material')).toBe('opaque');
  });

  test('le contenu garde son nom accessible, la surface n’ajoute ni rôle ni nom', () => {
    const container = mount(
      <MeeshyGlass as="button" aria-label="Fermer" interactive>
        <svg aria-hidden="true" />
      </MeeshyGlass>,
    );
    const element = surface(container);
    expect(element.tagName).toBe('BUTTON');
    expect(element.getAttribute('aria-label')).toBe('Fermer');
    expect(element.hasAttribute('role')).toBe(false);
    expect(container.querySelector('[data-glass-tone] [role]')).toBeNull();
  });

  test('quand le ton de l’hôte change, la surface suit sans rendre son contenu de nouveau', () => {
    const renders = { count: 0 };
    const control: { setTone: ((tone: MeeshyGlassTone) => void) | null } = { setTone: null };
    function Leaf() {
      renders.count += 1;
      return <span>feuille</span>;
    }
    const leaf = <Leaf />;
    function Host() {
      const [tone, setTone] = useState<MeeshyGlassTone>('deep');
      control.setTone = setTone;
      return (
        <MeeshyGlassScope tone={tone}>
          <MeeshyGlass interactive>{leaf}</MeeshyGlass>
        </MeeshyGlassScope>
      );
    }
    const container = mount(<Host />);
    act(() => control.setTone?.('onLight'));
    expect(surface(container).getAttribute('data-glass-tone')).toBe('onLight');
    expect(renders.count).toBe(1);
  });

  test('la classe de l’appelant s’ajoute à celles du verre', () => {
    const container = mount(<MeeshyGlass className="rounded-full size-11">x</MeeshyGlass>);
    expect(['glass-tone', 'rounded-full', 'size-11'].every((name) => surface(container).classList.contains(name))).toBe(true);
  });

  test('le ton theme pose les classes du verre actuel, la teinte carte ou accent', () => {
    const container = mount(
      <div>
        <MeeshyGlass tone="theme" tint="card">
          x
        </MeeshyGlass>
        <MeeshyGlass tone="theme" tint="accent" density="dense">
          y
        </MeeshyGlass>
      </div>,
    );
    expect(surface(container, 0).getAttribute('data-glass-tint')).toBe('card');
    expect(surface(container, 1).getAttribute('data-glass-tint')).toBe('accent');
    expect(surface(container, 1).getAttribute('data-glass-density')).toBe('dense');
    expect([...surface(container, 0).classList]).toEqual(['glass-tone', 'glass', 'glass-card']);
    expect([...surface(container, 1).classList]).toEqual(['glass-tone', 'glass-prominent', 'glass-accent']);
  });

  test('les tons de la planche ne portent aucune classe du verre des listes', () => {
    const container = mount(
      <MeeshyGlass tone="deep" tint="accent" interactive>
        x
      </MeeshyGlass>,
    );
    expect([...surface(container).classList]).toEqual(['glass-tone', 'glass-touch']);
  });
});

describe('MeeshyGlassGroup', () => {
  test('regroupe ses voisins sans ajouter de matière, de rôle ni de nom', () => {
    const container = mount(
      <MeeshyGlassGroup>
        <MeeshyGlass interactive>a</MeeshyGlass>
        <MeeshyGlass interactive>b</MeeshyGlass>
      </MeeshyGlassGroup>,
    );
    const group = container.querySelector('[data-glass-group]');
    expect(group).not.toBeNull();
    expect(group?.classList.contains('glass-tone')).toBe(false);
    expect(group?.hasAttribute('role')).toBe(false);
    expect([...(group?.children ?? [])].map((child) => child.textContent)).toEqual(['a', 'b']);
  });

  test('dans un groupe posé sur un verre, une seule matière et la réponse au toucher gardée', () => {
    const container = mount(
      <MeeshyGlass tone="deep" density="dense">
        <MeeshyGlassGroup>
          <MeeshyGlass interactive>a</MeeshyGlass>
          <MeeshyGlass interactive>b</MeeshyGlass>
        </MeeshyGlassGroup>
      </MeeshyGlass>,
    );
    const surfaces = [...container.querySelectorAll('.glass-tone')];
    expect(surfaces.filter((element) => !element.hasAttribute('data-glass-nested'))).toHaveLength(1);
    expect(surfaces.filter((element) => element.classList.contains('glass-touch'))).toHaveLength(2);
  });
});
