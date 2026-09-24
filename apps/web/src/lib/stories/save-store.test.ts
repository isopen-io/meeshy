import { describe, expect, test } from 'bun:test';

import { cancel, finish, getState, lockDelivery, report, start, subscribe } from './save-store';

describe('storySaveStore — l’état d’un export vit HORS de React, lu par `getState`', () => {
  test('`start` crée un job à 0, annulable', () => {
    const id = 'st-1';
    start(id);
    expect(getState(id)).toEqual({ progress: 0, cancellable: true });
    finish(id);
  });

  test('un SECOND `start` pendant un job déjà en cours est IGNORÉ (idempotent)', () => {
    const id = 'st-2';
    const first = start(id);
    const second = start(id);
    expect(first).not.toBeNull();
    expect(second).toBeNull();
    finish(id);
  });

  test('`report` convertit la progression brute en part de l’anneau (`downloadShare`)', () => {
    const id = 'st-3';
    start(id);
    report(id, 0.5);
    expect(getState(id)?.progress).toBeCloseTo(0.45);
    finish(id);
  });

  test('`lockDelivery` rend le job NON annulable', () => {
    const id = 'st-4';
    start(id);
    lockDelivery(id);
    expect(getState(id)?.cancellable).toBe(false);
    finish(id);
  });

  test('`cancel` appelle `controller.abort()` et retire le job', () => {
    const id = 'st-5';
    const controller = start(id);
    let aborted = false;
    controller?.signal.addEventListener('abort', () => {
      aborted = true;
    });
    cancel(id);
    expect(aborted).toBe(true);
    expect(getState(id)).toBeNull();
  });

  test('`cancel` sur un job LOCKÉ (non annulable) est SANS EFFET', () => {
    const id = 'st-6';
    const controller = start(id);
    lockDelivery(id);
    let aborted = false;
    controller?.signal.addEventListener('abort', () => {
      aborted = true;
    });
    cancel(id);
    expect(aborted).toBe(false);
    expect(getState(id)).toEqual({ progress: 0, cancellable: false });
    finish(id);
  });

  test('`finish` retire le job, quel que soit son état', () => {
    const id = 'st-7';
    start(id);
    finish(id);
    expect(getState(id)).toBeNull();
  });

  test('L’ÉTAT EST DE MODULE : deux `getState()` lus depuis des « écrans » différents voient le MÊME job', () => {
    const id = 'st-8';
    start(id);
    report(id, 0.2);
    // Deux lectures indépendantes — comme deux composants montés à des
    // endroits différents de l’arbre — voient la MÊME valeur.
    const screenA = getState(id);
    const screenB = getState(id);
    expect(screenA).toEqual(screenB);
    finish(id);
  });

  test('`subscribe` notifie à chaque mutation (start/report/lockDelivery/cancel/finish)', () => {
    const id = 'st-9';
    let notifications = 0;
    const unsubscribe = subscribe(() => {
      notifications += 1;
    });
    start(id);
    report(id, 0.3);
    lockDelivery(id);
    finish(id);
    expect(notifications).toBe(4);
    unsubscribe();
  });
});
