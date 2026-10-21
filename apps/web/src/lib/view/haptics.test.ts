import { afterEach, describe, expect, test } from 'bun:test';

import { HAPTIC_CUES, impact, installHapticsDriver, playPattern, success, type HapticsDriver } from './haptics';

/**
 * LE SITE UNIQUE DE L'HAPTIQUE DU WEB (#11207). `navigator.vibrate` n'existe
 * ni sur WebKit iOS ni sur la plupart des bureaux : son absence n'est jamais
 * une erreur, et un plugin natif (Capacitor) pourra prendre la place du
 * moteur sans qu'aucun appelant ne change.
 */
const recordingHost = () => {
  const calls: (readonly number[])[] = [];
  const host = { vibrate: (pattern: number | number[]) => (calls.push(Array.isArray(pattern) ? pattern : [pattern]), true) };
  return { calls, host };
};

afterEach(() => installHapticsDriver(null));

describe('impact / success — un appel, une vibration', () => {
  test('impact(medium) appelle vibrate UNE fois, avec le motif medium', () => {
    const { calls, host } = recordingHost();
    expect(impact('medium', host)).toBe(true);
    expect(calls).toEqual([HAPTIC_CUES.medium]);
  });

  test('impact(light) est plus court que impact(medium)', () => {
    expect(HAPTIC_CUES.light[0]).toBeLessThan(HAPTIC_CUES.medium[0]);
  });

  test('success appelle vibrate une fois, avec son motif', () => {
    const { calls, host } = recordingHost();
    expect(success(host)).toBe(true);
    expect(calls).toEqual([HAPTIC_CUES.success]);
  });

  test('sans navigator.vibrate (WebKit iOS) : faux, sans erreur', () => {
    expect(impact('medium', {})).toBe(false);
    expect(success({})).toBe(false);
    expect(playPattern([10], {})).toBe(false);
  });

  test('un moteur qui lève (permission, page en arrière-plan) ne casse jamais le geste', () => {
    const throwing = {
      vibrate: () => {
        throw new Error('NotAllowedError');
      },
    };
    expect(impact('light', throwing)).toBe(false);
  });
});

describe('le point d’injection — un moteur natif remplace la vibration du navigateur', () => {
  test('un moteur installé reçoit le signal NOMMÉ, et le navigateur ne vibre pas', () => {
    const heard: string[] = [];
    const driver: HapticsDriver = {
      cue: (name) => (heard.push(name), true),
      pattern: (ms) => (heard.push(ms.join(',')), true),
    };
    installHapticsDriver(driver);
    expect(impact('medium')).toBe(true);
    expect(success()).toBe(true);
    expect(playPattern([22, 36, 10])).toBe(true);
    expect(heard).toEqual(['medium', 'success', '22,36,10']);
  });

  test('désinstaller rend la main à la vibration du navigateur', () => {
    installHapticsDriver({ cue: () => true, pattern: () => true });
    installHapticsDriver(null);
    const { calls, host } = recordingHost();
    impact('light', host);
    expect(calls).toEqual([HAPTIC_CUES.light]);
  });
});
