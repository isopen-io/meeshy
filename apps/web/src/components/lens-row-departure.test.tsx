import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { Conversation } from '@/lib/api/types';
import { departureStore } from '@/lib/conversation-departure';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { LensRow } from './lens-row';

/**
 * « SUPPRIMER » DANS LE MENU D'UNE LIGNE A UN EFFET (#7285) — il DEMANDE la
 * suppression de CETTE conversation, que l'hôte de la coquille confirme ; il
 * ne part jamais vers les actions de drapeaux (épingler, archiver…).
 */

const conversation = {
  id: 'c-lyon',
  type: 'group',
  title: 'Équipe Lyon',
  status: 'active',
  visibility: 'private',
  isActive: true,
  memberCount: 4,
  participants: [],
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  unreadCount: 0,
} as unknown as Conversation;

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
let container: HTMLDivElement;
let root: Root;

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/chats' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});
afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  departureStore.setState({ request: null, failure: null });
});

describe('LensRow — « Supprimer » demande la suppression de la ligne', () => {
  test('le menu offre « Supprimer » et son choix pose la demande, sans action de drapeau', () => {
    const flagActions: string[] = [];
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <ul>
          <LensRow
            conversation={conversation}
            languages={['fr']}
            viewerId="u-moi"
            flags={{ isPinned: false, isMuted: false, isArchived: false }}
            unreadCount={0}
            onRowAction={(_, id) => flagActions.push(id)}
          />
        </ul>,
      );
    });

    act(() => container.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')?.click());
    const remove = [...document.body.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((b) => b.textContent === 'Supprimer');
    expect(remove?.dataset.destructive).toBe('true');
    act(() => remove?.click());

    expect(departureStore.getState().request).toEqual({ conversationId: 'c-lyon', kind: 'delete', returnToList: false });
    expect(flagActions).toEqual([]);
  });
});
