import { describe, expect, test } from 'bun:test';

import { devicePushControl, devicePushPermissionOf } from './device-permission';
import type { ShellPushPermission } from './shell-push';

/**
 * **LA RANGÉE « BLOQUÉES SUR CET APPAREIL »** (#7307, critère 4) — le refus de
 * la permission Android 13+ est un état dessiné, avec son chemin de retour.
 */

function fakeDevice(states: { readonly check: readonly ShellPushPermission[]; readonly request?: ShellPushPermission }) {
  const calls: string[] = [];
  let checks = 0;
  const control = devicePushControl({
    plugin: {
      checkPermissions: async () => {
        const receive = states.check[Math.min(checks, states.check.length - 1)] ?? 'denied';
        checks += 1;
        return { receive };
      },
      requestPermissions: async () => {
        calls.push('request');
        return { receive: states.request ?? 'denied' };
      },
      register: async () => {
        calls.push('register');
      },
    },
    settings: {
      open: async () => {
        calls.push('open-settings');
      },
    },
  });
  return { control, calls };
}

describe('devicePushPermissionOf — trois états, pas quatre', () => {
  test('« prompt-with-rationale » se dessine comme une permission jamais accordée', () => {
    expect(devicePushPermissionOf('prompt-with-rationale')).toBe('prompt');
    expect(devicePushPermissionOf('denied')).toBe('denied');
  });
});

describe('devicePushControl — le chemin de retour d’un refus', () => {
  test('une permission refusée se lit refusée, sans rien enregistrer', async () => {
    const { control, calls } = fakeDevice({ check: ['denied'] });
    expect(await control.refresh()).toBe('denied');
    expect(calls).toEqual([]);
  });

  test('« Ouvrir les réglages » ouvre l’écran système des notifications de l’app', async () => {
    const { control, calls } = fakeDevice({ check: ['denied'] });
    await control.openSettings();
    expect(calls).toEqual(['open-settings']);
  });

  test('revenir des réglages avec la permission accordée enregistre le jeton', async () => {
    const { control, calls } = fakeDevice({ check: ['denied', 'granted'] });
    await control.refresh();
    expect(await control.refresh()).toBe('granted');
    expect(calls).toEqual(['register']);
  });

  test('une permission déjà accordée au premier regard n’enregistre pas une seconde fois', async () => {
    const { control, calls } = fakeDevice({ check: ['granted'] });
    expect(await control.refresh()).toBe('granted');
    expect(await control.refresh()).toBe('granted');
    expect(calls).toEqual([]);
  });

  test('« Activer » accepté au dialogue enregistre le jeton', async () => {
    const { control, calls } = fakeDevice({ check: ['prompt'], request: 'granted' });
    expect(await control.ask()).toBe('granted');
    expect(calls).toEqual(['request', 'register']);
  });

  test('« Activer » refusé au dialogue bascule sur l’état refusé', async () => {
    const { control, calls } = fakeDevice({ check: ['prompt'], request: 'denied' });
    expect(await control.ask()).toBe('denied');
    expect(calls).toEqual(['request']);
  });
});
