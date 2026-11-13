import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { journalDocks, JOURNAL_COLUMN_MIN_VIEWPORT, JOURNAL_COLUMN_RESERVE } from '@/lib/calls/call-journal-dock';
import type { ActiveCall, CallMember } from '@/lib/calls/call-store';
import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';
import { loadPillMotion } from '@/lib/calls/use-pill-motion';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CallScreen } from './call-screen';

/**
 * LE JOURNAL EN COLONNE SUR GRAND ÉCRAN (#16942, vues W1 et W2 de
 * `docs/product/appels-vue-finale.md`) — au-delà d'une place suffisante, le
 * journal ne recouvre plus l'image : il se pose en colonne de verre à droite,
 * la scène, les sous-titres et la pilule se recentrent dans la place qui
 * reste. En dessous, rien ne change : il s'ouvre dans le cadre de la pilule.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

const member = (userId: string, name: string): CallMember => ({ userId, name, avatar: null, micMuted: false, cameraOn: true, screenSharing: false, weakNetwork: false, capturing: false, link: 'connected' });

const said = (n: number) => ({ id: `w-${n}`, speakerId: 'u-awa', speakerName: 'Awa', original: `Line ${n}`, translated: `Ligne ${n}`, pair: { from: 'en', to: 'fr' }, isFinal: true, at: n, mine: false });

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
  captions: [said(1), said(2)],
  captionsMode: 'translated',
  captionPeers: [],
  preview: null,
  previewed: false,
  transcription: 'idle',
  initiatorId: null,
  invitedBy: null,
  quality: null,
  ...overrides,
});

const group: Partial<ActiveCall> = { isGroup: true, title: 'Équipe', members: { 'u-awa': member('u-awa', 'Awa'), 'u-karim': member('u-karim', 'Karim'), 'u-lina': member('u-lina', 'Lina') } };

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

const mount = (overrides: Partial<ActiveCall>, wide: boolean) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const render = (isWide: boolean) => act(() => root.render(<CallScreen call={call(overrides)} canShare effectsSupport={{ color: false, blur: false }} wide={isWide} />));
  render(wide);
  /* Le double d'une sortie (`data-call-pill-ghost`) s'efface et part : il n'est pas le contenu. */
  const find = (selector: string) => [...host.querySelectorAll<HTMLElement>(selector)].find((node) => node.closest('[data-call-pill-ghost]') === null) ?? null;
  const press = (selector: string) => act(() => find(selector)?.click());
  const settle = () => act(async () => {});
  const done = () => {
    act(() => root.unmount());
    host.remove();
  };
  return { host, find, press, settle, render, done };
};

/* Une colonne qui repart reste montée le temps de son mouvement (`data-leaving`) : elle n'est plus « ouverte ». */
const COLUMN = '[data-call-journal-column]:not([data-leaving])';

const openJournal = async (view: ReturnType<typeof mount>) => {
  view.press('[data-call-more]');
  await view.settle();
  view.press('[data-call-control="journal"]');
  await view.settle();
};

describe('la place décide, pas l’agent utilisateur', () => {
  test('une fenêtre assez large pose le journal en colonne ; une fenêtre étroite le garde dans la pilule', () => {
    expect(journalDocks(JOURNAL_COLUMN_MIN_VIEWPORT)).toBe(true);
    expect(journalDocks(1280)).toBe(true);
    expect(journalDocks(JOURNAL_COLUMN_MIN_VIEWPORT - 1)).toBe(false);
    expect(journalDocks(390)).toBe(false);
  });

  test('la scène garde au moins la largeur d’un écran de tablette quand la colonne est là', () => {
    expect(JOURNAL_COLUMN_MIN_VIEWPORT).toBeGreaterThanOrEqual(1000);
  });
});

describe('le journal en colonne de verre (W1, W2)', () => {
  for (const [shape, overrides] of [
    ['en duo (W1)', {}],
    ['en groupe (W2)', group],
  ] as const) {
    test(`${shape}, « Journal » ouvre la colonne à droite ; la pilule ne grandit pas, (…) range les sous-titres et les rend (#17343)`, async () => {
      const view = mount(overrides, true);
      await openJournal(view);
      const column = view.find(COLUMN);
      expect(column).not.toBeNull();
      expect(column?.className.split(' ')).toContain('glass-call-prominent');
      expect(column?.querySelectorAll('[data-call-journal-entry]')).toHaveLength(2);
      expect(view.find('[data-call-control-pill] [data-call-journal-panel]')).toBeNull();
      expect([...view.host.querySelectorAll('[data-call-captions-panel]')].filter((panel) => panel.closest('[data-leaving][inert]') === null)).toEqual([]);
      view.press('[data-call-more]');
      expect(view.find('[data-call-control-pill] [data-call-captions-panel]')).not.toBeNull();
      expect(view.find(COLUMN)).not.toBeNull();
      view.press('[data-call-more]');
      expect(view.find('[data-call-control="journal"]')?.getAttribute('aria-expanded')).toBe('true');
      expect(view.find('[data-call-control="journal"]')?.getAttribute('aria-controls')).toBe(column?.querySelector('[data-call-journal-panel]')?.id ?? 'absent');
      expect(view.find('[data-call-screen]')?.getAttribute('data-call-journal-dock')).toBe('column');
      view.done();
    });
  }

  test('la tête de la colonne est « Journal » à gauche et la bascule Traduit · Original à droite, sans ‹ ni ✕ (W1.9) ; « Journal » la referme', async () => {
    const view = mount({}, true);
    await openJournal(view);
    const column = view.find(COLUMN);
    expect(column?.querySelector('[data-panel-back]')).toBeNull();
    expect(column?.querySelector('[data-panel-close]')).toBeNull();
    const title = column?.querySelector('h2');
    expect(title?.className).toContain('text-start');
    expect(title?.className).not.toContain('text-center');
    expect(title?.nextElementSibling?.hasAttribute('data-call-journal-view')).toBe(true);
    view.press('[data-call-more]');
    view.press('[data-call-control="journal"]');
    expect(view.find(COLUMN)).toBeNull();
    expect(view.find('[data-call-screen]')?.hasAttribute('data-call-journal-dock')).toBe(false);
    view.done();
  });

  test('la bascule est là même quand rien n’est traduit (W1.9)', async () => {
    const raw = { id: 'w-9', speakerId: 'u-awa', speakerName: 'Awa', original: 'Same', translated: null, pair: null, isFinal: true, at: 9, mine: false };
    const view = mount({ captions: [raw] }, true);
    await openJournal(view);
    expect(view.find('[data-call-journal-column] [data-call-journal-view]')).not.toBeNull();
    view.done();
  });

  test('la colonne retient le toucher et ne compte pas la zone sûre une seconde fois (W1.18, W1.2)', async () => {
    const view = mount({}, true);
    await openJournal(view);
    const column = view.find(COLUMN);
    expect(column?.hasAttribute('data-call-chrome-keep')).toBe(true);
    expect(column?.style.top).not.toContain('safe-area');
    expect(column?.style.bottom).not.toContain('safe-area');
    view.done();
  });

  test('toucher le titre ou la marge de la colonne ne range ni l’en-tête ni la pilule ; toucher l’image, si (W1.18)', async () => {
    const view = mount({}, true);
    await openJournal(view);
    const chrome = () => view.find('[data-call-screen]')?.getAttribute('data-call-chrome');
    expect(chrome()).toBe('shown');
    act(() => (view.find(`${COLUMN} h2`) as HTMLElement).click());
    expect(chrome()).toBe('shown');
    act(() => (view.find(COLUMN) as HTMLElement).click());
    expect(chrome()).toBe('shown');
    act(() => (view.find('[data-call-stage-surface]') as HTMLElement).click());
    expect(chrome()).toBe('hidden');
    view.done();
  });

  test('la colonne qui entre recentre la scène, la pile des bandeaux, la pilule et le rail de fin en glissant depuis leur centre d’avant, jamais d’un saut (W1.20)', async () => {
    const played: { readonly element: Element; readonly frames: Keyframe[] }[] = [];
    const animate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
    const measure = Object.getOwnPropertyDescriptor(Element.prototype, 'getBoundingClientRect');
    const half = JOURNAL_COLUMN_RESERVE / 2;
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value(this: Element, frames: Keyframe[]) {
        played.push({ element: this, frames });
        return { finished: Promise.resolve(), cancel: () => undefined, effect: null };
      },
    });
    Object.defineProperty(Element.prototype, 'getBoundingClientRect', {
      configurable: true,
      value(this: Element) {
        const rails = this.closest('[data-call-rail-slot="trailing"]')?.closest<HTMLElement>('[data-call-rails]');
        const shifted = this.closest('[data-call-journal-reserve]') !== null || (rails?.style.paddingInlineEnd.includes(`${JOURNAL_COLUMN_RESERVE}px`) ?? false);
        const left = shifted ? -half : 0;
        return { left, right: left, top: 0, bottom: 0, x: left, y: 0, width: 0, height: 0, toJSON: () => ({}) };
      },
    });
    const view = mount({}, true);
    await openJournal(view);
    const slid = (selector: string) => played.filter((move) => move.element === view.find(selector)).map((move) => move.frames.map((frame) => frame.transform));
    expect(slid('[data-call-stage-surface]')).toContainEqual([`translateX(${half}px)`, 'none']);
    expect(slid('[data-call-plane]:not([data-call-header-slot])')).toContainEqual([`translateX(${half}px)`, 'none']);
    expect(slid('[data-call-banner-stack]')).toContainEqual([`translateX(${half}px)`, 'none']);
    expect(slid('[data-call-rail-slot="trailing"]')).toContainEqual([`translateX(${half}px)`, 'none']);
    expect(slid('[data-call-rail-slot="leading"]')).toEqual([]);
    if (animate === undefined) Reflect.deleteProperty(HTMLElement.prototype, 'animate');
    else Object.defineProperty(HTMLElement.prototype, 'animate', animate);
    if (measure !== undefined) Object.defineProperty(Element.prototype, 'getBoundingClientRect', measure);
    view.done();
  });

  test('la colonne entre par le bord de fin et repart par lui, la scène et la pilule glissent à leur nouveau centre (W1.20)', async () => {
    const played: { readonly element: Element; readonly frames: Keyframe[] }[] = [];
    const real = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value(this: Element, frames: Keyframe[]) {
        played.push({ element: this, frames });
        return { finished: Promise.resolve(), cancel: () => undefined, effect: null };
      },
    });
    const view = mount({}, true);
    await openJournal(view);
    const column = view.find(COLUMN);
    const entering = played.find((move) => move.element === column);
    expect(entering?.frames.map((frame) => frame.transform)).toEqual(['translateX(100%)', 'translateX(0)']);
    view.press('[data-call-more]');
    view.press('[data-call-control="journal"]');
    await view.settle();
    const leaving = played.filter((move) => move.element === column).at(-1);
    expect(leaving?.frames.map((frame) => frame.transform)).toEqual(['translateX(0)', 'translateX(100%)']);
    expect(view.find(COLUMN)).toBeNull();
    if (real === undefined) Reflect.deleteProperty(HTMLElement.prototype, 'animate');
    else Object.defineProperty(HTMLElement.prototype, 'animate', real);
    view.done();
  });

  test('colonne ouverte, la pile des bandeaux se pose dans la place de la scène, comme la bande du bas (W1.4, W1.21)', async () => {
    const view = mount({ screenSharing: true }, true);
    expect(view.find('[data-call-banner-stack]')?.style.paddingInlineEnd).toBe('');
    await openJournal(view);
    const stack = view.find('[data-call-banner-stack]');
    expect(stack?.style.paddingInlineEnd).toBe(`${JOURNAL_COLUMN_RESERVE}px`);
    expect(stack?.hasAttribute('data-call-journal-reserve')).toBe(true);
    view.done();
  });

  test('en duo (W1), la colonne reste ouverte quand (…) s’ouvre : le rail « l’appel » s’arrête à elle, celui de « mon image » garde son bord (#17327)', async () => {
    const view = mount({}, true);
    await openJournal(view);
    expect(view.find('[data-call-screen]')?.getAttribute('data-call-layer')).toBe('menu');
    expect(view.find(COLUMN)).not.toBeNull();
    expect(view.find('[data-call-journal-column] [data-call-journal-panel]')).not.toBeNull();
    const rails = view.find('[data-call-rails]');
    expect(rails).not.toBeNull();
    expect(rails?.style.paddingInlineEnd).toContain(`${JOURNAL_COLUMN_RESERVE}px`);
    expect(rails?.style.paddingInlineStart).not.toContain('px)');
    expect(view.find('[data-call-rail="mine"]')).not.toBeNull();
    expect(view.find('[data-call-rail="call"]')).not.toBeNull();
    view.press('[data-call-more]');
    view.press('[data-call-more]');
    expect(view.find(COLUMN)).not.toBeNull();
    expect(view.find('[data-call-rail="call"]')).not.toBeNull();
    view.done();
  });

  test('sans colonne, les rails gardent leurs deux bords entiers (#17327)', async () => {
    const view = mount({}, false);
    view.press('[data-call-more]');
    expect(view.find('[data-call-rails]')?.style.paddingInlineEnd).not.toContain('px)');
    view.done();
  });

  test('« Journal » retouché replie la colonne ; le menu, lui, se rouvre sans la fermer', async () => {
    const view = mount({}, true);
    await openJournal(view);
    view.press('[data-call-more]');
    expect(view.find(COLUMN)).not.toBeNull();
    view.press('[data-call-more]');
    view.press('[data-call-control="journal"]');
    expect(view.find(COLUMN)).toBeNull();
    view.done();
  });

  /**
   * #17932 (décision porteur du 2026-11-13, A) — colonne ouverte, « Journal » est ACTIF au
   * pied de la bande comme dans le rail : un disque blanc plein, encre sombre (loi 1,
   * la tenue `active` du kit), annoncé enfoncé ; le retoucher referme la colonne, qui ne
   * porte aucun ✕ (#17922). Refermée, il redevient un disque de verre.
   */
  const whiteDisc = (button: HTMLElement | null | undefined) => ({
    fill: button?.style.background ?? '',
    ink: button?.style.color ?? '',
    glass: button?.classList.contains('glass-call-disc') ?? true,
  });
  const ACTIVE = { fill: 'var(--color-on-media)', ink: 'var(--ios-indigo-950)', glass: false };

  test('#17932 — colonne ouverte, « Journal » du pied des sous-titres est un disque blanc plein, enfoncé ; le retoucher referme la colonne', async () => {
    const view = mount({}, true);
    await view.settle();
    const foot = () => view.find('[data-call-control-pill] [data-call-captions-journal]');
    expect(foot()?.getAttribute('aria-pressed')).toBe('false');
    expect(whiteDisc(foot()).glass).toBe(true);
    view.press('[data-call-captions-journal]');
    await view.settle();
    expect(view.find(COLUMN)).not.toBeNull();
    expect(view.find(COLUMN)?.querySelector('[data-panel-close]')).toBeNull();
    expect(foot()?.getAttribute('aria-pressed')).toBe('true');
    expect(whiteDisc(foot())).toEqual(ACTIVE);
    view.press('[data-call-captions-journal]');
    await view.settle();
    expect(view.find(COLUMN)).toBeNull();
    expect(foot()?.getAttribute('aria-pressed')).toBe('false');
    expect(whiteDisc(foot()).glass).toBe(true);
    view.done();
  });

  test('#17932 — colonne ouverte, « Journal » du rail est le même disque blanc ; le retoucher referme la colonne', async () => {
    const view = mount({}, true);
    await openJournal(view);
    const rail = view.find('[data-call-rail] [data-call-control="journal"]');
    expect(rail?.getAttribute('aria-expanded')).toBe('true');
    expect(whiteDisc(rail)).toEqual(ACTIVE);
    view.press('[data-call-rail] [data-call-control="journal"]');
    await view.settle();
    expect(view.find(COLUMN)).toBeNull();
    expect(view.find('[data-call-rail] [data-call-control="journal"]')?.getAttribute('aria-expanded')).toBe('false');
    view.done();
  });

  test('#17932 — sur une fenêtre étroite, il n’y a pas de colonne : « Journal » du pied n’est jamais annoncé enfoncé', async () => {
    const view = mount({}, false);
    await view.settle();
    expect(view.find('[data-call-control-pill] [data-call-captions-journal]')?.getAttribute('aria-pressed')).toBe('false');
    view.done();
  });

  test('Échap replie la colonne sans réduire l’appel', async () => {
    const view = mount({}, true);
    await openJournal(view);
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(view.find(COLUMN)).toBeNull();
    expect(view.find('[data-call-screen]')).not.toBeNull();
    view.done();
  });

  test('la scène, la bande du bas et le milieu laissent la place de la colonne ; l’en-tête garde toute la largeur', async () => {
    const view = mount({ members: { 'u-awa': member('u-awa', 'Awa') }, remoteStreams: {} }, true);
    await openJournal(view);
    const reserved = [...view.host.querySelectorAll<HTMLElement>('[data-call-journal-reserve]')];
    expect(reserved.length).toBeGreaterThanOrEqual(2);
    expect(view.find('[data-call-header]')?.closest('[data-call-journal-reserve]')).toBeNull();
    view.done();
  });

  test('en duo vidéo, l’image de l’autre se prolonge sous la colonne : le verre se lit sur la même scène, jamais sur une bande de fond', async () => {
    const camera = { kind: 'video', readyState: 'live', getCapabilities: () => ({}), getSettings: () => ({}), applyConstraints: async () => undefined };
    const remote = Object.assign(Object.create(MediaStream.prototype) as MediaStream, { getVideoTracks: () => [camera], getAudioTracks: () => [], getTracks: () => [camera] });
    const view = mount({ remoteStreams: { 'u-awa': remote } }, true);
    expect(view.find('[data-call-stage-bleed]')).toBeNull();
    await openJournal(view);
    const bleed = view.find('[data-call-stage-bleed]');
    expect(bleed?.getAttribute('aria-hidden')).toBe('true');
    expect(bleed?.style.insetInlineEnd).toBe(`-${JOURNAL_COLUMN_RESERVE}px`);
    expect(bleed?.querySelector('video')).not.toBeNull();
    expect(bleed?.querySelector('video[data-call-stream]')).toBeNull();
    view.done();
  });

  test('la fenêtre rétrécit, colonne ouverte : le journal passe dans la pilule ; elle s’élargit : il revient en colonne', async () => {
    const view = mount({}, true);
    await openJournal(view);
    view.render(false);
    await view.settle();
    expect(view.find(COLUMN)).toBeNull();
    expect(view.find('[data-call-control-pill] [data-call-journal-panel]')).not.toBeNull();
    view.render(true);
    await view.settle();
    expect(view.find(COLUMN)).not.toBeNull();
    expect(view.find('[data-call-control-pill] [data-call-journal-panel]')).toBeNull();
    view.done();
  });

  test('le verre qui porte du texte tient en 560 px SANS condition de fenêtre : grand écran ou téléphone en paysage, jamais bord à bord (P3.10)', async () => {
    for (const wide of [true, false]) {
      const view = mount({}, wide);
      await view.settle();
      const pill = view.find('[data-call-control-pill]');
      expect(pill?.querySelector('[data-call-captions-panel]')).not.toBeNull();
      expect(pill?.className.split(' ')).toContain('w-[min(calc(100%-1.5rem),560px)]');
      view.done();
    }
  });

  test('sur une fenêtre étroite, le journal vit DANS la pilule : « Journal » du pied des sous-titres l’ouvre à leur place (#17343, #17346)', async () => {
    const view = mount({}, false);
    await view.settle();
    view.press('[data-call-captions-journal]');
    await view.settle();
    expect(view.find('[data-call-screen]')?.getAttribute('data-call-layer')).toBe('panel');
    expect(view.find(COLUMN)).toBeNull();
    expect(view.find('[data-call-control-pill] [data-call-journal-panel]')).not.toBeNull();
    expect([...view.host.querySelectorAll('[data-call-captions-panel]')].filter((panel) => panel.closest('[data-leaving][inert]') === null)).toEqual([]);
    view.done();
  });

  test('sur une fenêtre large, « Journal » du pied des sous-titres ouvre la colonne', async () => {
    const view = mount({}, true);
    await view.settle();
    view.press('[data-call-captions-journal]');
    await view.settle();
    expect(view.find(COLUMN)).not.toBeNull();
    expect(view.find('[data-call-control-pill] [data-call-captions-panel]')).not.toBeNull();
    view.done();
  });

  test('sur une fenêtre étroite, rien ne change : le journal remplace les rangées dans la pilule', async () => {
    const view = mount({}, false);
    await openJournal(view);
    expect(view.find(COLUMN)).toBeNull();
    expect(view.find('[data-call-control-pill] [data-call-journal-panel]')).not.toBeNull();
    expect([...view.host.querySelectorAll('[data-call-captions-panel]')].filter((panel) => panel.closest('[data-leaving][inert]') === null)).toEqual([]);
    view.done();
  });
});
