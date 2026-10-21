import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { THREAD_SEARCH_PARAM, threadSearchRequested, useThreadSearchDoor } from './thread-search-door';

/**
 * LA PORTE « RECHERCHER » DU MENU D'UNE LIGNE (#11226) — `/c/<id>?search=1`
 * ouvre le fil SUR sa recherche, comme `openConversation(_, searching: true)`
 * d'iOS. La demande se consomme : l'adresse la perd, et un retour ou un
 * rechargement ne rouvre pas une recherche qu'on a refermée.
 */
describe('threadSearchRequested', () => {
  test('« search=1 » demande la recherche ; son absence, ou une autre valeur, non', () => {
    expect(threadSearchRequested(new URLSearchParams(`${THREAD_SEARCH_PARAM}=1`))).toBe(true);
    expect(threadSearchRequested(new URLSearchParams('message=m-1'))).toBe(false);
    expect(threadSearchRequested(new URLSearchParams(`${THREAD_SEARCH_PARAM}=0`))).toBe(false);
    expect(threadSearchRequested(undefined)).toBe(false);
  });
});

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/c/c-lyon?search=1&message=m-9' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function Probe({ search, onOpen }: { readonly search: URLSearchParams | undefined; readonly onOpen: () => void }) {
  useThreadSearchDoor({ search, openSearch: onOpen });
  return null;
}

describe('useThreadSearchDoor', () => {
  test('la demande ouvre la recherche une fois, puis l’adresse la perd en gardant le reste', () => {
    window.history.replaceState(null, '', '/c/c-lyon?search=1&message=m-9');
    const opened: number[] = [];
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const search = new URLSearchParams(window.location.search);
    act(() => root.render(<Probe search={search} onOpen={() => opened.push(1)} />));
    act(() => root.render(<Probe search={search} onOpen={() => opened.push(1)} />));
    expect(opened).toHaveLength(1);
    expect(`${window.location.pathname}${window.location.search}`).toBe('/c/c-lyon?message=m-9');
  });

  test('sans demande, rien ne s’ouvre et l’adresse ne bouge pas', () => {
    window.history.replaceState(null, '', '/c/c-lyon');
    const opened: number[] = [];
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<Probe search={new URLSearchParams()} onOpen={() => opened.push(1)} />));
    expect(opened).toEqual([]);
    expect(window.location.pathname).toBe('/c/c-lyon');
  });
});
