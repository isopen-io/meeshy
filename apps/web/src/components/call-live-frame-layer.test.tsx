import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { NO_LIVE_FRAME, callLiveFrameStore, type CallLiveFrameState } from '@/lib/calls/call-live-frame-store';
import type { ActiveCall, CallMember } from '@/lib/calls/call-store';
import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CallLiveFrameStatus, LIVE_FRAME_NOTICE_MS, liveFramePaintSize } from './call-live-frame-layer';
import { CallScreen } from './call-screen';

/**
 * LE CADRE EN DIRECT À L'ÉCRAN (#16943, vues C2 et C3) — la carte de
 * proposition chez l'autre, la capsule de réponse chez qui a proposé, et la
 * carte posée par l'écran d'appel dès que la session en reçoit une.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  await loadCallControlsCatalog('fr');
  await loadCallControlsCatalog('en');
  await import('./call-control-actions');
  await import('./call-live-frame-layer');
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(() => callLiveFrameStore.setState(NO_LIVE_FRAME, true));

const mountNode = (node: React.ReactElement) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(node));
  const find = (selector: string) => host.querySelector<HTMLElement>(selector);
  const done = () => {
    act(() => root.unmount());
    host.remove();
  };
  return { host, find, rerender: (next: React.ReactElement) => act(() => root.render(next)), done };
};

const names = (id: string): string | null => (id === 'jovial.confettis' ? 'Jovial' : null);

const status = (state: Pick<CallLiveFrameState, 'proposal' | 'answer' | 'notice'>, spies: { accepted: number; declined: number; answers: number; notices: number }, language: 'fr' | 'en' = 'fr') => (
  <CallLiveFrameStatus
    language={language}
    state={state}
    nameOf={names}
    onAccept={() => void (spies.accepted += 1)}
    onDecline={() => void (spies.declined += 1)}
    onDismissAnswer={() => void (spies.answers += 1)}
    onDismissNotice={() => void (spies.notices += 1)}
  />
);

const spy = () => ({ accepted: 0, declined: 0, answers: 0, notices: 0 });

describe('la carte de proposition (C2)', () => {
  test('« Awa vous propose le cadre « Jovial » » · « Non merci » · « Appliquer », chacun avec son effet', () => {
    const spies = spy();
    const view = mountNode(status({ proposal: { frameId: 'jovial.confettis', from: 'Awa' }, answer: null, notice: null }, spies));
    expect(view.find('[data-call-live-frame-proposal]')?.textContent).toContain('Awa vous propose le cadre « Jovial »');
    expect(view.find('[data-call-live-frame-proposal]')?.className.split(' ')).toContain('glass-call-prominent');
    act(() => view.find('[data-call-live-frame-decline]')?.click());
    act(() => view.find('[data-call-live-frame-accept]')?.click());
    expect(spies).toEqual({ accepted: 1, declined: 1, answers: 0, notices: 0 });
    expect(view.find('[data-call-live-frame-decline]')?.textContent).toBe('Non merci');
    expect(view.find('[data-call-live-frame-accept]')?.textContent).toBe('Appliquer');
    view.done();
  });

  test('sans prénom partagé, « Votre correspondant » ; un cadre inconnu du catalogue ne pose aucune carte', () => {
    const anonymous = mountNode(status({ proposal: { frameId: 'jovial.confettis', from: null }, answer: null, notice: null }, spy()));
    expect(anonymous.find('[data-call-live-frame-proposal]')?.textContent).toContain('Votre correspondant vous propose le cadre « Jovial »');
    anonymous.done();
    const unknown = mountNode(status({ proposal: { frameId: 'inconnu.cadre', from: 'Awa' }, answer: null, notice: null }, spy()));
    expect(unknown.find('[data-call-live-frame-proposal]')).toBeNull();
    unknown.done();
  });

  test('dans la langue d’interface', () => {
    const view = mountNode(status({ proposal: { frameId: 'jovial.confettis', from: 'Awa' }, answer: null, notice: null }, spy(), 'en'));
    expect(view.find('[data-call-live-frame-proposal]')?.textContent).toContain('Awa suggests the “Jovial” frame');
    expect(view.find('[data-call-live-frame-accept]')?.textContent).toBe('Apply');
    view.done();
  });
});

describe('la réponse à ma proposition (C3)', () => {
  test('« Awa a appliqué votre cadre », annoncé, puis effacé au bout de quatre secondes', async () => {
    const spies = spy();
    const view = mountNode(status({ proposal: null, answer: { frameId: 'jovial.confettis', reply: 'accepted', from: 'Awa' }, notice: null }, spies));
    const capsule = view.find('[data-call-live-frame-answer]');
    expect(capsule?.textContent).toBe('Awa a appliqué votre cadre');
    expect(capsule?.getAttribute('role')).toBe('status');
    await act(async () => new Promise((resolve) => setTimeout(resolve, LIVE_FRAME_NOTICE_MS + 50)));
    expect(spies.answers).toBe(1);
    view.done();
  });

  test('un refus : « Awa garde son affichage »', () => {
    const view = mountNode(status({ proposal: null, answer: { frameId: 'jovial.confettis', reply: 'declined', from: 'Awa' }, notice: null }, spy()));
    expect(view.find('[data-call-live-frame-answer]')?.textContent).toBe('Awa garde son affichage');
    view.done();
  });

  test('un cadre que la passerelle n’a pas proposé le dit', () => {
    const view = mountNode(status({ proposal: null, answer: null, notice: 'not-proposed' }, spy()));
    expect(view.find('[data-call-live-frame-notice]')?.textContent).toBe("Le cadre est appliqué chez vous, mais n'a pas pu être proposé");
    view.done();
  });
});

describe('la toile du cadre', () => {
  test('à la taille de l’écran en pixels, bornée à 2048 sur son plus long côté', () => {
    expect(liveFramePaintSize({ width: 390, height: 844 }, 2)).toEqual({ width: 780, height: 1688 });
    expect(liveFramePaintSize({ width: 430, height: 932 }, 3)).toEqual({ width: 945, height: 2048 });
    expect(liveFramePaintSize({ width: 1280, height: 800 }, 0.5)).toEqual({ width: 1280, height: 800 });
  });
});

const member = (userId: string, name: string): CallMember => ({ userId, name, avatar: null, micMuted: false, cameraOn: true, screenSharing: false, weakNetwork: false, capturing: false, link: 'connected' });

const duoCall = (overrides: Partial<ActiveCall> = {}): ActiveCall => ({
  callId: '6650c0ffee0000000000c411',
  conversationId: 'c-1',
  media: 'video',
  direction: 'outgoing',
  isGroup: false,
  title: 'Awa',
  avatar: null,
  callerName: null,
  initiatorId: null,
  invitedBy: null,
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
  transcription: 'idle',
  quality: null,
  preview: null,
  previewed: false,
  ...overrides,
});

describe('l’écran d’appel pose la carte', () => {
  test('une proposition reçue paraît sous l’en-tête, hors de ce qu’un toucher range (loi 11)', async () => {
    const view = mountNode(<CallScreen call={duoCall()} canShare effectsSupport={{ color: false, blur: false }} />);
    expect(view.find('[data-call-live-frame-slot]')).toBeNull();
    act(() => callLiveFrameStore.setState({ callId: '6650c0ffee0000000000c411', proposal: { frameId: 'jovial.confettis', from: 'Awa' } }));
    await act(async () => {
      await import('@/lib/calls/frames/frame-studio');
    });
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    const slot = view.find('[data-call-live-frame-slot]');
    expect(slot).not.toBeNull();
    expect(slot?.closest('[data-call-chrome-fade]')).toBeNull();
    expect(slot?.className.split(' ')).not.toContain('invisible');
    view.done();
  });
});

describe('le cadre gardé à l’écran (C3)', () => {
  test('ma vignette s’efface, sa vidéo reste la source de ma case dans le cadre, et les commandes de ma caméra passent dans le menu', async () => {
    const view = mountNode(<CallScreen call={duoCall()} canShare effectsSupport={{ color: false, blur: false }} />);
    expect(view.find('[data-call-corner]')).not.toBeNull();
    act(() => callLiveFrameStore.setState({ callId: '6650c0ffee0000000000c411', frameId: 'jovial.fete.duo' }));
    await act(async () => {
      await import('@/lib/calls/frames/frame-studio');
    });
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    const frame = view.find('[data-call-corner-frame]');
    expect(frame?.hasAttribute('data-call-self-tile-composed')).toBe(true);
    expect(frame?.getAttribute('aria-hidden')).toBe('true');
    expect(frame?.className.split(' ')).toContain('opacity-0');
    expect(view.find('[data-call-self-controls-holder="tile"]')).toBeNull();
    view.done();
  });

  test('hors du duo vidéo, le cadre gardé ne se montre pas et ma vignette reste', () => {
    callLiveFrameStore.setState({ callId: '6650c0ffee0000000000c411', frameId: 'jovial.fete.duo' });
    const audio = mountNode(<CallScreen call={duoCall({ media: 'audio', cameraOn: false, members: { 'u-awa': { ...member('u-awa', 'Awa'), cameraOn: false } } })} canShare effectsSupport={{ color: false, blur: false }} />);
    expect(audio.find('[data-call-live-frame-surface]')).toBeNull();
    audio.done();
  });
});
