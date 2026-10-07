import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import type { Message } from '@/lib/api/types';
import { CAPTURE_SHIELD_PLUGIN } from '@/lib/capture/capture-shield';
import type { CoqueNative } from '@/lib/native-shell';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CaptureShieldHold, CaptureShieldOver, viewerPageIsSensitive } from './use-capture-shield-hold';

/* « ANNONCÉ OU NOIR » DANS LA COQUE (#9617) — une rangée d'éphémère ne
   s'épargne FLAG_SECURE que sur un Android qui détecte capture ET
   enregistrement ; une visionneuse, jamais. */

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

function androidShell(sdk: number): { readonly secure: readonly boolean[] } {
  const secure: boolean[] = [];
  globals.Capacitor = {
    getPlatform: () => 'android',
    PluginHeaders: [{ name: CAPTURE_SHIELD_PLUGIN, methods: [{ name: 'setSecure' }, { name: 'getState' }] }],
    nativePromise: async (_plugin, method, options) => {
      if (method === 'getState') return { screenshotDetection: sdk >= 34, recordingDetection: sdk >= 35, recording: false };
      secure.push((options as { secure: boolean }).secure);
      return {};
    },
  };
  /* Le bouclier est unique pour l'application : une coque neuve (un témoin
     précédent en avait une autre) se voit d'abord rappeler l'état absent. */
  return {
    get secure(): readonly boolean[] {
      const first = secure.indexOf(true);
      return first === -1 ? [] : secure.slice(first);
    },
  };
}

const settle = async () => {
  for (let i = 0; i < 5; i += 1) await mounter.settle();
};

describe('une rangée d’éphémère dans la coque', () => {
  test('Android 14 (enregistrement indétectable) : noire tant qu’elle est montée', async () => {
    const shell = androidShell(34);
    await mounter.mount(<CaptureShieldHold messageId="m-flame" conversationId="c-1" verdict="announced" declared />);
    await settle();
    expect(shell.secure).toEqual([true]);
    mounter.unmountAll();
    await settle();
    expect(shell.secure).toEqual([true, false]);
  });

  test('Android 15 : noire le temps que la coque réponde, puis annoncée', async () => {
    const shell = androidShell(35);
    await mounter.mount(<CaptureShieldHold messageId="m-flame" conversationId="c-1" verdict="announced" declared />);
    await settle();
    expect(shell.secure).toEqual([true, false]);
  });

  test('une nature illisible reste noire même sur Android 15', async () => {
    const shell = androidShell(36);
    await mounter.mount(<CaptureShieldHold messageId="m-x" conversationId="c-1" verdict="blocked" declared />);
    await settle();
    expect(shell.secure).toEqual([true]);
  });
});

describe('une visionneuse dans la coque', () => {
  const flame = { id: 'm-f', senderId: 'u-other', effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL, ephemeralDuration: 60 } as Message;
  const plain = { id: 'm-p', senderId: 'u-other', effectFlags: 0 } as Message;

  test('une flamme parmi ses pages la rend noire, même sur Android 15', async () => {
    const shell = androidShell(36);
    await mounter.mount(<CaptureShieldOver messages={[plain, flame]} viewerId="u-me" />);
    await settle();
    expect(shell.secure).toEqual([true]);
  });

  test('des pages ordinaires la laissent libre', async () => {
    const shell = androidShell(36);
    await mounter.mount(<CaptureShieldOver messages={[plain]} viewerId="u-me" />);
    await settle();
    expect(shell.secure).toEqual([]);
  });

  test('sensibilité d’une page : nature illisible d’autrui, citation non déclarée, flamme d’autrui', () => {
    const unread = { id: 'm-u', senderId: 'u-other' } as Message;
    expect(viewerPageIsSensitive(unread, false, false)).toBe(true);
    expect(viewerPageIsSensitive(unread, true, false)).toBe(false);
    expect(viewerPageIsSensitive(unread, true, true)).toBe(true);
    expect(viewerPageIsSensitive(flame, false, false)).toBe(true);
    expect(viewerPageIsSensitive(flame, true, false)).toBe(false);
  });
});

describe('dans un navigateur', () => {
  test('rien n’est tenu ni appelé', async () => {
    await mounter.mount(<CaptureShieldHold messageId="m-flame" conversationId="c-1" verdict="announced" declared />);
    await settle();
    expect(globals.Capacitor).toBeUndefined();
  });
});
