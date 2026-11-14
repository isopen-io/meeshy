import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { FullScreenLevel, SpotlightChoice } from '@/lib/calls/call-spotlight';
import { speakerColor } from '@/lib/calls/call-speaker-color';
import type { CallMember } from '@/lib/calls/call-store';

import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';

import { CallGrid, type CallGridProps } from './call-grid';
import { CALL_GRID_KIT } from './call-stage';

beforeAll(async () => {
  await loadCallControlsCatalog('fr');
});

/**
 * LA GRILLE D'UN APPEL DE GROUPE (#3721, #8392, #8393) — une tuile par
 * participant et la sienne, chacune bordée de la couleur de la personne ;
 * toucher une tuile la met à la une ; un écran partagé y monte seul, ENTIER,
 * sous « Écran de X », avec Grille et plein écran ; un modérateur y trouve
 * « Retirer de l'appel ».
 */

const member = (userId: string, name: string, overrides: Partial<CallMember> = {}): CallMember => ({
  userId,
  name,
  avatar: null,
  micMuted: false,
  cameraOn: false,
  screenSharing: false,
  weakNetwork: false,
  capturing: false,
  link: 'connected',
  ...overrides,
});

/** Un vrai `MediaStream` du DOM : `srcObject` refuse tout autre objet. */
const domVideo = (): MediaStream => Object.defineProperty(new MediaStream(), 'getVideoTracks', { value: () => [{ readyState: 'live' }] });

const liveVideo = { getVideoTracks: () => [{ readyState: 'live' }], getTracks: () => [] } as unknown as MediaStream;

const props = (overrides: Partial<CallGridProps> = {}): CallGridProps => ({
  kit: CALL_GRID_KIT,
  members: [member('u-a', 'Awa'), member('u-b', 'Bintou')],
  remoteStreams: {},
  self: { stream: null, cameraOn: false, mirrored: true, micMuted: false },
  choice: null,
  onChoose: () => undefined,
  fullScreen: 'off',
  onFullScreen: () => undefined,
  moderation: null,
  language: 'fr',
  ...overrides,
});

const grid = (overrides: Partial<CallGridProps> = {}) => renderToStaticMarkup(<CallGrid {...props(overrides)} />);

const sharing = { members: [member('u-a', 'Awa'), member('u-k', 'Kofi', { screenSharing: true })], remoteStreams: { 'u-k': liveVideo } };

describe('CallGrid — ma tuile caméra coupée montre MON portrait, pas « Vous »', () => {
  test('mes initiales et mon avatar, le libellé « Vous » gardé', () => {
    const html = grid({ self: { stream: null, cameraOn: false, mirrored: true, micMuted: false, name: 'Kofi Mensah', avatar: null } });
    expect(html).toContain('KM');
    expect(html).not.toContain('>VO<');
    expect(html).toContain('Vous');
  });

  test('sans identité connue, « Vous » sert encore de portrait', () => {
    expect(grid()).toContain('Vous');
  });
});

describe('CallGrid', () => {
  test('sans mise en avant : une tuile par participant, la sienne comprise, chacune se met en avant', () => {
    const html = grid();
    expect(html).toContain('data-call-tile="u-a"');
    expect(html).toContain('data-call-tile="u-b"');
    expect(html).toContain('data-call-tile-self=""');
    expect(html).toContain('aria-label="Mettre Awa en avant"');
    expect(html).not.toContain('data-call-spotlight');
  });

  test('chaque vignette porte le liseré de la couleur de sa personne — celle de son nom dans les sous-titres', () => {
    const html = grid();
    expect(html).toContain(`border-color:${speakerColor('u-a')}`);
    expect(html).toContain(`border-color:${speakerColor('u-b')}`);
  });

  test('ma vignette porte MA couleur, celle de mes sous-titres (#16635)', () => {
    const html = grid({ self: { id: 'u-me', stream: null, cameraOn: false, mirrored: true, micMuted: false } });
    expect(html).toMatch(new RegExp(`border-color:${speakerColor('u-me')}[^>]*data-call-tile-self=""`));
  });

  test('l’étiquette de nom d’une vignette est la plaque partagée, sur le verre du kit (#17982, comme ma vignette du duo et l’appel réduit)', () => {
    expect(grid()).toMatch(/data-call-tile-plate=""[^>]*data-glass-tone="deep"[^>]*class="glass-tone[^"]*"[^>]*>Awa/);
  });

  test('à la une : le participant choisi occupe la scène, les autres passent en bandeau, Grille ramène', () => {
    const html = grid({ choice: { kind: 'member', userId: 'u-b' } });
    expect(html).toContain('data-call-spotlight="u-b"');
    expect(html).toContain('aria-label="Revenir à la grille"');
    expect(html).toContain('data-call-strip=""');
    expect(html).toContain('data-call-tile="u-a"');
    expect(html).not.toContain('data-call-shared-screen');
  });

  test('un membre partage : son ÉCRAN monte seul à la une, entier, sous « Écran de Kofi »', () => {
    const html = grid(sharing);
    expect(html).toContain('data-call-spotlight="u-k"');
    expect(html).toContain('data-call-shared-screen=""');
    expect(html).toContain('object-fit:contain');
    expect(html).toContain('Écran de Kofi');
    expect(html).toContain('data-call-screen-medallion=""');
    expect(html).toContain('aria-label="Plein écran"');
  });

  test('un choix manuel l’emporte sur la montée automatique', () => {
    const html = grid({ ...sharing, choice: { kind: 'member', userId: 'u-a' } });
    expect(html).toContain('data-call-spotlight="u-a"');
    expect(html).not.toContain('data-call-shared-screen');
  });

  test('plein écran (U2, #17961) : le bandeau des caméras RESTE, le bouton dit comment en sortir', () => {
    const html = grid({ ...sharing, fullScreen: 'full' });
    expect(html).toContain('data-call-strip=""');
    expect(html).toContain('aria-label="Quitter le plein écran"');
  });

  test('plein écran total (U2b, #17961) : le partage seul, aucun bandeau', () => {
    const html = grid({ ...sharing, fullScreen: 'total' });
    expect(html).not.toContain('data-call-strip');
    expect(html).toContain('aria-label="Quitter le plein écran total"');
  });

  test('une personne invitée sonne dans sa tuile, et sa tuile ne se met pas en avant', () => {
    const html = grid({ members: [member('u-a', 'Awa'), member('u-r', 'Rémi', { link: 'ringing' })] });
    expect(html).toContain('data-call-ringing=""');
    expect(html).toContain('Sonne…');
    expect(html).not.toContain('aria-label="Mettre Rémi en avant"');
  });
});

describe('CallGrid — toute tuile à la une, la mienne aussi (#9098)', () => {
  test('ma tuile montre mon micro coupé', () => {
    expect(grid({ self: { stream: null, cameraOn: false, mirrored: true, micMuted: true } })).toMatch(/data-call-tile-self=""[\s\S]*data-call-tile-muted=""/);
    expect(grid()).not.toContain('data-call-tile-muted');
  });

  test('ma tuile se met à la une, comme les autres', () => {
    expect(grid()).toContain('aria-label="Mettre mon image à la une"');
  });

  test('ma tuile à la une : mon image occupe la scène, tous les pairs en bandeau — aucune commande de ma caméra sur la grille (#17327)', () => {
    const html = grid({ choice: { kind: 'self' } });
    expect(html).toContain('data-call-spotlight="self"');
    expect(html).not.toContain('data-call-self-featured-controls');
    expect(html).toContain('data-call-strip=""');
    expect(html).toContain('data-call-tile="u-a"');
    expect(html).toContain('data-call-tile="u-b"');
    expect(html).toContain('aria-label="Revenir à la grille"');
  });

  test('le plein écran s’offre pour toute tuile à la une, pas seulement un écran partagé', () => {
    expect(grid({ choice: { kind: 'member', userId: 'u-b' } })).toContain('aria-label="Plein écran"');
    expect(grid({ choice: { kind: 'self' } })).toContain('aria-label="Plein écran"');
  });
});

describe('CallGrid — un partage d’écran en groupe laisse les caméras en rail (#9112)', () => {
  test('l’écran partagé occupe la scène, les caméras des autres et la mienne forment le rail, chacune se met à la une', () => {
    const html = grid({
      members: [member('u-a', 'Awa', { cameraOn: true }), member('u-b', 'Bintou', { cameraOn: true }), member('u-k', 'Kofi', { screenSharing: true })],
      remoteStreams: { 'u-a': liveVideo, 'u-b': liveVideo, 'u-k': liveVideo },
      self: { stream: liveVideo, cameraOn: true, mirrored: true, micMuted: false },
    });
    expect(html).toContain('data-call-shared-screen=""');
    const strip = html.slice(html.indexOf('data-call-strip'));
    expect(strip).toContain('data-call-tile="u-a"');
    expect(strip).toContain('data-call-tile="u-b"');
    expect(strip).toContain('data-call-tile-self=""');
    expect(strip).toContain('aria-label="Mettre Awa en avant"');
    expect(strip).toContain('aria-label="Mettre mon image à la une"');
  });
});

const columnsOf = (html: string) => Number(/grid-template-columns:repeat\((\d),/.exec(html)?.[1]);
const peers = (count: number) => Array.from({ length: count }, (_, index) => member(`u-${index}`, `Pair ${index}`));

describe('CallGrid — la grille suit l’orientation (P11.1, GroupCallGridLayout)', () => {
  test('portrait : deux tuiles s’empilent, trois et quatre font 2 × 2, cinq et six font 2 colonnes × 3 rangées', () => {
    expect([1, 2, 3, 4, 5].map((count) => columnsOf(grid({ members: peers(count) })))).toEqual([1, 2, 2, 2, 2]);
  });

  test('paysage sans hauteur compacte (W2.1, fenêtre de bureau) : quatre tuiles restent 2 × 2, cinq et six font 3 colonnes', () => {
    expect([1, 2, 3, 4, 5].map((count) => columnsOf(grid({ members: peers(count), landscape: true })))).toEqual([2, 2, 2, 3, 3]);
  });

  test('paysage de hauteur compacte (L4.1, téléphone couché) : trois personnes (quatre tuiles avec moi) tiennent sur une seule rangée', () => {
    expect([1, 2, 3, 4, 5].map((count) => columnsOf(grid({ members: peers(count), landscape: true, compact: true })))).toEqual([2, 2, 4, 3, 3]);
    expect(columnsOf(grid({ members: peers(3), landscape: false, compact: true }))).toBe(2);
  });

  test('la fenêtre qui franchit la hauteur compacte fait GLISSER chaque case de 2 × 2 à la rangée de quatre, jamais sauter (FACTURE, P14.10)', () => {
    const keys: string[] = [];
    const kit = { ...CALL_GRID_KIT, useStageFlip: (_root: unknown, key: string) => void keys.push(key) };
    [false, true].forEach((compact) => grid({ kit, members: peers(3), landscape: true, compact }));
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
  });

  test('sur grand écran la grille est bornée en largeur et centrée, marges égales (W2.1, planche W2)', () => {
    expect(grid({ members: peers(3) })).toMatch(/class="relative grid min-h-\[140px\][^"]*max-w-\[1064px\][^"]*mx-auto/);
  });

  test('la grille garde 140 de haut au moins, et chaque case se partage la hauteur à parts égales (P12.7)', () => {
    const html = grid();
    expect(html).toMatch(/class="relative grid min-h-\[140px\][^"]*"[^>]*grid-auto-rows:1fr/);
    expect(grid({ choice: { kind: 'self' } })).toMatch(/class="relative flex min-h-\[140px\][^"]*"[^>]*data-call-spotlight/);
  });
});

describe('CallGrid — l’avatar prend la couleur de SA personne, comme le liseré (P11.6)', () => {
  test('caméra coupée : l’avatar d’un pair vient de son identifiant, pas de son nom', () => {
    const html = grid({ members: [member('u-a', 'Awa')] });
    expect(html).toContain(`linear-gradient(135deg, ${speakerColor('u-a')}`);
    expect(grid({ members: [member('u-a', 'Un autre nom')] })).toContain(`linear-gradient(135deg, ${speakerColor('u-a')}`);
  });

  test('et le mien, de mon identifiant', () => {
    expect(grid({ self: { id: 'u-me', stream: null, cameraOn: false, mirrored: true, micMuted: false, name: 'Kofi Mensah' } })).toContain(`linear-gradient(135deg, ${speakerColor('u-me')}`);
  });
});

describe('CallGrid — le bandeau des autres (P14.1, P14.2, P14.9)', () => {
  const spotlight = (overrides: Partial<CallGridProps> = {}) => grid({ members: peers(3), choice: { kind: 'member', userId: 'u-0' }, ...overrides });
  const strip = (html: string) => html.slice(html.indexOf('<div class="', html.lastIndexOf('>', html.indexOf('data-call-strip'))), html.indexOf('data-call-strip') + 40);

  test('portrait : une rangée sous la une, des vignettes de 84 × 112, effacée en fondu à ses deux bords', () => {
    const html = strip(spotlight());
    expect(html).toContain('grid-auto-columns:84px');
    expect(html).toContain('grid-template-rows:112px');
    expect(html).toContain('mask-image:linear-gradient(to right, transparent, #000 8px, #000 calc(100% - 8px), transparent)');
    expect(spotlight()).toMatch(/class="relative flex min-h-\[140px\][^"]*flex-col/);
  });

  test('paysage : une colonne de 128 à droite de la une, effacée en fondu en haut et en bas', () => {
    const html = strip(spotlight({ landscape: true }));
    expect(html).toContain('width:128px');
    expect(html).toContain('grid-auto-rows:112px');
    expect(html).toContain('grid-template-columns:84px');
    expect(html).toContain('mask-image:linear-gradient(to bottom, transparent, #000 8px, #000 calc(100% - 8px), transparent)');
    expect(spotlight({ landscape: true })).toMatch(/class="relative flex min-h-\[140px\][^"]*flex-row/);
  });

  test('plein écran d’une caméra (un seul niveau, #17961) : le bandeau reste, en paysage comme en portrait', () => {
    expect(spotlight({ fullScreen: 'full', landscape: true })).toContain('data-call-strip=""');
    expect(spotlight({ fullScreen: 'full' })).toContain('data-call-strip=""');
  });
});

describe('CallGrid — une seule capsule de verre : « Revenir à la grille » puis « Plein écran », toujours là (P14.3)', () => {
  const capsule = (html: string) => html.slice(html.indexOf('data-call-spotlight-capsule'));

  test('un seul verre porte les deux boutons, « Revenir à la grille » d’abord', () => {
    const html = grid({ choice: { kind: 'self' } });
    expect(html.match(/data-call-spotlight-capsule/g)).toHaveLength(1);
    expect(html).toMatch(/class="glass-call flex[^"]*rounded-full[^"]*" data-call-spotlight-capsule/);
    const inside = capsule(html);
    expect(inside.indexOf('aria-label="Revenir à la grille"')).toBeGreaterThan(-1);
    expect(inside.indexOf('aria-label="Revenir à la grille"')).toBeLessThan(inside.indexOf('aria-label="Plein écran"'));
  });

  test('en plein écran, « Revenir à la grille » reste, et « Quitter le plein écran » prend la place de l’autre', () => {
    const inside = capsule(grid({ choice: { kind: 'self' }, fullScreen: 'full' }));
    expect(inside.indexOf('aria-label="Revenir à la grille"')).toBeLessThan(inside.indexOf('aria-label="Quitter le plein écran"'));
  });
});

describe('CallGrid — les gestes (#8392)', () => {
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

  const mount = (overrides: Partial<CallGridProps>) => {
    const chosen: SpotlightChoice[] = [];
    const levels: FullScreenLevel[] = [];
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const recorded = (next: Partial<CallGridProps>) => props({ ...next, onChoose: (choice) => chosen.push(choice), onFullScreen: (level) => levels.push(level) });
    act(() => root.render(<CallGrid {...recorded(overrides)} />));
    const press = (selector: string) => act(() => (host.querySelector(selector) as HTMLElement | null)?.click());
    const done = () => {
      act(() => root.unmount());
      host.remove();
    };
    const render = (next: Partial<CallGridProps>) => act(() => root.render(<CallGrid {...recorded(next)} />));
    return { chosen, levels, press, done, host, render };
  };

  test('chaque vidéo dit À QUI elle est — le membre, ou moi : la capture pose chaque visage dans SA case (#8743)', () => {
    const view = mount({ members: [member('u-a', 'Awa', { cameraOn: true })], remoteStreams: { 'u-a': domVideo() }, self: { stream: domVideo(), cameraOn: true, mirrored: true, micMuted: false } });
    expect(view.host.querySelector('video[data-call-member="u-a"]')).not.toBeNull();
    expect(view.host.querySelector('video[data-call-self]')).not.toBeNull();
    view.done();
    const shared = mount({ ...sharing, remoteStreams: { 'u-k': domVideo() } });
    expect(shared.host.querySelector('video[data-call-stream="contain"][data-call-member="u-k"]')).not.toBeNull();
    shared.done();
  });

  test('une vignette qui change d’arbre — de la grille au bandeau, à la une — garde SON <video> : déplacé, jamais recréé (P14.10)', () => {
    const cameras = { members: [member('u-a', 'Awa', { cameraOn: true }), member('u-b', 'Bintou', { cameraOn: true })], remoteStreams: { 'u-a': domVideo(), 'u-b': domVideo() } };
    const view = mount(cameras);
    const awa = view.host.querySelector('video[data-call-member="u-a"]');
    const bintou = view.host.querySelector('video[data-call-member="u-b"]');
    expect(awa).not.toBeNull();
    view.render({ ...cameras, choice: { kind: 'member', userId: 'u-b' } });
    expect(view.host.querySelector('[data-call-strip] video[data-call-member="u-a"]')).toBe(awa);
    expect(view.host.querySelector('[data-call-spotlight] video[data-call-member="u-b"]')).toBe(bintou);
    view.render({ ...cameras, choice: { kind: 'grid', dismissedSharer: null } });
    expect(view.host.querySelector('video[data-call-member="u-a"]')).toBe(awa);
    expect(view.host.querySelectorAll('video')).toHaveLength(2);
    view.done();
  });

  test('un pair qui part emporte son <video> : plus rien ne le retient', () => {
    const view = mount({ members: [member('u-a', 'Awa', { cameraOn: true })], remoteStreams: { 'u-a': domVideo() } });
    const awa = view.host.querySelector('video[data-call-member="u-a"]') as HTMLVideoElement;
    view.render({ members: [], remoteStreams: {} });
    expect(awa.isConnected).toBe(false);
    view.done();
  });

  test('commandes rangées, toucher une vignette décide à la DESCENTE du pointeur : le focus que le doigt lui donne (Chromium) rend les commandes avant le clic, et le clic ne la met pas à la une (#17548, P11.10, P14.6)', () => {
    const revealed: number[] = [];
    const reveal = () => void revealed.push(1);
    const view = mount({ chromeVisible: false, onRevealChrome: reveal });
    const touch = (selector: string) => act(() => void (view.host.querySelector(selector) as HTMLElement).dispatchEvent(new PointerEvent('pointerdown', { pointerId: 4, bubbles: true, button: 0 })));
    touch('[data-call-tile="u-b"]');
    view.render({ chromeVisible: true, onRevealChrome: reveal });
    view.press('[data-call-tile="u-b"]');
    expect(view.chosen).toEqual([]);
    expect(revealed).toHaveLength(1);
    view.press('[data-call-tile="u-b"]');
    expect(view.chosen).toEqual([{ kind: 'member', userId: 'u-b' }]);
    view.render({ chromeVisible: false, onRevealChrome: reveal, choice: { kind: 'member', userId: 'u-a' } });
    touch('[data-call-strip] [data-call-tile="u-b"]');
    view.render({ chromeVisible: true, onRevealChrome: reveal, choice: { kind: 'member', userId: 'u-a' } });
    view.press('[data-call-strip] [data-call-tile="u-b"]');
    expect(view.chosen).toHaveLength(1);
    expect(revealed).toHaveLength(2);
    view.done();
  });

  test('toucher une vignette la choisit', () => {
    const view = mount({});
    view.press('[data-call-tile="u-b"]');
    expect(view.chosen).toEqual([{ kind: 'member', userId: 'u-b' }]);
    view.done();
  });

  test('toucher ma tuile la choisit (#9098)', () => {
    const view = mount({});
    view.press('[data-call-tile-self]');
    expect(view.chosen).toEqual([{ kind: 'self' }]);
    view.done();
  });

  test('un écran partagé se zoome — Ctrl + molette, pincer — et un double toucher le rend entier (#9098)', () => {
    const domStream = Object.defineProperty(new MediaStream(), 'getVideoTracks', { value: () => [{ readyState: 'live' }] });
    const view = mount({ ...sharing, remoteStreams: { 'u-k': domStream } });
    const screen = () => document.querySelector('[data-call-shared-screen]') as HTMLElement;
    const zoom = () => Number(screen().getAttribute('data-call-screen-zoom'));
    expect(zoom()).toBe(1);
    /* happy-dom ne porte pas `ctrlKey` sur `WheelEvent` : il est posé à la main. */
    const wheel = Object.defineProperty(new WheelEvent('wheel', { deltaY: -200, bubbles: true, cancelable: true }), 'ctrlKey', { value: true });
    act(() => void screen().dispatchEvent(wheel));
    expect(zoom()).toBeGreaterThan(1);
    act(() => void screen().dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    expect(zoom()).toBe(1);
    const finger = (type: string, pointerId: number, x: number) => act(() => void screen().dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId, clientX: x, clientY: 100, pointerType: 'touch' })));
    finger('pointerdown', 1, 100);
    finger('pointerdown', 2, 200);
    finger('pointermove', 2, 300);
    finger('pointerup', 2, 300);
    finger('pointerup', 1, 100);
    expect(zoom()).toBe(2);
    view.done();
  });

  test('« Plein écran » monte d’un niveau à chaque appui, « Quitter » redescend, « Revenir à la grille » sort de tout (U2.2, #17961)', () => {
    const view = mount({ ...sharing, remoteStreams: { 'u-k': domVideo() } });
    view.press('button[aria-label="Plein écran"]');
    view.render({ ...sharing, remoteStreams: { 'u-k': domVideo() }, fullScreen: 'full' });
    view.press('button[aria-label="Plein écran total"]');
    view.render({ ...sharing, remoteStreams: { 'u-k': domVideo() }, fullScreen: 'total' });
    view.press('button[aria-label="Quitter le plein écran total"]');
    view.render({ ...sharing, remoteStreams: { 'u-k': domVideo() }, fullScreen: 'full' });
    view.press('button[aria-label="Quitter le plein écran"]');
    expect(view.levels).toEqual(['full', 'total', 'full', 'off']);
    view.render({ ...sharing, remoteStreams: { 'u-k': domVideo() }, fullScreen: 'total' });
    view.press('button[aria-label="Revenir à la grille"]');
    expect(view.levels.at(-1)).toBe('off');
    expect(view.chosen).toEqual([{ kind: 'grid', dismissedSharer: 'u-k' }]);
    view.done();
  });

  test('zoomé, l’écran partagé à la une se déplace au doigt, borné à son cadre, par un seul calque GPU (U2.7, #17754)', async () => {
    const view = mount({ ...sharing, remoteStreams: { 'u-k': domVideo() } });
    const screen = () => view.host.querySelector('[data-call-shared-screen]') as HTMLElement;
    const layer = () => view.host.querySelector('[data-call-screen-layer]') as HTMLElement;
    Object.defineProperty(screen(), 'getBoundingClientRect', { value: () => ({ left: 0, top: 0, right: 400, bottom: 200, width: 400, height: 200, x: 0, y: 0, toJSON: () => ({}) }) });
    const finger = (type: string, x: number, y: number) => act(() => void screen().dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, clientX: x, clientY: y, pointerType: 'touch', button: 0 })));
    const flush = () => act(async () => void (await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))));
    finger('pointerdown', 200, 100);
    finger('pointermove', 260, 100);
    await flush();
    finger('pointerup', 260, 100);
    expect(layer().style.transform).toBe('');
    act(() => void screen().dispatchEvent(Object.defineProperty(new WheelEvent('wheel', { deltaY: -69.3 * 3, bubbles: true, cancelable: true }), 'ctrlKey', { value: true })));
    finger('pointerdown', 200, 100);
    finger('pointermove', 260, 90);
    await flush();
    finger('pointerup', 260, 90);
    expect(layer().style.transform).toMatch(/translate3d\(60px, -10px, 0\) scale\(/);
    expect(screen().hasAttribute('data-call-owns-drag')).toBe(true);
    finger('pointerdown', 200, 100);
    finger('pointermove', 2000, 100);
    await flush();
    finger('pointerup', 2000, 100);
    expect(Number(/translate3d\((-?[\d.]+)px/.exec(layer().style.transform)?.[1])).toBeLessThanOrEqual(200);
    view.done();
  });

  test('une caméra qui se coupe cède à l’avatar EN FONDU, dans la grille aussi (loi 17.12) : l’avatar monte par-dessus l’image', () => {
    const cameras = (cameraOn: boolean) => ({ members: [member('u-a', 'Awa', { cameraOn })], remoteStreams: { 'u-a': domVideo() } });
    const view = mount(cameras(true));
    const veil = () => view.host.querySelector('[data-call-tile="u-a"] [data-call-camera-off]');
    expect(veil()?.classList.contains('invisible')).toBe(true);
    view.render(cameras(false));
    expect(veil()?.classList.contains('invisible')).toBe(false);
    expect(view.host.querySelector('[data-call-tile="u-a"] [data-call-camera-off]')?.textContent).toContain('AW');
    view.render(cameras(true));
    expect(view.host.querySelector('[data-call-tile="u-a"] video[data-call-member="u-a"]')).not.toBeNull();
    view.done();
  });

  test('« Grille » pendant un partage congédie CE partage', () => {
    const domStream = Object.defineProperty(new MediaStream(), 'getVideoTracks', { value: () => [{ readyState: 'live' }] });
    const view = mount({ ...sharing, remoteStreams: { 'u-k': domStream } });
    view.press('button[aria-label="Revenir à la grille"]');
    expect(view.chosen).toEqual([{ kind: 'grid', dismissedSharer: 'u-k' }]);
    view.done();
  });
});

describe('CallGrid — droite à gauche : capsule et plaque se posent au coin de FIN et de DÉBUT (U3.5, U3.2)', () => {
  test('la capsule de la une est ancrée au coin de fin, jamais à droite en dur', () => {
    const html = grid({ choice: { kind: 'self' } });
    expect(html).toMatch(/class="absolute end-2 top-2[^"]*"[^>]*data-call-spotlight-place=""/);
    expect(html).not.toContain('right-2 top-2');
  });

  test('la plaque de nom d’une vignette est ancrée au coin de début, jamais à gauche en dur', () => {
    const html = grid();
    expect(html).toMatch(/glass-tone absolute bottom-2 start-2/);
    expect(html).not.toContain('left-2');
  });
});

describe('CallGrid — la capsule et la puce se rangent au toucher, en plein écran aussi (U2.4, U2.5, U1.10 ; #17961 point 1)', () => {
  const place = (html: string) => /<div[^>]*data-call-spotlight-place=""[^>]*>/.exec(html)?.[0] ?? '';
  const chip = (html: string) => /<span[^>]*data-call-screen-banner=""[^>]*>/.exec(html)?.[0] ?? '';

  test('la capsule sort vers le HAUT avec l’en-tête (U1.10), jamais un fondu sur place', () => {
    expect(place(grid({ choice: { kind: 'self' } }))).toContain('data-call-stow="top"');
    expect(place(grid({ choice: { kind: 'self' } }))).not.toContain('data-call-chrome-fade');
  });

  test('commandes rangées : la capsule est rangée, et ne se lit plus', () => {
    const stowed = place(grid({ choice: { kind: 'self' }, chromeVisible: false }));
    expect(stowed).toContain('data-call-stowed=""');
    expect(stowed).toContain('aria-hidden="true"');
    expect(place(grid({ choice: { kind: 'self' } }))).not.toContain('data-call-stowed');
  });

  test('en plein écran, la capsule n’échappe plus au toucher : rangée avec les commandes, rendue avec elles (U2.4)', () => {
    expect(place(grid({ choice: { kind: 'self' }, fullScreen: 'full' }))).not.toContain('data-call-stowed');
    expect(place(grid({ choice: { kind: 'self' }, fullScreen: 'full', chromeVisible: false }))).toContain('data-call-stowed=""');
    expect(place(grid({ ...sharing, fullScreen: 'total', chromeVisible: false }))).toContain('data-call-stowed=""');
  });

  test('la puce « Écran de X · 2× » se range et revient avec la capsule, aux deux niveaux (U2.5)', () => {
    expect(chip(grid(sharing))).toContain('data-call-stow="top"');
    expect(chip(grid(sharing))).not.toContain('data-call-stowed');
    expect(chip(grid({ ...sharing, chromeVisible: false }))).toContain('data-call-stowed=""');
    expect(chip(grid({ ...sharing, fullScreen: 'full', chromeVisible: false }))).toContain('data-call-stowed=""');
    expect(chip(grid({ ...sharing, fullScreen: 'total', chromeVisible: false }))).toContain('data-call-stowed=""');
  });

  test('le bouton est un glyphe sur verre, comme « Plein écran » : jamais un disque blanc actif', () => {
    const full = () => grid({ choice: { kind: 'self' }, fullScreen: 'full' });
    const button = (html: string) => /<button[^>]*data-call-fullscreen="exit"[^>]*>/.exec(html)?.[0] ?? '';
    expect(button(full())).not.toContain('background:var(--color-on-media)');
    expect(button(full())).toContain('aria-pressed="true"');
    expect(button(full())).toContain('aria-label="Quitter le plein écran"');
  });
});

describe('CallGrid — deux niveaux de plein écran pour un écran partagé, un seul pour une caméra (U2.2, #17961)', () => {
  const labels = (html: string) => [...html.slice(html.indexOf('data-call-spotlight-capsule')).matchAll(/<button[^>]*aria-label="([^"]+)"/g)].map((match) => match[1]).slice(0, 3);

  test('à la une : « Revenir à la grille · Plein écran »', () => {
    expect(labels(grid(sharing)).slice(0, 2)).toEqual(['Revenir à la grille', 'Plein écran']);
  });

  test('U2 : « Revenir à la grille · Plein écran total · Quitter le plein écran »', () => {
    expect(labels(grid({ ...sharing, fullScreen: 'full' }))).toEqual(['Revenir à la grille', 'Plein écran total', 'Quitter le plein écran']);
  });

  test('U2b : « Revenir à la grille · Quitter le plein écran total »', () => {
    expect(labels(grid({ ...sharing, fullScreen: 'total' })).slice(0, 2)).toEqual(['Revenir à la grille', 'Quitter le plein écran total']);
  });

  test('une caméra en plein écran : « Revenir à la grille · Quitter le plein écran », jamais de plein écran total', () => {
    const html = grid({ choice: { kind: 'member', userId: 'u-b' }, fullScreen: 'full' });
    expect(html).not.toContain('Plein écran total');
    expect(labels(html).slice(0, 2)).toEqual(['Revenir à la grille', 'Quitter le plein écran']);
  });
});

describe('CallGrid — le lecteur d’écran annonce le partage qui prend la une (U2.1, #18180)', () => {
  const region = (html: string) => /<span[^>]*data-call-share-announce=""[^>]*>([^<]*)<\/span>/.exec(html);

  test('une zone vive TOUJOURS montée, vide sans partage', () => {
    const quiet = region(grid());
    expect(quiet?.[0]).toContain('role="status"');
    expect(quiet?.[1]).toBe('');
  });

  test('un partage commence : elle dit qui partage, et la puce ne le redit pas', () => {
    expect(region(grid(sharing))?.[1]).toBe('Kofi partage son écran');
    expect(/<span[^>]*data-call-screen-banner=""[^>]*>/.exec(grid(sharing))?.[0]).not.toContain('role="status"');
  });
});

describe('CallGrid — une seule couleur par personne (loi 18.2)', () => {
  test('le médaillon de qui partage porte SA couleur d’identifiant, celle de son liseré et de ses sous-titres', () => {
    const medallion = /data-call-screen-medallion=""[\s\S]*?<\/div>\s*<\/div>/.exec(grid(sharing))?.[0] ?? '';
    expect(medallion).toContain(`linear-gradient(135deg, ${speakerColor('u-k')}`);
  });
});
