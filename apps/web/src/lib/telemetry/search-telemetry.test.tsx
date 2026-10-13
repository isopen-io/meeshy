import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import type { SocialEventV2Input } from '@/lib/api/social-events-v2-types';
import { readingTelemetry } from '@/lib/view/reading-telemetry';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { useSearchTelemetry } from './search-telemetry';

/** LA RECHERCHE, SANS SON TEXTE (#10505). */
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

const P = (n: number) => ({ id: n.toString(16).padStart(24, '0') });

function Search(props: { readonly query: string; readonly results?: readonly { readonly id: string }[] }) {
  const { onResultsClick } = useSearchTelemetry({
    query: props.query,
    results: props.results,
    settled: true,
    minLength: 2,
    resultKind: 'profile',
    targetKind: 'profile',
    rowAttribute: 'data-person',
  });
  return (
    <ul onClick={onResultsClick}>
      {(props.results ?? []).map((r) => (
        <li key={r.id} data-person={r.id}>
          <button type="button">{r.id}</button>
        </li>
      ))}
    </ul>
  );
}

describe('useSearchTelemetry', () => {
  test('une recherche servie émet search_submitted avec la LONGUEUR de la requête, jamais son texte', () => {
    root = createRoot(container);
    act(() => root?.render(<Search query="alice dupont" results={[P(1), P(2)]} />));
    expect(v2).toHaveLength(1);
    expect(v2[0]).toMatchObject({ type: 'discovery', action: 'search_submitted', surface: 'search', queryLength: 12, resultCount: 2, resultKind: 'profile' });
    expect(JSON.stringify(v2)).not.toContain('alice');
  });

  test('toucher le 2e résultat émet search_result_click, son rang et la même recherche', () => {
    root = createRoot(container);
    act(() => root?.render(<Search query="al" results={[P(1), P(2)]} />));
    const second = container.querySelectorAll('button')[1] as HTMLButtonElement;
    act(() => second.click());
    expect(v2[1]).toMatchObject({ type: 'discovery', action: 'search_result_click', target: { kind: 'profile', id: P(2).id }, listing: { position: 1 } });
    expect((v2[1] as { searchId: string }).searchId).toBe((v2[0] as { searchId: string }).searchId);
    act(() => root?.unmount());
    root = null;
    expect(v2).toHaveLength(2);
  });

  test('quitter sans rien toucher émet search_abandoned', () => {
    root = createRoot(container);
    act(() => root?.render(<Search query="bob" results={[P(1)]} />));
    act(() => root?.unmount());
    root = null;
    expect(v2.map((e) => (e as { action: string }).action)).toEqual(['search_submitted', 'search_abandoned']);
  });
});
