import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { callOutputStore } from '@/lib/calls/call-output';
import type { ActiveCall, CallMember } from '@/lib/calls/call-store';
import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';
import { loadPillMotion } from '@/lib/calls/use-pill-motion';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CallScreen } from './call-screen';

/**
 * P1.6 · #17843 — « Sortie », dans la pilule, s'allume quand le son part vers un appareil externe, en
 * audio comme en vidéo, et le lecteur d'écran dit où il part : la loi `callOutputButtonTone`, miroir de
 * `CallOutputButtonRule` d'iOS et d'Android (#18411). Dans le navigateur, l'appareil externe est la
 * sortie CHOISIE dans la feuille des appareils, tant qu'elle est branchée ; dans la coque, la route
 * qu'elle rapporte. Le défaut du système, et le haut-parleur d'office d'un appel vidéo, sont le repos.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

const member = (userId: string, name: string, cameraOn = true): CallMember => ({ userId, name, avatar: null, micMuted: false, cameraOn, screenSharing: false, weakNetwork: false, capturing: false, link: 'connected' });

const call = (overrides: Partial<ActiveCall> = {}): ActiveCall => ({
  callId: 'call-1',
  conversationId: 'c-1',
  media: 'video',
  direction: 'outgoing',
  isGroup: false,
  title: 'Awa',
  avatar: null,
  callerName: null,
  phase: { kind: 'connected' },
  connectedAt: 0,
  endedDurationSec: null,
  micMuted: false,
  cameraOn: true,
  facing: 'user',
  screenSharing: false,
  members: { 'u-awa': member('u-awa', 'Awa') },
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

const audio: Partial<ActiveCall> = { media: 'audio', cameraOn: false, members: { 'u-awa': member('u-awa', 'Awa', false) } };

type Output = { readonly deviceId: string; readonly label: string };

/** Les sorties que le navigateur liste : `null`, il n'en liste aucune (pas d'`enumerateDevices`). */
const plugged = (outputs: readonly Output[] | null) => {
  const media = navigator as Navigator & { mediaDevices?: unknown };
  const original = Object.getOwnPropertyDescriptor(media, 'mediaDevices');
  const devices =
    outputs === null
      ? undefined
      : {
          enumerateDevices: async () => {
            return outputs.map((output) => ({ kind: 'audiooutput', deviceId: output.deviceId, label: output.label, groupId: '', toJSON: () => ({}) }));
          },
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        };
  Object.defineProperty(media, 'mediaDevices', { value: devices, configurable: true });
  return {
    restore: () => (original === undefined ? Reflect.deleteProperty(media, 'mediaDevices') : Object.defineProperty(media, 'mediaDevices', original)),
  };
};

beforeAll(async () => {
  await loadPillMotion();
  await loadCallControlsCatalog('fr');
  renderToStaticMarkup(<CallScreen call={call()} canShare />);
  await new Promise((resolve) => setTimeout(resolve, 0));
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(() => {
  callOutputStore.setState({ sinkId: null, route: null });
});

const mount = (overrides: Partial<ActiveCall> = {}) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(<CallScreen call={call(overrides)} canShare effectsSupport={{ color: false, blur: false }} wide={false} />));
  const output = () => [...host.querySelectorAll<HTMLElement>('[data-call-control-pill] [data-call-devices-open]')].find((node) => node.closest('[data-call-pill-ghost]') === null) ?? null;
  const settle = () => act(async () => {});
  const done = () => {
    act(() => root.unmount());
    host.remove();
  };
  return { output, settle, done };
};

/** Le ton que le bouton porte : le disque de verre dessiné, ou le disque blanc plein de l'enclenché. */
const toneOf = (button: HTMLElement | null): 'disc' | 'active' | null => {
  if (button === null) return null;
  if (button.className.split(' ').includes('glass-call-disc')) return 'disc';
  return button.style.background === 'var(--color-on-media)' ? 'active' : null;
};

describe('« Sortie » s’allume quand le son part vers un appareil externe (P1.6)', () => {
  test('au défaut du système, Sortie est un disque de verre, en audio comme en vidéo', async () => {
    const devices = plugged([{ deviceId: 'spk-usb', label: 'Casque USB' }]);
    for (const overrides of [{}, audio]) {
      const view = mount(overrides);
      await view.settle();
      expect(toneOf(view.output())).toBe('disc');
      expect(view.output()?.getAttribute('aria-label')).toBe('Sortie audio');
      view.done();
    }
    devices.restore();
  });

  test('une sortie choisie et branchée allume Sortie en vidéo ET en audio ; le lecteur d’écran dit où part le son', async () => {
    const devices = plugged([{ deviceId: 'spk-usb', label: 'Casque USB' }]);
    callOutputStore.setState({ sinkId: 'spk-usb' });
    for (const overrides of [{}, audio]) {
      const view = mount(overrides);
      await view.settle();
      expect(toneOf(view.output())).toBe('active');
      expect(view.output()?.getAttribute('aria-label')).toBe('Sortie audio, Casque USB');
      expect(view.output()?.getAttribute('aria-haspopup')).toBe('dialog');
      view.done();
    }
    devices.restore();
  });

  test('une sortie choisie puis débranchée : le son part au défaut, Sortie redevient un disque', async () => {
    const devices = plugged([{ deviceId: 'spk-hdmi', label: 'Écran HDMI' }]);
    callOutputStore.setState({ sinkId: 'spk-usb' });
    const view = mount();
    await view.settle();
    expect(toneOf(view.output())).toBe('disc');
    expect(view.output()?.getAttribute('aria-label')).toBe('Sortie audio');
    view.done();
    devices.restore();
  });

  test('choisir une sortie pendant l’appel allume Sortie sans rouvrir l’écran ; revenir au défaut l’éteint', async () => {
    const devices = plugged([{ deviceId: 'spk-usb', label: 'Casque USB' }]);
    const view = mount(audio);
    await view.settle();
    expect(toneOf(view.output())).toBe('disc');
    act(() => callOutputStore.setState({ sinkId: 'spk-usb' }));
    await view.settle();
    expect(toneOf(view.output())).toBe('active');
    act(() => callOutputStore.setState({ sinkId: null }));
    await view.settle();
    expect(toneOf(view.output())).toBe('disc');
    view.done();
    devices.restore();
  });

  test('dans la coque, la route rapportée décide : Bluetooth allume Sortie, le haut-parleur en audio seulement, l’écouteur jamais', async () => {
    const cases = [
      { route: 'bluetooth', overrides: {}, tone: 'active', said: 'Sortie audio, Bluetooth' },
      { route: 'wired', overrides: audio, tone: 'active', said: 'Sortie audio, Casque filaire' },
      { route: 'speaker', overrides: audio, tone: 'active', said: 'Sortie audio, Haut-parleur' },
      { route: 'speaker', overrides: {}, tone: 'disc', said: 'Sortie audio, Haut-parleur' },
      { route: 'earpiece', overrides: audio, tone: 'disc', said: 'Sortie audio, Écouteur' },
    ] as const;
    for (const { route, overrides, tone, said } of cases) {
      callOutputStore.setState({ route });
      const view = mount(overrides);
      await view.settle();
      expect(toneOf(view.output())).toBe(tone);
      expect(view.output()?.getAttribute('aria-label')).toBe(said);
      view.done();
    }
  });
});
