import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { callJournalHeight } from '@/lib/calls/call-journal-height';
import { PILL_TEXT_EXIT } from '@/lib/calls/call-pill-text-exit';
import type { ActiveCall, CallMember } from '@/lib/calls/call-store';
import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CallScreen } from './call-screen';

/**
 * LES SOUS-TITRES ET LE JOURNAL VIVENT DANS LA PILULE (#17343, #17479, vues P3 et
 * P6 de `docs/product/appels-vue-finale.md`) — au-dessus de la rangée de base,
 * dans le même verre, en duo comme en groupe. `(…)` les range ET les rend ;
 * toucher qui range la pilule laisse les sous-titres seuls ; « Journal », au pied
 * des sous-titres (#17346), ouvre tout l'appel à leur place — sous-titres allumés
 * ou non (#17342) —, et la rangée de base reste touchable.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

const member = (userId: string, name: string): CallMember => ({ userId, name, avatar: null, micMuted: false, cameraOn: true, screenSharing: false, weakNetwork: false, capturing: false, link: 'connected' });

const said = (n: number, translated: string | null = `Ligne ${n}`) => ({ id: `w-${n}`, speakerId: 'u-awa', speakerName: 'Awa', original: `Line ${n}`, translated, pair: translated === null ? null : { from: 'en', to: 'fr' }, isFinal: true, at: n, mine: false });

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

const mount = (overrides: Partial<ActiveCall> = {}) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(<CallScreen call={call(overrides)} canShare effectsSupport={{ color: false, blur: false }} wide={false} />));
  const find = (selector: string) => host.querySelector<HTMLElement>(selector);
  const press = (selector: string) => act(() => find(selector)?.click());
  const settle = () => act(async () => {});
  const layer = () => find('[data-call-screen]')?.getAttribute('data-call-layer');
  const done = () => {
    act(() => root.unmount());
    host.remove();
  };
  return { host, find, press, settle, layer, done };
};

type View = ReturnType<typeof mount>;

const inPill = (view: View, selector: string) => view.find(`[data-call-control-pill] ${selector}`);

const tapStage = (view: View) => act(() => view.find('[data-call-stage-surface]')?.click());

/** Le temps de la sortie du texte, et un peu plus (#17406). */
const outlast = () => act(() => new Promise((resolve) => setTimeout(resolve, PILL_TEXT_EXIT.exitMs + 40)));

/** Un texte qui repart : marqué sortant, INERTE (ni focus, ni clic) et caché au lecteur d'écran. */
const leavingOf = (node: Element | null | undefined) => {
  const leaving = node?.closest('[data-leaving]');
  return leaving === null || leaving === undefined ? null : { inert: leaving.hasAttribute('inert'), hidden: leaving.getAttribute('aria-hidden') === 'true' };
};

describe('les sous-titres, dans le verre de la pilule (P3.1)', () => {
  for (const [shape, overrides] of [
    ['en duo', {}],
    ['en groupe', group],
  ] as const) {
    test(`${shape}, au repos, ils sont DANS la pilule, au-dessus de sa rangée de base — pas dans un verre à eux`, async () => {
      const view = mount(overrides);
      await view.settle();
      const panel = inPill(view, '[data-call-captions-panel]');
      expect(panel?.getAttribute('data-call-captions-surface')).toBe('inset');
      expect(view.find('[data-call-captions-band] [data-call-captions-panel]')).toBeNull();
      const pill = view.find('[data-call-control-pill]');
      expect(pill?.getAttribute('data-call-control-pill')).toBe('pill');
      const order = [...(pill?.querySelectorAll('[data-call-captions-panel], [data-call-more]') ?? [])].map((node) => (node.hasAttribute('data-call-more') ? 'base' : 'captions'));
      expect(order).toEqual(['captions', 'base']);
      view.done();
    });
  }

  test('sous-titres éteints, la pilule ne porte rien', async () => {
    const view = mount({ captionsMode: 'off' });
    await view.settle();
    expect(view.find('[data-call-captions-panel]')).toBeNull();
    expect(view.find('[data-call-control-pill]')?.className.split(' ')).toContain('w-fit');
    view.done();
  });

  test('le pied dit la paire et le geste (« EN → FR · toucher = original »), et porte le bouton Journal (#17346)', async () => {
    const view = mount();
    await view.settle();
    expect(inPill(view, '[data-call-captions-footer]')?.textContent).toContain('EN → FR · toucher = original');
    expect(inPill(view, '[data-call-captions-journal]')?.textContent).toBe('Journal');
    view.done();
  });
});

describe('(…) les range et les rend (P6.12)', () => {
  test('en duo, (…) range les sous-titres ; le refermer les rend', async () => {
    const view = mount();
    await view.settle();
    view.press('[data-call-more]');
    await view.settle();
    await outlast();
    expect(view.find('[data-call-captions-panel]')).toBeNull();
    view.press('[data-call-more]');
    await view.settle();
    expect(inPill(view, '[data-call-captions-panel]')).not.toBeNull();
    expect(leavingOf(inPill(view, '[data-call-captions-panel]'))).toBeNull();
    view.done();
  });

  test('#17406 — en duo, (…) ne les retire pas d’un coup : ils repartent en fondu, à leur place et dans le même verre, puis la pilule reprend sa forme', async () => {
    const view = mount();
    await view.settle();
    view.press('[data-call-more]');
    await view.settle();
    const leaving = inPill(view, '[data-call-captions-panel]');
    expect(leaving?.getAttribute('data-call-captions-surface')).toBe('inset');
    expect(leavingOf(leaving)).toEqual({ inert: true, hidden: true });
    expect(leaving?.closest('[data-call-pill-text="captions"][data-leaving]')).not.toBeNull();
    await outlast();
    expect(view.find('[data-call-captions-panel]')).toBeNull();
    expect(view.find('[data-call-control-pill]')?.className.split(' ')).toContain('w-fit');
    view.done();
  });

  test('#17406 — la sortie est interruptible : (…) retouché pendant le fondu rend les mêmes sous-titres, aussitôt', async () => {
    const view = mount();
    await view.settle();
    view.press('[data-call-more]');
    await view.settle();
    view.press('[data-call-more]');
    await view.settle();
    expect(view.host.querySelectorAll('[data-call-captions-panel]')).toHaveLength(1);
    expect(leavingOf(inPill(view, '[data-call-captions-panel]'))).toBeNull();
    await outlast();
    expect(inPill(view, '[data-call-captions-panel]')).not.toBeNull();
    view.done();
  });

  test('#17406 — sous « Réduire les animations », rien ne se joue : les sous-titres partent tout de suite', async () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({ ...original.call(window, query), matches: query.includes('reduce') })) as typeof window.matchMedia;
    try {
      const view = mount();
      await view.settle();
      view.press('[data-call-more]');
      await view.settle();
      await act(() => new Promise((resolve) => setTimeout(resolve, 5)));
      expect(view.find('[data-call-captions-panel]')).toBeNull();
      view.done();
    } finally {
      window.matchMedia = original;
    }
  });

  test('en groupe, les rangées prennent leur place dans le cadre de la pilule, les sous-titres sont rangés', async () => {
    const view = mount(group);
    await view.settle();
    view.press('[data-call-more]');
    await view.settle();
    expect(view.find('[data-call-control-pill]')?.getAttribute('data-call-control-pill')).toBe('grown');
    expect(view.find('[data-call-captions-panel]')).toBeNull();
    expect(inPill(view, '[data-call-row]')).not.toBeNull();
    view.done();
  });

  test('(…) sur un journal ouvert le RANGE : il n’est pas fermé, refermer les actions le rend — le focus reste sur (…)', async () => {
    const view = mount();
    await view.settle();
    view.press('[data-call-captions-journal]');
    await view.settle();
    expect(inPill(view, '[data-call-journal-panel]')).not.toBeNull();
    view.find('[data-call-more]')?.focus();
    view.press('[data-call-more]');
    await view.settle();
    expect(view.layer()).toBe('menu');
    expect(view.find('[data-call-journal-panel]')).toBeNull();
    expect(view.find('[data-call-rail="call"]')).not.toBeNull();
    expect(view.find('[data-call-control="journal"]')?.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement?.hasAttribute('data-call-more')).toBe(true);
    view.press('[data-call-more]');
    await view.settle();
    expect(view.layer()).toBe('panel');
    expect(inPill(view, '[data-call-journal-panel]')).not.toBeNull();
    view.done();
  });

  test('depuis le menu, « Journal » d’un rail ouvre le journal rangé', async () => {
    const view = mount();
    await view.settle();
    view.press('[data-call-captions-journal]');
    await view.settle();
    view.press('[data-call-more]');
    await view.settle();
    view.press('[data-call-control="journal"]');
    await view.settle();
    expect(inPill(view, '[data-call-journal-panel]')).not.toBeNull();
    view.done();
  });
});

describe('le journal, DANS la pilule, à la place des sous-titres (P6)', () => {
  test('il s’ouvre au-dessus de la rangée de base, qui reste touchable ; les sous-titres lui cèdent la place', async () => {
    const view = mount();
    await view.settle();
    view.press('[data-call-captions-journal]');
    await view.settle();
    expect(inPill(view, '[data-call-journal-panel]')).not.toBeNull();
    expect(view.find('[data-call-captions-panel]')).toBeNull();
    expect(view.find('[data-call-control-pill]')?.className.split(' ')).toContain('w-[min(calc(100%-1.5rem),560px)]');
    expect(inPill(view, '[data-call-more]')).not.toBeNull();
    expect(inPill(view, '[data-call-more]')?.closest('[aria-hidden="true"]')).toBeNull();
    view.done();
  });

  test('#17342 — le journal garde tout l’appel, sous-titres éteints : il s’ouvre depuis les rangées, et lit tout', async () => {
    const view = mount({ captionsMode: 'off', captions: Array.from({ length: 5 }, (_, n) => said(n)) });
    await view.settle();
    view.press('[data-call-more]');
    await view.settle();
    view.press('[data-call-control="journal"]');
    await view.settle();
    expect(view.host.querySelectorAll('[data-call-journal-entry]')).toHaveLength(5);
    view.done();
  });

  test('sa liste prend une part de la fenêtre, sans plafond d’appel : trois cents phrases, une seule liste qui défile', async () => {
    const view = mount({ captions: Array.from({ length: 300 }, (_, n) => said(n)) });
    await view.settle();
    view.press('[data-call-captions-journal]');
    await view.settle();
    const list = view.find('[data-call-journal]');
    expect(list?.style.height).toBe(`${callJournalHeight(window.innerHeight)}px`);
    expect(view.host.querySelectorAll('[data-call-journal-entry]')).toHaveLength(300);
    view.done();
  });

  test('ma vignette garde sa place pendant que le journal est ouvert : il ne libère pas l’écran', async () => {
    const view = mount();
    await view.settle();
    view.press('[data-call-captions-journal]');
    await view.settle();
    expect(view.find('[data-call-header]')).not.toBeNull();
    expect(view.find('[data-call-mode]')).toBeNull();
    view.done();
  });
});

describe('un toucher qui range la pilule laisse les sous-titres seuls (loi 11)', () => {
  test('la pilule rangée, les sous-titres restent dans un verre à eux, à sa place, lus et annoncés', async () => {
    const view = mount();
    await view.settle();
    tapStage(view);
    await view.settle();
    expect(view.find('[data-call-screen]')?.getAttribute('data-call-chrome')).toBe('hidden');
    expect(leavingOf(inPill(view, '[data-call-captions-panel]'))).toEqual({ inert: true, hidden: true });
    const panel = view.find('[data-call-captions-band] [data-call-captions-panel]');
    expect(panel?.getAttribute('data-call-captions-surface')).toBe('glass');
    expect(panel?.closest('[data-call-control-pill]')).toBeNull();
    expect(panel?.closest('[aria-hidden="true"]')).toBeNull();
    expect(panel?.closest('[data-call-captions-band]')?.className.split(' ')).toContain('w-[min(calc(100%-1.5rem),560px)]');
    expect(panel?.querySelector('[aria-live="polite"]')).not.toBeNull();
    tapStage(view);
    await view.settle();
    expect(inPill(view, '[data-call-captions-panel]')).not.toBeNull();
    view.done();
  });

  test('#17406 — la pilule revenue, les sous-titres seuls repartent en fondu à sa place, puis s’effacent', async () => {
    const view = mount();
    await view.settle();
    tapStage(view);
    await view.settle();
    await outlast();
    expect(inPill(view, '[data-call-captions-panel]')).toBeNull();
    tapStage(view);
    await view.settle();
    expect(leavingOf(inPill(view, '[data-call-captions-panel]'))).toBeNull();
    expect(leavingOf(view.find('[data-call-captions-band] [data-call-captions-panel]'))).toEqual({ inert: true, hidden: true });
    await outlast();
    expect(view.find('[data-call-captions-band] [data-call-captions-panel]')).toBeNull();
    expect(view.host.querySelectorAll('[data-call-captions-panel]')).toHaveLength(1);
    view.done();
  });

  test('pilule rangée, le journal ouvert ne laisse que les sous-titres', async () => {
    const view = mount();
    await view.settle();
    view.press('[data-call-captions-journal]');
    await view.settle();
    tapStage(view);
    await view.settle();
    expect(view.find('[data-call-captions-panel]')?.getAttribute('data-call-captions-surface')).toBe('glass');
    expect(view.find('[data-call-journal-panel]')?.closest('[aria-hidden="true"]')).not.toBeNull();
    view.done();
  });
});

describe('au clavier', () => {
  test('Échap ferme le journal, rien d’autre : l’appel n’est pas réduit', async () => {
    const view = mount();
    await view.settle();
    view.press('[data-call-captions-journal]');
    await view.settle();
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    await view.settle();
    expect(view.layer()).toBe('idle');
    expect(inPill(view, '[data-call-captions-panel]')).not.toBeNull();
    view.done();
  });
});
