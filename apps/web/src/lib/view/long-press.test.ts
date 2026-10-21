import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { installHapticsDriver, type HapticCue } from './haptics';
import { LONG_PRESS_MAX_DISTANCE_PX, LONG_PRESS_MS, PRESS_RETURN_MS, pressReducer, useLongPress, type PressState } from './long-press';

const at = (state: PressState, ...events: Parameters<typeof pressReducer>[1][]): PressState =>
  events.reduce((s, e) => pressReducer(s, e), state);

describe('pressReducer — machine PURE du geste d’ouverture (#5814)', () => {
  test('constantes : 350 ms, 6 px — la parité iOS, MessageListView.swift:348 (#11207)', () => {
    expect(LONG_PRESS_MS).toBe(350);
    expect(LONG_PRESS_MAX_DISTANCE_PX).toBe(6);
  });

  test('down puis tick sous le seuil ⇒ reste pressing (pas encore ouvert)', () => {
    const state = at({ phase: 'idle' }, { type: 'down', x: 0, y: 0, at: 0 }, { type: 'tick', elapsedMs: 349 });
    expect(state.phase).toBe('pressing');
  });

  test('tick au seuil (350) ⇒ open', () => {
    const state = at({ phase: 'idle' }, { type: 'down', x: 0, y: 0, at: 0 }, { type: 'tick', elapsedMs: 350 });
    expect(state).toEqual({ phase: 'open' });
  });

  test('move de 7 px avant le seuil ⇒ cancelled, jamais open même si le temps continue', () => {
    const state = at(
      { phase: 'idle' },
      { type: 'down', x: 0, y: 0, at: 0 },
      { type: 'move', x: 7, y: 0 },
      { type: 'tick', elapsedMs: LONG_PRESS_MS },
    );
    expect(state).toEqual({ phase: 'cancelled' });
  });

  test('move de 6 px exactement ⇒ ne cancel PAS (au bord, pas au-delà)', () => {
    const state = at({ phase: 'idle' }, { type: 'down', x: 0, y: 0, at: 0 }, { type: 'move', x: 6, y: 0 });
    expect(state.phase).toBe('pressing');
  });

  test('cancel explicite ⇒ cancelled', () => {
    expect(pressReducer({ phase: 'pressing', x: 0, y: 0, at: 0 }, { type: 'cancel' })).toEqual({ phase: 'cancelled' });
  });

  test('up avant le seuil ⇒ idle, sans ouverture', () => {
    const state = at({ phase: 'idle' }, { type: 'down', x: 0, y: 0, at: 0 }, { type: 'up' });
    expect(state).toEqual({ phase: 'idle' });
  });

  test('up en dehors de pressing (déjà open) ne change rien', () => {
    expect(pressReducer({ phase: 'open' }, { type: 'up' })).toEqual({ phase: 'open' });
  });
});

/**
 * LE RETOUR PENDANT L'ATTENTE ET À L'OUVERTURE (#11207). Pendant les 350 ms,
 * la rangée porte `data-pressing` (la feuille `press-feedback.css` la presse
 * à 0,97) ; à l'ouverture, UNE vibration `medium` — jamais une par rendu,
 * jamais une à l'annulation.
 */
describe('useLongPress — la pression se voit, l’ouverture se sent', () => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const mounted: { root: Root; host: HTMLElement }[] = [];

  beforeAll(() => {
    ensureHappyDomRegistered();
    globals.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    for (const { root, host } of mounted.splice(0)) {
      act(() => root.unmount());
      host.remove();
    }
    installHapticsDriver(null);
  });

  afterAll(async () => {
    await act(async () => {});
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await releaseHappyDomIfRegistered();
  });

  type RowOptions = {
    readonly opens?: boolean;
    readonly enabled?: boolean;
    readonly pressFeedback?: boolean;
  };

  const Row = ({ onOpen, enabled, pressFeedback }: RowOptions & { readonly onOpen: () => boolean | void }) => {
    const press = useLongPress({
      onOpen,
      ...(enabled === undefined ? {} : { enabled }),
      ...(pressFeedback === undefined ? {} : { pressFeedback }),
    });
    return createElement('div', { 'data-testid': 'row', ...press }, 'rangée');
  };

  const mount = (options: RowOptions = {}) => {
    const cues: HapticCue[] = [];
    installHapticsDriver({ cue: (name) => (cues.push(name), true), pattern: () => true });
    const opened: number[] = [];
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    mounted.push({ root, host });
    const onOpen = (): boolean | void => {
      opened.push(Date.now());
      if (options.opens === false) return false;
    };
    act(() => root.render(createElement(Row, { ...options, onOpen })));
    const row = host.querySelector<HTMLElement>('[data-testid="row"]');
    if (row === null) throw new Error('rangée absente');
    return { row, cues, opened };
  };

  const pointer = (row: HTMLElement, type: string, x = 10, y = 10) =>
    act(() => {
      row.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y }));
    });

  const wait = (ms: number) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  test('data-pressing est posé au pointerdown, retiré à l’ouverture ; une seule vibration medium', async () => {
    const { row, cues, opened } = mount();
    pointer(row, 'pointerdown');
    expect(row.hasAttribute('data-pressing')).toBe(true);
    expect(cues).toEqual([]);
    await wait(LONG_PRESS_MS + 40);
    expect(opened.length).toBe(1);
    expect(row.hasAttribute('data-pressing')).toBe(false);
    pointer(row, 'pointerup');
    expect(cues).toEqual(['medium']);
  });

  test('relâcher avant le seuil retire data-pressing, n’ouvre rien, ne vibre pas', async () => {
    const { row, cues, opened } = mount();
    pointer(row, 'pointerdown');
    await wait(LONG_PRESS_MS / 2);
    pointer(row, 'pointerup');
    expect(row.hasAttribute('data-pressing')).toBe(false);
    await wait(LONG_PRESS_MS);
    expect(opened).toEqual([]);
    expect(cues).toEqual([]);
  });

  test('glisser au-delà de la tolérance annule : data-pressing retiré, aucune vibration', async () => {
    const { row, cues, opened } = mount();
    pointer(row, 'pointerdown', 0, 0);
    pointer(row, 'pointermove', LONG_PRESS_MAX_DISTANCE_PX + 1, 0);
    expect(row.hasAttribute('data-pressing')).toBe(false);
    await wait(LONG_PRESS_MS + 40);
    expect(opened).toEqual([]);
    expect(cues).toEqual([]);
  });

  test('Android : le contextmenu émis pendant la tenue n’ouvre pas une seconde fois, ne vibre pas deux fois', async () => {
    const { row, cues, opened } = mount();
    pointer(row, 'pointerdown');
    await wait(LONG_PRESS_MS + 40);
    pointer(row, 'pointercancel');
    act(() => {
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 0 }));
    });
    expect(opened.length).toBe(1);
    expect(cues).toEqual(['medium']);
  });

  test('Android : le contextmenu de la tenue qui tombe sur le VOILE (hors de la rangée) est avalé — la WebView n’ouvre pas son menu', async () => {
    const { row, opened } = mount();
    const veil = document.createElement('div');
    document.body.append(veil);
    pointer(row, 'pointerdown');
    await wait(LONG_PRESS_MS + 40);
    const held = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 0 });
    act(() => {
      veil.dispatchEvent(held);
    });
    expect(held.defaultPrevented).toBe(true);
    expect(opened.length).toBe(1);
    act(() => {
      document.body.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }));
    });
    const later = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
    act(() => {
      veil.dispatchEvent(later);
    });
    expect(later.defaultPrevented).toBe(false);
    veil.remove();
  });

  test('après un appui long RELÂCHÉ (sur le voile du menu), un clic droit rouvre — rien ne reste avalé', async () => {
    const { row, cues, opened } = mount();
    pointer(row, 'pointerdown');
    await wait(LONG_PRESS_MS + 40);
    act(() => {
      document.body.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }));
    });
    act(() => {
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
    });
    expect(opened.length).toBe(2);
    expect(cues).toEqual(['medium', 'medium']);
  });

  test('un clic droit (hors de toute tenue) ouvre, et vibre une fois', () => {
    const { row, cues, opened } = mount();
    act(() => {
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
    });
    expect(opened.length).toBe(1);
    expect(cues).toEqual(['medium']);
  });

  test('pointercancel (le défilement prend la main) retire data-pressing', () => {
    const { row } = mount();
    pointer(row, 'pointerdown');
    pointer(row, 'pointercancel');
    expect(row.hasAttribute('data-pressing')).toBe(false);
  });

  /**
   * LE RETOUR À LA TAILLE SE VOIT AUSSI (revue #11207). La transition de
   * retour vit sur `data-press-host`, qui reste posé après un relâcher ou une
   * annulation : un toucher ordinaire ne fait plus sauter la rangée, puis
   * tombe une fois le retour joué (il ne garde pas la main sur les
   * transitions propres de l'élément). À
   * l'OUVERTURE, les deux tombent ensemble — l'ancre se mesure à taille
   * réelle, sans transition en cours.
   */
  test('relâcher ou annuler garde data-press-host (retour animé) ; ouvrir retire les deux (ancre nette)', async () => {
    const { row } = mount();
    pointer(row, 'pointerdown');
    expect(row.hasAttribute('data-press-host')).toBe(true);
    pointer(row, 'pointerup');
    expect(row.hasAttribute('data-pressing')).toBe(false);
    expect(row.hasAttribute('data-press-host')).toBe(true);
    pointer(row, 'pointerdown');
    pointer(row, 'pointercancel');
    expect(row.hasAttribute('data-press-host')).toBe(true);
    await wait(PRESS_RETURN_MS + 40);
    expect(row.hasAttribute('data-press-host')).toBe(false);
    pointer(row, 'pointerdown');
    await wait(LONG_PRESS_MS + 40);
    expect(row.hasAttribute('data-pressing')).toBe(false);
    expect(row.hasAttribute('data-press-host')).toBe(false);
  });

  test('un hôte sans boîte (display: contents, l’avatar) presse son premier enfant — scale n’agit pas sans boîte', async () => {
    const ContentsHost = () => {
      const press = useLongPress({ onOpen: () => {} });
      return createElement(
        'span',
        { 'data-testid': 'host', style: { display: 'contents' }, ...press },
        createElement('span', { 'data-testid': 'face' }, 'A'),
      );
    };
    installHapticsDriver({ cue: () => true, pattern: () => true });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    mounted.push({ root, host });
    act(() => root.render(createElement(ContentsHost)));
    const gestureHost = host.querySelector<HTMLElement>('[data-testid="host"]');
    const face = host.querySelector<HTMLElement>('[data-testid="face"]');
    if (gestureHost === null || face === null) throw new Error('avatar absent');
    pointer(face, 'pointerdown');
    expect(face.hasAttribute('data-pressing')).toBe(true);
    expect(gestureHost.hasAttribute('data-pressing')).toBe(false);
    pointer(face, 'pointerup');
    expect(face.hasAttribute('data-pressing')).toBe(false);
  });

  test('pressFeedback: false — aucun attribut de pression, mais le geste ouvre et vibre', async () => {
    const { row, cues, opened } = mount({ pressFeedback: false });
    pointer(row, 'pointerdown');
    expect(row.hasAttribute('data-pressing')).toBe(false);
    expect(row.hasAttribute('data-press-host')).toBe(false);
    await wait(LONG_PRESS_MS + 40);
    expect(opened.length).toBe(1);
    expect(cues).toEqual(['medium']);
  });

  /** UN GESTE QUI N'OUVRE RIEN NE SE SENT PAS (loi 4, revue #11207). */
  test('onOpen qui rend false (rien ne s’est ouvert) ⇒ aucune vibration', async () => {
    const { row, cues, opened } = mount({ opens: false });
    pointer(row, 'pointerdown');
    await wait(LONG_PRESS_MS + 40);
    expect(opened.length).toBe(1);
    expect(cues).toEqual([]);
    act(() => {
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
    });
    expect(cues).toEqual([]);
  });

  test('enabled: false (mode sélection) ⇒ ni pression, ni ouverture, ni vibration — le menu natif reste coupé', async () => {
    const { row, cues, opened } = mount({ enabled: false });
    pointer(row, 'pointerdown');
    expect(row.hasAttribute('data-pressing')).toBe(false);
    await wait(LONG_PRESS_MS + 40);
    pointer(row, 'pointerup');
    const context = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
    act(() => {
      row.dispatchEvent(context);
    });
    act(() => {
      row.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ContextMenu' }));
    });
    expect(context.defaultPrevented).toBe(true);
    expect(opened).toEqual([]);
    expect(cues).toEqual([]);
  });
});
