import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, jest, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { ActiveCall, CallMember } from '@/lib/calls/call-store';
import { callActions } from '@/lib/calls/call-actions';
import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';
import { loadCallStudioCatalog } from '@/lib/i18n-call-studio-catalog';

import { CallModePending, CallScreen } from './call-screen';
import { ThreadCallButton } from './thread-call-button';

/* Les rangées d'actions et les rails du duo vivent dans leurs chunks (`call-control-actions.tsx`, `call-rails.tsx`) : un premier rendu en amorce le chargement, et les témoins lisent ensuite l'écran comme l'utilisateur, le chunk arrivé. */
beforeAll(async () => {
  await loadCallControlsCatalog('fr');
  renderToStaticMarkup(<CallScreen call={call()} canShare initiallyExpanded />);
  renderToStaticMarkup(<CallScreen call={call({ phase: { kind: 'incoming' }, direction: 'incoming', preview: { getVideoTracks: () => [], getTracks: () => [] } as unknown as MediaStream })} />);
  await import('./call-control-actions');
  await import('./call-rails');
  await import('./call-preview');
  await new Promise((resolve) => setTimeout(resolve, 0));
  /* Le cadre des rails arrivé, un second rendu amorce le contenu d'un rail, qu'il charge à son tour. */
  renderToStaticMarkup(<CallScreen call={call({ members: { 'u-peer': member() } })} canShare initiallyExpanded />);
  await new Promise((resolve) => setTimeout(resolve, 0));
});

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
  preview: null,
  previewed: false,
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
  test('un appel vidéo entrant propose Refuser, Répondre sans vidéo, Répondre (P17)', () => {
    const html = screen({ phase: { kind: 'incoming' }, media: 'video', direction: 'incoming', callerName: 'Amina Diallo' });
    expect(html).toContain('data-call-screen="incoming"');
    expect(html).toContain('Appel vidéo entrant');
    expect(html).toContain('Refuser');
    expect(html).toContain('Répondre sans vidéo');
    expect(html).toContain('aria-label="Répondre"');
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
      const order = ['Afficher les actions', 'Couper le micro', 'Sortie audio', 'Raccrocher'].map((label) => pill.indexOf(`aria-label="${label}"`));
      expect(order.every((index) => index >= 0)).toBe(true);
      expect([...order].sort((a, b) => a - b)).toEqual(order);
      expect(html).toMatch(/class="glass-call[^"]*"[^>]*data-call-control-pill/);
    }
  });

  test('le bouton (…) annonce l’action : « Masquer les actions » une fois ouvert', () => {
    expect(expandedScreen({ members: { 'u-peer': member() } })).toMatch(/aria-label="Masquer les actions"[^>]*data-call-more/);
  });

  test('micro coupé, le bouton annonce « Réactiver le micro »', () => {
    expect(screen({ micMuted: true, members: { 'u-peer': member() } })).toContain('aria-label="Réactiver le micro"');
  });

  test('(…) dit son état : actions rangées à l’ouverture de l’appel', () => {
    const html = screen({ members: { 'u-peer': member() } });
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('data-call-self-controls');
    expect(html).not.toContain('data-call-row');
  });

  test('la puce « Nom · durée » de l’en-tête, une fois connecté', () => {
    expect(screen({ members: { 'u-peer': member() } })).toContain('data-call-chip=""');
    expect(screen({ phase: { kind: 'outgoing' }, connectedAt: null })).not.toContain('data-call-chip');
  });

  test('Réduire est un bouton de verre isolé', () => {
    expect(screen({ members: { 'u-peer': member() } })).toMatch(/aria-label="Réduire"[^>]*class="glass-call/);
  });

  test('UN seul chemin vers la conversation : « Conversation » dans l’en-tête, juste à droite de Réduire (#8436)', () => {
    const html = screen({ members: { 'u-peer': member() } });
    const header = html.slice(html.indexOf('data-call-header'));
    const order = ['aria-label="Réduire"', 'data-call-conversation'].map((marker) => header.indexOf(marker));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect(order[0]).toBeLessThan(order[1] as number);
    expect(header).toMatch(/aria-label="Conversation"[^>]*class="glass-call/);
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
    const rerender = (next: Partial<ActiveCall>) => root.render(<CallScreen call={call(next)} canShare effectsSupport={effectsSupport} />);
    const done = () => {
      act(() => root.unmount());
      host.remove();
    };
    return { host, find, press, rerender, done };
  };

  const peers = { 'u-peer': member(), 'u-b': member({ userId: 'u-b', name: 'Bintou' }) };

  const rowLabels = (host: HTMLElement, family: string) => [...host.querySelectorAll(`[data-call-row="${family}"] [data-call-row-scroll] button`)].map((button) => button.getAttribute('aria-label'));

  const railLabels = (host: HTMLElement, family: string) => [...host.querySelectorAll(`[data-call-rail="${family}"] button`)].map((button) => button.getAttribute('aria-label'));

  /* Un rail entre une image après sa demande (il se monte hors de l'écran, puis glisse) et sort en 300 ms : les témoins attendent ces deux moments. */
  const frame = () => act(async () => void (await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))));

  const leaving = () => act(async () => void (await new Promise((resolve) => setTimeout(resolve, 350))));

  const railsState = (host: HTMLElement) => host.querySelector('[data-call-rails]')?.getAttribute('data-call-rails') ?? null;

  test('en duo, (…) fait sortir DEUX RAILS sur les bords — « Mon image » à gauche, « L’appel » à droite — et la pilule NE grandit PAS (#17327)', async () => {
    const view = mount({ members: { 'u-peer': member() } });
    expect(railsState(view.host)).toBeNull();
    view.press('[data-call-more]');
    await frame();
    expect(view.find('[data-call-more]')?.getAttribute('aria-expanded')).toBe('true');
    expect(view.find('[data-call-control-pill]')?.getAttribute('data-call-control-pill')).toBe('pill');
    expect(view.find('[data-call-control-pill]')?.className).toContain('w-fit');
    expect(view.find('[data-call-control-pill] [data-call-row]')).toBeNull();
    expect(railsState(view.host)).toBe('shown');
    expect([...view.host.querySelectorAll('[data-call-rail]')].map((rail) => rail.getAttribute('data-call-rail'))).toEqual(['mine', 'call']);
    expect(view.find('[data-call-rail-side="leading"] [data-call-rail="mine"]')).not.toBeNull();
    expect(view.find('[data-call-rail-side="trailing"] [data-call-rail="call"]')).not.toBeNull();
    expect(railLabels(view.host, 'mine')).toEqual(['Activer la caméra', 'Partager l’écran']);
    expect(railLabels(view.host, 'call')).toEqual(['Afficher les sous-titres traduits', 'Enregistrer l’appel', 'Ajouter des personnes à l’appel', 'Ouvrir le journal de l’appel', 'Envoyer une réaction']);
    const rail = view.find('[data-call-rail="call"]');
    expect(rail?.getAttribute('role')).toBe('toolbar');
    expect(rail?.getAttribute('aria-orientation')).toBe('vertical');
    expect(rail?.getAttribute('aria-label')).toBe('L’appel');
    expect(rail?.className).toContain('glass-call');
    expect(rail?.querySelector('[data-call-rail-scroll]')?.className).toContain('overflow-y-auto');
    expect(view.find('[data-call-rail] [data-call-captions]')).not.toBeNull();
    expect(view.find('[data-call-rail] [data-call-record]')).not.toBeNull();
    expect(view.find('[data-call-rail] button')?.className).not.toContain('glass-call ');
    view.done();
  });

  test('en duo, ranger (…) renvoie chaque rail vers SON bord, puis le démonte : rien ne disparaît d’un coup (#17327)', async () => {
    const view = mount({ members: { 'u-peer': member() } });
    view.press('[data-call-more]');
    await frame();
    view.press('[data-call-more]');
    expect(railsState(view.host)).toBe('away');
    expect(view.find('[data-call-rail-side="leading"]')?.className).toContain('-translate-x-[calc(100%+1.5rem)]');
    expect(view.find('[data-call-rail-side="trailing"]')?.className).toContain('translate-x-[calc(100%+1.5rem)]');
    expect(view.find('[data-call-rail-side="leading"]')?.className).toContain('opacity-0');
    expect(view.find('[data-call-rail-side="leading"]')?.getAttribute('aria-hidden')).toBe('true');
    expect(view.find('[data-call-rail-side="leading"]')?.hasAttribute('inert')).toBe(true);
    await leaving();
    expect(railsState(view.host)).toBeNull();
    expect(view.find('[data-call-rail]')).toBeNull();
    view.done();
  });

  test('les rails ne font bouger que la transformation et l’opacité ; « Réduire les animations » remplace la translation par un fondu', async () => {
    const view = mount({ members: { 'u-peer': member() } });
    view.press('[data-call-more]');
    await frame();
    const classes = view.find('[data-call-rail-side="leading"]')?.className ?? '';
    expect(classes).toContain('transition-[translate,opacity]');
    expect(classes).toContain('motion-reduce:translate-x-0');
    expect(classes).toContain('motion-reduce:duration-150');
    expect(classes).not.toContain('transition-all');
    view.done();
  });

  test('en groupe, (…) fait grandir la pilule : une rangée par famille, légendée, qui défile à l’horizontale — jamais de rail sur la grille (#8550, #17327)', async () => {
    const view = mount({ isGroup: true, members: peers });
    view.press('[data-call-more]');
    await act(async () => {});
    expect(view.find('[data-call-more]')?.getAttribute('aria-expanded')).toBe('true');
    expect(view.find('[data-call-control-pill]')?.getAttribute('data-call-control-pill')).toBe('grown');
    const rows = [...view.host.querySelectorAll('[data-call-control-pill] [data-call-row]')].map((row) => [row.getAttribute('data-call-row'), row.querySelector('[data-call-row-title]')?.textContent]);
    expect(rows).toEqual([
      ['mine', 'Mon image'],
      ['call', 'L’appel'],
    ]);
    const scroller = view.find('[data-call-row="call"] [data-call-row-scroll]');
    expect(scroller?.getAttribute('role')).toBe('toolbar');
    expect(scroller?.getAttribute('aria-orientation')).toBe('horizontal');
    expect(scroller?.className).toContain('overflow-x-auto');
    expect(scroller?.className).not.toContain('snap-');
    expect(scroller?.className).not.toContain('flex-wrap');
    expect(rowLabels(view.host, 'mine')).toEqual(['Activer la caméra', 'Partager l’écran']);
    expect(view.find('[data-call-row="call"] [data-call-captions]')).not.toBeNull();
    expect(view.find('[data-call-row="call"] [data-call-record]')).not.toBeNull();
    expect(view.find('[data-call-self-controls]')).toBeNull();
    expect(view.find('[data-call-rail]')).toBeNull();
    expect(view.find('[data-call-rails]')).toBeNull();
    expect(view.find('[data-call-row] button')?.className).not.toContain('glass-call');
    view.press('[data-call-more]');
    expect(view.find('[data-call-row]')).toBeNull();
    view.done();
  });

  test('de deux à trois, le (…) reste ouvert et change de forme : les rails repartent, les rangées se déplient (#17327)', async () => {
    const duo = mount({ members: { 'u-peer': member() } });
    duo.press('[data-call-more]');
    await frame();
    expect(duo.find('[data-call-rail]')).not.toBeNull();
    act(() => duo.rerender({ isGroup: true, members: peers }));
    expect(duo.find('[data-call-screen]')?.getAttribute('data-call-layer')).toBe('menu');
    expect(duo.find('[data-call-control-pill]')?.getAttribute('data-call-control-pill')).toBe('grown');
    expect(duo.find('[data-call-control-pill] [data-call-row="call"]')).not.toBeNull();
    expect(railsState(duo.host)).toBe('away');
    duo.done();
  });

  test('les flèches passent d’une action à sa voisine : ← et → dans une rangée du groupe, ↑ et ↓ dans un rail du duo', async () => {
    const group = mount({ isGroup: true, members: peers });
    group.press('[data-call-more]');
    await act(async () => {});
    const first = group.find('[data-call-row="mine"] [data-call-row-scroll] button') as HTMLElement;
    act(() => first.focus());
    act(() => group.find('[data-call-row="mine"] [data-call-row-scroll]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Partager l’écran');
    group.done();
    const duo = mount({ members: { 'u-peer': member() } });
    duo.press('[data-call-more]');
    await frame();
    act(() => (duo.find('[data-call-rail="mine"] button') as HTMLElement).focus());
    act(() => duo.find('[data-call-rail="mine"]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Partager l’écran');
    duo.done();
  });

  test('caméra allumée en duo, ma vignette ne porte AUCUNE commande : Caméra · Retourner · Effets · Écran sont le rail gauche, dans cet ordre (#17327)', async () => {
    const view = mount({ cameraOn: true, members: { 'u-peer': member() } }, { color: true, blur: false });
    expect(view.find('[data-call-self-controls]')).toBeNull();
    expect(view.find('[data-call-self-row]')).toBeNull();
    expect(view.find('[data-call-corner-frame] [role="toolbar"]')).toBeNull();
    expect(view.find('[data-call-corner-frame] [data-call-control]')).toBeNull();
    view.press('[data-call-more]');
    await frame();
    expect(railLabels(view.host, 'mine')).toEqual(['Couper la caméra', 'Retourner la caméra', 'Effets de ma vidéo', 'Partager l’écran']);
    expect(view.host.querySelectorAll('[data-call-control="camera"]')).toHaveLength(1);
    expect(view.host.querySelectorAll('[data-call-screen-share]')).toHaveLength(1);
    expect(view.find('[data-call-rail="mine"] [data-call-control="camera"]')?.getAttribute('aria-pressed')).toBe('true');
    view.done();
  });

  test('ma vignette porte le cran du zoom de ma caméra, et lui seul, dans son coin haut (#8441, #17327)', async () => {
    const camera = { kind: 'video', readyState: 'live', getCapabilities: () => ({ zoom: { min: 1, max: 10, step: 0.1 } }), getSettings: () => ({ zoom: 1 }), applyConstraints: async () => undefined };
    const stream = Object.assign(Object.create(MediaStream.prototype) as MediaStream, { getVideoTracks: () => [camera], getAudioTracks: () => [], getTracks: () => [camera] });
    const view = mount({ cameraOn: true, localStream: stream, members: { 'u-peer': member() } });
    await act(async () => {
      await import('./call-self-camera');
    });
    await act(async () => {});
    expect(view.find('[data-call-corner-frame] [data-call-self-zoom] [data-call-self-control="zoom"]')?.textContent).toBe('1×');
    expect(view.host.querySelectorAll('[data-call-corner-frame] [data-call-self-control]')).toHaveLength(1);
    view.done();
  });

  test('caméra coupée, Caméra et Écran restent dans le rail gauche pour la rallumer (#8626, #17327)', async () => {
    const view = mount({ media: 'video', members: { 'u-peer': member({ cameraOn: true }) } });
    expect(view.find('[data-call-self-controls]')).toBeNull();
    view.press('[data-call-more]');
    await frame();
    expect(railLabels(view.host, 'mine')).toEqual(['Activer la caméra', 'Partager l’écran']);
    view.done();
  });

  test('toucher la scène range les deux rails vers leurs bords, avec le reste ; un second toucher les rend (#17327)', async () => {
    const view = mount({ cameraOn: true, members: { 'u-peer': member() } });
    view.press('[data-call-more]');
    await frame();
    expect(railsState(view.host)).toBe('shown');
    tapStage(view);
    expect(railsState(view.host)).toBe('away');
    expect(view.find('[data-call-rail-side="leading"]')?.getAttribute('aria-hidden')).toBe('true');
    expect(view.find('[data-call-rail-side="trailing"]')?.hasAttribute('inert')).toBe(true);
    tapStage(view);
    await frame();
    expect(railsState(view.host)).toBe('shown');
    expect(view.find('[data-call-rail-side="leading"]')?.hasAttribute('inert')).toBe(false);
    view.done();
  });

  test('toucher un rail n’efface rien : le toucher appartient à ce qu’il touche (#8735)', async () => {
    const view = mount({ cameraOn: true, members: { 'u-peer': member() } });
    view.press('[data-call-more]');
    await frame();
    act(() => (view.find('[data-call-rail="call"]') as HTMLElement).click());
    expect(view.find('[data-call-screen]')?.getAttribute('data-call-chrome')).toBe('shown');
    view.done();
  });

  test('en vidéo connectée, « Capturer » ferme la liste de l’appel, après Réagir ; jamais en audio (#8552, #17327)', async () => {
    const video = mount({ cameraOn: true, members: { 'u-peer': member() } });
    video.press('[data-call-more]');
    await frame();
    expect(railLabels(video.host, 'call')).toEqual(['Afficher les sous-titres traduits', 'Enregistrer l’appel', 'Ajouter des personnes à l’appel', 'Ouvrir le journal de l’appel', 'Envoyer une réaction', 'Capturer l’appel']);
    video.done();
    const audio = mount({ members: { 'u-peer': member() } });
    audio.press('[data-call-more]');
    await frame();
    expect(audio.find('[data-call-control="capture"]')).toBeNull();
    audio.done();
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

  const settle = async (chunk: () => Promise<unknown>) => {
    await act(async () => {
      await chunk();
      await loadCallStudioCatalog('fr');
    });
    await act(async () => {});
    await act(async () => {});
  };

  test('« Effets » entre en MODE : en-tête, pilule et rails s’effacent ; seul reste le carrousel, et ✕ rend l’appel (#8578)', async () => {
    const view = mount({ cameraOn: true, members: { 'u-peer': member() } }, { color: true, blur: false });
    view.press('[data-call-more]');
    await frame();
    view.press('[data-call-rail="mine"] [data-call-control="effects"]');
    await settle(() => import('./call-effects-mode'));
    expect(view.find('[data-call-screen]')?.getAttribute('data-call-layer')).toBe('mode');
    expect(view.find('[data-call-mode="effects"]')).not.toBeNull();
    expect(view.find('[data-call-header]')).toBeNull();
    expect(view.find('[data-call-control-pill]')).toBeNull();
    expect(view.find('[data-call-row]')).toBeNull();
    expect(view.find('[data-call-rail]')).toBeNull();
    expect(view.find('[data-call-rails]')).toBeNull();
    expect(view.host.querySelectorAll('[data-call-mode-carousel]')).toHaveLength(1);
    view.press('[data-call-mode-quit]');
    expect(view.find('[data-call-mode="effects"]')).toBeNull();
    expect(view.find('[data-call-screen]')?.getAttribute('data-call-layer')).toBe('idle');
    expect(view.find('[data-call-control-pill]')).not.toBeNull();
    expect(document.activeElement?.hasAttribute('data-call-more')).toBe(true);
    view.done();
  });

  const videoStream = (id: string): MediaStream => {
    const track = { id, kind: 'video', readyState: 'live' };
    return Object.assign(Object.create(MediaStream.prototype) as MediaStream, { id, getVideoTracks: () => [track], getAudioTracks: () => [], getTracks: () => [track] });
  };

  test('en mode Effets, l’autre reste à l’écran : sa vidéo en vignette, lisible, hors de l’aperçu que la capture lit — qui reste MA vidéo (#8737)', async () => {
    const mine = videoStream('mine');
    const theirs = videoStream('theirs');
    const view = mount({ media: 'video', cameraOn: true, localStream: mine, members: { 'u-peer': member({ cameraOn: true }) }, remoteStreams: { 'u-peer': theirs } }, { color: true, blur: false });
    view.press('[data-call-more]');
    await frame();
    view.press('[data-call-control="effects"]');
    await settle(() => import('./call-effects-mode'));
    const block = view.find('[data-call-effects-companions]');
    expect(block?.getAttribute('aria-label')).toBe('Participants à l’appel');
    const peerVideo = view.find('[data-call-effects-companion="u-peer"] video') as HTMLVideoElement | null;
    expect(peerVideo?.srcObject).toBe(theirs);
    expect(peerVideo?.getAttribute('aria-label')).toBe('Amina Diallo');
    expect(peerVideo?.closest('[aria-hidden="true"]')).toBeNull();
    expect(peerVideo?.closest('[data-call-mode-preview]')).toBeNull();
    const previewVideos = [...view.host.querySelectorAll('[data-call-mode-preview="effects"] video')] as HTMLVideoElement[];
    expect(previewVideos.map((video) => video.srcObject)).toEqual([mine]);
    view.done();
  });

  test('en groupe, les autres dans l’ordre d’arrivée ; caméra coupée, son portrait (#8737)', async () => {
    const members = { 'u-z': member({ userId: 'u-z', name: 'Zoé', cameraOn: true }), 'u-a': member({ userId: 'u-a', name: 'Aya' }) };
    const view = mount({ media: 'video', isGroup: true, cameraOn: true, localStream: videoStream('mine'), members, remoteStreams: { 'u-z': videoStream('z'), 'u-a': videoStream('a') } }, { color: true, blur: false });
    view.press('[data-call-more]');
    view.press('[data-call-control="effects"]');
    await settle(() => import('./call-effects-mode'));
    expect([...view.host.querySelectorAll('[data-call-effects-companion]')].map((tile) => tile.getAttribute('data-call-effects-companion'))).toEqual(['u-z', 'u-a']);
    expect(view.find('[data-call-effects-companion="u-z"] video')).not.toBeNull();
    expect(view.find('[data-call-effects-companion="u-a"] video')).toBeNull();
    expect(view.find('[data-call-effects-companion="u-a"]')?.textContent).toContain('Aya');
    view.done();
  });

  test('« Capturer » entre en MODE montage : l’aperçu plein écran, les treize styles au carrousel, plus de déclencheur (#8552, #8578, #8625)', async () => {
    const view = mount({ cameraOn: true, members: { 'u-peer': member() } });
    view.press('[data-call-more]');
    view.press('[data-call-control="capture"]');
    await settle(() => import('./call-montage-mode'));
    expect(view.find('[data-call-screen]')?.getAttribute('data-call-layer')).toBe('mode');
    expect(view.find('[data-call-mode-preview="montage"] [data-call-capture-preview]')?.tagName).toBe('CANVAS');
    expect(view.host.querySelectorAll('[data-call-capture-thumb]')).toHaveLength(13);
    expect(view.find('[data-call-capture-shoot]')).toBeNull();
    expect(view.find('[data-carousel-item="grid"]')?.getAttribute('aria-describedby')).not.toBeNull();
    expect(view.find('[data-call-control-pill]')).toBeNull();
    act(() => view.find('[data-call-mode="montage"]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(view.find('[data-call-mode="montage"]')).toBeNull();
    expect(view.find('[data-call-control-pill]')).not.toBeNull();
    view.done();
  });

  /* Les plans de l'écran d'appel, du fond vers le lecteur : la scène, ma
     vignette (z-10, au-dessus de l'espace vide de la colonne pour recevoir le
     doigt), puis l'en-tête et la pilule avec ses panneaux (z-20). Mesuré dans
     Chromium à 320 × 568 : sans ce plan, la vignette couvrait « Fermer » du
     Journal, qui monte jusqu'à elle. */
  test('l’en-tête et la pilule passent au-dessus de ma vignette, qui passe au-dessus de la scène', () => {
    const view = mount({ cameraOn: true, members: { 'u-peer': member() } });
    const plane = (selector: string) => (view.find(selector)?.closest('[data-call-plane]') as HTMLElement | null)?.className.split(' ') ?? [];
    expect(plane('[data-call-header]')).toContain('z-20');
    expect(plane('[data-call-controls]')).toContain('z-20');
    expect(view.find('[data-call-corner]')?.className.split(' ')).toContain('z-10');
    view.done();
  });

  test('mon image en plein écran : plus aucune rangée de commandes en haut — le rail « mon image » reste le seul endroit ; « Effets » y entre dans le mode (#8576, #17327)', async () => {
    const view = mount({ media: 'video', cameraOn: true, members: { 'u-peer': member({ cameraOn: true }) } }, { color: true, blur: false });
    view.press('[data-call-corner]');
    await settle(() => import('./call-self-camera'));
    expect(view.find('[data-call-self-controls]')).toBeNull();
    expect(view.find('[data-call-self-controls-holder]')).toBeNull();
    expect(view.find('[data-call-corner-frame] [data-call-control]')).toBeNull();
    view.press('[data-call-more]');
    await frame();
    expect(railLabels(view.host, 'mine')).toEqual(['Couper la caméra', 'Retourner la caméra', 'Effets de ma vidéo', 'Partager l’écran']);
    view.press('[data-call-rail="mine"] [data-call-control="effects"]');
    expect(view.find('[data-call-screen]')?.getAttribute('data-call-layer')).toBe('mode');
    await settle(() => import('./call-effects-mode'));
    expect(view.find('[data-call-mode="effects"]')).not.toBeNull();
    expect(view.find('[data-call-rail]')).toBeNull();
    view.done();
  });

  test('« Journal », entre Ajouter et Réagir, ouvre TOUT l’appel à la place des rails — et le bandeau se tait (#8579, #17327)', async () => {
    const said = (n: number) => ({ id: `w-${n}`, speakerId: 'u-peer', speakerName: 'Amina', original: `Line ${n}`, translated: `Ligne ${n}`, pair: { from: 'en', to: 'fr' }, isFinal: true, at: n, mine: false });
    const view = mount({ members: { 'u-peer': member() }, captionsMode: 'translated', captions: Array.from({ length: 250 }, (_, n) => said(n)) });
    view.press('[data-call-more]');
    await frame();
    const row = [...view.host.querySelectorAll('[data-call-rail="call"] button')];
    const at = (selector: string) => row.findIndex((button) => button.matches(selector));
    expect(at('[data-call-control="journal"]')).toBe(at('[data-call-control="invite"]') + 1);
    expect(at('[data-call-control="react"]')).toBe(at('[data-call-control="journal"]') + 1);
    expect(view.find('[data-call-control="journal"]')?.getAttribute('aria-label')).toBe('Ouvrir le journal de l’appel');
    view.press('[data-call-control="journal"]');
    await settle(() => import('./call-journal-panel'));
    expect(view.find('[data-call-row]')).toBeNull();
    expect(railsState(view.host)).not.toBe('shown');
    expect(view.host.querySelectorAll('[data-call-journal-entry]')).toHaveLength(250);
    expect(view.find('[data-call-captions-panel]')).toBeNull();
    view.press('[data-panel-back]');
    expect(document.activeElement?.getAttribute('data-call-control')).toBe('journal');
    view.done();
  });

  const swipeDown = (host: HTMLElement, to: number) => {
    const stage = host.querySelector('[data-call-screen]') as HTMLElement;
    const at = { now: 0 };
    const pointer = (type: string, y: number) => {
      at.now += 16;
      const event = new PointerEvent(type, { bubbles: true, clientX: 200, clientY: y, pointerId: 7, isPrimary: true, button: 0, pointerType: 'touch' });
      Object.defineProperty(event, 'timeStamp', { value: at.now });
      act(() => void stage.dispatchEvent(event));
    };
    pointer('pointerdown', 100);
    pointer('pointermove', 100 + to / 2);
    pointer('pointermove', 100 + to);
    pointer('pointerup', 100 + to);
  };

  const spyMinimize = () => {
    const original = callActions.minimize;
    const minimized: number[] = [];
    callActions.minimize = () => void minimized.push(1);
    return { minimized, restore: () => void (callActions.minimize = original) };
  };

  test('en duo, glisser l’écran d’appel vers le bas le réduit en bulle, comme sur iOS (#9096)', () => {
    const spy = spyMinimize();
    const view = mount({ members: { 'u-peer': member() } });
    expect(view.find('[data-call-screen]')?.getAttribute('data-call-swipe-down')).toBe('ready');
    swipeDown(view.host, 280);
    expect(spy.minimized).toHaveLength(1);
    spy.restore();
    view.done();
  });

  test('en groupe, ou le menu ouvert, le glissé n’existe pas : la scène et les rangées gardent leurs gestes (#9096)', () => {
    const spy = spyMinimize();
    const group = mount({ isGroup: true, members: peers });
    expect(group.find('[data-call-screen]')?.hasAttribute('data-call-swipe-down')).toBe(false);
    swipeDown(group.host, 280);
    group.done();
    const menu = mount({ members: { 'u-peer': member() } });
    menu.press('[data-call-more]');
    expect(menu.find('[data-call-screen]')?.hasAttribute('data-call-swipe-down')).toBe(false);
    swipeDown(menu.host, 280);
    menu.done();
    expect(spy.minimized).toHaveLength(0);
    spy.restore();
  });

  test('en groupe, MA tuile passe à la une : la grille ne porte aucune commande de ma caméra, la rangée « Mon image » de la pilule les garde toutes (#9098, #17327)', async () => {
    const view = mount({ isGroup: true, members: peers, cameraOn: true });
    view.press('[data-call-tile-self]');
    expect(view.find('[data-call-spotlight]')?.getAttribute('data-call-spotlight')).toBe('self');
    expect(view.find('[data-call-self-featured-controls]')).toBeNull();
    expect(view.find('[data-call-self-controls-holder]')).toBeNull();
    expect(view.find('[data-call-fullscreen]')).not.toBeNull();
    view.press('[data-call-more]');
    await act(async () => {});
    expect(rowLabels(view.host, 'mine')).toEqual(['Couper la caméra', 'Retourner la caméra', 'Partager l’écran']);
    view.done();
  });

  test('en groupe, chrome rangé, toucher une vignette le RANGE au lieu de changer la une ; chrome visible, elle la met à la une (#9183)', () => {
    const view = mount({ isGroup: true, members: peers, cameraOn: true });
    const chrome = () => view.find('[data-call-screen]')?.getAttribute('data-call-chrome');
    tapStage(view);
    expect(chrome()).toBe('hidden');
    view.press('[data-call-tile-self]');
    expect(chrome()).toBe('shown');
    expect(view.find('[data-call-spotlight]')).toBeNull();
    view.press('[data-call-tile-self]');
    expect(view.find('[data-call-spotlight]')?.getAttribute('data-call-spotlight')).toBe('self');
    view.done();
  });

  test('Échap, un panneau ouvert, le ferme SANS réduire l’appel — même quand le focus a quitté le panneau (#8618)', async () => {
    const original = callActions.minimize;
    const minimized: number[] = [];
    callActions.minimize = () => void minimized.push(1);
    const view = mount({ members: { 'u-peer': member() } });
    view.press('[data-call-more]');
    view.press('[data-call-control="journal"]');
    await settle(() => import('./call-journal-panel'));
    act(() => (document.activeElement as HTMLElement | null)?.blur());
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(view.find('[data-call-journal-panel]')).toBeNull();
    expect(view.find('[data-call-screen]')?.getAttribute('data-call-layer')).toBe('idle');
    expect(minimized).toHaveLength(0);
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(minimized).toHaveLength(1);
    callActions.minimize = original;
    view.done();
  });

  test('un panneau REMPLACE les rangées : ‹ revient au menu, ✕ ferme tout (#8578)', async () => {
    const view = mount({ members: { 'u-peer': member() } });
    view.press('[data-call-more]');
    await frame();
    view.press('[data-call-control="react"]');
    await settle(() => import('./call-control-panels'));
    expect(view.find('[data-call-screen]')?.getAttribute('data-call-layer')).toBe('panel');
    expect(view.find('[data-call-react-panel]')).not.toBeNull();
    expect(view.find('[data-call-row]')).toBeNull();
    expect(railsState(view.host)).not.toBe('shown');
    expect(view.find('[data-call-control-pill]')?.getAttribute('data-call-control-pill')).toBe('grown');
    expect(view.find('[data-panel-back]')?.getAttribute('aria-label')).toBe('Retour');
    view.press('[data-panel-back]');
    await frame();
    expect(view.find('[data-call-screen]')?.getAttribute('data-call-layer')).toBe('menu');
    expect(railsState(view.host)).toBe('shown');
    expect(view.find('[data-call-control-pill]')?.getAttribute('data-call-control-pill')).toBe('pill');
    expect(document.activeElement?.getAttribute('data-call-control')).toBe('react');
    view.press('[data-call-control="react"]');
    view.press('[data-panel-close]');
    expect(view.find('[data-call-screen]')?.getAttribute('data-call-layer')).toBe('idle');
    expect(view.find('[data-call-row]')).toBeNull();
    view.done();
  });

  test('ranger les actions referme le panneau ouvert', () => {
    const view = mount({ members: { 'u-peer': member() } });
    view.press('[data-call-more]');
    view.press('[data-call-control="react"]');
    view.press('[data-call-more]');
    expect(view.find('[data-call-screen]')?.getAttribute('data-call-layer')).toBe('idle');
    view.press('[data-call-more]');
    expect(view.find('[data-call-screen]')?.getAttribute('data-call-layer')).toBe('menu');
    expect(view.find('[data-call-rail="call"]')).not.toBeNull();
    view.done();
  });

  const tapStage = (view: ReturnType<typeof mount>) => act(() => (view.find('[data-call-stage-surface]') as HTMLElement | null)?.click());

  test('les sous-titres vivent DANS la pilule, (…) les range, et ils ne s’effacent pas avec les commandes : la pilule rangée les laisse dans un verre à eux (#17343, loi 11)', async () => {
    const view = mount({ isGroup: true, cameraOn: true, members: peers, captionsMode: 'translated' });
    await act(async () => {
      await import('./call-captions-panel');
    });
    const panel = () => view.find('[data-call-captions-panel]');
    expect(panel()?.getAttribute('data-call-captions-surface')).toBe('inset');
    expect(panel()?.closest('[data-call-control-pill]')).not.toBeNull();
    view.press('[data-call-more]');
    expect(panel()?.closest('[data-leaving][inert]')).not.toBeNull();
    view.press('[data-call-more]');
    expect(panel()?.getAttribute('data-call-captions-surface')).toBe('inset');
    expect(panel()?.closest('[data-leaving]')).toBeNull();
    tapStage(view);
    await act(async () => {});
    expect(view.find('[data-call-screen]')?.getAttribute('data-call-chrome')).toBe('hidden');
    const alone = view.find('[data-call-captions-band] [data-call-captions-panel]');
    expect(alone).not.toBeNull();
    expect(alone?.closest('[aria-hidden="true"]')).toBeNull();
    expect(alone?.closest('[data-call-control-pill]')).toBeNull();
    expect(alone?.getAttribute('data-call-captions-surface')).toBe('glass');
    view.done();
  });

  test('toucher la scène efface TOUTES les commandes — en-tête, pilule, pastilles — et un second toucher les rend (#8550)', () => {
    const view = mount({ cameraOn: true, members: { 'u-peer': member({ micMuted: true }) } });
    const chrome = () => view.find('[data-call-screen]')?.getAttribute('data-call-chrome');
    tapStage(view);
    expect(chrome()).toBe('hidden');
    expect(view.find('[data-call-controls]')?.getAttribute('aria-hidden')).toBe('true');
    expect(view.find('[data-call-header]')?.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(view.find('[data-call-pill="peer-muted"]')?.closest('[aria-hidden="true"]')).not.toBeNull();
    tapStage(view);
    expect(chrome()).toBe('shown');
    view.done();
  });

  test('en groupe, les pastilles d’état s’effacent avec le reste', () => {
    const view = mount({ isGroup: true, cameraOn: true, members: { ...peers, 'u-b': member({ userId: 'u-b', name: 'Bintou', micMuted: true }) } });
    expect(view.find('[data-call-pill-row]')?.closest('[data-call-chrome-fade]')).not.toBeNull();
    view.done();
  });

  test('toucher un bouton n’efface rien ; bouger la souris ne rend pas ce qu’un toucher a rangé', () => {
    const view = mount({ cameraOn: true, members: { 'u-peer': member() } });
    const chrome = () => view.find('[data-call-screen]')?.getAttribute('data-call-chrome');
    view.press('[data-call-more]');
    expect(chrome()).toBe('shown');
    tapStage(view);
    act(() => view.find('[data-call-screen]')?.dispatchEvent(new Event('pointermove', { bubbles: true })));
    expect(chrome()).toBe('hidden');
    view.done();
  });

  const onFakeClock = (run: () => void) => {
    jest.useFakeTimers();
    try {
      run();
    } finally {
      jest.useRealTimers();
    }
  };

  const chromeOf = (view: ReturnType<typeof mount>) => view.find('[data-call-screen]')?.getAttribute('data-call-chrome');

  const controlsClasses = (view: ReturnType<typeof mount>) => (view.find('[data-call-controls]') as HTMLElement | null)?.className.split(' ') ?? [];

  /* AUCUNE MINUTERIE (#8988, directive porteur du 2026-10-01) : les commandes
     d'une vidéo ne disparaissent plus d'elles-mêmes — un toucher sur la scène
     les range, le suivant les rend. */
  test('en vidéo, aucune attente n’efface les commandes : ni au repos, ni le menu ouvert (#8988)', () =>
    onFakeClock(() => {
      const view = mount({ cameraOn: true, members: { 'u-peer': member() } });
      act(() => jest.advanceTimersByTime(60_000));
      expect(chromeOf(view)).toBe('shown');
      view.press('[data-call-more]');
      act(() => jest.advanceTimersByTime(60_000));
      expect(chromeOf(view)).toBe('shown');
      expect(controlsClasses(view)).toContain('opacity-100');
      view.done();
    }));

  /* Le clic sur la scène, qui n'est pas focalisable, emporte le focus HORS de
     l'écran, sur le `<dialog>` qui le porte (mesuré dans Chromium) : l'hôte du
     témoin en tient lieu. */
  test('rangées d’un toucher, une touche les rend — même pressée hors de l’écran, sur ce qui le porte (#8988)', () => {
    const view = mount({ cameraOn: true, members: { 'u-peer': member() } });
    tapStage(view);
    expect(chromeOf(view)).toBe('hidden');
    act(() => void view.host.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })));
    expect(chromeOf(view)).toBe('shown');
    view.done();
  });

  /* UN BOUTON VISIBLE RÉPOND AU PREMIER TOUCHER (#8735). Le fondu posait
     `pointer-events-none` à l'instant où l'opacité COMMENÇAIT à baisser : un
     bouton encore bien visible laissait passer le doigt à la vidéo, qui ne
     faisait que rendre les commandes — il fallait toucher deux fois. */
  test('rangées d’un toucher sur la scène, elles laissent passer le doigt — une fois leur fondu fini, jamais pendant (#8735)', () => {
    const view = mount({ cameraOn: true, members: { 'u-peer': member() } });
    expect(controlsClasses(view)).toContain('transition-opacity');
    tapStage(view);
    expect(chromeOf(view)).toBe('hidden');
    expect(controlsClasses(view)).toContain('invisible');
    expect(controlsClasses(view)).toContain('transition-[opacity,visibility]');
    expect(controlsClasses(view)).not.toContain('pointer-events-none');
    tapStage(view);
    expect(controlsClasses(view)).not.toContain('invisible');
    view.done();
  });

  /* LE GLISSÉ NE REBONDIT PAS (#8736) : `overscroll-x-contain` laisse
     l'élasticité locale d'une piste, dont la fin d'animation termine le
     défilement suivant (#8619, 10 glissés perdus sur 10). */
  test('chaque rangée et chaque panneau défile sans élasticité : overscroll-x-none (#8736)', async () => {
    const view = mount({ isGroup: true, members: peers });
    view.press('[data-call-more]');
    await act(async () => {});
    const rows = [...view.host.querySelectorAll<HTMLElement>('[data-call-row] [data-call-row-scroll]')];
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((row) => {
      expect(row.className).toContain('overscroll-x-none');
      expect(row.className).not.toContain('overscroll-x-contain');
    });
    view.press('[data-call-control="react"]');
    await act(async () => {
      await import('./call-control-panels');
    });
    await act(async () => {});
    expect((view.find('[data-call-react-panel] [data-call-row-scroll]') as HTMLElement | null)?.className).toContain('overscroll-x-none');
    view.done();
  });

  /* LE PREMIER TOUCHER N'ATTEND PAS LE RÉSEAU (#8735) : chaque mode et
     chaque panneau vit dans son chunk ; l'appel vivant, ils se chargent quand
     le navigateur souffle. Et un mode encore en chemin ne laisse pas un écran
     vide : sa barre est là, et ✕ en sort déjà. */
  test('l’appel vivant, les modes et les panneaux se préchargent quand le navigateur souffle — pas pendant la sonnerie (#8735)', () => {
    const globals = globalThis as typeof globalThis & { requestIdleCallback?: unknown; cancelIdleCallback?: unknown };
    const saved = { request: globals.requestIdleCallback, cancel: globals.cancelIdleCallback };
    const scheduled: IdleRequestCallback[] = [];
    globals.requestIdleCallback = (run: IdleRequestCallback) => scheduled.push(run);
    globals.cancelIdleCallback = () => undefined;
    try {
      const ringing = mount({ phase: { kind: 'incoming' }, direction: 'incoming' });
      expect(scheduled).toHaveLength(0);
      ringing.done();
      const view = mount({ members: { 'u-peer': member() } });
      expect(scheduled).toHaveLength(1);
      expect(() => scheduled[0]?.({ didTimeout: false, timeRemaining: () => 50 })).not.toThrow();
      view.done();
    } finally {
      globals.requestIdleCallback = saved.request;
      globals.cancelIdleCallback = saved.cancel;
    }
  });

  test('un mode en chemin montre sa barre, et ✕ en sort avant qu’il n’arrive (#8735)', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const exits: string[] = [];
    act(() => root.render(<CallModePending label="Fermer" glyph={null} onExit={() => void exits.push('exit')} />));
    const quit = host.querySelector('[data-call-mode-pending] button[aria-label="Fermer"]') as HTMLElement | null;
    expect(quit).not.toBeNull();
    act(() => quit?.click());
    expect(exits).toEqual(['exit']);
    act(() => root.unmount());
    host.remove();
  });

  test('la durée de la puce avance chaque seconde (#8735)', () =>
    onFakeClock(() => {
      const view = mount({ connectedAt: Date.now(), members: { 'u-peer': member() } });
      const chip = () => view.find('[data-call-chip]')?.textContent ?? '';
      expect(chip()).toContain('0:00');
      act(() => jest.advanceTimersByTime(2000));
      expect(chip()).toContain('0:02');
      view.done();
    }));

  test('en audio, toucher ne cache rien', () => {
    const view = mount({ members: { 'u-peer': member() } });
    act(() => (view.find('[data-call-status]') as HTMLElement | null)?.click());
    expect(view.find('[data-call-screen]')?.getAttribute('data-call-chrome')).toBe('shown');
    view.done();
  });
});

describe('CallScreen — le verre : un seul flou par pilule, un disque de verre par bouton (#8432, #17345)', () => {
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

  const nestedGlass = async (overrides: Partial<ActiveCall>, openPanel: boolean) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<CallScreen call={call(overrides)} canShare effectsSupport={{ color: true, blur: true }} />));
    act(() => (host.querySelector('[data-call-more]') as HTMLElement | null)?.click());
    if (openPanel) {
      act(() => (host.querySelector('[data-call-control="react"]') as HTMLElement | null)?.click());
      await act(async () => {});
    }
    const glasses = [...host.querySelectorAll(GLASS)];
    const nested = glasses.filter((glass) => glass.parentElement?.closest(GLASS) != null).map((glass) => glass.outerHTML.slice(0, 80));
    const panel = host.querySelector('[data-call-react-panel]');
    act(() => root.unmount());
    host.remove();
    return { nested, glasses: glasses.length, panel };
  };

  test('en duo, actions sorties et panneau « Réagir » ouvert : chaque groupe a UN flou', async () => {
    const view = await nestedGlass({ cameraOn: true, members: { 'u-peer': member() } }, true);
    expect(view.panel).not.toBeNull();
    expect(view.glasses).toBeGreaterThan(3);
    expect(view.nested).toEqual([]);
  });

  test('en groupe, la pilule qui a grandi porte ses rangées sans second flou', async () => {
    const view = await nestedGlass({ isGroup: true, cameraOn: true, members: { 'u-peer': member(), 'u-b': member({ userId: 'u-b', name: 'Bintou' }) } }, true);
    expect(view.nested).toEqual([]);
  });

  const BLUR = '.glass-call, .glass-call-prominent';
  const DISC = 'glass-call-disc';

  const mountPill = async (overrides: Partial<ActiveCall>, expand: boolean) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<CallScreen call={call(overrides)} canShare effectsSupport={{ color: true, blur: true }} />));
    if (expand) {
      act(() => (host.querySelector('[data-call-more]') as HTMLElement | null)?.click());
      await act(async () => {});
    }
    const pill = host.querySelector('[data-call-control-pill]') as HTMLElement;
    const buttons = [...pill.querySelectorAll('button')] as HTMLElement[];
    const done = () => {
      act(() => root.unmount());
      host.remove();
    };
    return { pill, buttons, done };
  };

  const discOf = (button: HTMLElement) => (button.classList.contains(DISC) ? button : button.querySelector(`.${DISC}`));

  test('(#17345) chaque bouton au repos de la pilule porte son disque de verre dessiné : (…), Micro, Sortie', async () => {
    const view = await mountPill({ cameraOn: true, members: { 'u-peer': member() } }, false);
    const resting = ['[data-call-more]', '[aria-label="Couper le micro"]', '[data-call-devices-open]'].map((selector) => view.pill.querySelector(selector) as HTMLElement);
    expect(resting.every((button) => button != null)).toBe(true);
    for (const button of resting) expect(discOf(button)).not.toBeNull();
    view.done();
  });

  test('(#17345) aucun bouton de la pilule n’est transparent', async () => {
    const view = await mountPill({ isGroup: true, cameraOn: true, members: { 'u-peer': member(), 'u-b': member({ userId: 'u-b', name: 'Bintou' }) } }, true);
    expect(view.buttons.length).toBeGreaterThan(4);
    for (const button of view.buttons) {
      const round = (button.querySelector('span[class*="rounded-full"]') ?? button) as HTMLElement;
      const filled = discOf(button) != null || round.style.background !== '' || round.style.backgroundColor !== '';
      expect([button.getAttribute('aria-label'), filled]).toEqual([button.getAttribute('aria-label'), true]);
      expect(round.style.background).not.toBe('transparent');
    }
    view.done();
  });

  test('(#17345) les rangées sorties par (…) en groupe portent aussi leurs disques, sous le même flou', async () => {
    const view = await mountPill({ isGroup: true, cameraOn: true, members: { 'u-peer': member(), 'u-b': member({ userId: 'u-b', name: 'Bintou' }) } }, true);
    const rows = [...view.pill.querySelectorAll('[data-call-row] button')] as HTMLElement[];
    expect(rows.length).toBeGreaterThan(2);
    expect(rows.filter((button) => discOf(button) != null).length).toBeGreaterThan(0);
    view.done();
  });

  test('(#17345, #17327) les rails du duo : chaque bouton porte son disque de verre dessiné, sous le seul flou de la capsule', async () => {
    const view = await mountPill({ cameraOn: true, members: { 'u-peer': member() } }, true);
    await act(async () => void (await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))));
    const rails = [...document.querySelectorAll('[data-call-rail]')] as HTMLElement[];
    expect(rails).toHaveLength(2);
    for (const rail of rails) {
      expect(rail.matches(BLUR)).toBe(true);
      expect(rail.querySelectorAll(BLUR)).toHaveLength(0);
      const buttons = [...rail.querySelectorAll('button')] as HTMLElement[];
      expect(buttons.length).toBeGreaterThan(1);
      for (const button of buttons) expect([button.getAttribute('aria-label'), discOf(button) != null || button.style.background !== '' || (button.querySelector('span[class*="rounded-full"]') as HTMLElement | null)?.style.background !== '']).toEqual([button.getAttribute('aria-label'), true]);
    }
    view.done();
  });

  test('(#17345) un seul flou : la pilule, repliée comme déployée, et aucun de ses disques', async () => {
    for (const expand of [false, true]) {
      const view = await mountPill({ cameraOn: true, members: { 'u-peer': member() } }, expand);
      expect(view.pill.matches(BLUR)).toBe(true);
      expect(view.pill.querySelectorAll(BLUR)).toHaveLength(0);
      for (const disc of view.pill.querySelectorAll(`.${DISC}`)) expect(disc.matches(BLUR)).toBe(false);
      view.done();
    }
  });

  test('(#17345) enclenché reste un plein blanc, Fin reste rouge : ni l’un ni l’autre ne devient un disque de verre', async () => {
    const view = await mountPill({ micMuted: true, members: { 'u-peer': member() } }, false);
    const mic = view.pill.querySelector('[aria-pressed="true"]') as HTMLElement;
    expect(mic.classList.contains(DISC)).toBe(false);
    expect(mic.style.background).toContain('--color-on-media');
    const hangup = view.pill.querySelector('[aria-label="Raccrocher"]') as HTMLElement | null;
    expect(hangup?.classList.contains(DISC)).toBe(false);
    expect(hangup?.style.background).toContain('--ios-error-strong');
    view.done();
  });

  test('la sonnerie et l’écran de fin : les boutons neutres sont de verre, Refuser et Fin rouges, Accepter vert', () => {
    const incoming = screen({ phase: { kind: 'incoming' }, media: 'video', direction: 'incoming' });
    expect(incoming).toMatch(/aria-label="Répondre sans vidéo"[^>]*class="glass-call/);
    expect(incoming).toMatch(/aria-label="Refuser avec un message"[^>]*class="glass-call/);
    expect(incoming).not.toMatch(/aria-label="Refuser"[^>]*class="glass-call/);
    expect(screen({ phase: { kind: 'ended', reason: 'missed', detail: null } })).toMatch(/aria-label="Fermer"[^>]*class="glass-call/);
  });
});

describe('CallScreen — voir et entendre l’appelant avant de décrocher (#8480)', () => {
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

  const previewStream = (kinds: ReadonlyArray<'audio' | 'video'>) => {
    const tracks = kinds.map((kind) => ({ kind, readyState: 'live' }));
    /* Une doublure qui PASSE pour un MediaStream (`srcObject` de happy-dom le vérifie). */
    return Object.assign(Object.create(MediaStream.prototype) as MediaStream, { getTracks: () => tracks, getVideoTracks: () => tracks.filter((t) => t.kind === 'video'), getAudioTracks: () => tracks.filter((t) => t.kind === 'audio') });
  };
  const ringing = (media: 'audio' | 'video', preview: MediaStream | null): Partial<ActiveCall> => ({ phase: { kind: 'incoming' }, media, direction: 'incoming', callerName: 'Amina Diallo', preview });

  const mount = (overrides: Partial<ActiveCall>) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<CallScreen call={call(overrides)} />));
    const find = (selector: string) => host.querySelector(selector);
    const press = (selector: string) => act(() => (find(selector) as HTMLElement | null)?.click());
    const done = () => {
      act(() => root.unmount());
      host.remove();
    };
    return { find, press, done };
  };

  test('la vidéo de l’appelant remplit l’écran de sonnerie, muette, sous les boutons de réponse', () => {
    const view = mount(ringing('video', previewStream(['video', 'audio'])));
    const video = view.find('[data-call-preview] video') as HTMLVideoElement | null;
    expect(video).not.toBeNull();
    expect(video?.muted).toBe(true);
    expect(view.find('[data-call-preview-audio] audio')).toBeNull();
    expect(view.find('[data-call-incoming-accept]')?.getAttribute('aria-label')).toBe('Répondre');
    view.done();
  });

  test('« Activer le son » fait entendre l’appelant, « Couper le son » le fait taire', () => {
    const view = mount(ringing('video', previewStream(['video', 'audio'])));
    const toggle = () => view.find('[data-call-preview-sound]');
    expect(toggle()?.getAttribute('aria-pressed')).toBe('false');
    expect(toggle()?.getAttribute('aria-label')).toBe('Activer le son');
    view.press('[data-call-preview-sound]');
    expect(view.find('[data-call-preview-audio] audio')).not.toBeNull();
    expect(toggle()?.getAttribute('aria-pressed')).toBe('true');
    expect(toggle()?.getAttribute('aria-label')).toBe('Couper le son');
    view.press('[data-call-preview-sound]');
    expect(view.find('[data-call-preview-audio] audio')).toBeNull();
    view.done();
  });

  test('le bouton de son se lit d’emblée, en toutes lettres, au-dessus de l’identité (#8627)', () => {
    const view = mount(ringing('video', previewStream(['video', 'audio'])));
    const button = view.find('[data-call-preview-sound]');
    expect(button?.textContent).toContain('Activer le son');
    expect(button?.className).toContain('glass-call-prominent');
    view.done();
  });

  test('activer le son de l’aperçu fait taire la sonnerie ; le couper ne la relance pas (#8627)', () => {
    const original = callActions.hearPreview;
    const heard: number[] = [];
    callActions.hearPreview = () => void heard.push(1);
    const view = mount(ringing('video', previewStream(['video', 'audio'])));
    view.press('[data-call-preview-sound]');
    expect(heard).toHaveLength(1);
    view.press('[data-call-preview-sound]');
    expect(heard).toHaveLength(1);
    view.done();
    callActions.hearPreview = original;
  });

  test('un appel vocal qui sonne s’écoute aussi, sans vidéo', () => {
    const view = mount(ringing('audio', previewStream(['audio'])));
    expect(view.find('[data-call-preview] video')).toBeNull();
    expect(view.find('[data-call-preview-sound]')).not.toBeNull();
    view.done();
  });

  test('sans aperçu, ni vidéo ni bouton de son', () => {
    const html = screen(ringing('video', null));
    expect(html).not.toContain('data-call-preview');
  });

  test('l’appelant lit que l’appelé le voit, ou peut l’entendre en vocal', () => {
    expect(screen({ phase: { kind: 'outgoing' }, media: 'video', previewed: true })).toContain('Amina Diallo vous voit avant de décrocher');
    expect(screen({ phase: { kind: 'outgoing' }, media: 'audio', previewed: true })).toContain('Amina Diallo peut vous entendre avant de décrocher');
    expect(screen({ phase: { kind: 'outgoing' }, media: 'video', previewed: false })).not.toContain('avant de décrocher');
  });
});

describe('ThreadCallButton', () => {
  test('en fixtures, le bouton ouvre un menu vocal/vidéo', () => {
    const html = renderToStaticMarkup(<ThreadCallButton conversationId="c-1" title="Amina" avatar={null} group={false} />);
    expect(html).toContain('data-thread-call="menu"');
    expect(html).toContain('aria-haspopup="menu"');
  });
});
