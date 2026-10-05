import { describe, expect, test } from 'bun:test';

import { withFcmGuard } from './fcm-guard';
import type { ShellPushPlugin } from './shell-push';

/**
 * **SANS FCM, `register()` N'ATTEINT JAMAIS LE NATIF** (#8477). Une coque
 * construite sans `google-services.json` plantait à la connexion :
 * `PushNotificationsPlugin.register` lève `FirebaseApp is not initialized` sur
 * le fil des plugins, là où aucun `.catch` JS ne rattrape.
 */

function recordingPlugin() {
  const calls: string[] = [];
  const plugin: ShellPushPlugin = {
    checkPermissions: async () => {
      calls.push('checkPermissions');
      return { receive: 'granted' };
    },
    requestPermissions: async () => {
      calls.push('requestPermissions');
      return { receive: 'granted' };
    },
    register: async () => {
      calls.push('register');
    },
    unregister: async () => {
      calls.push('unregister');
    },
    createChannel: async () => {
      calls.push('createChannel');
    },
    addListener: (async () => {
      calls.push('addListener');
      return { remove: async () => undefined };
    }) as ShellPushPlugin['addListener'],
  };
  return { plugin, calls };
}

describe('withFcmGuard', () => {
  test('FCM configuré : register atteint le plugin', async () => {
    const { plugin, calls } = recordingPlugin();
    await withFcmGuard(plugin, async () => true).register();
    expect(calls).toEqual(['register']);
  });

  test('FCM absent : register se résout sans toucher le plugin', async () => {
    const { plugin, calls } = recordingPlugin();
    await withFcmGuard(plugin, async () => false).register();
    expect(calls).toEqual([]);
  });

  test('une sonde qui échoue ferme la garde', async () => {
    const { plugin, calls } = recordingPlugin();
    await withFcmGuard(plugin, () => Promise.reject(new Error('not implemented'))).register();
    expect(calls).toEqual([]);
  });

  test('la sonde ne se pose qu’une fois', async () => {
    const { plugin } = recordingPlugin();
    let probes = 0;
    const guarded = withFcmGuard(plugin, async () => {
      probes += 1;
      return true;
    });
    await guarded.register();
    await guarded.register();
    expect(probes).toBe(1);
  });

  test('les autres méthodes passent au plugin sans condition', async () => {
    const { plugin, calls } = recordingPlugin();
    const guarded = withFcmGuard(plugin, async () => false);
    await guarded.checkPermissions();
    await guarded.requestPermissions();
    await guarded.unregister();
    await guarded.createChannel({ id: 'c', name: 'c' });
    await guarded.addListener('registration', () => undefined);
    expect(calls).toEqual(['checkPermissions', 'requestPermissions', 'unregister', 'createChannel', 'addListener']);
  });
});
