import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import type { AcceptOptions } from '@/lib/calls/engine';
import type { ActiveCall } from '@/lib/calls/call-store';
import type { SelfPreviewDeps } from '@/lib/calls/incoming-self-preview';
import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';
import { track, type FakeTrack } from '@/test-support/call-engine-harness';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CallIncomingAnswer } from './call-incoming-answer';
import { CallScreen } from './call-screen';

/**
 * DÉCROCHER UN APPEL VIDÉO EN SACHANT CE QUI PART (#16944, vue P17) — ma
 * vignette quand la caméra est déjà autorisée, une barre de verre qui dit ce
 * que l'autre recevra (« Awa Diallo vous verra en décrochant ») avec mes deux
 * bascules, et trois réponses : Refuser, Sans vidéo, Accepter. Décrocher tient
 * la promesse de la barre.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  await loadCallControlsCatalog('fr');
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const ringing = (overrides: Partial<ActiveCall> = {}): ActiveCall => ({
  callId: 'call-1',
  conversationId: 'c-1',
  media: 'video',
  direction: 'incoming',
  isGroup: false,
  title: 'Awa Diallo',
  avatar: null,
  callerName: 'Awa Diallo',
  phase: { kind: 'incoming' },
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
  ...overrides,
});

const never: SelfPreviewDeps<MediaStream> = { granted: async () => false, open: () => Promise.reject(new Error('jamais')) };

const mount = (node: React.ReactElement) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(node));
  const find = (selector: string) => host.querySelector<HTMLElement>(selector);
  const press = (selector: string) => act(() => find(selector)?.click());
  const done = () => {
    act(() => root.unmount());
    host.remove();
  };
  return { find, press, done };
};

const answer = (call: ActiveCall, selfPreview: SelfPreviewDeps<MediaStream> = never) => {
  const accepted: AcceptOptions[] = [];
  const counts = { declined: 0, messages: 0 };
  const view = mount(
    <CallIncomingAnswer
      call={call}
      language="fr"
      selfPreview={selfPreview}
      onAccept={(options) => void accepted.push(options)}
      onDecline={() => void (counts.declined += 1)}
      onDeclineMessage={() => void (counts.messages += 1)}
    />,
  );
  return { ...view, accepted, counts };
};

describe('la barre de ce qui part en décrochant', () => {
  test('« Awa Diallo vous verra en décrochant », micro et caméra allumés', () => {
    const view = answer(ringing());
    expect(view.find('[data-call-incoming-consent]')?.textContent).toContain('Awa Diallo vous verra en décrochant');
    expect(view.find('[data-call-incoming-consent]')?.className.split(' ')).toContain('glass-call-prominent');
    expect(view.find('[data-call-incoming-mic]')?.getAttribute('aria-pressed')).toBe('true');
    expect(view.find('[data-call-incoming-mic]')?.getAttribute('aria-label')).toBe('Couper le micro');
    expect(view.find('[data-call-incoming-camera]')?.getAttribute('aria-pressed')).toBe('true');
    expect(view.find('[data-call-incoming-camera]')?.getAttribute('aria-label')).toBe('Couper la caméra');
    view.done();
  });

  test('caméra coupée : « vous entendra », et Accepter décroche sans vidéo ; tout coupé, la barre le dit', () => {
    const view = answer(ringing());
    view.press('[data-call-incoming-camera]');
    expect(view.find('[data-call-incoming-consent]')?.textContent).toContain('Awa Diallo vous entendra en décrochant');
    expect(view.find('[data-call-incoming-camera]')?.getAttribute('aria-label')).toBe('Activer la caméra');
    view.press('[data-call-incoming-accept]');
    expect(view.accepted).toEqual([{ audioOnly: true, micMuted: false }]);
    view.press('[data-call-incoming-mic]');
    expect(view.find('[data-call-incoming-consent]')?.textContent).toContain('Micro et caméra coupés en décrochant');
    view.done();
  });

  test('micro coupé : Accepter décroche en vidéo, micro coupé ; « Sans vidéo » garde le micro choisi', () => {
    const view = answer(ringing());
    view.press('[data-call-incoming-mic]');
    view.press('[data-call-incoming-accept]');
    view.press('[data-call-incoming-audio-only]');
    expect(view.accepted).toEqual([
      { audioOnly: false, micMuted: true },
      { audioOnly: true, micMuted: true },
    ]);
    view.done();
  });

  test('un appel VOCAL : ni barre ni vignette, Refuser et Accepter seulement', () => {
    const view = answer(ringing({ media: 'audio' }));
    expect(view.find('[data-call-incoming-consent]')).toBeNull();
    expect(view.find('[data-call-incoming-audio-only]')).toBeNull();
    view.press('[data-call-incoming-accept]');
    expect(view.accepted).toEqual([{ audioOnly: true, micMuted: false }]);
    view.done();
  });
});

describe('les trois réponses', () => {
  test('« Sans vidéo » en légende, la phrase entière pour le lecteur d’écran ; Refuser et le message gardent leur effet', () => {
    const view = answer(ringing());
    const audioOnly = view.find('[data-call-incoming-audio-only]');
    expect(audioOnly?.getAttribute('aria-label')).toBe('Répondre sans vidéo');
    expect(audioOnly?.parentElement?.textContent).toBe('Sans vidéo');
    view.press('[data-call-incoming-decline]');
    view.press('[data-call-control="decline-message"]');
    expect(view.counts).toEqual({ declined: 1, messages: 1 });
    view.done();
  });
});

describe('ma vignette pendant la sonnerie', () => {
  /* Une doublure qui PASSE pour un MediaStream (`srcObject` de happy-dom le vérifie). */
  const domStream = (tracks: readonly FakeTrack[]): MediaStream => Object.assign(Object.create(MediaStream.prototype) as MediaStream, { getTracks: () => tracks, getVideoTracks: () => tracks, getAudioTracks: () => [] });
  const granted = (camera = track('video')): SelfPreviewDeps<MediaStream> => ({ granted: async () => true, open: async () => domStream([camera]) });

  test('caméra déjà autorisée : ma vignette paraît, à ma couleur ; couper la caméra la retire et l’éteint', async () => {
    const camera = track('video');
    const view = answer(ringing(), granted(camera));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    const tile = view.find('[data-call-incoming-self]');
    expect(tile).not.toBeNull();
    expect(tile?.getAttribute('aria-hidden')).toBe('true');
    expect(tile?.style.borderColor).not.toBe('');
    view.press('[data-call-incoming-camera]');
    expect(view.find('[data-call-incoming-self]')).toBeNull();
    expect(camera.readyState).toBe('ended');
    view.done();
  });

  test('pas encore autorisée : aucune vignette, aucune question', async () => {
    const view = answer(ringing(), never);
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(view.find('[data-call-incoming-self]')).toBeNull();
    view.done();
  });

  test('décrocher éteint l’aperçu : le moteur ouvre sa propre caméra', async () => {
    const camera = track('video');
    const view = answer(ringing(), granted(camera));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    view.press('[data-call-incoming-accept]');
    expect(camera.readyState).toBe('ended');
    view.done();
  });
});

describe('l’écran de sonnerie avec la vidéo de l’appelant', () => {
  const liveVideo = () => {
    const tracks = [{ kind: 'video', readyState: 'live' }];
    return Object.assign(Object.create(MediaStream.prototype) as MediaStream, { getTracks: () => tracks, getVideoTracks: () => tracks, getAudioTracks: () => [] });
  };

  test('la vidéo de l’appelant remplace son portrait ; son nom et la barre restent', () => {
    const view = mount(<CallScreen call={ringing({ preview: liveVideo() })} />);
    expect(view.find('[data-call-incoming-portrait]')).toBeNull();
    expect(view.find('[data-call-screen="incoming"]')?.textContent).toContain('Awa Diallo');
    expect(view.find('[data-call-incoming-consent]')).not.toBeNull();
    view.done();
    const bare = mount(<CallScreen call={ringing()} />);
    expect(bare.find('[data-call-incoming-portrait]')).not.toBeNull();
    bare.done();
  });
});
