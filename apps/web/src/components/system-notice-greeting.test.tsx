import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { startArrivalsNotice, withArrival } from '@meeshy/shared/utils/arrivals-notice';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { composerInsertStore } from '@/lib/view/composer-insert';
import type { SystemRow } from '@/lib/view/message-badges';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { SystemNotice } from './system-notice';

/**
 * #16338 — L'AVIS D'ARRIVÉE PORTE « DIS-LUI SALUT », EN GRAS, DANS LA LANGUE
 * D'INTERFACE ; LE TOUCHER ÉCRIT LES MENTIONS DANS LE COMPOSEUR DU FIL.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
  await loadInterfaceCatalog('en');
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement;
let root: Root;
let stop: (() => void) | null = null;

afterEach(() => {
  stop?.();
  stop = null;
  act(() => root.unmount());
  container.remove();
});

const TOM: SystemRow = { kind: 'join', displayName: 'Tom', handle: null, isAnonymous: false, username: 'tom_b' };
const ARRIVALS: SystemRow = {
  kind: 'arrivals',
  notice: withArrival(startArrivalsNotice({ participantId: 'p-lea', displayName: 'Léa', username: 'lea' }, '2026-11-05T10:00:00.000Z'), {
    participantId: 'p-zoe',
    displayName: 'Zoé',
    username: 'zoe',
  }),
};

function mount(row: SystemRow, language: 'fr' | 'en' = 'fr', listening = true): string[] {
  const received: string[] = [];
  if (listening) stop = composerInsertStore.subscribe((chunk) => received.push(chunk));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<SystemNotice row={row} timeString="10:04" surface="row" language={language} />));
  return received;
}

const invite = (): HTMLButtonElement | null => container.querySelector<HTMLButtonElement>('[data-greet-arrival]');

describe('SystemNotice — « dis-lui salut » (#16338)', () => {
  test('un arrivant : l’invite est un bouton EN GRAS, dans la langue d’interface ; le toucher écrit sa mention', () => {
    const received = mount(TOM);
    const button = invite();
    expect(button?.textContent).toBe('Dis-lui salut');
    expect(button?.className).toContain('font-bold');
    act(() => button?.click());
    expect(received).toEqual(['@tom_b ']);
  });

  test('en anglais, l’invite parle anglais', () => {
    mount(TOM, 'en');
    expect(invite()?.textContent).toBe('Say hi');
  });

  test('plusieurs arrivants : « Dis-leur salut » écrit TOUTES les mentions, la phrase ne répète pas l’invite', () => {
    const received = mount(ARRIVALS);
    expect(invite()?.textContent).toBe('Dis-leur salut');
    expect(container.textContent).toContain('Zoé et Léa viennent d’arriver');
    expect(container.textContent).not.toContain('— dis-leur salut');
    act(() => invite()?.click());
    expect(received).toEqual(['@zoe @lea ']);
  });

  test('sans composeur pour la recevoir (fil en lecture seule), aucune invite', () => {
    mount(TOM, 'fr', false);
    expect(invite()).toBeNull();
  });
});
