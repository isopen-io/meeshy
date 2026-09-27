import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { SpotlightChoice } from '@/lib/calls/call-spotlight';
import { speakerColor } from '@/lib/calls/call-speaker-color';
import type { CallMember } from '@/lib/calls/call-store';

import { CallGrid, type CallGridProps } from './call-grid';

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

const liveVideo = { getVideoTracks: () => [{ readyState: 'live' }], getTracks: () => [] } as unknown as MediaStream;

const props = (overrides: Partial<CallGridProps> = {}): CallGridProps => ({
  members: [member('u-a', 'Awa'), member('u-b', 'Bintou')],
  remoteStreams: {},
  self: { stream: null, cameraOn: false, mirrored: true },
  choice: null,
  onChoose: () => undefined,
  immersive: false,
  onToggleImmersive: () => undefined,
  removal: null,
  language: 'fr',
  ...overrides,
});

const grid = (overrides: Partial<CallGridProps> = {}) => renderToStaticMarkup(<CallGrid {...props(overrides)} />);

const sharing = { members: [member('u-a', 'Awa'), member('u-k', 'Kofi', { screenSharing: true })], remoteStreams: { 'u-k': liveVideo } };

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

  test('l’étiquette de nom d’une vignette est un verre d’appel', () => {
    expect(grid()).toMatch(/class="glass-call[^"]*"[^>]*>Awa/);
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

  test('plein écran : le bandeau s’efface, le bouton dit comment en sortir', () => {
    const html = grid({ ...sharing, immersive: true });
    expect(html).not.toContain('data-call-strip');
    expect(html).toContain('aria-label="Quitter le plein écran"');
  });

  test('un modérateur trouve « Retirer » sur le participant en avant, pas un membre ordinaire', () => {
    const removal = { canRemove: (userId: string) => userId === 'u-b', remove: () => undefined, failed: false };
    expect(grid({ choice: { kind: 'member', userId: 'u-b' }, removal })).toContain('Retirer Bintou de l’appel');
    expect(grid({ choice: { kind: 'member', userId: 'u-a' }, removal })).not.toContain('Retirer');
    expect(grid({ choice: { kind: 'member', userId: 'u-b' } })).not.toContain('Retirer');
  });

  test('un retrait refusé le dit', () => {
    const removal = { canRemove: () => true, remove: () => undefined, failed: true };
    expect(grid({ choice: { kind: 'member', userId: 'u-b' }, removal })).toContain('Impossible de retirer ce participant');
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
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<CallGrid {...props({ ...overrides, onChoose: (choice) => chosen.push(choice) })} />));
    const press = (selector: string) => act(() => (host.querySelector(selector) as HTMLElement | null)?.click());
    const done = () => {
      act(() => root.unmount());
      host.remove();
    };
    return { chosen, press, done };
  };

  test('toucher une vignette la choisit', () => {
    const view = mount({});
    view.press('[data-call-tile="u-b"]');
    expect(view.chosen).toEqual([{ kind: 'member', userId: 'u-b' }]);
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
