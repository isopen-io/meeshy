import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { journalDocks, JOURNAL_COLUMN_MIN_VIEWPORT, JOURNAL_COLUMN_RESERVE } from '@/lib/calls/call-journal-dock';
import type { ActiveCall, CallMember } from '@/lib/calls/call-store';
import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';
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
  const find = (selector: string) => host.querySelector<HTMLElement>(selector);
  const press = (selector: string) => act(() => find(selector)?.click());
  const settle = () => act(async () => {});
  const done = () => {
    act(() => root.unmount());
    host.remove();
  };
  return { host, find, press, settle, render, done };
};

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
      const column = view.find('[data-call-journal-column]');
      expect(column).not.toBeNull();
      expect(column?.className.split(' ')).toContain('glass-call-prominent');
      expect(column?.querySelectorAll('[data-call-journal-entry]')).toHaveLength(2);
      expect(view.find('[data-call-control-pill] [data-call-journal-panel]')).toBeNull();
      expect(view.find('[data-call-captions-panel]')).toBeNull();
      view.press('[data-call-more]');
      expect(view.find('[data-call-control-pill] [data-call-captions-panel]')).not.toBeNull();
      expect(view.find('[data-call-journal-column]')).not.toBeNull();
      view.press('[data-call-more]');
      expect(view.find('[data-call-control="journal"]')?.getAttribute('aria-expanded')).toBe('true');
      expect(view.find('[data-call-control="journal"]')?.getAttribute('aria-controls')).toBe(column?.querySelector('[data-call-journal-panel]')?.id ?? 'absent');
      expect(view.find('[data-call-screen]')?.getAttribute('data-call-journal-dock')).toBe('column');
      view.done();
    });
  }

  test('la colonne a son ✕ et pas de ‹ : elle n’est pas un sous-menu', async () => {
    const view = mount({}, true);
    await openJournal(view);
    expect(view.find('[data-call-journal-column] [data-panel-back]')).toBeNull();
    view.press('[data-call-journal-column] [data-panel-close]');
    expect(view.find('[data-call-journal-column]')).toBeNull();
    expect(view.find('[data-call-screen]')?.hasAttribute('data-call-journal-dock')).toBe(false);
    view.done();
  });

  test('en duo (W1), la colonne reste ouverte quand (…) s’ouvre : le rail « l’appel » s’arrête à elle, celui de « mon image » garde son bord (#17327)', async () => {
    const view = mount({}, true);
    await openJournal(view);
    expect(view.find('[data-call-screen]')?.getAttribute('data-call-layer')).toBe('menu');
    expect(view.find('[data-call-journal-column]')).not.toBeNull();
    expect(view.find('[data-call-journal-column] [data-call-journal-panel]')).not.toBeNull();
    const rails = view.find('[data-call-rails]');
    expect(rails).not.toBeNull();
    expect(rails?.style.paddingInlineEnd).toContain(`${JOURNAL_COLUMN_RESERVE}px`);
    expect(rails?.style.paddingInlineStart).not.toContain('px)');
    expect(view.find('[data-call-rail="mine"]')).not.toBeNull();
    expect(view.find('[data-call-rail="call"]')).not.toBeNull();
    view.press('[data-call-more]');
    view.press('[data-call-more]');
    expect(view.find('[data-call-journal-column]')).not.toBeNull();
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
    expect(view.find('[data-call-journal-column]')).not.toBeNull();
    view.press('[data-call-more]');
    view.press('[data-call-control="journal"]');
    expect(view.find('[data-call-journal-column]')).toBeNull();
    view.done();
  });

  test('Échap replie la colonne sans réduire l’appel', async () => {
    const view = mount({}, true);
    await openJournal(view);
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(view.find('[data-call-journal-column]')).toBeNull();
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
    expect(view.find('[data-call-journal-column]')).toBeNull();
    expect(view.find('[data-call-control-pill] [data-call-journal-panel]')).not.toBeNull();
    view.render(true);
    await view.settle();
    expect(view.find('[data-call-journal-column]')).not.toBeNull();
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
    expect(view.find('[data-call-journal-column]')).toBeNull();
    expect(view.find('[data-call-control-pill] [data-call-journal-panel]')).not.toBeNull();
    expect(view.find('[data-call-captions-panel]')).toBeNull();
    view.done();
  });

  test('sur une fenêtre large, « Journal » du pied des sous-titres ouvre la colonne', async () => {
    const view = mount({}, true);
    await view.settle();
    view.press('[data-call-captions-journal]');
    await view.settle();
    expect(view.find('[data-call-journal-column]')).not.toBeNull();
    expect(view.find('[data-call-control-pill] [data-call-captions-panel]')).not.toBeNull();
    view.done();
  });

  test('sur une fenêtre étroite, rien ne change : le journal remplace les rangées dans la pilule', async () => {
    const view = mount({}, false);
    await openJournal(view);
    expect(view.find('[data-call-journal-column]')).toBeNull();
    expect(view.find('[data-call-control-pill] [data-call-journal-panel]')).not.toBeNull();
    expect(view.find('[data-call-captions-panel]')).toBeNull();
    view.done();
  });
});
