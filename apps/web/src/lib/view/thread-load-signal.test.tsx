import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, jest, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { THREAD_LOAD_SIGNAL_DELAY_MS, threadLoadSignalOf, useDelayedSignal, type ThreadLoadSignal } from './thread-load-signal';

/**
 * #9302 — LE FIL DIT QU'IL CHARGE quand il saute vers un message ancien
 * (`?around=`) ou rejoint le présent (la page plus récente) : miroir de
 * `isSearchingQuotedMessage` iOS, qui fait pulser le bouton « revenir en bas »
 * (`ConversationScrollControlsView.quotedMessageSearchContent`). Cache-First :
 * rien ne se signale tant que le chargement ne DURE pas — une fenêtre servie
 * par le cache ne fait jamais clignoter le bouton.
 */
describe('threadLoadSignalOf (#9302)', () => {
  test('la fenêtre ?around= en vol prime : « seeking »', () => {
    expect(threadLoadSignalOf({ windowLoading: true, newerState: 'idle' })).toBe('seeking');
    expect(threadLoadSignalOf({ windowLoading: true, newerState: 'loading-more' })).toBe('seeking');
  });

  test('la page plus récente en vol : « newer »', () => {
    expect(threadLoadSignalOf({ windowLoading: false, newerState: 'loading-more' })).toBe('newer');
  });

  test('rien en vol, un refus ou le présent atteint : aucun signal', () => {
    for (const newerState of ['idle', 'error', 'exhausted'] as const) {
      expect(threadLoadSignalOf({ windowLoading: false, newerState })).toBeNull();
    }
  });
});

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

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  jest.useRealTimers();
});

function mount(initial: ThreadLoadSignal | null) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const created = createRoot(host);
  container = host;
  root = created;
  let shown: ThreadLoadSignal | null = null;
  function Probe({ signal }: { readonly signal: ThreadLoadSignal | null }) {
    shown = useDelayedSignal(signal, THREAD_LOAD_SIGNAL_DELAY_MS);
    return null;
  }
  const render = (signal: ThreadLoadSignal | null) => act(() => created.render(<Probe signal={signal} />));
  render(initial);
  return { render, shown: () => shown };
}

describe('useDelayedSignal (#9302) — le signal ne paraît que si le chargement DURE', () => {
  test('un chargement plus court que le seuil ne montre rien : aucun clignotement', () => {
    jest.useFakeTimers();
    const view = mount('seeking');
    expect(view.shown()).toBeNull();
    act(() => jest.advanceTimersByTime(THREAD_LOAD_SIGNAL_DELAY_MS - 1));
    view.render(null);
    act(() => jest.advanceTimersByTime(THREAD_LOAD_SIGNAL_DELAY_MS * 4));
    expect(view.shown()).toBeNull();
  });

  test('un chargement qui dure paraît au seuil, et s’éteint DANS le rendu où il aboutit', () => {
    jest.useFakeTimers();
    const view = mount('seeking');
    act(() => jest.advanceTimersByTime(THREAD_LOAD_SIGNAL_DELAY_MS));
    expect(view.shown()).toBe('seeking');
    view.render(null);
    expect(view.shown()).toBeNull();
  });

  test('un chargement qui enchaîne sur un autre garde le signal, à sa nouvelle nature', () => {
    jest.useFakeTimers();
    const view = mount('seeking');
    act(() => jest.advanceTimersByTime(THREAD_LOAD_SIGNAL_DELAY_MS));
    view.render('newer');
    expect(view.shown()).toBe('newer');
  });

  test('un nouveau chargement après un repos rejoue le seuil', () => {
    jest.useFakeTimers();
    const view = mount('newer');
    act(() => jest.advanceTimersByTime(THREAD_LOAD_SIGNAL_DELAY_MS));
    view.render(null);
    view.render('newer');
    expect(view.shown()).toBeNull();
    act(() => jest.advanceTimersByTime(THREAD_LOAD_SIGNAL_DELAY_MS));
    expect(view.shown()).toBe('newer');
  });
});
