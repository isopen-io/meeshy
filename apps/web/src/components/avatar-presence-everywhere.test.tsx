import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';

import type { ConversationMember } from '@/lib/api/conversation-members';
import { viewingStore } from '@/lib/api/conversation-viewing';
import { presenceStore } from '@/lib/api/presence-store';
import type { TypingEntry } from '@/lib/api/typing-store';
import type { Conversation, Participant } from '@/lib/api/types';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { HerePeersContext, peerHereIn } from '@/lib/view/use-conversation-viewing';
import type { StoryTrayGroup } from '@/lib/view/story-tray';
import { ProfileConversationsSection } from '@/routes/user-profile-conversations';
import { StoryRow } from '@/routes/stories';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ConversationDetailsAvatar } from './conversation-details-avatar';
import { FocusIdentity } from './focal-focus-overlays';
import { MemberAvatar } from './member-avatar';
import { PeerAvatar } from './peer-avatar';
import { TypingRosterCell } from './typing-roster-cell';

/**
 * CHAQUE AVATAR D'UNE AUTRE PERSONNE PORTE LA PRÉSENCE SERVIE (#10944) — et
 * rien d'autre : absente ⇒ aucun point ; le point « ici » d'une conversation
 * ne s'allume que pour CETTE conversation.
 */

const VIEWER = 'u-viewer';
const NOW = new Date().toISOString();

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
const unmounts: (() => void)[] = [];
afterEach(() => {
  unmounts.splice(0).forEach((unmount) => unmount());
  presenceStore.getState().clear();
  viewingStore.getState().clear();
});

/** Le « ici » vit dans un magasin que le rendu serveur lit à son état INITIAL :
 * il se mesure dans un vrai montage. */
const mounted = (node: ReactNode): string => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(node));
  unmounts.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  return host.innerHTML;
};

const online = (userId: string) => presenceStore.getState().put(userId, { isOnline: true, lastActiveAt: NOW });
const dotOf = (html: string): string | null => /data-presence="([a-z]+)"/.exec(html)?.[1] ?? null;

const participant = (userId: string, partial: Partial<Participant> = {}): Participant =>
  ({
    id: `p-${userId}`,
    conversationId: 'c-a',
    userId,
    type: 'user',
    role: 'member',
    displayName: userId,
    language: 'fr',
    permissions: {
      canSendMessages: true,
      canSendFiles: true,
      canSendImages: true,
      canSendVideos: true,
      canSendAudios: true,
      canSendLocations: true,
      canSendLinks: true,
    },
    isActive: true,
    joinedAt: new Date('2026-01-01'),
    ...partial,
  }) as Participant;

const direct = (id: string, peerId: string): Conversation =>
  ({
    id,
    type: 'direct',
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 2,
    participants: [participant(VIEWER, { conversationId: id }), participant(peerId, { conversationId: id })],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    unreadCount: 0,
    title: peerId,
  }) as Conversation;

const group = (id: string): Conversation =>
  ({ ...direct(id, 'u-nour'), type: 'group', title: 'Équipe', memberCount: 3 }) as Conversation;

describe('le point « ici » ne sort jamais de sa conversation', () => {
  test('le pair présent dans A n’allume pas la ligne de B, où il est aussi le pair', () => {
    const herePeers = { 'c-a': ['u-amina'] };

    expect(peerHereIn(herePeers, direct('c-a', 'u-amina'), VIEWER)).toBe(true);
    expect(peerHereIn(herePeers, direct('c-b', 'u-amina'), VIEWER)).toBe(false);
  });

  test('l’avatar d’un membre de B ne porte pas le « ici » de A', () => {
    viewingStore.getState().arrive('c-a', 'u-amina');

    expect(dotOf(mounted(<MemberAvatar member={member('u-amina')} accent="#5B4CFF" size={40} conversationId="c-b" />))).toBeNull();
    expect(dotOf(mounted(<MemberAvatar member={member('u-amina')} accent="#5B4CFF" size={40} conversationId="c-a" />))).toBe('here');
  });
});

describe('une personne connue par son identifiant', () => {
  test('absente de la carte vivante, aucun point', () => {
    expect(dotOf(renderToStaticMarkup(<PeerAvatar presenceKey="u-amina" initials="AM" color="#5B4CFF" size={40} />))).toBeNull();
  });

  test('servie en ligne, la pastille verte', () => {
    online('u-amina');

    expect(dotOf(renderToStaticMarkup(<PeerAvatar presenceKey="u-amina" initials="AM" color="#5B4CFF" size={40} />))).toBe('online');
  });

  test('sans clé (soi, un groupe), aucun point même quand la carte en porte', () => {
    online('u-amina');

    expect(dotOf(renderToStaticMarkup(<PeerAvatar presenceKey={undefined} initials="AM" color="#5B4CFF" size={40} />))).toBeNull();
  });
});

const member = (userId: string): ConversationMember => ({
  id: `p-${userId}`,
  userId,
  username: userId,
  displayName: userId,
  avatar: undefined,
  role: 'member',
});

describe('la liste des membres', () => {
  test('un membre servi en ligne porte sa pastille, un autre rien', () => {
    online('u-amina');

    expect(dotOf(renderToStaticMarkup(<MemberAvatar member={member('u-amina')} accent="#5B4CFF" size={40} conversationId="c-a" />))).toBe('online');
    expect(dotOf(renderToStaticMarkup(<MemberAvatar member={member('u-kwame')} accent="#5B4CFF" size={40} conversationId="c-a" />))).toBeNull();
  });
});

describe('la puce d’identité du mode focus', () => {
  const chip = (props: { readonly presence?: 'online' | 'offline'; readonly authorId?: string }) => (
    <FocusIdentity initials="AM" name="Amina" accent="#5B4CFF" {...props} />
  );

  test('elle porte la présence de la rangée qu’elle recouvre', () => {
    expect(dotOf(renderToStaticMarkup(chip({ presence: 'online', authorId: 'u-amina' })))).toBe('online');
  });

  test('et le « ici » du fil qu’on lit', () => {
    const html = renderToStaticMarkup(
      <HerePeersContext.Provider value={['u-amina']}>{chip({ presence: 'offline', authorId: 'u-amina' })}</HerePeersContext.Provider>,
    );

    expect(dotOf(html)).toBe('here');
  });

  test('sans présence servie, aucun point', () => {
    expect(dotOf(renderToStaticMarkup(chip({ authorId: 'u-amina' })))).toBeNull();
  });
});

describe('la cellule de frappe', () => {
  const entry: TypingEntry = { userId: 'u-kwame', displayName: 'Kwame Mensah', expiresAt: 0 };

  test('celui qui écrit est en ligne, dans les deux tenues', () => {
    for (const flat of [true, false]) {
      expect(dotOf(renderToStaticMarkup(<TypingRosterCell typists={[entry]} accent="#5B4CFF" flat={flat} />))).toBe('online');
    }
  });
});

const inside = (node: ReactNode) => renderToStaticMarkup(<>{node}</>);

describe('l’en-tête de la feuille de détails', () => {
  test('une conversation directe porte la présence servie du pair', () => {
    online('u-amina');

    expect(dotOf(inside(<ConversationDetailsAvatar conversation={direct('c-a', 'u-amina')} viewerId={VIEWER} title="Amina" accent="#5B4CFF" />))).toBe('online');
  });

  test('et le « ici » de CETTE conversation seulement', () => {
    viewingStore.getState().arrive('c-b', 'u-amina');

    expect(dotOf(mounted(<ConversationDetailsAvatar conversation={direct('c-a', 'u-amina')} viewerId={VIEWER} title="Amina" accent="#5B4CFF" />))).toBeNull();
    expect(dotOf(mounted(<ConversationDetailsAvatar conversation={direct('c-b', 'u-amina')} viewerId={VIEWER} title="Amina" accent="#5B4CFF" />))).toBe('here');
  });

  test('un groupe ne porte aucun point', () => {
    online('u-nour');

    expect(dotOf(inside(<ConversationDetailsAvatar conversation={group('c-g')} viewerId={VIEWER} title="Équipe" accent="#5B4CFF" />))).toBeNull();
  });
});

describe('les conversations partagées d’un profil', () => {
  test('le direct porte la présence du pair, le groupe rien, et aucun « ici »', () => {
    online('u-amina');
    online('u-nour');
    viewingStore.getState().arrive('c-a', 'u-amina');

    const html = mounted(
      <ProfileConversationsSection language="fr" conversations={[direct('c-a', 'u-amina'), group('c-g')]} viewerId={VIEWER} loading={false} failed={false} onRetry={() => undefined} />,
    );

    expect(html.match(/data-presence="([a-z]+)"/g)).toEqual(['data-presence="online"']);
  });
});

describe('une ligne de story', () => {
  const story = (overrides: Partial<StoryTrayGroup> = {}): StoryTrayGroup => ({
    authorId: 'u-ines',
    author: { id: 'u-ines', displayName: 'Inès' },
    stories: [{ id: 's1', type: 'image', createdAt: NOW }],
    latestAt: Date.now(),
    hasUnseen: true,
    isMine: false,
    entryStoryId: 's1',
    ...overrides,
  });

  test('l’auteur servi en ligne porte sa pastille', () => {
    online('u-ines');

    expect(dotOf(renderToStaticMarkup(<StoryRow language="fr" group={story()} />))).toBe('online');
  });

  test('ma propre ligne n’en porte aucune', () => {
    online('u-ines');

    expect(dotOf(renderToStaticMarkup(<StoryRow language="fr" group={story({ isMine: true })} />))).toBeNull();
  });
});
