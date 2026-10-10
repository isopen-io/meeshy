import { QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { appQueryClient } from '@/lib/api/query-client';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { COMMENTS_ZONE_SHARE } from '@/lib/view/comments-zone';
import type { WritingBar } from '@/lib/view/use-comments-sheet-host';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { PublicationCommentsSheet } from './publication-comments-sheet';

/**
 * #9894 (jumelle web de #9893) — **SUR UNE STORY, LA ZONE DE COMMENTAIRES
 * MONTE AVEC LE COMPOSEUR, PLUS ENCORE AVEC LE CLAVIER**, et le chevron (v)
 * la fait redescendre en repliant le composeur en bulle. Le lecteur des Réels,
 * qui monte la même feuille sans `risesWithComposer`, garde sa loi (#8643).
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

type FakeViewport = EventTarget & { height: number; offsetTop: number; width: number };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
  realViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let realViewport: PropertyDescriptor | undefined;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
  appQueryClient.clear();
  if (realViewport === undefined) Reflect.deleteProperty(window, 'visualViewport');
  else Object.defineProperty(window, 'visualViewport', realViewport);
});

function fakeViewport(): FakeViewport {
  const viewport = Object.assign(new EventTarget(), { height: window.innerHeight, offsetTop: 0, width: window.innerWidth });
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
  return viewport;
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}

async function mount(props: { readonly rises: boolean; readonly bars?: (WritingBar | null)[] }): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <QueryClientProvider client={appQueryClient}>
        <PublicationCommentsSheet
          postId="post-text-rank2"
          onClose={() => undefined}
          {...(props.rises ? { risesWithComposer: true } : {})}
          onWritingBar={(bar) => props.bars?.push(bar)}
        />
      </QueryClientProvider>,
    );
  });
  await settle();
  return container;
}

const sheetOf = (host: HTMLElement) => {
  const el = host.querySelector<HTMLElement>('[data-story-comments-sheet]');
  if (el === null) throw new Error('feuille absente');
  return el;
};
const list = (host: HTMLElement) => host.querySelector<HTMLElement>('[data-comment-thread-list]');
const field = (host: HTMLElement) => host.querySelector<HTMLTextAreaElement>('[data-comment-field]');
const click = async (host: HTMLElement, selector: string) => {
  await act(async () => host.querySelector<HTMLButtonElement>(selector)?.click());
  await settle();
};

describe('PublicationCommentsSheet — la zone de commentaires d’une story monte avec le composeur (#9894)', () => {
  test('composeur visible : la zone est HAUTE ; replié en bulle (⌄) : elle redescend ; la bulle la fait remonter', async () => {
    const host = await mount({ rises: true });
    expect(sheetOf(host).getAttribute('data-comments-zone')).toBe('open');
    expect(sheetOf(host).style.height).toBe(`${COMMENTS_ZONE_SHARE.open * 100}%`);
    await click(host, '[data-comment-fold]');
    expect(sheetOf(host).getAttribute('data-comments-zone')).toBe('folded');
    expect(sheetOf(host).style.height).toBe(`${COMMENTS_ZONE_SHARE.folded * 100}%`);
    expect(list(host)?.hidden).toBe(false);
    await click(host, '[data-comment-unfold]');
    expect(sheetOf(host).getAttribute('data-comments-zone')).toBe('open');
    expect(document.activeElement).not.toBe(field(host));
  });

  test('écrire au clavier physique (aucun clavier virtuel) : la liste RESTE, la zone reste haute, la scène n’est pas réduite', async () => {
    const bars: (WritingBar | null)[] = [];
    const host = await mount({ rises: true, bars });
    await act(async () => field(host)?.focus());
    await settle();
    expect(list(host)?.hidden).toBe(false);
    expect(sheetOf(host).getAttribute('data-comments-zone')).toBe('open');
    expect(bars.every((bar) => bar === null)).toBe(true);
  });

  test('clavier virtuel ouvert (Safari) : la zone occupe tout l’espace libre AU-DESSUS du clavier, la liste visible', async () => {
    const viewport = fakeViewport();
    const host = await mount({ rises: true });
    await act(async () => field(host)?.focus());
    await act(async () => {
      viewport.height = window.innerHeight - 300;
      viewport.dispatchEvent(new Event('resize'));
    });
    await settle();
    expect(sheetOf(host).getAttribute('data-comments-zone')).toBe('typing');
    expect(sheetOf(host).style.bottom).toBe('300px');
    expect(sheetOf(host).style.height).toContain('calc(100% - 300px');
    expect(list(host)?.hidden).toBe(false);
  });

  test('le ⌄ ferme le clavier : la zone redescend quand le clavier part, et se pose en bulle', async () => {
    const viewport = fakeViewport();
    const host = await mount({ rises: true });
    await act(async () => field(host)?.focus());
    await act(async () => {
      viewport.height = window.innerHeight - 300;
      viewport.dispatchEvent(new Event('resize'));
    });
    await click(host, '[data-comment-fold]');
    expect(document.activeElement).not.toBe(field(host));
    await act(async () => {
      viewport.height = window.innerHeight;
      viewport.dispatchEvent(new Event('resize'));
    });
    await settle();
    expect(sheetOf(host).getAttribute('data-comments-zone')).toBe('folded');
    expect(sheetOf(host).style.bottom).toBe('0px');
  });

  test('coque Android : la WebView rétrécit sous le clavier — la zone remplit le cadre réduit', async () => {
    const viewport = fakeViewport();
    const host = await mount({ rises: true });
    await act(async () => field(host)?.focus());
    const height = window.innerHeight;
    const realInner = Object.getOwnPropertyDescriptor(window, 'innerHeight');
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: height - 300 });
    try {
      await act(async () => {
        viewport.height = height - 300;
        viewport.dispatchEvent(new Event('resize'));
      });
      await settle();
      expect(sheetOf(host).getAttribute('data-comments-zone')).toBe('typing');
      expect(sheetOf(host).style.bottom).toBe('0px');
    } finally {
      if (realInner === undefined) Reflect.deleteProperty(window, 'innerHeight');
      else Object.defineProperty(window, 'innerHeight', realInner);
    }
  });
});

describe('PublicationCommentsSheet — le lecteur des Réels garde sa loi (#8643)', () => {
  test('sans `risesWithComposer`, écrire retire la liste au profit de la scène réduite', async () => {
    const host = await mount({ rises: false });
    await act(async () => field(host)?.focus());
    await settle();
    expect(list(host)?.hidden).toBe(true);
    expect(sheetOf(host).hasAttribute('data-comments-zone')).toBe(false);
  });
});
