import { describe, expect, test } from 'bun:test';

import { bindPlaybackQoe, createPlaybackAccumulator } from './playback-qoe';

/**
 * LA QUALITÉ D'UNE SÉANCE DE LECTURE (#10504, décision § 4, Mux/Conviva) —
 * un SEUL résumé par séance, à la fin ; rien pendant la lecture.
 */
const start = (now = 0) => createPlaybackAccumulator({ playbackId: 'pb', mediaId: 'm1', mutedAtStart: true, startedAt: now });

describe('createPlaybackAccumulator', () => {
  test('démarrage : le temps jusqu’à la première image', () => {
    const acc = start();
    acc.on('loadstart', { at: 0 });
    acc.on('playing', { at: 420 });
    const summary = acc.finish({ at: 1000, exitReason: 'closed', durationMs: 10_000 });
    expect(summary.startupMs).toBe(420);
    expect(summary.exitBeforeStart).toBe(false);
  });

  test('deux attentes après le démarrage ⇒ rebufferCount 2, et leur durée', () => {
    const acc = start();
    acc.on('playing', { at: 100 });
    acc.on('waiting', { at: 1000 });
    acc.on('playing', { at: 1300 });
    acc.on('stalled', { at: 2000 });
    acc.on('playing', { at: 2500 });
    const summary = acc.finish({ at: 3000, exitReason: 'swiped', durationMs: 10_000 });
    expect(summary.rebufferCount).toBe(2);
    expect(summary.rebufferMs).toBe(800);
  });

  test('l’attente qui suit un saut n’est pas une panne de débit', () => {
    const acc = start();
    acc.on('playing', { at: 0 });
    acc.on('seeking', { at: 500 });
    acc.on('waiting', { at: 510 });
    acc.on('seeked', { at: 700 });
    acc.on('playing', { at: 710 });
    const summary = acc.finish({ at: 1000, exitReason: 'closed', durationMs: 10_000 });
    expect(summary.seeks).toBe(1);
    expect(summary.rebufferCount).toBe(0);
  });

  test('une boucle (retour au début après la fin) incrémente loops ; les quartiles sont un masque', () => {
    const acc = start();
    acc.on('playing', { at: 0 });
    [0, 2.5, 5, 7.5, 9.9].forEach((t) => acc.on('timeupdate', { at: t * 1000, currentTime: t, duration: 10 }));
    acc.on('timeupdate', { at: 10_100, currentTime: 0.1, duration: 10 });
    const summary = acc.finish({ at: 11_000, exitReason: 'swiped', durationMs: 10_000 });
    expect(summary.loops).toBe(1);
    expect(summary.quartiles).toBe(15);
    expect(summary.playedMs).toBe(9900);
  });

  test('pauses, bascules du son, erreur réduite à son code', () => {
    const acc = start();
    acc.on('playing', { at: 0 });
    acc.on('pause', { at: 100 });
    acc.on('volumechange', { at: 200, muted: false });
    acc.on('volumechange', { at: 300, muted: false });
    acc.on('volumechange', { at: 400, muted: true });
    acc.on('error', { at: 500, errorCode: 3 });
    const summary = acc.finish({ at: 600, exitReason: 'error', durationMs: 10_000 });
    expect(summary.pauses).toBe(1);
    expect(summary.muteToggles).toBe(2);
    expect(summary.errorCode).toBe('MEDIA_ERR_DECODE');
    expect(summary.errorDomain).toBe('html5');
    expect(summary.mutedAtStart).toBe(true);
  });

  test('quitté avant la première image ⇒ exitBeforeStart', () => {
    const acc = start();
    acc.on('loadstart', { at: 0 });
    const summary = acc.finish({ at: 900, exitReason: 'swiped', durationMs: 0 });
    expect(summary.exitBeforeStart).toBe(true);
    expect(summary.startupMs).toBe(900);
  });
});

describe('bindPlaybackQoe — aucun envoi pendant la lecture', () => {
  test('les événements du média alimentent l’accumulateur ; le résumé ne sort qu’à la fin, une fois', () => {
    const listeners = new Map<string, () => void>();
    const media = {
      currentTime: 0,
      duration: 10,
      muted: true,
      error: null as { code: number } | null,
      addEventListener: (type: string, run: () => void) => void listeners.set(type, run),
      removeEventListener: (type: string) => void listeners.delete(type),
    };
    let clock = 0;
    const out: unknown[] = [];
    const session = bindPlaybackQoe(media, { playbackId: 'pb', mediaId: 'm1', now: () => clock, onSummary: (s) => out.push(s) });
    clock = 300;
    listeners.get('playing')?.();
    clock = 1000;
    listeners.get('waiting')?.();
    clock = 1200;
    listeners.get('playing')?.();
    expect(out).toEqual([]);
    session.finish('closed');
    session.finish('closed');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ playbackId: 'pb', mediaId: 'm1', startupMs: 300, rebufferCount: 1, exitReason: 'closed', mediaDurationMs: 10_000 });
    expect(listeners.size).toBe(0);
  });
});
