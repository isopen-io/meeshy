import { describe, expect, test } from 'bun:test';

import { KEYBOARD_ATTRIBUTE, KEYBOARD_INSET_VAR, installKeyboardViewport, type KeyboardViewportHost } from './keyboard-viewport';

/**
 * LE COMPOSEUR COLLÉ AU CLAVIER, SUR LES TROIS NAVIGATEURS MOBILES (#10005,
 * note « plat » de la planche).
 *
 * Safari et Chrome iOS ignorent `interactive-widget=resizes-content` : le
 * clavier RECOUVRE la page au lieu de la réduire. Une racine `h-dvh` garde sa
 * hauteur, Safari fait glisser la page pour montrer le champ, l'en-tête part
 * en haut et le fil se met à défiler en entier. La hauteur du clavier se lit
 * au `visualViewport` ; elle est posée UNE fois, sur `<html>`, pour toute
 * l'application : `--keyboard-inset` (ce qu'il recouvre) et
 * `data-keyboard="open"` (il est ouvert — Chrome Android et la coque, qui
 * réduisent la vue, n'ont rien à soustraire mais n'ont plus d'indicateur home
 * sous le composeur).
 */

type Listener = () => void;

function fakeHost({
  innerHeight = 844,
  width = 390,
  height = 844,
  offsetTop = 0,
  scale = 1,
  scrollHeight = 844,
  withViewport = true,
}: {
  readonly innerHeight?: number;
  readonly width?: number;
  readonly height?: number;
  readonly offsetTop?: number;
  readonly scale?: number;
  readonly scrollHeight?: number;
  readonly withViewport?: boolean;
} = {}) {
  const listeners = new Map<string, Set<Listener>>();
  const properties = new Map<string, string>();
  const attributes = new Map<string, string>();
  const scrolls: Array<readonly [number, number]> = [];
  const viewport = { width, height, offsetTop, scale };
  const state = { innerHeight, scrollY: 0, scrollHeight };
  const host: KeyboardViewportHost = {
    get innerHeight() {
      return state.innerHeight;
    },
    get scrollY() {
      return state.scrollY;
    },
    scrollTo: (x: number, y: number) => {
      scrolls.push([x, y]);
      state.scrollY = y;
      viewport.offsetTop = 0;
    },
    visualViewport: withViewport
      ? {
          get width() {
            return viewport.width;
          },
          get height() {
            return viewport.height;
          },
          get offsetTop() {
            return viewport.offsetTop;
          },
          get scale() {
            return viewport.scale;
          },
          addEventListener: (type: string, listener: Listener) => {
            const set = listeners.get(type) ?? new Set<Listener>();
            set.add(listener);
            listeners.set(type, set);
          },
          removeEventListener: (type: string, listener: Listener) => {
            listeners.get(type)?.delete(listener);
          },
        }
      : null,
    document: {
      documentElement: {
        get scrollHeight() {
          return state.scrollHeight;
        },
        style: {
          setProperty: (name: string, value: string) => {
            properties.set(name, value);
          },
          removeProperty: (name: string) => {
            properties.delete(name);
            return '';
          },
        },
        setAttribute: (name: string, value: string) => {
          attributes.set(name, value);
        },
        removeAttribute: (name: string) => {
          attributes.delete(name);
        },
      },
    },
  };
  const fire = (type: string) => listeners.get(type)?.forEach((listener) => listener());
  const listenerCount = () => [...listeners.values()].reduce((total, set) => total + set.size, 0);
  return { host, viewport, state, properties, attributes, scrolls, fire, listenerCount };
}

describe('installKeyboardViewport — le clavier lu au visualViewport (#10005)', () => {
  test('clavier fermé : rien n’est posé sur <html>', () => {
    const fake = fakeHost();
    installKeyboardViewport(fake.host);
    expect(fake.properties.has(KEYBOARD_INSET_VAR)).toBe(false);
    expect(fake.attributes.has(KEYBOARD_ATTRIBUTE)).toBe(false);
  });

  test('Safari iOS : le clavier recouvre, sa hauteur est posée et l’attribut ouvert', () => {
    const fake = fakeHost();
    installKeyboardViewport(fake.host);
    fake.viewport.height = 508;
    fake.fire('resize');
    expect(fake.properties.get(KEYBOARD_INSET_VAR)).toBe('336px');
    expect(fake.attributes.get(KEYBOARD_ATTRIBUTE)).toBe('open');
  });

  test('Safari iOS a fait glisser un écran d’application : la page revient en haut, le clavier entier est soustrait', () => {
    const fake = fakeHost();
    installKeyboardViewport(fake.host);
    fake.viewport.height = 508;
    fake.viewport.offsetTop = 200;
    fake.fire('resize');
    expect(fake.scrolls).toEqual([[0, 0]]);
    expect(fake.properties.get(KEYBOARD_INSET_VAR)).toBe('336px');
  });

  test('une PAGE qui défile (la landing) garde sa position : seul l’écran d’application est ramené', () => {
    const fake = fakeHost({ scrollHeight: 2400 });
    installKeyboardViewport(fake.host);
    fake.viewport.height = 508;
    fake.viewport.offsetTop = 200;
    fake.fire('resize');
    expect(fake.scrolls).toEqual([]);
  });

  test('Chrome Android et la coque réduisent la vue : rien à soustraire, mais le clavier est ouvert', () => {
    const fake = fakeHost();
    installKeyboardViewport(fake.host);
    fake.state.innerHeight = 508;
    fake.viewport.height = 508;
    fake.fire('resize');
    expect(fake.properties.has(KEYBOARD_INSET_VAR)).toBe(false);
    expect(fake.attributes.get(KEYBOARD_ATTRIBUTE)).toBe('open');
  });

  test('la barre d’adresse qui se replie n’est pas un clavier', () => {
    const fake = fakeHost({ innerHeight: 760, height: 760 });
    installKeyboardViewport(fake.host);
    fake.state.innerHeight = 844;
    fake.viewport.height = 844;
    fake.fire('resize');
    fake.viewport.height = 790;
    fake.fire('resize');
    expect(fake.attributes.has(KEYBOARD_ATTRIBUTE)).toBe(false);
  });

  test('le zoom au pincement n’est pas un clavier : rien n’est posé, la page zoomée n’est pas ramenée', () => {
    const fake = fakeHost();
    installKeyboardViewport(fake.host);
    fake.viewport.scale = 2;
    fake.viewport.height = 422;
    fake.viewport.offsetTop = 300;
    fake.fire('resize');
    fake.fire('scroll');
    expect(fake.scrolls).toEqual([]);
    expect(fake.properties.has(KEYBOARD_INSET_VAR)).toBe(false);
    expect(fake.attributes.has(KEYBOARD_ATTRIBUTE)).toBe(false);
  });

  test('le clavier qui se retire efface tout', () => {
    const fake = fakeHost();
    installKeyboardViewport(fake.host);
    fake.viewport.height = 508;
    fake.fire('resize');
    fake.viewport.height = 844;
    fake.fire('resize');
    expect(fake.properties.has(KEYBOARD_INSET_VAR)).toBe(false);
    expect(fake.attributes.has(KEYBOARD_ATTRIBUTE)).toBe(false);
  });

  test('sans visualViewport (vieux navigateur), l’installation ne fait rien et ne lève pas', () => {
    const fake = fakeHost({ withViewport: false });
    expect(() => installKeyboardViewport(fake.host)()).not.toThrow();
    expect(fake.attributes.size).toBe(0);
  });

  test('désinstaller retire les écouteurs et ce qui était posé', () => {
    const fake = fakeHost();
    const uninstall = installKeyboardViewport(fake.host);
    fake.viewport.height = 508;
    fake.fire('resize');
    uninstall();
    expect(fake.listenerCount()).toBe(0);
    expect(fake.properties.has(KEYBOARD_INSET_VAR)).toBe(false);
    expect(fake.attributes.has(KEYBOARD_ATTRIBUTE)).toBe(false);
  });
});
