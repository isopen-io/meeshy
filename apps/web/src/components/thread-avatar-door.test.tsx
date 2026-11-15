import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { Conversation, Participant } from '@/lib/api/types';
import type { ConversationFlags } from '@/lib/api/preferences';
import { sessionStore, type AuthenticatedSession, type GuestIdentity } from '@/lib/api/session';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadNotificationRowCatalog } from '@/lib/i18n-notification-row-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { LensRow } from './lens-row';
import { ThreadHeader } from './thread-header';

/**
 * TOUCHER L'AVATAR D'UNE CONVERSATION OUVRE SA FICHE (#10300, directive
 * porteur du 2026-10-12) — « tout comme quand on touche l'avatar d'une
 * conversation directe avec un utilisateur et on voit son profil ; dans une
 * conversation non directe, il faut afficher le profil de la conversation ».
 *
 * Même geste, même effet, dans l'en-tête du fil ET dans la liste : un direct
 * mène au profil du pair, toute autre conversation (groupe, public, global,
 * communauté) ouvre ses détails. Un visiteur sans compte n'ouvre ni détails ni
 * profils (#10205) : son avatar garde exactement le geste d'avant.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/c/c-groupe' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
  await loadNotificationRowCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
  sessionStore.setState({ session: { status: 'anonymous' } });
});

const mount = (node: ReactNode): HTMLDivElement => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(node));
  return container;
};

const ACCOUNT = {
  status: 'authenticated',
  token: 'jwt',
  sessionToken: 's',
  expiresAt: Number.MAX_SAFE_INTEGER,
  user: { id: 'u-moi', username: 'moi', displayName: 'Moi' },
} as unknown as AuthenticatedSession;

const GUEST: GuestIdentity = { participantId: 'p-awa', nickname: 'Awa', conversationId: 'c-groupe', link: 'mshy_lyon', mayWrite: true };

const asMember = () => sessionStore.setState({ session: ACCOUNT });
const asGuest = () => sessionStore.setState({ session: { status: 'guest', sessionToken: 'anon', guest: GUEST, expiresAt: Number.MAX_SAFE_INTEGER } });

const participant = (id: string, name: string): Participant =>
  ({
    id: `p-${id}`,
    conversationId: 'c-groupe',
    userId: `u-${id}`,
    type: 'user',
    displayName: name,
    role: 'member',
    language: 'fr',
    isActive: true,
    isOnline: false,
    joinedAt: new Date('2026-01-01'),
    user: { id: `u-${id}`, username: id, displayName: name },
  }) as Participant;

const conversationOf = (type: string, title: string): Conversation =>
  ({
    id: 'c-groupe',
    type,
    title,
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 12,
    participants: [participant('nour', 'Nour Haddad'), participant('moi', 'Moi Même')],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    unreadCount: 0,
    lastMessageAt: new Date('2026-10-12T09:00:00.000Z'),
  }) as unknown as Conversation;

const GROUP = conversationOf('group', 'Équipe Lyon');
const DIRECT = conversationOf('direct', 'Nour Haddad');

const header = (options: {
  readonly conversation: Conversation;
  readonly title: string;
  readonly expanded?: boolean;
  readonly preview?: boolean;
  readonly journal: string[];
}) => (
  <ThreadHeader
    title={options.title}
    accent="#0ea5e9"
    conversation={options.conversation}
    viewerId="u-moi"
    group={options.conversation.type !== 'direct'}
    otherUnread={0}
    expanded={options.expanded ?? false}
    onToggleExpanded={() => options.journal.push('bascule')}
    onOpenDetails={() => options.journal.push('details')}
    currentRowTitle=""
    isAuto
    readingMenuRows={[]}
    onSelectReadingMode={() => {}}
    onResetReadingModeToAuto={() => {}}
    {...(options.preview === true ? { preview: true } : {})}
  />
);

const avatarDoor = (el: HTMLElement): HTMLElement | null => el.querySelector<HTMLElement>('[data-thread-avatar-door]');

describe('dans l’en-tête du fil, l’avatar ouvre la fiche (#10300)', () => {
  for (const type of ['group', 'public', 'global', 'community'] as const) {
    test(`une conversation ${type} : l’avatar est un bouton « Voir la conversation » qui ouvre ses détails`, () => {
      asMember();
      const journal: string[] = [];
      const el = mount(header({ conversation: conversationOf(type, 'Équipe Lyon'), title: 'Équipe Lyon', journal }));
      const door = avatarDoor(el);
      expect(door?.tagName).toBe('BUTTON');
      expect(door?.getAttribute('aria-label')).toBe('Voir la conversation Équipe Lyon');
      expect(door?.getAttribute('aria-haspopup')).toBe('dialog');
      act(() => door?.click());
      expect(journal).toEqual(['details']);
    });
  }

  test('une conversation directe : l’avatar mène au profil du pair', () => {
    asMember();
    const journal: string[] = [];
    const el = mount(header({ conversation: DIRECT, title: 'Nour Haddad', journal }));
    const door = avatarDoor(el)?.querySelector<HTMLAnchorElement>('a');
    expect(door?.getAttribute('href')).toBe('/u/nour');
    expect(door?.getAttribute('aria-label')).toBe('Voir le profil de Nour Haddad');
    expect(journal).toEqual([]);
  });

  test('déplié aussi, l’avatar d’un groupe ouvre ses détails au lieu de replier', () => {
    asMember();
    const journal: string[] = [];
    const el = mount(header({ conversation: GROUP, title: 'Équipe Lyon', expanded: true, journal }));
    act(() => avatarDoor(el)?.click());
    expect(journal).toEqual(['details']);
  });

  test('en aperçu, un direct mène aussi au profil : même geste, même effet', () => {
    asMember();
    const journal: string[] = [];
    const el = mount(header({ conversation: DIRECT, title: 'Nour Haddad', preview: true, journal }));
    expect(avatarDoor(el)?.querySelector('a')?.getAttribute('href')).toBe('/u/nour');
  });

  test('l’en-tête se déplie et se replie toujours, par sa bande', () => {
    asMember();
    const journal: string[] = [];
    const replie = mount(header({ conversation: GROUP, title: 'Équipe Lyon', journal }));
    const deplier = replie.querySelector<HTMLButtonElement>('button[aria-label="Déplier l’en-tête"]');
    expect(deplier?.getAttribute('aria-expanded')).toBe('false');
    act(() => deplier?.click());
    act(() => root?.render(header({ conversation: GROUP, title: 'Équipe Lyon', expanded: true, journal })));
    const replier = container?.querySelector<HTMLButtonElement>('button[aria-label="Replier l’en-tête"]');
    expect(replier?.getAttribute('aria-expanded')).toBe('true');
    act(() => replier?.click());
    expect(journal).toEqual(['bascule', 'bascule']);
  });

  test('un visiteur sans compte : l’avatar n’ouvre rien de nouveau, il garde sa bascule', () => {
    asGuest();
    const journal: string[] = [];
    const el = mount(header({ conversation: GROUP, title: 'Équipe Lyon', journal }));
    expect(avatarDoor(el)).toBeNull();
    act(() => el.querySelector<HTMLButtonElement>('button[aria-label="Déplier l’en-tête"]')?.click());
    expect(journal).toEqual(['bascule']);
    expect(el.querySelector('a[href^="/u/"]')).toBeNull();
  });
});

const FLAGS: ConversationFlags = { isPinned: false, isMuted: false, isArchived: false } as ConversationFlags;

const row = (conversation: Conversation, onOpenDetails?: (id: string) => void) => (
  <LensRow
    conversation={conversation}
    languages={['fr']}
    viewerId="u-moi"
    flags={FLAGS}
    unreadCount={0}
    onRowAction={() => {}}
    {...(onOpenDetails === undefined ? {} : { onOpenDetails })}
  />
);

describe('dans la liste, l’avatar d’une conversation non directe ouvre sa fiche (#10300)', () => {
  test('un groupe : l’avatar est un bouton nommé qui ouvre ses détails, le texte ouvre toujours le fil', () => {
    asMember();
    const opened: string[] = [];
    const el = mount(row(GROUP, (id) => opened.push(id)));
    const door = el.querySelector<HTMLButtonElement>('[data-lens-avatar-door]');
    expect(door?.getAttribute('aria-label')).toBe('Voir la conversation Équipe Lyon');
    expect(door?.getAttribute('aria-haspopup')).toBe('dialog');
    act(() => door?.click());
    expect(opened).toEqual(['c-groupe']);
    expect(el.querySelector('a[href="/c/c-groupe"]')).not.toBeNull();
  });

  test('un direct : l’avatar mène toujours au profil', () => {
    asMember();
    const el = mount(row(DIRECT, () => {}));
    expect(el.querySelector('[data-lens-avatar-door]')).toBeNull();
    expect(el.querySelector('a[href="/u/nour"]')).not.toBeNull();
  });

  test('sans hôte qui sache ouvrir les détails, l’avatar d’un groupe garde le chemin du fil', () => {
    asMember();
    const el = mount(row(GROUP));
    expect(el.querySelector('[data-lens-avatar-door]')).toBeNull();
  });
});
