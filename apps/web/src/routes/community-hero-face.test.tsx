import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { CommunitySummary } from '@/lib/api/communities';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CommunityHero } from './communities-parts';

/**
 * **LE VISAGE CARRÉ D'UNE COMMUNAUTÉ, UN SEUL** (#12571) — l'en-tête d'une
 * communauté monte son avatar carré hors du composant `Avatar`, mais avec la
 * MÊME mécanique : la photo chargée masque ses initiales, une photo en échec
 * les laisse, et une adresse neuve repart d'une `<img>` neuve. Des événements
 * réels (`load`, `error`, changement d'adresse) : le rendu statique de
 * `communities.test.tsx` ne les rejoue pas.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  await loadInterfaceCatalog('fr');
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
});

const community = (avatar: string | null): CommunitySummary => ({
  id: 'm-polyglottes',
  identifier: 'mshy_polyglottes',
  name: 'Les polyglottes',
  description: null,
  avatar,
  banner: null,
  isPrivate: false,
  createdBy: 'u1',
  memberCount: 3,
  conversationCount: 1,
});

const mount = (avatar: string | null) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const draw = (next: string | null) => act(() => root.render(<CommunityHero language="fr" community={community(next)} />));
  draw(avatar);
  cleanup = () => {
    act(() => root.unmount());
    host.remove();
  };
  return { host, draw };
};

const face = (host: HTMLElement) => host.querySelector<HTMLImageElement>('[data-community-hero] img');
const fire = (target: Element | null, type: 'load' | 'error') => act(() => void target?.dispatchEvent(new Event(type)));

describe('l’avatar carré d’une communauté remplace ses initiales (#12571)', () => {
  test('la photo chargée porte `data-loaded` : la règle de frère d’`avatar.css` masque alors les initiales', () => {
    const { host } = mount('2026/09/6aa607/harbor_41.png');
    expect(face(host)?.hasAttribute('data-loaded')).toBe(false);
    fire(face(host), 'load');
    expect(face(host)?.hasAttribute('data-loaded')).toBe(true);
    expect(face(host)?.nextElementSibling?.hasAttribute('data-avatar-initials')).toBe(true);
  });

  test('une photo en échec s’efface et laisse les initiales', () => {
    const { host } = mount('2026/09/6aa607/harbor_41.png');
    fire(face(host), 'error');
    expect(face(host)?.style.display).toBe('none');
    expect(host.querySelector('[data-avatar-initials]')?.textContent).toBe('LP');
  });

  test('après un échec, une NOUVELLE photo s’affiche : le `display:none` d’un échec ne survit pas au changement d’adresse', () => {
    const { host, draw } = mount('2026/09/6aa607/harbor_41.png');
    fire(face(host), 'error');
    draw('2026/09/6aa607/harbor_42.png');
    expect(face(host)?.getAttribute('src')).toContain('harbor_42.png');
    expect(face(host)?.style.display).not.toBe('none');
    expect(face(host)?.hasAttribute('data-loaded')).toBe(false);
  });
});
