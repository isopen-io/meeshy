import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, jest, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { ActiveCall, CallMember } from '@/lib/calls/call-store';

import { CallScreen } from './call-screen';
import { ThreadCallButton } from './thread-call-button';

/**
 * L'ÉCRAN D'APPEL DESSINÉ (#6382, #8045) — miroir `CallView.swift` : chaque
 * phase montre SES commandes et rien d'autre. Rendu sans DOM : ce que ces
 * témoins gardent est ce que l'écran PROPOSE, pas comment il s'anime.
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
  transcription: 'idle',
  initiatorId: null,
  invitedBy: null,
  quality: null,
  ...overrides,
});

const member = (overrides: Partial<CallMember> = {}): CallMember => ({
  userId: 'u-peer',
  name: 'Amina Diallo',
  avatar: null,
  micMuted: false,
  cameraOn: false,
  screenSharing: false,
  weakNetwork: false,
  capturing: false,
  link: 'connected',
  ...overrides,
});

const screen = (overrides: Partial<ActiveCall> = {}, canShare = false) => renderToStaticMarkup(<CallScreen call={call(overrides)} canShare={canShare} />);

const expandedScreen = (overrides: Partial<ActiveCall> = {}, canShare = false) => renderToStaticMarkup(<CallScreen call={call(overrides)} canShare={canShare} initiallyExpanded />);

const liveVideo = { getVideoTracks: () => [{ readyState: 'live' }], getTracks: () => [] } as unknown as MediaStream;

describe('CallScreen', () => {
  test('un appel vidéo entrant propose Refuser, Répondre sans vidéo, Accepter', () => {
    const html = screen({ phase: { kind: 'incoming' }, media: 'video', direction: 'incoming', callerName: 'Amina Diallo' });
    expect(html).toContain('data-call-screen="incoming"');
    expect(html).toContain('Appel vidéo entrant');
    expect(html).toContain('Refuser');
    expect(html).toContain('Répondre sans vidéo');
    expect(html).toContain('Accepter');
    expect(html).not.toContain('Raccrocher');
  });

  test('un appel entrant propose « Message » pour refuser avec une réponse rapide (#8065)', () => {
    const html = screen({ phase: { kind: 'incoming' }, direction: 'incoming' });
    expect(html).toContain('data-call-control="decline-message"');
    expect(html).toContain('aria-label="Refuser avec un message"');
    expect(screen({ members: { 'u-peer': member() } })).not.toContain('decline-message');
  });

  test('un appel VOCAL entrant ne propose pas « Répondre sans vidéo »', () => {
    expect(screen({ phase: { kind: 'incoming' }, direction: 'incoming' })).not.toContain('Répondre sans vidéo');
  });

  test('en appel : micro, caméra, raccrocher — et le nom du pair', () => {
    const html = screen({ members: { 'u-peer': member() } });
    expect(html).toContain('Amina Diallo');
    expect(html).toContain('Couper le micro');
    expect(html).toContain('Raccrocher');
    expect(html).not.toContain('Accepter');
  });

  test('un appel sortant sans réponse se termine sur « Pas de réponse » et propose Réessayer', () => {
    const html = screen({ phase: { kind: 'ended', reason: 'missed', detail: null } });
    expect(html).toContain('Pas de réponse');
    expect(html).toContain('Réessayer');
    expect(html).toContain('Fermer');
  });

  test('un appel raccroché ne propose PAS Réessayer', () => {
    expect(screen({ phase: { kind: 'ended', reason: 'local', detail: null } })).not.toContain('Réessayer');
  });

  test('le micro coupé du pair se lit en pastille', () => {
    expect(screen({ members: { 'u-peer': member({ micMuted: true }) } })).toContain('data-call-pill="peer-muted"');
  });

  test('l’écran est un dialogue nommé', () => {
    expect(screen()).toContain('role="dialog"');
  });
});

describe('CallScreen — la pilule de verre (#8391)', () => {
  test('la même pilule en audio, vidéo et groupe : (…) · Micro · Sortie · Fin, (…) devant le micro', () => {
    const shapes = [screen({ members: { 'u-peer': member() } }), screen({ cameraOn: true, members: { 'u-peer': member() } }), screen({ isGroup: true, members: { 'u-peer': member(), 'u-b': member({ userId: 'u-b', name: 'Bintou' }) } })];
    for (const html of shapes) {
      const pill = html.slice(html.indexOf('data-call-control-pill'));
      const order = ['Plus d’actions', 'Couper le micro', 'Choisir les périphériques', 'Raccrocher'].map((label) => pill.indexOf(`aria-label="${label}"`));
      expect(order.every((index) => index >= 0)).toBe(true);
      expect([...order].sort((a, b) => a - b)).toEqual(order);
      expect(html).toMatch(/class="glass-call[^"]*"[^>]*data-call-control-pill/);
    }
  });

  test('(…) dit son état : actions rangées à l’ouverture de l’appel', () => {
    const html = screen({ members: { 'u-peer': member() } });
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('data-call-rail');
    expect(html).not.toContain('data-call-row');
  });

  test('la puce « Nom · durée » de l’en-tête, une fois connecté', () => {
    expect(screen({ members: { 'u-peer': member() } })).toContain('data-call-chip=""');
    expect(screen({ phase: { kind: 'outgoing' }, connectedAt: null })).not.toContain('data-call-chip');
  });

  test('Réduire est un bouton de verre isolé', () => {
    expect(screen({ members: { 'u-peer': member() } })).toMatch(/aria-label="Réduire l’appel"[^>]*class="glass-call/);
  });

  test('UN seul chemin vers la conversation : « Conversation » dans l’en-tête, juste à droite de Réduire (#8436)', () => {
    const html = screen({ members: { 'u-peer': member() } });
    const header = html.slice(html.indexOf('data-call-header'));
    const order = ['aria-label="Réduire l’appel"', 'data-call-conversation'].map((marker) => header.indexOf(marker));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect(order[0]).toBeLessThan(order[1] as number);
    expect(header).toMatch(/aria-label="Ouvrir la conversation"[^>]*class="glass-call/);
    expect(html).not.toContain('data-call-control="messages"');
  });

  test('sans conversation connue, aucun bouton « Conversation »', () => {
    expect(screen({ conversationId: '', members: { 'u-peer': member() } })).not.toContain('data-call-conversation');
  });
});

describe('CallScreen — partage d’écran (#8063)', () => {
  test('connecté, sur un navigateur qui sait, le bouton « Partager l’écran » est offert dans les actions', () => {
    const html = expandedScreen({ members: { 'u-peer': member() } }, true);
    expect(html).toContain('data-call-screen-share=""');
    expect(html).toContain('aria-label="Partager l’écran"');
  });

  test('sans getDisplayMedia (coque Android, Safari iOS), aucun bouton ne le promet', () => {
    expect(expandedScreen({ members: { 'u-peer': member() } }, false)).not.toContain('data-call-screen-share');
  });

  test('pendant la sonnerie, le partage n’est pas offert', () => {
    expect(expandedScreen({ phase: { kind: 'outgoing' } }, true)).not.toContain('data-call-screen-share');
  });

  test('celui qui partage lit « Vous partagez votre écran » et peut arrêter', () => {
    const html = expandedScreen({ screenSharing: true, members: { 'u-peer': member() } }, true);
    expect(html).toContain('data-call-pill="screen-sharing"');
    expect(html).toContain('aria-label="Arrêter le partage d’écran"');
    expect(html).toContain('aria-pressed="true"');
  });

  test('le pair qui partage : son écran en grand, ENTIER, sous une bannière qui le nomme — même là où l’on ne sait pas ÉMETTRE, même en appel vocal sans caméra', () => {
    const html = screen({ media: 'audio', cameraOn: false, members: { 'u-peer': member({ screenSharing: true, cameraOn: false }) }, remoteStreams: { 'u-peer': liveVideo } }, false);
    expect(html).toContain('data-call-shared-screen=""');
    expect(html).toContain('object-fit:contain');
    expect(html).toContain('Amina Diallo partage son écran');
  });
});

describe('CallScreen — les gestes de la vue « C adapté » (#8391)', () => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

  beforeAll(() => {
    ensureHappyDomRegistered();
    globals.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(async () => {
    await act(async () => {});
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await releaseHappyDomIfRegistered();
  });

  const mount = (overrides: Partial<ActiveCall> = {}, effectsSupport: { readonly color: boolean; readonly blur: boolean } = { color: false, blur: false }) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<CallScreen call={call(overrides)} canShare effectsSupport={effectsSupport} />));
    const find = (selector: string) => host.querySelector(selector);
    const press = (selector: string) => act(() => (find(selector) as HTMLElement | null)?.click());
    const done = () => {
      act(() => root.unmount());
      host.remove();
    };
    return { host, find, press, done };
  };

  const peers = { 'u-peer': member(), 'u-b': member({ userId: 'u-b', name: 'Bintou' }) };

  test('en duo, (…) sort deux rails — mon image à gauche, l’appel à droite — et les range', () => {
    const view = mount({ members: { 'u-peer': member() } });
    view.press('[data-call-more]');
    expect(view.find('[data-call-more]')?.getAttribute('aria-expanded')).toBe('true');
    expect(view.find('[data-call-rail="mine"] [data-call-control="camera"]')).not.toBeNull();
    expect(view.find('[data-call-rail="mine"] [data-call-screen-share]')).not.toBeNull();
    expect(view.find('[data-call-rail="call"] [data-call-captions]')).not.toBeNull();
    expect(view.find('[data-call-rail="call"] [data-call-record]')).not.toBeNull();
    expect(view.find('[data-call-rail="mine"]')?.className).toContain('glass-call');
    expect(view.find('[data-call-rail="mine"] button')?.className).not.toContain('glass-call');
    expect(view.find('[data-call-rail="mine"] button')?.getAttribute('title')).toBe('Activer la caméra');
    view.press('[data-call-more]');
    expect(view.find('[data-call-rail]')).toBeNull();
    view.done();
  });

  test('caméra allumée, « Effets » vient dans le rail de mon image, entre Retourner et Écran (#8442)', () => {
    const view = mount({ cameraOn: true, members: { 'u-peer': member() } }, { color: true, blur: false });
    view.press('[data-call-more]');
    const mine = [...view.host.querySelectorAll('[data-call-rail="mine"] button')].map((button) => button.getAttribute('aria-label'));
    expect(mine).toEqual(['Couper la caméra', 'Retourner la caméra', 'Effets de ma vidéo', 'Partager l’écran']);
    view.done();
  });

  test('« Effets » absent là où le navigateur ne sait rien en faire, et caméra éteinte', () => {
    const unsupported = mount({ cameraOn: true, members: { 'u-peer': member() } });
    unsupported.press('[data-call-more]');
    expect(unsupported.find('[data-call-control="effects"]')).toBeNull();
    unsupported.done();
    const cameraOff = mount({ members: { 'u-peer': member() } }, { color: true, blur: true });
    cameraOff.press('[data-call-more]');
    expect(cameraOff.find('[data-call-control="effects"]')).toBeNull();
    cameraOff.done();
  });

  test('« Effets » ouvre le panneau au-dessus de la pilule, et le referme', async () => {
    const view = mount({ cameraOn: true, members: { 'u-peer': member() } }, { color: true, blur: false });
    view.press('[data-call-more]');
    view.press('[data-call-control="effects"]');
    await act(async () => {
      await import('./call-effects-panel');
    });
    await act(async () => {});
    expect(view.find('[data-call-control="effects"]')?.getAttribute('aria-expanded')).toBe('true');
    const panel = view.find('[data-call-effects-panel]');
    expect(panel).not.toBeNull();
    expect(panel?.closest('[data-call-controls]')).not.toBeNull();
    view.press('[data-call-effects-close]');
    expect(view.find('[data-call-effects-panel]')).toBeNull();
    expect(view.find('[data-call-control="effects"]')?.getAttribute('aria-expanded')).toBe('false');
    view.done();
  });

  test('en groupe, (…) fait grandir la pilule : deux rangées légendées, mon image d’abord', () => {
    const view = mount({ isGroup: true, members: peers });
    view.press('[data-call-more]');
    expect(view.find('[data-call-control-pill]')?.getAttribute('data-call-control-pill')).toBe('grown');
    const rows = [...view.host.querySelectorAll('[data-call-row]')].map((row) => [row.getAttribute('data-call-row'), row.querySelector('span')?.textContent]);
    expect(rows).toEqual([
      ['mine', 'Mon image'],
      ['call', 'L’appel'],
    ]);
    expect(view.find('[data-call-rail]')).toBeNull();
    view.done();
  });

  test('en vidéo, les commandes s’effacent après 4 s sans geste ; toucher la scène les rend', () => {
    jest.useFakeTimers();
    const view = mount({ cameraOn: true, members: { 'u-peer': member() } });
    const chrome = () => view.find('[data-call-screen]')?.getAttribute('data-call-chrome');
    expect(chrome()).toBe('shown');
    act(() => jest.advanceTimersByTime(4100));
    expect(chrome()).toBe('hidden');
    act(() => view.find('[data-call-screen]')?.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    expect(chrome()).toBe('shown');
    view.done();
    jest.useRealTimers();
  });

  test('les sous-titres ne s’effacent pas avec les commandes — même sortis du cadre d’une pilule de groupe', async () => {
    jest.useFakeTimers();
    const view = mount({ isGroup: true, cameraOn: true, members: peers, captionsMode: 'translated' });
    view.press('[data-call-more]');
    await act(async () => {
      await import('./call-captions-panel');
    });
    const panel = () => view.find('[data-call-captions-panel]');
    expect(panel()?.getAttribute('data-call-captions-surface')).toBe('inset');
    act(() => jest.advanceTimersByTime(4100));
    await act(async () => {});
    expect(view.find('[data-call-screen]')?.getAttribute('data-call-chrome')).toBe('hidden');
    expect(panel()).not.toBeNull();
    expect(panel()?.closest('[aria-hidden="true"]')).toBeNull();
    expect(panel()?.getAttribute('data-call-captions-surface')).toBe('glass');
    view.done();
    jest.useRealTimers();
  });

  test('en audio, jamais', () => {
    jest.useFakeTimers();
    const view = mount({ members: { 'u-peer': member() } });
    act(() => jest.advanceTimersByTime(60_000));
    expect(view.find('[data-call-screen]')?.getAttribute('data-call-chrome')).toBe('shown');
    view.done();
    jest.useRealTimers();
  });
});

describe('CallScreen — le verre, sans verre sur verre (#8432)', () => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

  beforeAll(() => {
    ensureHappyDomRegistered();
    globals.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(async () => {
    await act(async () => {});
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await releaseHappyDomIfRegistered();
  });

  const GLASS = '.glass-call, .glass-call-prominent';

  const nestedGlass = async (overrides: Partial<ActiveCall>, openEffects: boolean) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<CallScreen call={call(overrides)} canShare effectsSupport={{ color: true, blur: true }} />));
    act(() => (host.querySelector('[data-call-more]') as HTMLElement | null)?.click());
    if (openEffects) {
      act(() => (host.querySelector('[data-call-control="effects"]') as HTMLElement | null)?.click());
      await act(async () => {
        await import('./call-effects-panel');
      });
      await act(async () => {});
    }
    const glasses = [...host.querySelectorAll(GLASS)];
    const nested = glasses.filter((glass) => glass.parentElement?.closest(GLASS) != null).map((glass) => glass.outerHTML.slice(0, 80));
    const panel = host.querySelector('[data-call-effects-panel]');
    act(() => root.unmount());
    host.remove();
    return { nested, glasses: glasses.length, panel };
  };

  test('en duo, actions sorties et panneau des effets ouvert : chaque groupe a UN verre', async () => {
    const view = await nestedGlass({ cameraOn: true, members: { 'u-peer': member() } }, true);
    expect(view.panel).not.toBeNull();
    expect(view.glasses).toBeGreaterThan(3);
    expect(view.nested).toEqual([]);
  });

  test('en groupe, la pilule qui a grandi porte ses rangées sans verre à elles', async () => {
    const view = await nestedGlass({ isGroup: true, cameraOn: true, members: { 'u-peer': member(), 'u-b': member({ userId: 'u-b', name: 'Bintou' }) } }, true);
    expect(view.nested).toEqual([]);
  });

  test('la sonnerie et l’écran de fin : les boutons neutres sont de verre, Refuser et Fin rouges, Accepter vert', () => {
    const incoming = screen({ phase: { kind: 'incoming' }, media: 'video', direction: 'incoming' });
    expect(incoming).toMatch(/aria-label="Répondre sans vidéo"[^>]*class="glass-call/);
    expect(incoming).toMatch(/aria-label="Refuser avec un message"[^>]*class="glass-call/);
    expect(incoming).not.toMatch(/aria-label="Refuser"[^>]*class="glass-call/);
    expect(screen({ phase: { kind: 'ended', reason: 'missed', detail: null } })).toMatch(/aria-label="Fermer"[^>]*class="glass-call/);
  });
});

describe('ThreadCallButton', () => {
  test('en fixtures, le bouton ouvre un menu vocal/vidéo', () => {
    const html = renderToStaticMarkup(<ThreadCallButton conversationId="c-1" title="Amina" avatar={null} group={false} />);
    expect(html).toContain('data-thread-call="menu"');
    expect(html).toContain('aria-haspopup="menu"');
  });
});
