import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { callActions } from '@/lib/calls/call-actions';
import { pipOpenStore, registerPipCloser, registerPipOpener } from '@/lib/calls/call-pip';
import type { ActiveCall, CallMember } from '@/lib/calls/call-store';
import { NO_EFFECTS, setVideoEffects, videoEffectsStore } from '@/lib/calls/video-effects';
import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';

import { CallScreen } from './call-screen';

/**
 * LES ACTIONS CAMÉRA DE L'APPEL SUIVENT iOS (#9094, #9095) — sur un
 * ordinateur à plusieurs webcams on CHOISIT sa caméra (`.cameraPicker`) ;
 * Effets montre qu'un effet est posé (`.active`) ; un appel vocal propose
 * d'ajouter la vidéo (`video.badge.plus`) ; l'image dans l'image vit dans la
 * rangée « l'appel », plus dans l'en-tête.
 */

const call = (overrides: Partial<ActiveCall> = {}): ActiveCall => ({
  callId: 'call-1',
  conversationId: 'c-1',
  media: 'audio',
  direction: 'outgoing',
  isGroup: false,
  title: 'Amina Diallo',
  avatar: null,
  callerName: null,
  phase: { kind: 'connected' },
  connectedAt: 0,
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
  ...overrides,
});

const member = (overrides: Partial<CallMember> = {}): CallMember => ({ userId: 'u-peer', name: 'Amina Diallo', avatar: null, micMuted: false, cameraOn: false, screenSharing: false, weakNetwork: false, capturing: false, link: 'connected', ...overrides });

const videoOf = (deviceId: string) => ({ getVideoTracks: () => [{ readyState: 'live', getSettings: () => ({ deviceId }) }], getTracks: () => [] }) as unknown as MediaStream;

type Device = { readonly kind: MediaDeviceKind; readonly deviceId: string; readonly label: string };

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

let srcObject: PropertyDescriptor | undefined;

const withDevices = (devices: readonly Device[]) => {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { enumerateDevices: async () => devices, addEventListener: () => undefined, removeEventListener: () => undefined },
  });
};

const mount = async (overrides: Partial<ActiveCall>, effectsSupport = { color: true, blur: false }) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(<CallScreen call={call(overrides)} canShare={false} effectsSupport={effectsSupport} />));
  const find = (selector: string) => document.querySelector(selector);
  const press = async (selector: string) => act(async () => (find(selector) as HTMLElement | null)?.click());
  const done = () => {
    act(() => root.unmount());
    host.remove();
  };
  await press('[data-call-more]');
  return { host, find, press, done };
};

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  srcObject = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'srcObject');
  Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', { configurable: true, get: () => null, set: () => undefined });
  await loadCallControlsCatalog('fr');
  await import('./call-control-actions');
});

afterEach(() => {
  videoEffectsStore.setState({ effects: NO_EFFECTS });
});

afterAll(async () => {
  await act(async () => {});
  if (srcObject !== undefined) Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', srcObject);
  Reflect.deleteProperty(navigator, 'mediaDevices');
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const webcams: readonly Device[] = [
  { kind: 'videoinput', deviceId: 'cam-1', label: 'FaceTime HD' },
  { kind: 'videoinput', deviceId: 'cam-2', label: 'Logitech C920' },
  { kind: 'audioinput', deviceId: 'mic-1', label: 'Micro' },
];

describe('choisir sa caméra sur un ordinateur à plusieurs webcams (#9094)', () => {
  test('deux webcams sans avant ni arrière : « Caméra » ouvre le choix à la place de « Retourner »', async () => {
    withDevices(webcams);
    const view = await mount({ media: 'video', cameraOn: true, localStream: videoOf('cam-1') });
    expect(view.find('[data-call-control="flip"]')).toBeNull();
    const picker = view.find('[data-call-control="camera-picker"]');
    expect(picker?.getAttribute('aria-label')).toBe('Choisir la caméra');
    expect(picker?.getAttribute('aria-haspopup')).not.toBeNull();
    view.done();
  });

  test('le choix liste les caméras, coche celle qui tourne, et ouvre celle qu’on touche', async () => {
    withDevices(webcams);
    const selected: string[] = [];
    const original = callActions.selectCamera;
    callActions.selectCamera = (deviceId) => void selected.push(deviceId);
    const view = await mount({ media: 'video', cameraOn: true, localStream: videoOf('cam-1') });
    await view.press('[data-call-control="camera-picker"]');
    const options = [...document.querySelectorAll('[role="menu"] [role="menuitemradio"]')];
    expect(options.map((option) => [option.textContent, option.getAttribute('aria-checked')])).toEqual([
      ['FaceTime HD', 'true'],
      ['Logitech C920', 'false'],
    ]);
    await view.press('[role="menuitemradio"][data-call-camera-option="cam-2"]');
    callActions.selectCamera = original;
    expect(selected).toEqual(['cam-2']);
    expect(document.querySelector('[role="menu"]')).toBeNull();
    view.done();
  });

  test('un téléphone (caméra arrière) garde « Retourner »', async () => {
    withDevices([
      { kind: 'videoinput', deviceId: 'front', label: 'Front Camera' },
      { kind: 'videoinput', deviceId: 'back', label: 'Back Camera' },
    ]);
    const view = await mount({ media: 'video', cameraOn: true, localStream: videoOf('front') });
    expect(view.find('[data-call-control="flip"]')).not.toBeNull();
    expect(view.find('[data-call-control="camera-picker"]')).toBeNull();
    view.done();
  });
});

describe('Effets montre son état (#9095, `.active` d’iOS)', () => {
  test('aucun effet posé : le bouton est au repos ; un effet posé : il est actif', async () => {
    withDevices([]);
    const idle = await mount({ media: 'video', cameraOn: true, localStream: videoOf('cam-1') });
    expect(idle.find('[data-call-control="effects"]')?.getAttribute('aria-pressed')).toBe('false');
    idle.done();
    setVideoEffects({ preset: 'warm' });
    const active = await mount({ media: 'video', cameraOn: true, localStream: videoOf('cam-1') });
    expect(active.find('[data-call-control="effects"]')?.getAttribute('aria-pressed')).toBe('true');
    active.done();
  });
});

describe('un appel vocal propose d’ajouter la vidéo (#9095, `video.badge.plus`)', () => {
  test('caméra éteinte en appel vocal : la caméra porte le « + » ; coupée en appel vidéo : la caméra barrée', async () => {
    withDevices([]);
    const audio = await mount({ media: 'audio', cameraOn: false });
    expect(audio.find('[data-call-control="camera"] [data-call-camera-glyph]')?.getAttribute('data-call-camera-glyph')).toBe('add');
    audio.done();
    const video = await mount({ media: 'video', cameraOn: false });
    expect(video.find('[data-call-control="camera"] [data-call-camera-glyph]')?.getAttribute('data-call-camera-glyph')).toBe('off');
    video.done();
  });

  test('pendant MON partage, Caméra dit la caméra gardée en aperçu comme iOS : allumée, pressée, inactive, et son libellé est celui d’une caméra allumée (S2.8)', async () => {
    withDevices([]);
    const filming = await mount({ media: 'video', cameraOn: true, localStream: videoOf('cam-1') });
    const label = filming.find('[data-call-control="camera"]')?.getAttribute('aria-label');
    filming.done();
    const sharing = await mount({ media: 'video', cameraOn: false, screenSharing: true, localStream: videoOf('screen'), cameraPreview: videoOf('cam-1') });
    const camera = sharing.find('[data-call-control="camera"]');
    expect(camera?.querySelector('[data-call-camera-glyph]')?.getAttribute('data-call-camera-glyph')).toBe('on');
    expect(camera?.getAttribute('aria-pressed')).toBe('true');
    expect(camera?.hasAttribute('disabled') === true || camera?.getAttribute('aria-disabled') === 'true').toBe(true);
    expect(camera?.getAttribute('aria-label')).toBe(label ?? '');
    sharing.done();
  });
});

describe('l’image dans l’image vit dans l’en-tête, entre Réduire et Conversation (#17329)', () => {
  test('offerte, elle s’ouvre dans le geste depuis l’en-tête et quitte la liste « l’appel »', async () => {
    const pipWindow = window as unknown as { documentPictureInPicture?: unknown };
    withDevices([]);
    pipWindow.documentPictureInPicture = {};
    const opened: string[] = [];
    const unregister = registerPipOpener(async () => {
      opened.push('ouverte');
      return true;
    });
    try {
      const view = await mount({ media: 'video', members: { 'u-peer': member({ cameraOn: true }) }, remoteStreams: { 'u-peer': videoOf('remote') } });
      const header = [...document.querySelectorAll('[data-call-header] button')].map((button) => button.getAttribute('aria-label'));
      expect(header).toEqual(['Réduire', 'Image dans l’image', 'Conversation']);
      expect(view.find('[data-call-rail="call"] [data-call-control="pip"]')).toBeNull();
      act(() => (view.find('[data-call-header] [data-call-pip]') as HTMLElement | null)?.click());
      expect(opened).toEqual(['ouverte']);
      view.done();
    } finally {
      unregister();
      delete pipWindow.documentPictureInPicture;
    }
  });

  test('flottante, le même bouton propose d’en SORTIR', async () => {
    const pipWindow = window as unknown as { documentPictureInPicture?: unknown };
    withDevices([]);
    pipWindow.documentPictureInPicture = {};
    const closed: string[] = [];
    const unregister = registerPipCloser(() => void closed.push('fermée'));
    act(() => pipOpenStore.setState({ open: true }));
    try {
      const view = await mount({ media: 'video', members: { 'u-peer': member({ cameraOn: true }) }, remoteStreams: { 'u-peer': videoOf('remote') } });
      const exit = view.find('[data-call-header] [data-call-pip]') as HTMLElement | null;
      expect(exit?.getAttribute('aria-label')).toBe('Quitter l’image dans l’image');
      act(() => exit?.click());
      expect(closed).toEqual(['fermée']);
      view.done();
    } finally {
      unregister();
      act(() => pipOpenStore.setState({ open: false }));
      delete pipWindow.documentPictureInPicture;
    }
  });

  test('sans image dans l’image possible, l’en-tête ne porte que Réduire et Conversation', async () => {
    withDevices([]);
    const view = await mount({ media: 'video', members: { 'u-peer': member({ cameraOn: true }) }, remoteStreams: { 'u-peer': videoOf('remote') } });
    expect(view.find('[data-call-header] [data-call-pip]')).toBeNull();
    view.done();
  });
});
