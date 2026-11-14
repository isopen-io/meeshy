import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { PORTRAIT_MORPH_MS, STOW_REDUCED_MS } from '@/lib/calls/call-pill-motion';
import type { ActiveCall, CallMember } from '@/lib/calls/call-store';
import { loadPillMotion } from '@/lib/calls/use-pill-motion';
import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CallScreen } from './call-screen';

/**
 * #17529 — EN APPEL AUDIO, LE JOURNAL OUVERT RÉDUIT L'AVATAR (loi 6, vue P9b ; `CallCompactAudioHeader` d'iOS) :
 * l'avatar passe à 56 px en haut, le nom et la durée à côté, et le journal prend la place libérée. Fermer le
 * journal, ouvrir (…) par-dessus ou ranger la pilule lui rend sa taille. Le passage est un morphisme (l'avatar
 * glisse et se réduit, le nom et la durée arrivent en fondu), joué en Web Animations ; sous « Réduire les
 * animations », un fondu court, sans déplacement.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

const member = (): CallMember => ({ userId: 'u-awa', name: 'Awa Diallo', avatar: null, micMuted: false, cameraOn: false, screenSharing: false, weakNetwork: false, capturing: false, link: 'connected' }) as CallMember;

const said = (n: number) => ({ id: `w-${n}`, speakerId: 'u-awa', speakerName: 'Awa', original: `Line ${n}`, translated: `Ligne ${n}`, pair: { from: 'en', to: 'fr' }, isFinal: true, at: n, mine: false });

const call = (overrides: Partial<ActiveCall> = {}): ActiveCall =>
  ({
    callId: 'call-audio-journal', conversationId: 'c-1', media: 'audio', direction: 'outgoing', isGroup: false, title: 'Awa Diallo', avatar: null, callerName: null, peerKey: 'u-awa', phase: { kind: 'connected' }, connectedAt: 0, endedDurationSec: null,
    micMuted: false, cameraOn: false, facing: 'user', screenSharing: false, members: { 'u-awa': member() }, display: 'full', localStream: null, remoteStreams: {}, captions: [said(1), said(2)], captionsMode: 'translated',
    captionPeers: [], preview: null, previewed: false, transcription: 'idle', initiatorId: null, invitedBy: null, quality: null, ...overrides,
  }) as ActiveCall;

const STAGE = '[data-call-audio-stage]';
const PORTRAIT = '[data-call-incoming-portrait]';

const runs: { readonly target: Element; readonly frames: readonly Keyframe[]; readonly duration: number }[] = [];
const saved: { animate?: PropertyDescriptor | undefined; rect?: PropertyDescriptor | undefined; media?: PropertyDescriptor | undefined } = {};

/* happy-dom ne met rien en page : le portrait dit sa place selon la forme de la scène, pleine (centrée) ou compacte (en haut). */
function placed(this: Element): DOMRect {
  const compact = this.closest(`${STAGE}[data-call-audio-stage="compact"]`) !== null;
  const box = this.matches(PORTRAIT) ? (compact ? { x: 24, y: 80, width: 80 } : { x: 127, y: 300, width: 136 }) : { x: 0, y: 0, width: 0 };
  return { ...box, left: box.x, top: box.y, height: box.width, right: box.x + box.width, bottom: box.y + box.width, toJSON: () => box } as DOMRect;
}

beforeAll(async () => {
  await loadPillMotion();
  await loadCallControlsCatalog('fr');
  renderToStaticMarkup(<CallScreen call={call()} canShare initiallyExpanded />);
  await import('./call-control-actions');
  await import('./call-journal-panel');
  await import('./call-captions-panel');
  await new Promise((resolve) => setTimeout(resolve, 0));
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
beforeEach(() => {
  runs.length = 0;
  saved.animate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
  saved.rect = Object.getOwnPropertyDescriptor(Element.prototype, 'getBoundingClientRect');
  saved.media = Object.getOwnPropertyDescriptor(window, 'matchMedia');
  Object.defineProperty(Element.prototype, 'getBoundingClientRect', { configurable: true, value: placed });
  Object.defineProperty(HTMLElement.prototype, 'animate', {
    configurable: true,
    value(this: Element, frames: Keyframe[], options: KeyframeAnimationOptions) {
      runs.push({ target: this, frames, duration: Number(options.duration) });
      return { finished: new Promise<void>(() => undefined), cancel: () => undefined, onfinish: null };
    },
  });
});
afterEach(() => {
  const restore = (target: object, key: string, descriptor: PropertyDescriptor | undefined) => (descriptor === undefined ? Reflect.deleteProperty(target, key) : Object.defineProperty(target, key, descriptor));
  restore(HTMLElement.prototype, 'animate', saved.animate);
  restore(Element.prototype, 'getBoundingClientRect', saved.rect);
  restore(window, 'matchMedia', saved.media);
});

const mount = (overrides: Partial<ActiveCall> = {}, { reducedMotion = false }: { readonly reducedMotion?: boolean } = {}) => {
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: (query: string) => ({ matches: reducedMotion && query.includes('reduce'), addEventListener: () => undefined, removeEventListener: () => undefined }) });
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(<CallScreen call={call(overrides)} canShare effectsSupport={{ color: false, blur: false }} wide={false} />));
  const find = (selector: string) => [...host.querySelectorAll<HTMLElement>(selector)].find((node) => node.closest('[data-call-pill-ghost]') === null) ?? null;
  return {
    find,
    press: (selector: string) => act(() => find(selector)?.click()),
    settle: () => act(async () => {}),
    stage: () => find(STAGE)?.getAttribute('data-call-audio-stage') ?? null,
    portraitSize: () => find(`${PORTRAIT} > div`)?.style.width ?? null,
    done: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
};

type View = ReturnType<typeof mount>;

const openJournal = async (view: View) => {
  view.press('[data-call-captions-journal]');
  await view.settle();
};

const portraitRuns = () => runs.filter((run) => run.target.matches(PORTRAIT));

describe('P9b — le journal ouvert dans la pilule réduit l’avatar en en-tête compact', () => {
  test('au repos, la scène audio est pleine : l’avatar garde sa taille, au centre', async () => {
    const view = mount();
    await view.settle();
    expect(view.stage()).toBe('full');
    expect(view.portraitSize()).toBe('144px');
    view.done();
  });

  test('le journal ouvert pose l’avatar à 56 px, le nom et la durée à côté de lui', async () => {
    const view = mount();
    await view.settle();
    await openJournal(view);
    expect(view.find('[data-call-control-pill] [data-call-journal-panel]')).not.toBeNull();
    expect(view.stage()).toBe('compact');
    expect(view.portraitSize()).toBe('80px');
    const row = view.find(STAGE);
    expect(row?.querySelector('h2')?.textContent).toBe('Awa Diallo');
    expect(row?.querySelector('[data-call-duration]')).not.toBeNull();
    view.done();
  });

  test('sous-titres éteints, le journal ouvert depuis les rangées réduit l’avatar aussi (#17342)', async () => {
    const view = mount({ captionsMode: 'off' });
    await view.settle();
    view.press('[data-call-more]');
    await view.settle();
    view.press('[data-call-control="journal"]');
    await view.settle();
    expect(view.stage()).toBe('compact');
    view.done();
  });

  test('(…) ouvert par-dessus le journal le range : l’avatar reprend sa taille, et la reprend encore au retour du journal', async () => {
    const view = mount();
    await view.settle();
    await openJournal(view);
    view.press('[data-call-more]');
    await view.settle();
    expect(view.stage()).toBe('full');
    view.press('[data-call-more]');
    await view.settle();
    expect(view.stage()).toBe('compact');
    view.done();
  });

  test('les sous-titres seuls ne réduisent rien', async () => {
    const view = mount();
    await view.settle();
    expect(view.find('[data-call-control-pill] [data-call-captions-panel]')).not.toBeNull();
    expect(view.stage()).toBe('full');
    view.done();
  });
});

/* #17945 (décision porteur du 2026-11-13, loi 11 « un toucher sur la scène ») : en duo audio, le fond
   derrière l'avatar est la scène. Le premier toucher range l'en-tête, la pilule et le journal, l'avatar
   reprend ses 120 ; le second les rend, journal compris. Seuls les sous-titres restent, dans leur verre. */
describe('#17945 — en duo audio, un toucher sur le fond range en-tête, pilule et journal ; un nouveau les rend', () => {
  const tapBackground = async (view: View) => {
    act(() => view.find(STAGE)?.click());
    await view.settle();
  };
  const chrome = (view: View) => view.find('[data-call-screen]')?.getAttribute('data-call-chrome') ?? null;

  test('l’avatar plein mesure 120, comme iOS (P9) ; la sonnerie garde son portrait', async () => {
    const view = mount();
    await view.settle();
    expect(view.portraitSize()).toBe('144px');
    view.done();
    const ringing = mount({ phase: { kind: 'outgoing' } });
    await ringing.settle();
    expect(ringing.portraitSize()).toBe('136px');
    ringing.done();
  });

  test('sous-titres éteints : le toucher range l’en-tête et la pilule entière, le second les rend', async () => {
    const view = mount({ captionsMode: 'off' });
    await view.settle();
    await tapBackground(view);
    expect(chrome(view)).toBe('hidden');
    expect(view.find('[data-call-header]')?.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(view.find('[data-call-controls]')?.getAttribute('aria-hidden')).toBe('true');
    await tapBackground(view);
    expect(chrome(view)).toBe('shown');
    expect(view.find('[data-call-header]')?.closest('[aria-hidden="true"]')).toBeNull();
    expect(view.find('[data-call-controls]')?.getAttribute('aria-hidden')).toBeNull();
    view.done();
  });

  test('toucher l’avatar lui-même range aussi : il est la scène, pas un bouton', async () => {
    const view = mount({ captionsMode: 'off' });
    await view.settle();
    act(() => view.find(PORTRAIT)?.click());
    await view.settle();
    expect(chrome(view)).toBe('hidden');
    view.done();
  });

  test('journal ouvert : il se range avec la pilule et l’avatar reprend sa taille ; le second toucher rend le journal et l’en-tête compact', async () => {
    const view = mount();
    await view.settle();
    await openJournal(view);
    expect(view.stage()).toBe('compact');
    await tapBackground(view);
    expect(chrome(view)).toBe('hidden');
    expect(view.stage()).toBe('full');
    expect(view.portraitSize()).toBe('144px');
    expect(view.find('[data-call-journal-panel]')?.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(view.find('[data-call-control-pill] [data-call-captions-panel]')?.closest('[aria-hidden="true"]')).toBeNull();
    await tapBackground(view);
    expect(chrome(view)).toBe('shown');
    expect(view.stage()).toBe('compact');
    expect(view.find('[data-call-control-pill] [data-call-journal-panel]')?.closest('[aria-hidden="true"]')).toBeNull();
    view.done();
  });

  test('un bouton touché n’est pas la scène : couper le micro ne range rien', async () => {
    const view = mount({ captionsMode: 'off' });
    await view.settle();
    view.press('[data-call-screen] button[aria-label="Couper le micro"]');
    await view.settle();
    expect(chrome(view)).toBe('shown');
    view.done();
  });

  test('le clavier rend toujours les commandes', async () => {
    const view = mount({ captionsMode: 'off' });
    await view.settle();
    await tapBackground(view);
    act(() => void document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })));
    await view.settle();
    expect(chrome(view)).toBe('shown');
    view.done();
  });
});

describe('le passage est un morphisme, un fondu court sous « Réduire les animations »', () => {
  test('l’avatar part de sa place et de sa taille d’avant (FLIP) et la rejoint, en transformation seule', async () => {
    const view = mount();
    await view.settle();
    runs.length = 0;
    await openJournal(view);
    const morph = portraitRuns();
    expect(morph).toHaveLength(1);
    expect(morph[0]?.frames).toEqual([{ transform: 'translate(131px, 248px) scale(1.7)' }, { transform: 'none' }]);
    expect(morph[0]?.duration).toBe(PORTRAIT_MORPH_MS);
    view.done();
  });

  test('le nom et la durée rejoignent l’avatar en fondu', async () => {
    const view = mount();
    await view.settle();
    runs.length = 0;
    await openJournal(view);
    const label = runs.find((run) => run.target.matches('[data-call-stage-label]'));
    expect(label?.frames).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(label?.duration).toBe(PORTRAIT_MORPH_MS);
    view.done();
  });

  test('fermer le journal rend la scène pleine par le chemin inverse', async () => {
    const view = mount();
    await view.settle();
    await openJournal(view);
    runs.length = 0;
    view.press('[data-call-control-pill] [data-call-journal-panel] [data-panel-close]');
    await view.settle();
    expect(view.stage()).toBe('full');
    expect(view.portraitSize()).toBe('144px');
    expect(portraitRuns()[0]?.frames).toEqual([{ transform: 'translate(-131px, -248px) scale(0.5882352941176471)' }, { transform: 'none' }]);
    view.done();
  });

  test('« Réduire les animations » : aucun déplacement, la scène entière arrive en un fondu court', async () => {
    const view = mount({}, { reducedMotion: true });
    await view.settle();
    runs.length = 0;
    await openJournal(view);
    expect(portraitRuns()).toHaveLength(0);
    const fade = runs.find((run) => run.target.matches(STAGE));
    expect(fade?.frames).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(fade?.duration).toBe(STOW_REDUCED_MS);
    view.done();
  });

  test('rien ne se joue à la première peinture', async () => {
    const view = mount();
    await view.settle();
    expect(portraitRuns()).toHaveLength(0);
    expect(runs.filter((run) => run.target.matches('[data-call-stage-label]'))).toHaveLength(0);
    view.done();
  });
});
