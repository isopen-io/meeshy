import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { createRouter, navigate } from '@/lib/router';
import { floatingMenusHost } from '@/lib/view/floating-gate';
import { SPLIT_QUERY } from '@/lib/view/split-query';
import { floatingMenusReady } from '@/test-support/floating-menus-ready';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { DeferredSplitFrame } from './route-table';

/**
 * SUR ORDINATEUR, LES DISQUES FLOTTANTS RESTENT QUAND UNE CONVERSATION EST
 * OUVERTE (#10117, retour porteur du 2026-10-11). Au téléphone, le fil prend
 * tout l'écran et les disques le quittent : posés sur une conversation, ils
 * couvriraient des bulles (`floating-gate.ts`). Dans le cadre côte à côte, la
 * liste reste à gauche : les disques vivent dans SA colonne, sur `/chats` comme
 * sur `/c/:id` — jamais sur le volet du fil, donc jamais sur son en-tête ni sur
 * son composeur.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

type Listener = (event: { matches: boolean }) => void;
const media = { wide: true, listeners: new Set<Listener>() };
let originalMatchMedia: typeof window.matchMedia;

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  originalMatchMedia = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    get matches() {
      return query === SPLIT_QUERY ? media.wide : false;
    },
    media: query,
    addEventListener: (_: string, listener: Listener) => media.listeners.add(listener),
    removeEventListener: (_: string, listener: Listener) => media.listeners.delete(listener),
  })) as unknown as typeof window.matchMedia;
  await floatingMenusReady();
});

afterAll(async () => {
  window.matchMedia = originalMatchMedia;
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
  media.wide = true;
  media.listeners.clear();
  navigate('/', true);
});

const TABLE = {
  list: { pattern: '/chats', screen: () => Promise.resolve({ default: () => <ul data-list-stub /> }) },
  thread: { pattern: '/c/$conversation', screen: () => Promise.resolve({ default: () => <main data-thread-stub /> }) },
} as const;

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function mountAt(path: string): Promise<HTMLDivElement> {
  navigate(path, true);
  const { Router } = createRouter(TABLE, () => null, { frame: DeferredSplitFrame });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(<Router wrap={(screen) => screen} skeleton={<div data-route-pending />} />));
  await settle();
  return container;
}

describe('où se posent les disques flottants', () => {
  test('dans le cadre côte à côte, sur la colonne de la liste — pour la liste ET pour le fil', () => {
    expect(floatingMenusHost({ routeKey: 'list', wide: true, guest: false })).toBe('list-column');
    expect(floatingMenusHost({ routeKey: 'thread', wide: true, guest: false })).toBe('list-column');
  });

  test('au téléphone, rien ne change : sur l’écran pour la liste, nulle part sur le fil', () => {
    expect(floatingMenusHost({ routeKey: 'list', wide: false, guest: false })).toBe('screen');
    expect(floatingMenusHost({ routeKey: 'thread', wide: false, guest: false })).toBeNull();
    expect(floatingMenusHost({ routeKey: 'feed', wide: true, guest: false })).toBe('screen');
  });

  test('l’invité en focus n’en reçoit aucun, même sur ordinateur', () => {
    expect(floatingMenusHost({ routeKey: 'thread', wide: true, guest: true })).toBeNull();
  });
});

describe('sur ordinateur, une conversation ouverte garde les disques', () => {
  test('/c/:id : les deux disques vivent dans la colonne de la liste, jamais sur le volet du fil', async () => {
    const el = await mountAt('/c/abc');
    expect(el.querySelector('[data-split-list] [data-floating-feed]')).not.toBeNull();
    expect(el.querySelector('[data-split-list] [data-floating-menu]')).not.toBeNull();
    expect(el.querySelector('[data-split-detail] .floating-menus')).toBeNull();
  });

  test('/chats : la même colonne, la même place — ouvrir une conversation ne les déplace pas', async () => {
    const el = await mountAt('/chats');
    expect(el.querySelector('[data-split-list] [data-floating-menu]')).not.toBeNull();
    expect(el.querySelectorAll('.floating-menus')).toHaveLength(1);
  });

  test('la couche se borne à la colonne au lieu de couvrir la fenêtre', async () => {
    const el = await mountAt('/c/abc');
    const layer = el.querySelector<HTMLElement>('[data-split-list] .floating-menus');
    expect(layer?.classList.contains('absolute')).toBe(true);
    expect(layer?.classList.contains('fixed')).toBe(false);
  });

  test('sous 1024 px, le cadre ne pose aucun disque : le fil reste plein écran', async () => {
    media.wide = false;
    const el = await mountAt('/c/abc');
    expect(el.querySelector('.floating-menus')).toBeNull();
  });
});
