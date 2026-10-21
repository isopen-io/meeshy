import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { Conversation } from '@/lib/api/types';
import { departureStore } from '@/lib/conversation-departure';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import type { RowIntent } from '@/lib/view/row-actions';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { LensRow } from './lens-row';

/**
 * LA LIGNE PORTE LE FAVORI ET LES ENTRÉES D'iOS DE SON MENU (#10593) — l'emoji
 * posé se voit à côté du nom ; Détails ouvre la fiche (direct compris),
 * Renommer, Bloquer et les choix de sous-menu partent vers l'écran.
 */
const group = {
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
  userPreferences: [{ reaction: '🏆' }],
  currentUserRole: 'creator',
} as unknown as Conversation;

const direct = {
  ...group,
  id: 'c-amina',
  type: 'direct',
  title: undefined,
  memberCount: 2,
  userPreferences: [],
  participants: [
    { id: 'p-me', userId: 'u-moi', displayName: 'Moi' },
    { id: 'p-amina', userId: 'u-amina', displayName: 'Amina', user: { id: 'u-amina', username: 'amina' } },
  ],
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
});

function mount(conversation: Conversation, peerBlocked?: boolean) {
  const intents: [string, RowIntent][] = [];
  const details: string[] = [];
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
          onRowAction={() => undefined}
          onOpenDetails={(id) => details.push(id)}
          onRowIntent={(id, intent) => intents.push([id, intent])}
          peerBlocked={peerBlocked}
          categories={[{ id: 'cat-a', name: 'Travail' }]}
        />
      </ul>,
    );
  });
  return { intents, details };
}

const openMenu = () => act(() => container.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')?.click());
const entry = (label: string) => [...document.body.querySelectorAll<HTMLButtonElement>('[role="menu"] button')].find((b) => b.textContent === label);
const labels = () => [...document.body.querySelectorAll<HTMLButtonElement>('[role="menu"] button')].map((b) => b.textContent);

describe('LensRow — le favori et les entrées d’iOS', () => {
  test('l’emoji favori se voit à côté du nom, nommé pour le lecteur d’écran', () => {
    mount(group);
    const favorite = container.querySelector('[data-favorite]');
    expect(favorite?.textContent).toBe('🏆');
    expect(favorite?.getAttribute('aria-label')).toBe('Favori 🏆');
  });

  test('un groupe que l’on a créé : Détails ouvre la fiche, Renommer et « Déplacer vers… › Travail » partent vers l’écran', () => {
    const { intents, details } = mount(group);
    openMenu();
    expect(labels()).toEqual([
      'Appel vocal',
      'Appel vidéo',
      'Épingler',
      'Silence',
      'Non lu',
      'Détails',
      'Renommer',
      'Inviter',
      'Gérer les membres',
      'Favori',
      'Déplacer vers…',
      'Archiver',
      'Quitter',
      'Supprimer',
    ]);
    act(() => entry('Détails')?.click());
    openMenu();
    act(() => entry('Renommer')?.click());
    openMenu();
    act(() => entry('Déplacer vers…')?.click());
    act(() => entry('Travail')?.click());
    expect(details).toEqual(['c-lyon']);
    expect(intents).toEqual([
      ['c-lyon', { kind: 'rename' }],
      ['c-lyon', { kind: 'moveTo', categoryId: 'cat-a' }],
    ]);
  });

  test('un membre ordinaire d’un groupe ne renomme ni n’invite (#11211)', () => {
    mount({ ...group, currentUserRole: 'member' } as unknown as Conversation);
    openMenu();
    expect(labels()).not.toContain('Renommer');
    expect(labels()).not.toContain('Inviter');
    expect(labels()).toContain('Quitter');
  });

  test('« Quitter » demande le départ, « Inviter » et « Gérer les membres » ouvrent la fiche (#11211)', () => {
    departureStore.setState({ request: null, failure: null });
    const { details } = mount(group);
    openMenu();
    act(() => entry('Quitter')?.click());
    expect(departureStore.getState().request).toEqual({ conversationId: 'c-lyon', kind: 'leave', returnToList: false });
    openMenu();
    act(() => entry('Inviter')?.click());
    openMenu();
    act(() => entry('Gérer les membres')?.click());
    expect(details).toEqual(['c-lyon', 'c-lyon']);
    departureStore.setState({ request: null, failure: null });
  });

  test('un direct : pas de Renommer, Détails ouvre aussi sa fiche, « Bloquer » demande le blocage', () => {
    const { intents, details } = mount(direct, false);
    openMenu();
    expect(labels()).not.toContain('Renommer');
    act(() => entry('Détails')?.click());
    openMenu();
    act(() => entry('Bloquer')?.click());
    expect(details).toEqual(['c-amina']);
    expect(intents).toEqual([['c-amina', { kind: 'block', intent: 'block' }]]);
  });

  test('un pair déjà bloqué : « Débloquer »', () => {
    const { intents } = mount(direct, true);
    openMenu();
    act(() => entry('Débloquer')?.click());
    expect(intents).toEqual([['c-amina', { kind: 'block', intent: 'unblock' }]]);
  });
});
