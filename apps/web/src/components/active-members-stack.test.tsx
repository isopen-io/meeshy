import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import type { Conversation } from '@/lib/api/types';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import type { AuthorStoryRing } from '@/lib/view/author-story-ring';
import type { ActiveMember } from '@/lib/view/top-active-members';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ThreadHeader } from './thread-header';

/**
 * **L'EN-TÊTE D'UN GROUPE MONTRE SES TROIS PARTICIPANTS LES PLUS ACTIFS**
 * (#7830, jumelle iOS #7831) — toucher : la story non vue, sinon le profil ;
 * appui long : Voir le profil · Voir la story · Détails de la conversation.
 */

const MEMBERS: readonly ActiveMember[] = [
  { id: 'u-nour', name: 'Nour Haddad', username: 'nour', avatar: undefined, count: 5 },
  { id: 'u-ali', name: 'Ali Ben', username: 'ali', avatar: undefined, count: 3 },
  { id: 'u-sara', name: 'Sara Lin', username: 'sara', avatar: undefined, count: 1 },
];

const RINGS: Readonly<Record<string, AuthorStoryRing>> = {
  'u-nour': { entryStoryId: 's-nour', unseen: true },
  'u-ali': { entryStoryId: 's-ali', unseen: false },
};

const groupe = (type: Conversation['type'] = 'group'): Conversation =>
  ({
    id: 'c-groupe',
    type,
    title: 'Équipe Lyon',
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 12,
    participants: [],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  }) as Conversation;

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
let container: HTMLDivElement;
let root: Root;

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});
afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
beforeEach(() => {
  window.history.replaceState(null, '', '/c/c-groupe');
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.querySelectorAll('[role="menu"]').forEach((node) => node.remove());
});

const monte = (options: { readonly expanded: boolean; readonly type?: Conversation['type'] }) => {
  const journal: string[] = [];
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <ThreadHeader
        title="Équipe Lyon"
        accent="#6366f1"
        conversation={groupe(options.type)}
        viewerId="u-moi"
        group={(options.type ?? 'group') !== 'direct'}
        storyRingOf={(authorId) => (authorId === undefined ? undefined : RINGS[authorId])}
        activeMembers={MEMBERS}
        otherUnread={0}
        expanded={options.expanded}
        onToggleExpanded={() => journal.push('bascule')}
        onOpenDetails={() => journal.push('details')}
        currentRowTitle=""
        isAuto
        readingMenuRows={[]}
        onSelectReadingMode={() => {}}
        onResetReadingModeToAuto={() => {}}
      />,
    );
  });
  return journal;
};

const lienDe = (id: string): HTMLAnchorElement => {
  const lien = container.querySelector<HTMLAnchorElement>(`[data-active-member="${id}"] a`);
  if (lien === null) throw new Error(`avatar ${id} introuvable`);
  return lien;
};

const touche = (element: Element) =>
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  });

describe('ActiveMembersStack — dans l’en-tête d’un groupe (#7830)', () => {
  test('en-tête déplié : trois avatars, dans l’ordre d’activité, nommés pour le lecteur d’écran', () => {
    monte({ expanded: true });
    const pile = container.querySelector('[data-active-members]');
    expect(pile?.getAttribute('aria-label')).toBe('Participants les plus actifs');
    expect([...container.querySelectorAll<HTMLElement>('[data-active-member]')].map((node) => node.dataset.activeMember)).toEqual([
      'u-nour',
      'u-ali',
      'u-sara',
    ]);
    expect(container.querySelectorAll('[data-active-members] [data-story-ring]').length).toBe(2);
  });

  test('en-tête replié : aucune pile (la bande de 320 px n’a pas la place)', () => {
    monte({ expanded: false });
    expect(container.querySelector('[data-active-members]')).toBeNull();
  });

  test('conversation directe : aucune pile', () => {
    monte({ expanded: true, type: 'direct' });
    expect(container.querySelector('[data-active-members]')).toBeNull();
  });

  test('toucher un avatar dont la story n’est PAS vue ouvre la story', () => {
    monte({ expanded: true });
    touche(lienDe('u-nour'));
    expect(window.location.pathname).toBe('/story/s-nour');
  });

  test('toucher un avatar dont la story est DÉJÀ vue ouvre le profil', () => {
    monte({ expanded: true });
    expect(lienDe('u-ali').getAttribute('aria-label')).toBe('Voir le profil de Ali Ben');
    touche(lienDe('u-ali'));
    expect(window.location.pathname).toBe('/u/ali');
  });

  test('toucher un avatar sans story ouvre le profil', () => {
    monte({ expanded: true });
    touche(lienDe('u-sara'));
    expect(window.location.pathname).toBe('/u/sara');
  });

  test('appui long : Voir le profil · Voir la story · Détails de la conversation — et la story vue s’y ouvre', () => {
    const journal = monte({ expanded: true });
    act(() => {
      lienDe('u-ali').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
    });
    const entrees = [...document.querySelectorAll<HTMLElement>('[data-avatar-menu-entry]')];
    expect(entrees.map((node) => node.textContent)).toEqual(['Voir le profil', 'Voir la story', 'Détails de la conversation']);
    act(() => document.querySelector<HTMLButtonElement>('[data-avatar-menu-entry="story"]')?.click());
    expect(window.location.pathname).toBe('/story/s-ali');
    expect(journal).toEqual([]);
  });

  test('appui long puis « Détails de la conversation » ouvre les détails', () => {
    const journal = monte({ expanded: true });
    act(() => {
      lienDe('u-sara').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
    });
    act(() => document.querySelector<HTMLButtonElement>('[data-avatar-menu-entry="details"]')?.click());
    expect(journal).toEqual(['details']);
  });
});
