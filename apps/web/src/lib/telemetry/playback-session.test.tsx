import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import type { SocialEventV2Input } from '@/lib/api/social-events-v2-types';
import { readingTelemetry } from '@/lib/view/reading-telemetry';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { usePlaybackTelemetry } from './playback-session';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
let v2: SocialEventV2Input[] = [];
const original = readingTelemetry.recordV2;
let container: HTMLDivElement;
let root: Root | null = null;

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
beforeEach(() => {
  v2 = [];
  readingTelemetry.recordV2 = (event) => void v2.push(event);
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  root = null;
  container.remove();
  readingTelemetry.recordV2 = original;
});

function Probe(props: { readonly element: HTMLMediaElement; readonly active: boolean }) {
  usePlaybackTelemetry({ element: props.element, active: props.active, target: { kind: 'reel', id: 'r1' }, mediaId: 'm1', surface: 'reels' });
  return null;
}

describe('usePlaybackTelemetry — un résumé par séance', () => {
  test('aucun envoi pendant la lecture ; le glissement clôt la séance en `swiped`', () => {
    const video = document.createElement('video');
    root = createRoot(container);
    act(() => root?.render(<Probe element={video} active />));
    video.dispatchEvent(new Event('playing'));
    video.dispatchEvent(new Event('waiting'));
    video.dispatchEvent(new Event('waiting'));
    expect(v2).toEqual([]);
    act(() => root?.render(<Probe element={video} active={false} />));
    expect(v2).toHaveLength(1);
    expect(v2[0]).toMatchObject({ type: 'playback', action: 'session', target: { kind: 'reel', id: 'r1' }, surface: 'reels', mediaId: 'm1', exitReason: 'swiped', rebufferCount: 1 });
  });

  test('fermer l’écran clôt la séance en `closed`', () => {
    const video = document.createElement('video');
    root = createRoot(container);
    act(() => root?.render(<Probe element={video} active />));
    act(() => root?.unmount());
    root = null;
    expect(v2).toHaveLength(1);
    expect(v2[0]).toMatchObject({ exitReason: 'closed', exitBeforeStart: true });
  });
});
