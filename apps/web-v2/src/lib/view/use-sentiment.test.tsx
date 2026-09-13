import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { SENTIMENT_DEBOUNCE_MS, useSentiment } from './use-sentiment';
import type { SentimentLevel } from '@/lib/send/sentiment';

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

function mount(initial: string) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  let captured!: SentimentLevel;

  function Harness({ text }: { readonly text: string }) {
    captured = useSentiment(text);
    return null;
  }

  act(() => {
    root.render(<Harness text={initial} />);
  });

  return {
    rerender: (text: string) => act(() => root.render(<Harness text={text} />)),
    level: () => captured,
  };
}

describe('useSentiment — indicateur passif débounce 300 ms', () => {
  test('texte vide au montage ⇒ neutral', () => {
    expect(mount('').level()).toBe('neutral');
  });

  test('avant le débounce, aucun changement', () => {
    const { rerender, level } = mount('');
    rerender('love');
    expect(level()).toBe('neutral');
  });

  test('après le débounce, la tonalité se met à jour', async () => {
    const { rerender, level } = mount('');
    rerender('love');
    await act(async () => new Promise((r) => setTimeout(r, SENTIMENT_DEBOUNCE_MS + 30)));
    expect(level()).toBe('veryPositive');
  });

  test('un texte revidé retombe IMMÉDIATEMENT à neutral, sans attendre le débounce', async () => {
    const { rerender, level } = mount('');
    rerender('love');
    await act(async () => new Promise((r) => setTimeout(r, SENTIMENT_DEBOUNCE_MS + 30)));
    expect(level()).toBe('veryPositive');
    rerender('');
    expect(level()).toBe('neutral');
  });
});
