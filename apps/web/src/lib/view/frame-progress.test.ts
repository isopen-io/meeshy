import { describe, expect, test } from 'bun:test';

import { mediaFraction, startFrameProgress } from './frame-progress';

/**
 * LA PROGRESSION ÉCRITE À CHAQUE IMAGE (#9702) — la barre d'un réel suivait
 * `timeupdate` (≈ 4 Hz) par pas de 1/50, donc par sauts d'une seconde sur un
 * réel d'une minute. Le pilote lit l'horloge du média à chaque image et
 * l'écrit sur une couche composée, sans passer par un état ni un rendu.
 */
function fakeFrames() {
  const pending = new Map<number, (time: number) => void>();
  let next = 1;
  return {
    schedule: (cb: (time: number) => void) => {
      const id = next++;
      pending.set(id, cb);
      return id;
    },
    cancel: (id: number) => {
      pending.delete(id);
    },
    tick: () => {
      const callbacks = [...pending.values()];
      pending.clear();
      callbacks.forEach((cb) => cb(0));
    },
    pending: () => pending.size,
  };
}

describe('mediaFraction', () => {
  test('borné à [0, 1], et 0 tant que la durée est inconnue', () => {
    expect(mediaFraction({ currentTime: 15, duration: 60 })).toBe(0.25);
    expect(mediaFraction({ currentTime: 70, duration: 60 })).toBe(1);
    expect(mediaFraction({ currentTime: 3, duration: Number.NaN })).toBe(0);
    expect(mediaFraction({ currentTime: 3, duration: Number.POSITIVE_INFINITY })).toBe(0);
    expect(mediaFraction({ currentTime: 3, duration: 0 })).toBe(0);
  });
});

describe('startFrameProgress', () => {
  test('écrit la fraction tout de suite, puis à chaque image', () => {
    const frames = fakeFrames();
    const media = { currentTime: 0, duration: 60 };
    const written: number[] = [];
    startFrameProgress({ media, write: (f) => written.push(f), schedule: frames.schedule, cancel: frames.cancel });
    expect(written).toEqual([0]);
    media.currentTime = 0.5;
    frames.tick();
    media.currentTime = 1;
    frames.tick();
    expect(written).toEqual([0, 0.5 / 60, 1 / 60]);
  });

  test('n’écrit pas deux fois la même valeur (média en attente de données)', () => {
    const frames = fakeFrames();
    const written: number[] = [];
    startFrameProgress({ media: { currentTime: 6, duration: 60 }, write: (f) => written.push(f), schedule: frames.schedule, cancel: frames.cancel });
    frames.tick();
    frames.tick();
    expect(written).toEqual([0.1]);
  });

  test('l’arrêt annule l’image en attente — aucune boucle ne survit à la pause', () => {
    const frames = fakeFrames();
    const stop = startFrameProgress({ media: { currentTime: 0, duration: 60 }, write: () => undefined, schedule: frames.schedule, cancel: frames.cancel });
    expect(frames.pending()).toBe(1);
    stop();
    expect(frames.pending()).toBe(0);
  });
});
