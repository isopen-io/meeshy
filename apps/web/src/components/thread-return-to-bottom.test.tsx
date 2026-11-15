import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, jest, test } from 'bun:test';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import type { ListPaginationState } from '@/lib/lens/pagination';
import { THREAD_LOAD_SIGNAL_DELAY_MS } from '@/lib/view/thread-load-signal';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ThreadReturnToBottom } from './thread-return-to-bottom';

/**
 * #9302 — LE BOUTON « REVENIR EN BAS » PULSE PENDANT QUE LE FIL CHARGE, au
 * même endroit qu'iOS (`ConversationScrollControlsView`, `isSearchingQuotedMessage` :
 * capsule « Recherche… », trois points pulsés, insensible au toucher) — et il
 * paraît même au bas du fil, comme `showsScrollToBottomButton` iOS qui l'y
 * garde pendant la recherche. Rien ne pulse avant que l'attente dure.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  jest.useRealTimers();
});

type Props = {
  readonly visible?: boolean;
  readonly windowLoading?: boolean;
  readonly newerState?: ListPaginationState;
};

function mount(initial: Props) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const created = createRoot(host);
  container = host;
  root = created;
  let clicks = 0;
  const render = (props: Props) =>
    act(() =>
      created.render(
        <ThreadReturnToBottom
          chrome={{
            scrollButtonVisible: props.visible ?? false,
            scrollButtonUnreadCount: 0,
            scrollButtonSenderName: null,
            scrollButtonPreviewText: null,
            onScrollToBottom: () => {
              clicks += 1;
            },
          }}
          windowLoading={props.windowLoading ?? false}
          newerState={props.newerState ?? 'exhausted'}
        />,
      ),
    );
  render(initial);
  return {
    render,
    button: () => host.querySelector('button'),
    status: () => host.querySelector('[role="status"]')?.textContent ?? null,
    clicks: () => clicks,
  };
}

describe('ThreadReturnToBottom (#9302)', () => {
  test('au repos : le bouton ordinaire, sans signal ni annonce', () => {
    const view = mount({ visible: true });
    expect(view.button()?.getAttribute('aria-label')).toBe('Défiler vers le bas');
    expect(view.button()?.getAttribute('aria-busy')).toBeNull();
    expect(view.button()?.hasAttribute('data-thread-loading')).toBe(false);
    expect(view.status()).toBe('');
  });

  test('la fenêtre ?around= qui DURE : le bouton paraît même au bas du fil, « Recherche… », occupé et insensible', () => {
    jest.useFakeTimers();
    const view = mount({ visible: false, windowLoading: true });
    expect(view.button()).toBeNull();
    act(() => jest.advanceTimersByTime(THREAD_LOAD_SIGNAL_DELAY_MS));
    const button = view.button();
    expect(button?.getAttribute('data-thread-loading')).toBe('seeking');
    expect(button?.getAttribute('aria-busy')).toBe('true');
    expect(button?.getAttribute('aria-disabled')).toBe('true');
    expect(button?.getAttribute('aria-label')).toBe('Recherche…');
    expect(view.status()).toBe('Recherche…');
    act(() => button?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(view.clicks()).toBe(0);
  });

  test('la page plus récente qui DURE : « Chargement… », et le retour au présent reste permis', () => {
    jest.useFakeTimers();
    const view = mount({ visible: true, newerState: 'loading-more' });
    act(() => jest.advanceTimersByTime(THREAD_LOAD_SIGNAL_DELAY_MS));
    const button = view.button();
    expect(button?.getAttribute('data-thread-loading')).toBe('newer');
    expect(button?.getAttribute('aria-busy')).toBe('true');
    expect(button?.getAttribute('aria-disabled')).toBeNull();
    expect(view.status()).toBe('Chargement…');
    act(() => button?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(view.clicks()).toBe(1);
  });

  test('un chargement plus court que le seuil ne fait rien paraître', () => {
    jest.useFakeTimers();
    const view = mount({ visible: false, windowLoading: true });
    act(() => jest.advanceTimersByTime(THREAD_LOAD_SIGNAL_DELAY_MS - 1));
    view.render({ visible: false, windowLoading: false });
    act(() => jest.advanceTimersByTime(THREAD_LOAD_SIGNAL_DELAY_MS));
    expect(view.button()).toBeNull();
    expect(view.status()).toBe('');
  });

  test('la fenêtre servie : le bouton revient à son état ordinaire dans le même rendu', () => {
    jest.useFakeTimers();
    const view = mount({ visible: true, windowLoading: true });
    act(() => jest.advanceTimersByTime(THREAD_LOAD_SIGNAL_DELAY_MS));
    view.render({ visible: true, windowLoading: false });
    expect(view.button()?.hasAttribute('data-thread-loading')).toBe(false);
    expect(view.button()?.getAttribute('aria-label')).toBe('Défiler vers le bas');
    expect(view.status()).toBe('');
  });
});
