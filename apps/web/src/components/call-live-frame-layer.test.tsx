import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { NO_LIVE_FRAME, callLiveFrameStore, type CallLiveFrameState } from '@/lib/calls/call-live-frame-store';
import type { ActiveCall, CallMember } from '@/lib/calls/call-store';
import { loadPillMotion } from '@/lib/calls/use-pill-motion';
import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CallLiveFrameStatus, CallLiveFrameSurface, LIVE_FRAME_NOTICE_MS, liveFramePaintSize } from './call-live-frame-layer';
import { CallScreen } from './call-screen';

/**
 * LE CADRE EN DIRECT À L'ÉCRAN (#16943, vues C2 et C3) — la carte de
 * proposition chez l'autre, la capsule de réponse chez qui a proposé, et la
 * carte posée par l'écran d'appel dès que la session en reçoit une.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  await loadPillMotion();
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
    act(() => callLiveFrameStore.setState({ callId: '6650c0ffee0000000000c411', proposal: { frameId: 'jovial.fete.duo', from: 'Awa' } }));
    await act(async () => {
      await import('@/lib/calls/frames/frame-studio');
    });
    for (let tries = 0; tries < 40 && view.find('[data-call-live-frame-slot]') === null; tries += 1) await act(async () => new Promise((resolve) => setTimeout(resolve, 25)));
    const slot = view.find('[data-call-live-frame-slot]');
    expect(slot).not.toBeNull();
    expect(slot?.querySelector('[data-call-live-frame-proposal]')).not.toBeNull();
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

describe('la carte et la capsule entrent et repartent en mouvement (C2.1, C2.7, C3.6)', () => {
  type Played = { readonly what: string; readonly keyframes: Keyframe[]; readonly duration: unknown };
  const proto = (): { animate?: unknown } => HTMLElement.prototype as unknown as { animate?: unknown };
  const played: Played[] = [];
  const finishers: Array<() => void> = [];
  let before: PropertyDescriptor | undefined;
  let media: PropertyDescriptor | undefined;

  beforeEach(() => {
    before = Object.getOwnPropertyDescriptor(proto(), 'animate');
    media = Object.getOwnPropertyDescriptor(window, 'matchMedia');
    played.length = 0;
    finishers.length = 0;
    Object.defineProperty(proto(), 'animate', {
      configurable: true,
      writable: true,
      value: function (this: HTMLElement, keyframes: Keyframe[], options: { duration: number }) {
        played.push({ what: this.hasAttribute('data-call-live-frame-slot') ? 'slot' : this.hasAttribute('data-call-live-frame-surface-host') ? 'surface' : 'other', keyframes, duration: options.duration });
        const finished = new Promise<void>((resolve) => finishers.push(resolve));
        return { cancel: () => undefined, finished, onfinish: null };
      },
    });
  });
  afterEach(() => {
    if (before === undefined) Reflect.deleteProperty(proto(), 'animate');
    else Object.defineProperty(proto(), 'animate', before);
    if (media === undefined) Reflect.deleteProperty(window, 'matchMedia');
    else Object.defineProperty(window, 'matchMedia', media);
  });

  const none = { proposal: null, answer: null, notice: null } as const;
  const proposal = { proposal: { frameId: 'jovial.confettis', from: 'Awa' }, answer: null, notice: null } as const;
  const answer = { proposal: null, answer: { frameId: 'jovial.fete.duo', from: 'Awa', reply: 'accepted' as const }, notice: null };
  const slots = () => played.filter((entry) => entry.what === 'slot');
  const finish = () => act(async () => void finishers.splice(0).forEach((resolve) => resolve()));

  test('la carte tient la largeur de la pile : sa case est pleine largeur, la carte garde sa marge', () => {
    const view = mountNode(status(proposal, spy()));
    expect(view.find('[data-call-live-frame-slot]')?.className.split(' ')).toContain('w-full');
    expect(view.find('[data-call-live-frame-proposal]')?.className.split(' ')).toContain('mx-3');
    view.done();
  });

  test('la carte entre depuis le haut, et repart vers lui sans prendre le doigt', async () => {
    const view = mountNode(status(none, spy()));
    expect(view.find('[data-call-live-frame-slot]')).toBeNull();
    view.rerender(status(proposal, spy()));
    expect(slots().map((entry) => [entry.keyframes[0], entry.keyframes[1], entry.duration])).toEqual([[{ opacity: 0, transform: 'translateY(-100%)' }, { opacity: 1, transform: 'translateY(0)' }, 200]]);
    await finish();
    view.rerender(status(none, spy()));
    const leaving = view.find('[data-call-live-frame-slot]');
    expect(leaving?.hasAttribute('data-leaving')).toBe(true);
    expect(leaving?.hasAttribute('inert')).toBe(true);
    expect(leaving?.querySelector('[data-call-live-frame-proposal]')).not.toBeNull();
    expect(slots()[1]?.keyframes.map((frame) => frame.transform)).toEqual(['translateY(0)', 'translateY(-100%)']);
    await finish();
    expect(view.find('[data-call-live-frame-slot]')).toBeNull();
    view.done();
  });

  test('la capsule de réponse entre et repart de même, et se retire seule au bout de quatre secondes', async () => {
    const view = mountNode(status(none, spy()));
    view.rerender(status(answer, spy()));
    expect(slots()).toHaveLength(1);
    expect(view.find('[data-call-live-frame-answer]')?.textContent).toBe('Awa a appliqué votre cadre');
    await finish();
    view.rerender(status(none, spy()));
    expect(view.find('[data-call-live-frame-slot]')?.hasAttribute('data-leaving')).toBe(true);
    expect(view.find('[data-call-live-frame-answer]')?.textContent).toBe('Awa a appliqué votre cadre');
    expect(slots()).toHaveLength(2);
    await finish();
    expect(view.find('[data-call-live-frame-slot]')).toBeNull();
    view.done();
  });

  test('sous « Réduire les animations » : un fondu court, sans déplacement', async () => {
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: true }) });
    const view = mountNode(status(none, spy()));
    view.rerender(status(proposal, spy()));
    await finish();
    view.rerender(status(none, spy()));
    expect(slots().map((entry) => entry.duration)).toEqual([150, 150]);
    expect(slots().every((entry) => entry.keyframes.every((frame) => frame.transform === undefined))).toBe(true);
    view.done();
  });

  test('une proposition qui revient pendant le départ reprend sa place, sans se démonter', async () => {
    const view = mountNode(status(proposal, spy()));
    view.rerender(status(none, spy()));
    view.rerender(status(proposal, spy()));
    expect(view.find('[data-call-live-frame-slot]')?.hasAttribute('data-leaving')).toBe(false);
    await finish();
    expect(view.find('[data-call-live-frame-proposal]')).not.toBeNull();
    view.done();
  });

  test('la feuille sort la case qui repart de la mise en page, pour que la pile se referme sans l’attendre', () => {
    const sheet = readFileSync(new URL('../styles/call-motion.css', import.meta.url), 'utf8');
    expect(sheet).toMatch(/\[data-call-banner-stack\]\s*>\s*\[data-call-live-frame-slot\]\[data-leaving\][^{]*\{[^}]*position:\s*absolute/);
  });

  test('le cadre gardé se fond : sa toile paraît et s’efface en fondu, sans déplacement, et ne prend aucun toucher', async () => {
    const studio = (await import('@/lib/calls/frames/frame-studio')).createFrameStudio();
    const surface = (frameId: string | null) => <CallLiveFrameSurface language="fr" studio={studio} shown={frameId === null ? null : { frameId, remoteSharedName: null }} call={duoCall()} stage={() => null} />;
    const view = mountNode(surface(null));
    expect(view.find('[data-call-live-frame-surface-host]')).toBeNull();
    view.rerender(surface('jovial.fete.duo'));
    expect(view.find('[data-call-live-frame-surface-host] canvas[data-call-live-frame-surface]')).not.toBeNull();
    expect(played.filter((entry) => entry.what === 'surface').map((entry) => entry.keyframes)).toEqual([[{ opacity: 0, transform: 'none' }, { opacity: 1, transform: 'none' }]]);
    await finish();
    view.rerender(surface(null));
    const leaving = view.find('[data-call-live-frame-surface-host]');
    expect(leaving?.hasAttribute('data-leaving')).toBe(true);
    expect(leaving?.querySelector('canvas')).not.toBeNull();
    expect(played.filter((entry) => entry.what === 'surface').map((entry) => entry.keyframes[1]?.opacity)).toEqual([1, 0]);
    await finish();
    expect(view.find('[data-call-live-frame-surface-host]')).toBeNull();
    view.done();
  });
});
