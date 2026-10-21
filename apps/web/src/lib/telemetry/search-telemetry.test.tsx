import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import type { SocialEventV2Input } from '@/lib/api/social-events-v2-types';
import { readingTelemetry } from '@/lib/view/reading-telemetry';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { rememberSearchId, useSearchTelemetry } from './search-telemetry';

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

function Search(props: { readonly query: string; readonly results?: readonly { readonly id: string }[]; readonly searchId?: string }) {
  const { onResultsClick } = useSearchTelemetry({
    query: props.query,
    results: props.results,
    searchId: props.searchId,
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
    act(() => root?.render(<Search query="al" results={[P(1), P(2)]} searchId="scelle.du.serveur" />));
    const second = container.querySelectorAll('button')[1] as HTMLButtonElement;
    act(() => second.click());
    expect(v2[1]).toMatchObject({ type: 'discovery', action: 'search_result_click', target: { kind: 'profile', id: P(2).id }, listing: { position: 1 } });
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

  test('la recherche porte l’identifiant SERVI avec ses résultats — soumission, résultat touché et abandon', () => {
    root = createRoot(container);
    act(() => root?.render(<Search query="al" results={[P(1), P(2)]} searchId="scelle.du.serveur" />));
    act(() => (container.querySelectorAll('button')[0] as HTMLButtonElement).click());
    act(() => root?.render(<Search query="bob" results={[P(3)]} searchId="autre.scelle" />));
    act(() => root?.unmount());
    root = null;
    expect(v2.map((e) => [(e as { action: string }).action, (e as { searchId?: string }).searchId])).toEqual([
      ['search_submitted', 'scelle.du.serveur'],
      ['search_result_click', 'scelle.du.serveur'],
      ['search_submitted', 'autre.scelle'],
      ['search_abandoned', 'autre.scelle'],
    ]);
  });

  test('sans identifiant servi, aucun n’est inventé — la passerelle n’ouvre que son propre scellé (#10505)', () => {
    root = createRoot(container);
    act(() => root?.render(<Search query="bob" results={[P(1)]} />));
    act(() => root?.unmount());
    root = null;
    expect(v2).toHaveLength(2);
    expect(v2.every((event) => !('searchId' in event))).toBe(true);
  });
});

describe('rememberSearchId', () => {
  test('retient l’identifiant servi dans `meta`, et rien quand la réponse n’en porte pas', () => {
    const known = new Map<string, string>();
    rememberSearchId(known, 'alice', { ok: true, meta: { searchId: 'scelle' } });
    rememberSearchId(known, 'bob', { ok: true });
    rememberSearchId(known, 'carl', { ok: false, meta: { searchId: 'refuse' } });
    rememberSearchId(known, 'dora', { ok: true, meta: { searchId: 42 } });
    expect([...known.entries()]).toEqual([['alice', 'scelle']]);
  });

  test('reste borné : les requêtes les plus anciennes sortent', () => {
    const known = new Map<string, string>();
    Array.from({ length: 25 }, (_, n) => rememberSearchId(known, `q${n}`, { ok: true, meta: { searchId: `s${n}` } }));
    expect(known.size).toBe(20);
    expect(known.has('q0')).toBe(false);
    expect(known.get('q24')).toBe('s24');
  });
});
