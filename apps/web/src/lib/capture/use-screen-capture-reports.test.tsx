import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { CoqueNative } from '@/lib/native-shell';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CAPTURE_SHIELD_PLUGIN } from './capture-shield';
import { useScreenCaptureReports } from './use-screen-capture-reports';

/* HORS COQUE, RIEN (#9617) : un navigateur ne détecte aucune capture, le fil
   n'y installe aucune écoute et n'y appelle rien. Dans la coque, il écoute. */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean; Capacitor?: CoqueNative };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => {
  mounter.unmountAll();
  delete globals.Capacitor;
});

function Probe({ conversationId, viewerId }: { readonly conversationId: string; readonly viewerId: string }) {
  useScreenCaptureReports(conversationId, viewerId);
  return null;
}

const until = async (done: () => boolean) => {
  for (let i = 0; i < 50 && !done(); i += 1) await new Promise((resolve) => setTimeout(resolve, 5));
};

describe('l’écoute des captures par le fil', () => {
  test('dans un navigateur : aucune écoute, aucun appel', async () => {
    const touched: string[] = [];
    globals.Capacitor = {
      getPlatform: () => 'web',
      addListener: (_plugin, event) => {
        touched.push(event);
        return { remove: async () => {} };
      },
      nativePromise: async (_plugin, method) => void touched.push(method),
    };
    await mounter.mount(<Probe conversationId="c-1" viewerId="u-1" />);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(touched).toEqual([]);
  });

  test('dans la coque : le fil écoute les captures et les lâche en sortant', async () => {
    const listening = new Set<string>();
    globals.Capacitor = {
      getPlatform: () => 'android',
      PluginHeaders: [{ name: CAPTURE_SHIELD_PLUGIN, methods: [{ name: 'setSecure' }, { name: 'getState' }] }],
      nativePromise: async () => ({ recording: false }),
      addListener: (_plugin, event) => {
        listening.add(event);
        return { remove: async () => void listening.delete(event) };
      },
    };
    await mounter.mount(<Probe conversationId="c-1" viewerId="u-1" />);
    await until(() => listening.size === 2);
    expect([...listening].sort()).toEqual(['recordingChanged', 'screenCaptured']);
    mounter.unmountAll();
    await until(() => listening.size === 0);
    expect(listening.size).toBe(0);
  });
});
