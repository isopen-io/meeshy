import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import type { DwellContentType } from '@/lib/api/social-events';
import type { SocialEventV2Input } from '@/lib/api/social-events-v2-types';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { QUICK_SKIP_MS, readingTelemetry, useReadingSession } from './reading-telemetry';

/** LE PASSAGE ÉCLAIR, SIGNAL NÉGATIF IMPLICITE (#10503). */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
let v2: SocialEventV2Input[] = [];
const originals = { record: readingTelemetry.record, recordV2: readingTelemetry.recordV2 };
let container: HTMLDivElement;
let root: Root;
let clock = 0;

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
beforeEach(() => {
  v2 = [];
  clock = 0;
  readingTelemetry.record = () => undefined;
  readingTelemetry.recordV2 = (event) => void v2.push(event);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  container.remove();
  readingTelemetry.record = originals.record;
  readingTelemetry.recordV2 = originals.recordV2;
});

function Session(props: { readonly active: boolean; readonly contentType: DwellContentType }) {
  useReadingSession({ postId: 'a'.repeat(24), active: props.active, contentType: props.contentType, surface: 'reels', impressionSource: null, openView: false, now: () => clock });
  return null;
}

describe('quick_skip', () => {
  test('un réel quitté à 600 ms émet negative/quick_skip et sa durée visible', () => {
    act(() => root.render(<Session active contentType="REEL" />));
    clock = 600;
    act(() => root.render(<Session active={false} contentType="REEL" />));
    act(() => root.unmount());
    expect(v2).toEqual([{ type: 'negative', action: 'quick_skip', target: { kind: 'reel', id: 'a'.repeat(24) }, surface: 'reels', visibleMs: 600 }]);
  });

  test(`un réel regardé ${QUICK_SKIP_MS} ms ou plus n’est pas un passage éclair ; un post jamais`, () => {
    act(() => root.render(<Session active contentType="REEL" />));
    clock = QUICK_SKIP_MS;
    act(() => root.render(<Session active={false} contentType="REEL" />));
    act(() => root.render(<Session active contentType="POST" />));
    clock += 100;
    act(() => root.unmount());
    expect(v2).toEqual([]);
  });
});
