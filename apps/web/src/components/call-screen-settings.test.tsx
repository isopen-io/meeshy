import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { ActiveCall } from '@/lib/calls/call-store';
import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CallScreen } from './call-screen';

/**
 * UN APPEL COUPÉ FAUTE DE MICRO MÈNE AUX RÉGLAGES DE L'APP (#9033) — comme le
 * composeur (#8882) et la caméra du studio (#9032) : dans la coque Android,
 * deux refus suffisent pour qu'Android ne redemande plus le micro, et l'écran
 * de fin n'offrait que « Fermer ».
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean; Capacitor?: unknown };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadCallControlsCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => {
  mounter.unmountAll();
  Reflect.deleteProperty(globalThis, 'Capacitor');
});

const refusedCall: ActiveCall = {
  callId: 'call-1',
  conversationId: 'c-1',
  media: 'audio',
  direction: 'outgoing',
  isGroup: false,
  title: 'Amina Diallo',
  avatar: null,
  callerName: null,
  phase: { kind: 'ended', reason: 'permission', detail: 'media' },
  connectedAt: null,
  endedDurationSec: null,
  micMuted: false,
  cameraOn: false,
  facing: 'user',
  screenSharing: false,
  members: {},
  display: 'full',
  localStream: null,
  remoteStreams: {},
  captions: [],
  captionsMode: 'off',
  captionPeers: [],
  preview: null,
  previewed: false,
  transcription: 'idle',
  initiatorId: null,
  invitedBy: null,
  quality: null,
};

const labelled = (name: string) => document.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);

type NativeCall = { readonly plugin: string; readonly method: string };

function androidShell(): NativeCall[] {
  const calls: NativeCall[] = [];
  globals.Capacitor = {
    getPlatform: () => 'android',
    PluginHeaders: [{ name: 'MeeshyNotificationSettings', methods: [{ name: 'openApp' }] }],
    nativePromise: (plugin: string, method: string) => {
      calls.push({ plugin, method });
      return Promise.resolve({});
    },
  };
  return calls;
}

describe('appel coupé faute de micro (#9033)', () => {
  test('dans la coque Android ⇒ « Réglages » ouvre la fiche de l’app', async () => {
    const calls = androidShell();
    await mounter.mount(<CallScreen call={refusedCall} />);
    await mounter.click(labelled('Réglages'));
    expect(calls).toEqual([{ plugin: 'MeeshyNotificationSettings', method: 'openApp' }]);
    expect(labelled('Fermer')).not.toBeNull();
  });

  test('dans un navigateur ⇒ « Fermer » seul : la demande du navigateur se rejoue au prochain appel', async () => {
    await mounter.mount(<CallScreen call={refusedCall} />);
    expect(labelled('Fermer')).not.toBeNull();
    expect(labelled('Réglages')).toBeNull();
  });

  test('un appel terminé pour une autre raison n’offre pas « Réglages »', async () => {
    androidShell();
    await mounter.mount(<CallScreen call={{ ...refusedCall, phase: { kind: 'ended', reason: 'missed', detail: null } }} />);
    expect(labelled('Réglages')).toBeNull();
  });
});
