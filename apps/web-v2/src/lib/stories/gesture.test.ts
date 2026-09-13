import { describe, expect, test } from 'bun:test';

import {
  DOUBLE_TAP_WINDOW_MS,
  DRAG_SLOP_PX,
  EDGE_FRACTION,
  HOLD_THRESHOLD_MS,
  classifyTapZone,
  decideTouchDown,
  decideTouchUp,
  isDoubleTap,
  isDrag,
  isHold,
} from './gesture';

describe('constantes — StoryViewerView+Canvas.swift', () => {
  test('le seuil d\'appui est 450 ms (relevé de 200 : un tap humain posé dure 150-300 ms)', () => {
    expect(HOLD_THRESHOLD_MS).toBe(450);
  });

  test('le seuil de glissement est 24 px', () => {
    expect(DRAG_SLOP_PX).toBe(24);
  });

  test('les bandes de bord occupent 30 % de chaque côté', () => {
    expect(EDGE_FRACTION).toBe(0.3);
  });

  test('la fenêtre de double-tap est 300 ms', () => {
    expect(DOUBLE_TAP_WINDOW_MS).toBe(300);
  });
});

describe('classifyTapZone', () => {
  test('le tiers gauche est PRECEDENT', () => {
    expect(classifyTapZone(0.1)).toBe('previous');
    expect(classifyTapZone(0.29)).toBe('previous');
  });

  test('le tiers droit est SUIVANT', () => {
    expect(classifyTapZone(0.7)).toBe('next');
    expect(classifyTapZone(0.99)).toBe('next');
  });

  test('la bande centrale ne navigue pas', () => {
    expect(classifyTapZone(0.5)).toBe('center');
    expect(classifyTapZone(0.3)).toBe('center');
    expect(classifyTapZone(0.6999)).toBe('center');
  });
});

describe('isHold / isDrag', () => {
  test('un appui de 450 ms ou plus est une pause', () => {
    expect(isHold(449)).toBe(false);
    expect(isHold(450)).toBe(true);
  });

  test('un déplacement de plus de 24 px n\'est plus un tap', () => {
    expect(isDrag(24)).toBe(false);
    expect(isDrag(25)).toBe(true);
    expect(isDrag(-25)).toBe(true);
  });
});

describe('isDoubleTap', () => {
  test('dans la fenêtre de 300 ms, oui', () => {
    expect(isDoubleTap(299)).toBe(true);
    expect(isDoubleTap(300)).toBe(true);
  });

  test('au-delà, non', () => {
    expect(isDoubleTap(301)).toBe(false);
  });
});

describe('decideTouchDown — reprise au toucher, jamais au relâchement', () => {
  test('en pause, un toucher sur un BORD reprend la lecture', () => {
    expect(decideTouchDown({ zone: 'previous', isPaused: true })).toBe('resume');
    expect(decideTouchDown({ zone: 'next', isPaused: true })).toBe('resume');
  });

  test('en pause, un toucher au CENTRE ne fait rien (réservé au double-tap)', () => {
    expect(decideTouchDown({ zone: 'center', isPaused: true })).toBe('none');
  });

  test('en lecture, un toucher ne fait jamais rien à la descente', () => {
    expect(decideTouchDown({ zone: 'previous', isPaused: false })).toBe('none');
  });
});

describe('decideTouchUp', () => {
  test('un appui qui tenait la pause ne navigue pas au relâchement', () => {
    expect(decideTouchUp({ zone: 'next', holdActive: true, moved: false, elapsedMs: 100 })).toBe('none');
  });

  test('un déplacement (glissé) n\'est plus un tap', () => {
    expect(decideTouchUp({ zone: 'next', holdActive: false, moved: true, elapsedMs: 100 })).toBe('none');
  });

  test('un appui aussi long qu\'une pause, sans avoir déclenché holdActive, ne navigue pas', () => {
    expect(decideTouchUp({ zone: 'next', holdActive: false, moved: false, elapsedMs: 450 })).toBe('none');
  });

  test('un tap court sur le bord GAUCHE recule', () => {
    expect(decideTouchUp({ zone: 'previous', holdActive: false, moved: false, elapsedMs: 120 })).toBe('previous');
  });

  test('un tap court sur le bord DROIT avance', () => {
    expect(decideTouchUp({ zone: 'next', holdActive: false, moved: false, elapsedMs: 120 })).toBe('next');
  });

  test('un tap court au CENTRE ne navigue pas — réservé au double-tap', () => {
    expect(decideTouchUp({ zone: 'center', holdActive: false, moved: false, elapsedMs: 120 })).toBe('none');
  });
});
