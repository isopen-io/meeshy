import { describe, expect, test } from 'bun:test';

import { LONG_PRESS_MAX_DISTANCE_PX, LONG_PRESS_MS, pressReducer, type PressState } from './long-press';

const at = (state: PressState, ...events: Parameters<typeof pressReducer>[1][]): PressState =>
  events.reduce((s, e) => pressReducer(s, e), state);

describe('pressReducer — machine PURE du geste d’ouverture (#5814)', () => {
  test('constantes : 500 ms, 6 px — miroir MessageListView.swift:348', () => {
    expect(LONG_PRESS_MS).toBe(500);
    expect(LONG_PRESS_MAX_DISTANCE_PX).toBe(6);
  });

  test('down puis tick sous le seuil ⇒ reste pressing (pas encore ouvert)', () => {
    const state = at({ phase: 'idle' }, { type: 'down', x: 0, y: 0, at: 0 }, { type: 'tick', elapsedMs: 499 });
    expect(state.phase).toBe('pressing');
  });

  test('tick au seuil (500) ⇒ open', () => {
    const state = at({ phase: 'idle' }, { type: 'down', x: 0, y: 0, at: 0 }, { type: 'tick', elapsedMs: 500 });
    expect(state).toEqual({ phase: 'open' });
  });

  test('move de 7 px avant 500 ms ⇒ cancelled, jamais open même si le temps continue', () => {
    const state = at(
      { phase: 'idle' },
      { type: 'down', x: 0, y: 0, at: 0 },
      { type: 'move', x: 7, y: 0 },
      { type: 'tick', elapsedMs: 500 },
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

  test('up avant 500 ms ⇒ idle, sans ouverture', () => {
    const state = at({ phase: 'idle' }, { type: 'down', x: 0, y: 0, at: 0 }, { type: 'up' });
    expect(state).toEqual({ phase: 'idle' });
  });

  test('up en dehors de pressing (déjà open) ne change rien', () => {
    expect(pressReducer({ phase: 'open' }, { type: 'up' })).toEqual({ phase: 'open' });
  });
});
