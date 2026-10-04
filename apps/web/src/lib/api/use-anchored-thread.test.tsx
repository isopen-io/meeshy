import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ARCHIVE_CONVERSATION_ID, ARCHIVE_MESSAGES, ARCHIVE_STARRED_ID } from './fixtures-archive';
import { useThreadData } from './query';

/**
 * #7420 — LE FIL S'OUVRE SUR UN MESSAGE PLUS ANCIEN QUE SES PAGES, PUIS
 * REDESCEND JUSQU'AU PRÉSENT SANS TROU NI DOUBLON. Joué sur le corpus des
 * archives (160 messages, `arch-12` en favori) : la fenêtre `?around=` arrive
 * en UNE requête, s'étend vers le présent page à page, et rejoint le présent
 * en un fil continu.
 */
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

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

type Thread = ReturnType<typeof useThreadData>;

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

async function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let captured!: Thread;
  function Probe() {
    captured = useThreadData(ARCHIVE_CONVERSATION_ID);
    return null;
  }
  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <Probe />
      </QueryClientProvider>,
    );
  });
  await settle();
  return () => captured;
}

const idsOf = (thread: Thread): readonly string[] => thread.messages.map((m) => m.id);
const corpusIds = ARCHIVE_MESSAGES.map((m) => m.id);

describe('useThreadData — la fenêtre ancrée (#7420)', () => {
  test('le présent d’abord : les 50 derniers, le favori n’y est pas', async () => {
    const thread = await mount();
    expect(thread().status).toBe('success');
    expect(idsOf(thread())).toEqual(corpusIds.slice(-50));
    expect(idsOf(thread())).not.toContain(ARCHIVE_STARRED_ID);
    expect(thread().detached).toBe(false);
  });

  test('ancrer sur le favori sert la fenêtre autour de lui, DÉTACHÉE du présent', async () => {
    const thread = await mount();
    act(() => thread().around.seek(ARCHIVE_STARRED_ID));
    await settle();
    expect(thread().around).toMatchObject({ target: ARCHIVE_STARRED_ID, settled: true });
    expect(idsOf(thread())).toEqual(corpusIds.slice(0, 38));
    expect(thread().detached).toBe(true);
    expect(thread().newerState).toBe('idle');
    expect(thread().olderState).toBe('exhausted');
    expect(thread().hasOlder).toBe(false);
  });

  test('redescendre vers le présent rejoint le fil entier : aucun trou, aucun doublon', async () => {
    const thread = await mount();
    act(() => thread().around.seek(ARCHIVE_STARRED_ID));
    await settle();
    for (let page = 0; page < 5 && thread().detached; page += 1) {
      act(() => thread().fetchNewer());
      await settle();
    }
    expect(thread().detached).toBe(false);
    expect(thread().newerState).toBe('exhausted');
    expect(idsOf(thread())).toEqual(corpusIds);
  });

  test('revenir au présent rend le présent tel qu’il était, sans rien recharger', async () => {
    const thread = await mount();
    const present = thread().messages;
    act(() => thread().around.seek(ARCHIVE_STARRED_ID));
    await settle();
    act(() => thread().returnToPresent());
    expect(thread().messages).toBe(present);
    expect(thread().around.target).toBeNull();
  });

  test('un message que la fenêtre ne porte pas : la demande ABOUTIT quand même, le présent reste servi', async () => {
    const thread = await mount();
    act(() => thread().around.seek('arch-fantome'));
    await settle();
    expect(thread().around.settled).toBe(true);
    expect(idsOf(thread())).not.toContain('arch-fantome');
    expect(thread().detached).toBe(false);
  });
});
