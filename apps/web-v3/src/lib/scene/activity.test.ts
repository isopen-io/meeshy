import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { SCROLL_ACTIVITY_LINGER_MS } from '@meeshy/shared/utils/scroll-activity';

import { initialState, isArmed, isRevealed, isSceneActive, flatten, reduce, type SceneEvent } from './activity';

/**
 * LES VECTEURS PARTAGÉS DU RÉVÉLÉ — la loi de `SCROLL_ACTIVITY_LINGER_MS`
 * (`@meeshy/shared/utils/scroll-activity`) est REJOUÉE, jamais réécrite
 * (spécification #5648 §4.2). Les vecteurs `{type:'tick', at}` sont, dans le
 * réducteur PARTAGÉ, des no-op sur `lastScrolledAt` — `sceneActivity.reduce`
 * n'a pas besoin de les rejouer un par un pour prouver `isRevealed` : il
 * délègue directement à `scrollActivityLaw.isVisible` via `reveal`, rejoué
 * ici en composant l'état à partir des seuls `scrolled`.
 */
const VECTORS_PATH = fileURLToPath(
  new URL('../../../../../packages/shared/fixtures/reading-modes/scroll-activity.vectors.json', import.meta.url),
);
type Vector = {
  readonly _label: string;
  readonly input: { readonly events: readonly { readonly type: string; readonly at: number }[]; readonly probeAt: number };
  readonly expected: { readonly visible: boolean };
};
const vectors = JSON.parse(readFileSync(VECTORS_PATH, 'utf8')) as readonly Vector[];

const replay = (events: readonly { readonly type: string; readonly at: number }[]) =>
  events.reduce((state, event) => {
    if (event.type === 'scrolled') {
      return reduce(reduce(state, { type: 'intent', at: event.at }, { mode: 'focal' }), { type: 'scrolled', at: event.at, y: 0 }, { mode: 'focal' });
    }
    return reduce(state, { type: 'tick', at: event.at }, { mode: 'focal' });
  }, initialState());

describe('sceneActivity — le revele (vecteurs partages @meeshy/shared)', () => {
  test(`SCROLL_ACTIVITY_LINGER_MS vaut 900 (borne des vecteurs)`, () => {
    expect(SCROLL_ACTIVITY_LINGER_MS).toBe(900);
  });

  for (const vector of vectors) {
    test(`${vector._label}`, () => {
      const state = replay(vector.input.events);
      expect(isRevealed(state, vector.input.probeAt)).toBe(vector.expected.visible);
    });
  }
});

describe('sceneActivity — intention (defilement programme ignore)', () => {
  test('un "scrolled" SANS intention prealable laisse l etat inchange', () => {
    const state = initialState();
    const next = reduce(state, { type: 'scrolled', at: 100, y: 10 }, { mode: 'focal' });
    expect(next).toBe(state);
    expect(isRevealed(next, 100)).toBe(false);
  });

  test('apres "intent", les "scrolled" comptent', () => {
    let state = initialState();
    state = reduce(state, { type: 'intent', at: 0 }, { mode: 'focal' });
    state = reduce(state, { type: 'scrolled', at: 0, y: 0 }, { mode: 'focal' });
    expect(isRevealed(state, 0)).toBe(true);
  });

  test('"programmatic" ferme l intention jusqu au prochain "intent"', () => {
    let state = initialState();
    state = reduce(state, { type: 'intent', at: 0 }, { mode: 'focal' });
    state = reduce(state, { type: 'programmatic' }, { mode: 'focal' });
    const afterProgrammed = reduce(state, { type: 'scrolled', at: 10, y: 10 }, { mode: 'focal' });
    expect(isRevealed(afterProgrammed, 10)).toBe(false);

    state = reduce(afterProgrammed, { type: 'intent', at: 20 }, { mode: 'focal' });
    state = reduce(state, { type: 'scrolled', at: 20, y: 20 }, { mode: 'focal' });
    expect(isRevealed(state, 20)).toBe(true);
  });
});

describe('sceneActivity — session (fin de geste = fin de fenetre de revele)', () => {
  test('scrollStartedAt est pose au premier "scrolled" compte', () => {
    let state = initialState();
    state = reduce(state, { type: 'intent', at: 100 }, { mode: 'focal' });
    state = reduce(state, { type: 'scrolled', at: 100, y: 0 }, { mode: 'focal' });
    expect(state.scrollStartedAt).toBe(100);
  });

  test('un "tick" a last+900 referme la session, "armed" survit', () => {
    let state = initialState();
    state = reduce(state, { type: 'intent', at: 0 }, { mode: 'focal' });
    // Deux ticks a 100ms d'ecart, vitesse 1200 px/s -> armee.
    state = reduce(state, { type: 'scrolled', at: 0, y: 0 }, { mode: 'focal' });
    state = reduce(state, { type: 'scrolled', at: 100, y: 120 }, { mode: 'focal' });
    expect(isArmed(state)).toBe(true);
    expect(state.scrollStartedAt).not.toBeNull();

    const afterWindow = reduce(state, { type: 'tick', at: 100 + 900 }, { mode: 'focal' });
    expect(afterWindow.scrollStartedAt).toBeNull();
    expect(afterWindow.lastY).toBeNull();
    expect(afterWindow.lastAt).toBeNull();
    expect(isArmed(afterWindow)).toBe(true);
  });

  test('la fin de la fenetre referme AUSSI l intention (fin de geste = fin de session)', () => {
    let state = initialState();
    state = reduce(state, { type: 'intent', at: 0 }, { mode: 'focal' });
    state = reduce(state, { type: 'scrolled', at: 0, y: 0 }, { mode: 'focal' });
    expect(state.intent).toBe(true);

    const closed = reduce(state, { type: 'tick', at: 900 }, { mode: 'focal' });
    expect(closed.intent).toBe(false);

    // Un defilement PROGRAMME qui suit ne compte plus : sans intention
    // rouverte, le reducteur rend l etat inchange.
    const programmed = reduce(closed, { type: 'scrolled', at: 1000, y: 400 }, { mode: 'focal' });
    expect(programmed).toBe(closed);
    expect(isRevealed(programmed, 1000)).toBe(false);
  });

  test('un "tick" pendant la fenetre ne referme rien', () => {
    let state = initialState();
    state = reduce(state, { type: 'intent', at: 0 }, { mode: 'focal' });
    state = reduce(state, { type: 'scrolled', at: 0, y: 0 }, { mode: 'focal' });
    const ticked = reduce(state, { type: 'tick', at: 500 }, { mode: 'focal' });
    expect(ticked.scrollStartedAt).toBe(0);
  });
});

describe('sceneActivity — armement (Focal seul)', () => {
  test('mode "script" -> jamais armee, meme a grande vitesse et longue duree', () => {
    let state = initialState();
    let at = 0;
    let y = 0;
    state = reduce(state, { type: 'intent', at }, { mode: 'script' });
    for (let i = 0; i < 100; i += 1) {
      at += 100;
      y += 500; // 5000 px/s
      state = reduce(state, { type: 'scrolled', at, y }, { mode: 'script' });
    }
    expect(isArmed(state)).toBe(false);
  });

  test('mode "focal", deux ticks a 120px/100ms (1200 px/s) -> armee', () => {
    let state = initialState();
    state = reduce(state, { type: 'intent', at: 0 }, { mode: 'focal' });
    state = reduce(state, { type: 'scrolled', at: 0, y: 0 }, { mode: 'focal' });
    state = reduce(state, { type: 'scrolled', at: 100, y: 120 }, { mode: 'focal' });
    expect(isArmed(state)).toBe(true);
  });

  test('defilement lent et soutenu -> armee EXACTEMENT a 4000ms, pas avant', () => {
    let state = initialState();
    state = reduce(state, { type: 'intent', at: 0 }, { mode: 'focal' });
    for (let at = 0; at <= 3900; at += 100) {
      state = reduce(state, { type: 'scrolled', at, y: at / 100 }, { mode: 'focal' });
    }
    expect(isArmed(state)).toBe(false);
    state = reduce(state, { type: 'scrolled', at: 4000, y: 40 }, { mode: 'focal' });
    expect(isArmed(state)).toBe(true);
  });
});

describe('sceneActivity — scene et aplatissement', () => {
  test('isSceneActive : armee, dans la fenetre de repos (4,5s)', () => {
    let state = initialState();
    state = reduce(state, { type: 'intent', at: 0 }, { mode: 'focal' });
    state = reduce(state, { type: 'scrolled', at: 0, y: 0 }, { mode: 'focal' });
    state = reduce(state, { type: 'scrolled', at: 100, y: 120 }, { mode: 'focal' });
    expect(isSceneActive(state, 100 + 4499)).toBe(true);
    expect(isSceneActive(state, 100 + 4500)).toBe(false);
  });

  test('flatten() desarme et referme la session', () => {
    let state = initialState();
    state = reduce(state, { type: 'intent', at: 0 }, { mode: 'focal' });
    state = reduce(state, { type: 'scrolled', at: 0, y: 0 }, { mode: 'focal' });
    state = reduce(state, { type: 'scrolled', at: 100, y: 120 }, { mode: 'focal' });
    const flat = flatten(state);
    expect(flat.armed).toBe(false);
    expect(flat.scrollStartedAt).toBeNull();
  });

  test('l evenement "flatten" produit le meme resultat que flatten()', () => {
    let state = initialState();
    state = reduce(state, { type: 'intent', at: 0 }, { mode: 'focal' });
    state = reduce(state, { type: 'scrolled', at: 0, y: 0 }, { mode: 'focal' });
    state = reduce(state, { type: 'scrolled', at: 100, y: 120 }, { mode: 'focal' });
    expect(reduce(state, { type: 'flatten' }, { mode: 'focal' })).toEqual(flatten(state));
  });

  test('fil vide (etat initial) : rien n est actif ni revele', () => {
    const state = initialState();
    expect(isRevealed(state, 0)).toBe(false);
    expect(isArmed(state)).toBe(false);
    expect(isSceneActive(state, 0)).toBe(false);
  });
});

describe('sceneActivity — reduced motion n est PAS une entree de la loi', () => {
  test('l etat ne porte aucun champ "reducedMotion"', () => {
    const state = initialState();
    expect(Object.keys(state)).not.toContain('reducedMotion');
    const scrolled: SceneEvent = { type: 'scrolled', at: 0, y: 0 };
    expect('reducedMotion' in scrolled).toBe(false);
  });
});
