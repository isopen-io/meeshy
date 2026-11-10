import { describe, expect, test } from 'bun:test';

import {
  createTalkieLevelMeter,
  createTalkieWaveTrail,
  headerTalkieChrome,
  mayShowTalkieInHeader,
  resolveTalkieHeaderDelivery,
  resolveTalkieHeaderVoice,
  talkieElapsed,
  TALKIE_WAVE_FLOOR_DB,
  TALKIE_WAVE_TRAIL_CAPACITY,
  TALKIE_WAVE_TRAIL_STEP_MS,
  talkieWaveBarCount,
  talkieWaveBarHeights,
  talkieWaveMirroredBarHeights,
  talkieWaveNormalized,
  talkieWaveRms,
  talkieWaveSmoothed,
} from './talkie-header-law';

/**
 * L'EN-TÊTE D'UN DIRECT PREND LE TALKIE (#17338, jumelle de #17337 et #17310) —
 * transposition de `TalkieHeaderBarTests.swift` : quelle voix occupe la barre,
 * ce qu'elle devient AVANT la fin, et comment le niveau devient une onde.
 */

const near = (actual: number, expected: number, accuracy = 0.0001) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(accuracy);

describe('quelle voix occupe l’en-tête', () => {
  test('ma voix qui part l’occupe', () => {
    expect(resolveTalkieHeaderVoice({ phase: 'talking', peerSpeaking: false })).toBe('outgoing');
  });

  test('la voix du pair qui arrive l’occupe', () => {
    expect(resolveTalkieHeaderVoice({ phase: 'idle', peerSpeaking: true })).toBe('incoming');
  });

  test('les deux à la fois : la voix qui part l’emporte', () => {
    expect(resolveTalkieHeaderVoice({ phase: 'talking', peerSpeaking: true })).toBe('outgoing');
  });

  test('un appui dont la voix n’est pas encore partie laisse l’en-tête au repos', () => {
    expect(resolveTalkieHeaderVoice({ phase: 'starting', peerSpeaking: false })).toBe('none');
    expect(resolveTalkieHeaderVoice({ phase: 'idle', peerSpeaking: false })).toBe('none');
  });

  test('la copie en message vocal est une voix qui part', () => {
    expect(resolveTalkieHeaderVoice({ phase: 'recording-copy', peerSpeaking: false })).toBe('outgoing');
  });
});

describe('ce que l’en-tête montre', () => {
  test('au repos, tout', () => {
    expect(headerTalkieChrome('none')).toEqual({ showsBackButton: true, showsIdentity: true, showsActions: true, talkieSpansBar: false });
  });

  test('une voix qui part ou arrive : le talkie prend toute la barre', () => {
    (['outgoing', 'incoming'] as const).forEach((voice) => {
      expect(headerTalkieChrome(voice)).toEqual({ showsBackButton: false, showsIdentity: false, showsActions: false, talkieSpansBar: true });
    });
  });

  test('jamais dans un direct chiffré de bout en bout', () => {
    expect(mayShowTalkieInHeader('e2ee')).toBe(false);
    expect(mayShowTalkieInHeader('server')).toBe(true);
    expect(mayShowTalkieInHeader('hybrid')).toBe(true);
    expect(mayShowTalkieInHeader(null)).toBe(true);
    expect(mayShowTalkieInHeader(undefined)).toBe(true);
  });
});

describe('direct ou hors ligne : visible avant la fin', () => {
  test('un talkie ouvert sans réveil est en direct', () => {
    expect(resolveTalkieHeaderDelivery({ voice: 'outgoing', phase: 'talking', waking: false })).toBe('live');
  });

  test('un pair hors ligne qu’on réveille : relayé', () => {
    expect(resolveTalkieHeaderDelivery({ voice: 'outgoing', phase: 'talking', waking: true })).toBe('relayed');
  });

  test('le repli en message vocal : enregistré', () => {
    expect(resolveTalkieHeaderDelivery({ voice: 'outgoing', phase: 'recording-copy', waking: false })).toBe('recorded');
  });

  test('une voix qui arrive s’entend toujours en direct', () => {
    expect(resolveTalkieHeaderDelivery({ voice: 'incoming', phase: 'idle', waking: false })).toBe('live');
    expect(resolveTalkieHeaderDelivery({ voice: 'incoming', phase: 'recording-copy', waking: true })).toBe('live');
  });
});

describe('le niveau mesuré', () => {
  test('le silence vaut zéro, un signal constant vaut son amplitude', () => {
    expect(talkieWaveRms(new Float32Array(0))).toBe(0);
    expect(talkieWaveRms(new Float32Array(8))).toBe(0);
    near(talkieWaveRms(Float32Array.from([0.5, -0.5, 0.5, -0.5])), 0.5);
  });

  test('linéaire en décibels entre le plancher et la pleine échelle', () => {
    expect(talkieWaveNormalized(0)).toBe(0);
    expect(talkieWaveNormalized(1)).toBe(1);
    near(talkieWaveNormalized(10 ** (TALKIE_WAVE_FLOOR_DB / 40)), 0.5, 0.001);
  });

  test('borné contre le bruit et les valeurs absurdes', () => {
    expect(talkieWaveNormalized(3)).toBe(1);
    expect(talkieWaveNormalized(-1)).toBe(0);
    expect(talkieWaveNormalized(Number.NaN)).toBe(0);
    expect(talkieWaveNormalized(Number.POSITIVE_INFINITY)).toBe(1);
    expect(talkieWaveNormalized(0.000_01)).toBe(0);
  });
});

describe('le lissage', () => {
  test('monte vite et descend lentement', () => {
    const rise = talkieWaveSmoothed(0, 1);
    const fall = 1 - talkieWaveSmoothed(1, 0);
    expect(rise).toBeGreaterThan(0);
    expect(rise).toBeLessThan(1);
    expect(rise).toBeGreaterThan(fall);
  });

  test('reste borné et converge', () => {
    near(talkieWaveSmoothed(0.4, 0.4), 0.4);
    expect(talkieWaveSmoothed(1, 9)).toBeLessThanOrEqual(1);
    expect(talkieWaveSmoothed(0, -9)).toBeGreaterThanOrEqual(0);
    const converged = Array.from({ length: 120 }).reduce<number>((value) => talkieWaveSmoothed(value, 0.8), 0);
    near(converged, 0.8, 0.01);
  });
});

describe('des niveaux aux barres', () => {
  test('les barres remplissent la largeur sans jamais tomber à zéro', () => {
    expect(talkieWaveBarCount({ width: 300, barWidth: 3, gap: 3 })).toBe(50);
    expect(talkieWaveBarCount({ width: 0, barWidth: 3, gap: 3 })).toBe(1);
    expect(talkieWaveBarCount({ width: 10_000, barWidth: 3, gap: 3 })).toBe(TALKIE_WAVE_TRAIL_CAPACITY);
  });

  test('bornées : le silence au plancher, la pleine échelle au plafond', () => {
    const heights = talkieWaveBarHeights({ levels: [0, 0.5, 1, 7, -2], barCount: 5, minHeight: 2, maxHeight: 20 });
    expect(heights).toHaveLength(5);
    expect(heights[0]).toBe(2);
    near(heights[1] ?? 0, 11, 0.001);
    expect(heights[2]).toBe(20);
    expect(heights[3]).toBe(20);
    expect(heights[4]).toBe(2);
  });

  test('les derniers niveaux à droite, la gauche comblée par le plancher', () => {
    expect(talkieWaveBarHeights({ levels: [1, 0, 1], barCount: 2, minHeight: 2, maxHeight: 20 })).toEqual([2, 20]);
    expect(talkieWaveBarHeights({ levels: [1], barCount: 3, minHeight: 2, maxHeight: 20 })).toEqual([2, 2, 20]);
  });
});

describe('la traîne de l’onde', () => {
  test('avance à son propre pas, pas à chaque image', () => {
    const trail = createTalkieWaveTrail();
    trail.advance(0, 1);
    trail.advance(TALKIE_WAVE_TRAIL_STEP_MS / 4, 1);
    expect(trail.levels()).toHaveLength(1);
    trail.advance(TALKIE_WAVE_TRAIL_STEP_MS * 1.01, 1);
    expect(trail.levels()).toHaveLength(2);
  });

  test('lisse le niveau et reste bornée', () => {
    const trail = createTalkieWaveTrail();
    trail.advance(0, 1);
    expect(trail.levels()[0]).toBeLessThan(1);
    Array.from({ length: TALKIE_WAVE_TRAIL_CAPACITY * 2 - 1 }, (_, index) => index + 1).forEach((index) => trail.advance(index * TALKIE_WAVE_TRAIL_STEP_MS * 1.01, 1));
    expect(trail.levels()).toHaveLength(TALKIE_WAVE_TRAIL_CAPACITY);
    near(trail.levels().at(-1) ?? 0, 1, 0.01);
  });
});

describe('le compteur de niveau', () => {
  test('publie le niveau normalisé et revient au silence', () => {
    const meter = createTalkieLevelMeter();
    expect(meter.level()).toBe(0);
    meter.push(1);
    expect(meter.level()).toBe(1);
    meter.reset();
    expect(meter.level()).toBe(0);
  });

  test('une sonde branchée est lue à chaque lecture, débranchée elle se tait', () => {
    const meter = createTalkieLevelMeter();
    const samples = [1, 0];
    meter.probe(() => samples.shift() ?? 0);
    expect(meter.level()).toBe(1);
    expect(meter.level()).toBe(0);
    meter.probe(null);
    meter.push(1);
    expect(meter.level()).toBe(1);
  });
});

describe('l’onde miroir du direct', () => {
  test('le silence pose toutes les barres au plancher', () => {
    const heights = talkieWaveMirroredBarHeights({ level: 0, barCount: 9, timeS: 1.3, minHeight: 3, maxHeight: 24 });
    expect(heights).toHaveLength(9);
    expect(heights.every((height) => height === 3)).toBe(true);
  });

  test('symétrique autour de son centre', () => {
    [0, 0.41, 2.7, 13.05].forEach((timeS) => {
      const heights = talkieWaveMirroredBarHeights({ level: 0.8, barCount: 11, timeS, minHeight: 3, maxHeight: 24 });
      heights.forEach((height, index) => near(height, heights[heights.length - 1 - index] ?? Number.NaN, 1e-9));
    });
  });

  test('bornée, et le centre mène à pleine voix', () => {
    Array.from({ length: 18 }, (_, index) => index * 0.17).forEach((timeS) => {
      const heights = talkieWaveMirroredBarHeights({ level: 1, barCount: 15, timeS, minHeight: 3, maxHeight: 24 });
      expect(heights.every((height) => height >= 3 && height <= 24)).toBe(true);
      expect(heights[7] ?? 0).toBeGreaterThan(heights[0] ?? 0);
    });
  });

  test('suit la voix : plus fort, plus haut', () => {
    const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
    const quiet = talkieWaveMirroredBarHeights({ level: 0.2, barCount: 9, timeS: 0.5, minHeight: 3, maxHeight: 24 });
    const loud = talkieWaveMirroredBarHeights({ level: 0.9, barCount: 9, timeS: 0.5, minHeight: 3, maxHeight: 24 });
    expect(sum(loud)).toBeGreaterThan(sum(quiet));
  });

  test('sans barre, vide', () => {
    expect(talkieWaveMirroredBarHeights({ level: 1, barCount: 0, timeS: 0, minHeight: 3, maxHeight: 24 })).toEqual([]);
  });
});

describe('le chrono', () => {
  test('se lit en minutes et secondes', () => {
    expect(talkieElapsed(0)).toBe('0:00');
    expect(talkieElapsed(7_900)).toBe('0:07');
    expect(talkieElapsed(65_000)).toBe('1:05');
    expect(talkieElapsed(-3_000)).toBe('0:00');
  });
});
