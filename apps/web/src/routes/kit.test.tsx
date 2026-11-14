import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act, type ReactElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { kitCatalogEntry, kitCatalogState, type MeeshyKitCatalogEntry, type MeeshyKitCatalogState } from '@/components/kit/meeshy-kit-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { KitCatalogScreen } from './kit';

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
  document.documentElement.classList.remove('light');
  document.documentElement.classList.add('dark');
});

const mount = (element: ReactElement): HTMLElement => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(element));
  mounted = { container, root };
  return container;
};

const click = (element: Element | null): void => {
  if (element === null) throw new Error('élément absent');
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  });
};

const ENTRIES: readonly MeeshyKitCatalogEntry[] = [
  kitCatalogEntry({ key: 'K01', name: 'MeeshyGlassTone' }),
  kitCatalogEntry({
    key: 'K02',
    name: 'MeeshyGlassButton',
    states: [
      kitCatalogState({ id: 'repos', boardView: 'R1' }),
      kitCatalogState({ id: 'actif', boardView: 'R3', backdrop: 'media', isTouchable: true }),
    ],
  }),
  kitCatalogEntry({ key: 'K03', name: 'MeeshySegmented', states: [kitCatalogState({ id: 'deux' })] }),
];

const content = (key: string, state: MeeshyKitCatalogState, isPressed: boolean): ReactNode => (
  <button type="button" data-probe={`${key}:${state.id}:${isPressed ? 'presse' : 'vivant'}`}>
    {key}
  </button>
);

describe('le catalogue, la liste', () => {
  test('sans composant livré, la liste dit qu’il n’y en a aucun', () => {
    const container = mount(<KitCatalogScreen entries={[kitCatalogEntry({ key: 'K01', name: 'MeeshyGlassTone' })]} content={content} />);
    expect(container.querySelector('[data-kit-empty]')?.textContent).toBe('Aucun composant livré');
    expect(container.querySelectorAll('[data-kit-row]')).toHaveLength(0);
  });

  test('la liste n’affiche que les composants livrés, dans l’ordre, nommés « clé nom »', () => {
    const container = mount(<KitCatalogScreen entries={ENTRIES} content={content} />);
    const rows = [...container.querySelectorAll<HTMLAnchorElement>('[data-kit-row]')];
    expect(rows.map((row) => row.getAttribute('aria-label'))).toEqual(['K02 MeeshyGlassButton', 'K03 MeeshySegmented']);
    expect(rows.map((row) => row.getAttribute('href'))).toEqual(['/kit/k02', '/kit/k03']);
    expect(container.querySelector('[data-kit-empty]')).toBeNull();
  });

  test('toucher une ligne ouvre le détail', () => {
    const container = mount(<KitCatalogScreen entries={ENTRIES} content={content} />);
    expect(window.location.pathname).toBe('/kit');
    click(container.querySelector('[data-kit-row]'));
    expect(window.location.pathname).toBe('/kit/k02');
    window.history.replaceState(null, '', '/kit');
  });

  test('une clé inconnue ou non livrée laisse la liste', () => {
    const unknown = mount(<KitCatalogScreen composant="k99" entries={ENTRIES} content={content} />);
    expect(unknown.querySelectorAll('[data-kit-row]')).toHaveLength(2);
    const undelivered = mount(<KitCatalogScreen composant="k01" entries={ENTRIES} content={content} />);
    expect(undelivered.querySelectorAll('[data-kit-row]')).toHaveLength(2);
  });
});

describe('le catalogue, le détail', () => {
  test('une tuile par état, la pressée juste après la vivante, légendées par leur id, leur vue et isPressed', () => {
    const container = mount(<KitCatalogScreen composant="K02" entries={ENTRIES} content={content} />);
    const tiles = [...container.querySelectorAll<HTMLElement>('[data-kit-tile]')];
    expect(tiles.map((tile) => tile.getAttribute('data-kit-tile'))).toEqual(['repos', 'actif', 'actif-presse']);
    const headings = tiles.map((tile) => tile.querySelector('h2'));
    expect(headings.map((heading) => heading?.textContent)).toEqual(['repos · R1', 'actif · R3', 'actif · R3 · isPressed']);
    expect(tiles.map((tile) => tile.id)).toEqual(['repos', 'actif', 'actif-presse']);
    expect(tiles.map((tile) => tile.querySelector('[data-probe]')?.getAttribute('data-probe'))).toEqual([
      'K02:repos:vivant',
      'K02:actif:vivant',
      'K02:actif:presse',
    ]);
  });

  test('un état sans vue de la planche n’a pas de légende de vue', () => {
    const container = mount(<KitCatalogScreen composant="k03" entries={ENTRIES} content={content} />);
    expect(container.querySelector('[data-kit-tile="deux"] h2')?.textContent).toBe('deux');
  });

  test('la tuile pressée est figée : ni focus, ni clic', () => {
    const container = mount(<KitCatalogScreen composant="k02" entries={ENTRIES} content={content} />);
    const frozen = container.querySelector<HTMLElement>('[data-kit-tile="actif-presse"] [data-kit-frozen]');
    expect(frozen?.hasAttribute('inert')).toBe(true);
    expect(container.querySelector('[data-kit-tile="actif"] [data-kit-frozen]')).toBeNull();
  });

  test('le fond de l’état est celui que la fiche nomme', () => {
    const container = mount(<KitCatalogScreen composant="k02" entries={ENTRIES} content={content} />);
    const backdrops = [...container.querySelectorAll('[data-kit-stage]')].map((stage) => stage.getAttribute('data-backdrop'));
    expect(backdrops).toEqual(['dark', 'media', 'media']);
  });

  test('l’ancre de l’adresse amène sa tuile à l’écran', () => {
    const scrolled: string[] = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function scrollIntoView(this: Element) {
      scrolled.push(this.id);
    };
    window.history.replaceState(null, '', '/kit/k02#actif-presse');
    try {
      mount(<KitCatalogScreen composant="k02" entries={ENTRIES} content={content} />);
      expect(scrolled).toEqual(['actif-presse']);
    } finally {
      Element.prototype.scrollIntoView = original;
      window.history.replaceState(null, '', '/kit');
    }
  });

  test('sans ancre, le détail ne fait rien défiler', () => {
    const scrolled: string[] = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function scrollIntoView(this: Element) {
      scrolled.push(this.id);
    };
    window.history.replaceState(null, '', '/kit/k02');
    try {
      mount(<KitCatalogScreen composant="k02" entries={ENTRIES} content={content} />);
      expect(scrolled).toEqual([]);
    } finally {
      Element.prototype.scrollIntoView = original;
      window.history.replaceState(null, '', '/kit');
    }
  });

  test('le retour vers la liste est un lien', () => {
    const container = mount(<KitCatalogScreen composant="k02" entries={ENTRIES} content={content} />);
    const back = container.querySelector<HTMLAnchorElement>('[data-kit-back]');
    expect(back?.getAttribute('href')).toBe('/kit');
  });
});

describe('le catalogue, les réglages du détail', () => {
  const setting = (container: HTMLElement, name: string): HTMLInputElement => {
    const control = container.querySelector<HTMLInputElement>(`[data-kit-setting="${name}"]`);
    if (control === null) throw new Error(`réglage ${name} absent`);
    return control;
  };

  test('trois réglages, des cases du système nommées par leur identifiant technique, éteintes à l’ouverture d’un document clair', () => {
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.add('light');
    const container = mount(<KitCatalogScreen composant="k02" entries={ENTRIES} content={content} />);
    const controls = [...container.querySelectorAll<HTMLInputElement>('[data-kit-setting]')];
    expect(controls.map((control) => control.getAttribute('data-kit-setting'))).toEqual(['dark', 'rtl', 'large-font']);
    expect(controls.map((control) => control.closest('label')?.textContent)).toEqual(['dark', 'rtl', 'zoom 2']);
    expect(controls.every((control) => control.type === 'checkbox' && control.getAttribute('role') === 'switch' && !control.checked)).toBe(true);
    expect(container.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('Réglages');
  });

  test('le sombre pose le schéma sur le document et le rend en quittant le détail', () => {
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.add('light');
    const container = mount(<KitCatalogScreen composant="k02" entries={ENTRIES} content={content} />);
    click(setting(container, 'dark'));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('light')).toBe(false);
    expect(setting(container, 'dark').checked).toBe(true);
    act(() => mounted?.root.unmount());
    mounted?.container.remove();
    mounted = null;
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  test('le RTL et la grande police ne touchent que les tuiles', () => {
    const container = mount(<KitCatalogScreen composant="k02" entries={ENTRIES} content={content} />);
    click(setting(container, 'rtl'));
    click(setting(container, 'large-font'));
    const tiles = container.querySelector<HTMLElement>('[data-kit-tiles]');
    expect(tiles?.getAttribute('dir')).toBe('rtl');
    expect(tiles?.style.zoom).toBe('2');
    expect(document.documentElement.getAttribute('dir')).not.toBe('rtl');
  });

  test('un réglage ne re-rend pas les composants des tuiles', () => {
    const calls: string[] = [];
    const counted = (key: string, state: MeeshyKitCatalogState, isPressed: boolean): ReactNode => {
      calls.push(`${state.id}:${isPressed}`);
      return content(key, state, isPressed);
    };
    const container = mount(<KitCatalogScreen composant="k02" entries={ENTRIES} content={counted} />);
    expect(calls).toHaveLength(3);
    click(setting(container, 'rtl'));
    click(setting(container, 'large-font'));
    click(setting(container, 'dark'));
    expect(calls).toHaveLength(3);
  });

  test('ouvrir un autre composant repart des réglages par défaut', () => {
    const container = mount(<KitCatalogScreen composant="k02" entries={ENTRIES} content={content} />);
    click(setting(container, 'rtl'));
    act(() => mounted?.root.render(<KitCatalogScreen composant="k03" entries={ENTRIES} content={content} />));
    expect(container.querySelector('[data-kit-tiles]')?.getAttribute('dir')).toBe('ltr');
    expect(setting(container, 'rtl').checked).toBe(false);
  });

  test('un réglage ne remonte pas jusqu’à la liste', () => {
    const detail = mount(<KitCatalogScreen composant="k02" entries={ENTRIES} content={content} />);
    click(setting(detail, 'rtl'));
    act(() => mounted?.root.unmount());
    mounted?.container.remove();
    mounted = null;
    const list = mount(<KitCatalogScreen entries={ENTRIES} content={content} />);
    expect(list.querySelector('[data-kit-tiles]')).toBeNull();
    expect(list.querySelector('[dir="rtl"]')).toBeNull();
  });
});

describe('le catalogue, accessibilité', () => {
  test('la liste est une navigation, le détail un titre de niveau 1 suivi de titres de niveau 2', () => {
    const list = mount(<KitCatalogScreen entries={ENTRIES} content={content} />);
    expect(list.querySelector('main h1')?.textContent).toBe('Kit');
    expect(list.querySelector('nav[aria-label="Kit"] ul')).not.toBeNull();
    act(() => mounted?.root.unmount());
    mounted?.container.remove();
    mounted = null;
    const detail = mount(<KitCatalogScreen composant="k02" entries={ENTRIES} content={content} />);
    expect(detail.querySelector('main h1')?.textContent).toBe('K02 MeeshyGlassButton');
    expect(detail.querySelectorAll('main h2')).toHaveLength(3);
  });

  test('chaque ligne et chaque réglage tient dans une cible de 44 px', () => {
    const container = mount(<KitCatalogScreen entries={ENTRIES} content={content} />);
    const rows = [...container.querySelectorAll<HTMLElement>('[data-kit-row]')];
    expect(rows.every((row) => row.style.minBlockSize === '44px')).toBe(true);
    act(() => mounted?.root.unmount());
    mounted?.container.remove();
    mounted = null;
    const detail = mount(<KitCatalogScreen composant="k02" entries={ENTRIES} content={content} />);
    const labels = [...detail.querySelectorAll<HTMLInputElement>('[data-kit-setting]')].map((control) => control.closest('label'));
    expect(labels).toHaveLength(3);
    expect(labels.every((label) => label?.style.minBlockSize === '44px')).toBe(true);
    expect(detail.querySelector<HTMLElement>('[data-kit-back]')?.style.minBlockSize).toBe('44px');
  });

  test('au clavier, Tab atteint chaque ligne et la tuile pressée ne prend pas le focus', () => {
    const list = mount(<KitCatalogScreen entries={ENTRIES} content={content} />);
    const rows = [...list.querySelectorAll<HTMLAnchorElement>('[data-kit-row]')];
    expect(rows.every((row) => row.tagName === 'A' && row.tabIndex >= 0)).toBe(true);
    act(() => mounted?.root.unmount());
    mounted?.container.remove();
    mounted = null;
    const detail = mount(<KitCatalogScreen composant="k02" entries={ENTRIES} content={content} />);
    expect(detail.querySelector('[data-kit-tile="actif-presse"] [inert] [data-probe]')).not.toBeNull();
    expect(detail.querySelector('[data-kit-tile="actif"] [inert]')).toBeNull();
  });
});
