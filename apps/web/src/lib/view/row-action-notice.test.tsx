import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { loadRowMenuCatalog } from '@/lib/i18n-row-menu-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { announceRowEvent, publishRowNotice, rowActionNoticeOf, rowNoticeListenerCount, useRowActionNotice } from './row-action-notice';

const SHORT_MS = 40;
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  await loadRowMenuCatalog('fr');
  await loadRowMenuCatalog('en');
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement;
let root: Root | null = null;

function Harness() {
  const { text, tone } = useRowActionNotice(SHORT_MS);
  return <div role="status" data-live data-tone={tone}>{text}</div>;
}

const mount = () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  const mounted = createRoot(container);
  root = mounted;
  act(() => mounted.render(<Harness />));
};

const laisserPasser = (ms: number) =>
  act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });

const live = (): HTMLElement => container.querySelector<HTMLElement>('[data-live]')!;

const unmount = () => {
  const current = root;
  root = null;
  if (current !== null) act(() => current.unmount());
};

afterEach(() => {
  unmount();
  container?.remove();
});

describe('rowActionNoticeOf — la phrase du geste, dans la langue du lecteur', () => {
  test('un état nouveau est une annonce neutre', () => {
    expect(rowActionNoticeOf({ kind: 'applied', action: 'pin', on: true }, 'fr')).toEqual({ text: 'Conversation épinglée', tone: 'neutral' });
    expect(rowActionNoticeOf({ kind: 'applied', action: 'mute', on: false }, 'en')).toEqual({ text: 'Conversation unmuted', tone: 'neutral' });
    expect(rowActionNoticeOf({ kind: 'applied', action: 'read', on: false }, 'fr')).toEqual({ text: 'Marquée comme non lue', tone: 'neutral' });
  });

  test('un refus se lit comme un refus : ton erreur', () => {
    expect(rowActionNoticeOf({ kind: 'refused', action: 'archive' }, 'en')).toEqual({ text: 'Action refused, undone', tone: 'error' });
  });
});

describe('useRowActionNotice — l’écran entend les gestes du module', () => {
  test('une annonce publiée atteint la région, la dernière gagne, puis le silence revient', async () => {
    mount();
    expect(live().textContent).toBe('');
    act(() => publishRowNotice({ text: 'Conversation épinglée', tone: 'neutral' }));
    expect(live().textContent).toBe('Conversation épinglée');
    act(() => publishRowNotice({ text: 'Action refusée, annulée', tone: 'error' }));
    expect(live().textContent).toBe('Action refusée, annulée');
    expect(live().getAttribute('data-tone')).toBe('error');
    await laisserPasser(SHORT_MS + 40);
    expect(live().textContent).toBe('');
  });

  test('démonté, l’écran se désabonne : aucune rétention', () => {
    const before = rowNoticeListenerCount();
    mount();
    expect(rowNoticeListenerCount()).toBe(before + 1);
    unmount();
    expect(rowNoticeListenerCount()).toBe(before);
  });
});

describe('announceRowEvent — le pont de rowAction', () => {
  test('publie la phrase dans la langue de l’interface', async () => {
    mount();
    act(() => announceRowEvent({ kind: 'applied', action: 'archive', on: true }));
    expect(live().textContent).toBe('Conversation archivée');
    await laisserPasser(SHORT_MS + 40);
  });
});
