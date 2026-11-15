import { describe, expect, test } from 'bun:test';

import {
  DOUBLE_TAP_GAP_MS,
  DOUBLE_TAP_SLOP_PX,
  IDLE_TAP,
  nextTapDeadline,
  tapReducer,
  type TapEffect,
  type TapEvent,
  type TapState,
} from './double-tap';
import { LONG_PRESS_MS } from './long-press';

const run = (events: readonly TapEvent[], from: TapState = IDLE_TAP): { state: TapState; effects: TapEffect[] } =>
  events.reduce<{ state: TapState; effects: TapEffect[] }>(
    (acc, event) => {
      const next = tapReducer(acc.state, event);
      return { state: next.state, effects: [...acc.effects, ...next.effects] };
    },
    { state: from, effects: [] },
  );

const down = (at: number, x = 100, y = 100): TapEvent => ({ type: 'down', at, x, y });
const click = (at: number, kind: 'plain' | 'media' | 'control' = 'plain', x = 100, y = 100, messageId = 'm-1'): TapEvent => ({
  type: 'click',
  at,
  x,
  y,
  kind,
  messageId,
});

describe('tapReducer — le double toucher d’un message (#10599)', () => {
  test('deux touchers rapprochés sur le texte ⇒ double, le premier passe sans attendre', () => {
    const { effects, state } = run([down(0), click(80), down(180), click(250)]);
    expect(effects).toEqual(['pass', 'double']);
    expect(state).toEqual(IDLE_TAP);
  });

  test('un toucher seul sur un média est RETENU, puis rendu à l’échéance', () => {
    const { effects } = run([down(0), click(80, 'media'), { type: 'expire', at: 80 + DOUBLE_TAP_GAP_MS }]);
    expect(effects).toEqual(['hold', 'release']);
  });

  test('l’échéance n’a pas sonné avant la fenêtre : rien ne part', () => {
    const { effects } = run([down(0), click(80, 'media'), { type: 'expire', at: 80 + DOUBLE_TAP_GAP_MS - 1 }]);
    expect(effects).toEqual(['hold']);
  });

  test('double toucher sur un média ⇒ double, et la visionneuse ne s’ouvre pas', () => {
    const { effects } = run([down(0), click(80, 'media'), down(80 + DOUBLE_TAP_GAP_MS), click(330, 'media')]);
    expect(effects).toEqual(['hold', 'double']);
  });

  test('le second appui arrive APRÈS la fenêtre ⇒ deux touchers simples', () => {
    const { effects } = run([down(0), click(80, 'media'), down(81 + DOUBLE_TAP_GAP_MS), click(340, 'media')]);
    expect(effects).toEqual(['hold', 'release', 'hold']);
  });

  test('le second appui tombe trop loin ⇒ pas de double', () => {
    const far = 100 + DOUBLE_TAP_SLOP_PX + 1;
    const { effects } = run([down(0), click(80), down(150, far), click(220, 'plain', far)]);
    expect(effects).toEqual(['pass', 'pass']);
  });

  test('un contrôle (pastille, lien, lecture) passe toujours et rompt le geste', () => {
    const { effects } = run([down(0), click(80, 'media'), down(150), click(220, 'control')]);
    expect(effects).toEqual(['hold', 'release', 'pass']);
  });

  test('un glissé n’est pas un toucher : le clic qui le suit ne compte pas', () => {
    const { effects } = run([down(0), click(80), down(150, 100), click(250, 'plain', 160)]);
    expect(effects).toEqual(['pass', 'pass']);
  });

  test('un appui long n’est pas un toucher : le clic du relâcher ne compte pas', () => {
    const { effects } = run([down(0), click(80), down(150), click(150 + LONG_PRESS_MS)]);
    expect(effects).toEqual(['pass', 'pass']);
  });

  test('un second appui qui ne se relâche pas en toucher abandonne le média retenu', () => {
    const { effects, state } = run([down(0), click(80, 'media'), down(150), { type: 'expire', at: 150 + LONG_PRESS_MS }]);
    expect(effects).toEqual(['hold', 'drop']);
    expect(state).toEqual(IDLE_TAP);
  });

  test('deux messages différents ne font jamais un double', () => {
    const { effects } = run([down(0), click(80), down(150), click(220, 'plain', 100, 100, 'm-2')]);
    expect(effects).toEqual(['pass', 'pass']);
  });

  test('cancel rend le média retenu et revient au repos', () => {
    const { effects, state } = run([down(0), click(80, 'media'), { type: 'cancel' }]);
    expect(effects).toEqual(['hold', 'release']);
    expect(state).toEqual(IDLE_TAP);
  });

  test('l’échéance suivante : la fenêtre après un toucher, l’appui long après un second appui', () => {
    expect(nextTapDeadline(IDLE_TAP)).toBeNull();
    expect(nextTapDeadline(run([down(0), click(80)]).state)).toBe(80 + DOUBLE_TAP_GAP_MS);
    expect(nextTapDeadline(run([down(0), click(80), down(150)]).state)).toBe(150 + LONG_PRESS_MS);
  });
});
