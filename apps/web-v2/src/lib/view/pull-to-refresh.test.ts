import { describe, expect, test } from 'bun:test';

import { PULL_SETTLE_MS, PULL_THRESHOLD, nextPullPhase, pullTransform, releasePull, type PullPhase } from './pull-to-refresh';

describe('nextPullPhase', () => {
  test('refreshing + toute distance ⇒ null (ignoré)', () => {
    expect(nextPullPhase({ kind: 'refreshing' }, 999, 90)).toBeNull();
  });

  test('completing + toute distance ⇒ null (ignoré)', () => {
    expect(nextPullPhase({ kind: 'completing', outcome: 'ok' }, 0, 90)).toBeNull();
  });

  test('idle + 45 (seuil 90) ⇒ pulling(0.5)', () => {
    expect(nextPullPhase({ kind: 'idle' }, 45, 90)).toEqual({ kind: 'pulling', progress: 0.5 });
  });

  test('pulling + 90 ⇒ armed', () => {
    expect(nextPullPhase({ kind: 'pulling', progress: 1 }, 90, 90)).toEqual({ kind: 'armed' });
  });

  test('armed + 120 ⇒ null (une seule fois)', () => {
    expect(nextPullPhase({ kind: 'armed' }, 120, 90)).toBeNull();
  });

  test('armed + 30 (désarmement) ⇒ pulling(1/3)', () => {
    const result = nextPullPhase({ kind: 'armed' }, 30, 90);
    expect(result).not.toBeNull();
    expect((result as { progress: number }).progress).toBeCloseTo(1 / 3);
  });

  test('seuil 0 + tirer réel (distance > 0) ⇒ armed', () => {
    /* Corrigé (revue-correction #6195, défaut 7) : `distance` DOIT être > 0
     * pour exercer la branche « seuil nul ». `guard threshold > 0` n'est
     * atteinte, sur iOS, qu'APRÈS `guard pullDistance > 0`
     * (`MeeshyRefreshableScroll.swift:206-209`) — un vecteur à `distance: 0`
     * exerçait la garde de tête, pas le seuil. */
    expect(nextPullPhase({ kind: 'idle' }, 1, 0)).toEqual({ kind: 'armed' });
  });

  test('distance 0, pulling ⇒ idle (miroir iOS, revue-correction #6195 défaut 7)', () => {
    expect(nextPullPhase({ kind: 'pulling', progress: 0.5 }, 0, 90)).toEqual({ kind: 'idle' });
  });

  test('distance négative, armed ⇒ idle (miroir iOS, revue-correction #6195 défaut 7)', () => {
    expect(nextPullPhase({ kind: 'armed' }, -30, 90)).toEqual({ kind: 'idle' });
  });

  test('distance <= 0, déjà idle ⇒ null (aucun changement)', () => {
    expect(nextPullPhase({ kind: 'idle' }, 0, 90)).toBeNull();
    expect(nextPullPhase({ kind: 'idle' }, -5, 90)).toBeNull();
  });

  test('PULL_THRESHOLD === 90', () => {
    expect(PULL_THRESHOLD).toBe(90);
  });
});

describe('releasePull', () => {
  test('armed ⇒ refreshing', () => {
    expect(releasePull({ kind: 'armed' })).toEqual({ kind: 'refreshing' });
  });

  test('pulling ⇒ idle', () => {
    expect(releasePull({ kind: 'pulling', progress: 0.4 })).toEqual({ kind: 'idle' });
  });

  test('idle ⇒ idle', () => {
    const phase: PullPhase = { kind: 'idle' };
    expect(releasePull(phase)).toEqual({ kind: 'idle' });
  });
});

describe('pullTransform (revue-correction #6195)', () => {
  test('idle ⇒ AUCUN style : rien n’est laissé sur le scrollport', () => {
    expect(pullTransform({ kind: 'idle' }, 0)).toBeUndefined();
  });

  test('doigt POSÉ ⇒ transform SANS transition : la liste suit le doigt à l’image près', () => {
    expect(pullTransform({ kind: 'pulling', progress: 0.5 }, 45)).toEqual({ transform: 'translateY(45px)' });
    expect(pullTransform({ kind: 'armed' }, 90)).toEqual({ transform: 'translateY(90px)' });
  });

  test('doigt PARTI ⇒ transform AVEC transition : le retour s’anime, il ne claque pas', () => {
    expect(pullTransform({ kind: 'refreshing' }, 90)).toEqual({
      transform: 'translateY(90px)',
      transitionProperty: 'transform',
      transitionDuration: `${PULL_SETTLE_MS}ms`,
    });
    expect(pullTransform({ kind: 'completing', outcome: 'ok' }, 0)).toEqual({
      transform: 'translateY(0px)',
      transitionProperty: 'transform',
      transitionDuration: `${PULL_SETTLE_MS}ms`,
    });
  });
});
