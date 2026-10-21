import { afterEach, describe, expect, test } from 'bun:test';

import type { CoqueNative } from '@/lib/native-shell';

import {
  HAPTIC_CUES,
  impact,
  installHapticsDriver,
  playPattern,
  shellHapticsDriver,
  success,
  type HapticsDriver,
} from './haptics';

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

const withCapacitor = (coque: CoqueNative | undefined): void => {
  (globalThis as { Capacitor?: CoqueNative | undefined }).Capacitor = coque;
};

afterEach(() => {
  installHapticsDriver(null);
  withCapacitor(undefined);
});

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

/**
 * LA COQUE ANDROID (#11229) — `@capacitor/haptics` 8.0.2, plugin `Haptics`.
 * Contrat LU dans `HapticsPlugin.java` / `HapticsImpactType.java` /
 * `HapticsNotificationType.java` : `impact({ style: 'LIGHT' | 'MEDIUM' })`,
 * `notification({ type: 'SUCCESS' })`. Le plugin est lu comme la coque le
 * DÉCLARE (`PluginHeaders`), jamais par `@capacitor/core`.
 */
type NativeCall = { readonly plugin: string; readonly method: string; readonly options: object };

const recordingShell = (
  methods: readonly string[] = ['impact', 'notification', 'vibrate'],
  answer: () => Promise<unknown> = () => Promise.resolve(undefined),
) => {
  const calls: NativeCall[] = [];
  const coque: CoqueNative = {
    PluginHeaders: [{ name: 'Haptics', methods: methods.map((name) => ({ name })) }],
    nativePromise: (plugin, method, options) => (calls.push({ plugin, method, options }), answer()),
    getPlatform: () => 'android',
  };
  return { calls, coque };
};

describe('la coque Android — le plugin Haptics joue le retour nommé', () => {
  test('impact(medium) part au plugin en MEDIUM, et la vibration du navigateur se tait', () => {
    const { calls, coque } = recordingShell();
    const browser = recordingHost();
    expect(shellHapticsDriver(coque, browser.host).cue('medium')).toBe(true);
    expect(calls).toEqual([{ plugin: 'Haptics', method: 'impact', options: { style: 'MEDIUM' } }]);
    expect(browser.calls).toEqual([]);
  });

  test('impact(light) part en LIGHT, success part en notification SUCCESS', () => {
    const { calls, coque } = recordingShell();
    const driver = shellHapticsDriver(coque, undefined);
    driver.cue('light');
    driver.cue('success');
    expect(calls).toEqual([
      { plugin: 'Haptics', method: 'impact', options: { style: 'LIGHT' } },
      { plugin: 'Haptics', method: 'notification', options: { type: 'SUCCESS' } },
    ]);
  });

  test('un motif libre reste au navigateur : le plugin ne sait jouer qu’une durée', () => {
    const { calls, coque } = recordingShell();
    const browser = recordingHost();
    expect(shellHapticsDriver(coque, browser.host).pattern([22, 36, 10])).toBe(true);
    expect(calls).toEqual([]);
    expect(browser.calls).toEqual([[22, 36, 10]]);
  });

  test('une coque qui ne déclare pas Haptics (construite avant lui) garde la vibration du navigateur', () => {
    const coque: CoqueNative = { PluginHeaders: [{ name: 'Media' }], nativePromise: () => Promise.resolve(undefined) };
    const browser = recordingHost();
    expect(shellHapticsDriver(coque, browser.host).cue('medium')).toBe(true);
    expect(browser.calls).toEqual([HAPTIC_CUES.medium]);
  });

  test('une méthode non déclarée par la coque ne part pas au plugin : le navigateur la joue', () => {
    const { calls, coque } = recordingShell(['impact']);
    const browser = recordingHost();
    shellHapticsDriver(coque, browser.host).cue('success');
    expect(calls).toEqual([]);
    expect(browser.calls).toEqual([HAPTIC_CUES.success]);
  });

  test('un plugin qui rejette ne casse jamais le geste, et rien ne fuit en rejet non géré', async () => {
    const { coque } = recordingShell(undefined, () => Promise.reject(new Error('vibrator absent')));
    const unhandled: unknown[] = [];
    const listen = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', listen);
    expect(shellHapticsDriver(coque, undefined).cue('medium')).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    process.off('unhandledRejection', listen);
    expect(unhandled).toEqual([]);
  });

  test('un pont qui lève de façon synchrone rend faux', () => {
    const coque: CoqueNative = {
      PluginHeaders: [{ name: 'Haptics', methods: [{ name: 'impact' }] }],
      nativePromise: () => {
        throw new Error('bridge down');
      },
    };
    expect(shellHapticsDriver(coque, undefined).cue('light')).toBe(false);
  });
});

describe('le moteur par défaut — la coque courante, sans qu’aucun appelant ne change', () => {
  test('dans la coque, impact() sans hôte part au plugin natif', () => {
    const { calls, coque } = recordingShell();
    withCapacitor(coque);
    expect(impact('medium')).toBe(true);
    expect(success()).toBe(true);
    expect(calls.map((call) => call.method)).toEqual(['impact', 'notification']);
  });

  test('un hôte explicite passe avant la coque', () => {
    const { calls, coque } = recordingShell();
    withCapacitor(coque);
    const browser = recordingHost();
    impact('light', browser.host);
    expect(calls).toEqual([]);
    expect(browser.calls).toEqual([HAPTIC_CUES.light]);
  });

  test('un moteur installé passe avant la coque', () => {
    const { calls, coque } = recordingShell();
    withCapacitor(coque);
    const heard: string[] = [];
    installHapticsDriver({ cue: (name) => (heard.push(name), true), pattern: () => true });
    impact('medium');
    expect(calls).toEqual([]);
    expect(heard).toEqual(['medium']);
  });
});
