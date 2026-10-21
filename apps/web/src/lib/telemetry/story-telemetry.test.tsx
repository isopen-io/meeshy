import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import type { SocialEventV2Input } from '@/lib/api/social-events-v2-types';
import { readingTelemetry } from '@/lib/view/reading-telemetry';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { useStoryTelemetry } from './story-telemetry';

/** LES GESTES DU LECTEUR DE STORY (#10506). */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
let v2: SocialEventV2Input[] = [];
const original = readingTelemetry.recordV2;
let container: HTMLDivElement;
let root: Root;
let probe: ReturnType<typeof useStoryTelemetry> | null = null;

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
  readingTelemetry.recordV2 = (event) => void v2.push(event);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  readingTelemetry.recordV2 = original;
});

function Viewer(props: { readonly slideIndex: number; readonly slideCount: number }) {
  probe = useStoryTelemetry({ storyId: 'b'.repeat(24), slideIndex: props.slideIndex, slideCount: props.slideCount, elapsedMs: () => 1234.4 });
  return null;
}

describe('useStoryTelemetry', () => {
  test('une story fermée à la slide 2/5 émet exit_before_end avec slideIndex 1', () => {
    act(() => root.render(<Viewer slideIndex={1} slideCount={5} />));
    probe?.noteExit();
    expect(v2).toEqual([
      { type: 'story', action: 'exit_before_end', target: { kind: 'story', id: 'b'.repeat(24) }, surface: 'story', slideIndex: 1, slideCount: 5, elapsedMs: 1234 },
    ]);
  });

  test('fermée sur la dernière slide : pas une sortie avant la fin', () => {
    act(() => root.render(<Viewer slideIndex={4} slideCount={5} />));
    probe?.noteExit();
    expect(v2).toEqual([]);
  });

  test('tap avant et arrière, à la slide COURANTE (pas celle du premier rendu)', () => {
    act(() => root.render(<Viewer slideIndex={0} slideCount={3} />));
    probe?.noteTap('next');
    act(() => root.render(<Viewer slideIndex={1} slideCount={3} />));
    probe?.noteTap('previous');
    expect(v2.map((e) => [(e as { action: string }).action, (e as { slideIndex: number }).slideIndex])).toEqual([
      ['tap_forward', 0],
      ['tap_back', 1],
    ]);
  });
});
