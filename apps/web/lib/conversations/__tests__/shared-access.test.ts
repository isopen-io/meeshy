import { resolveSharedAccess } from '../shared-access';
import type { LinkConversationData } from '@/services/link-conversation.service';

const NOW = Date.parse('2026-08-15T12:00:00.000Z');
const CONVERSATION_ID = '507f1f77bcf86cd799439022';

function makeLinkData(overrides: Partial<LinkConversationData> = {}): LinkConversationData {
  return {
    conversation: {
      id: CONVERSATION_ID,
      title: 'Week-end Ardèche',
      description: '',
      type: 'group',
      createdAt: '2026-08-01T10:00:00.000Z',
      updatedAt: '2026-08-01T10:00:00.000Z',
    },
    link: {
      id: '507f1f77bcf86cd799439099',
      linkId: 'mshy_abc_123',
      name: 'Ardèche',
      description: '',
      allowViewHistory: true,
      allowAnonymousMessages: true,
      allowAnonymousFiles: false,
      allowAnonymousImages: true,
      requireAccount: false,
      requireEmail: false,
      requireNickname: true,
      requireBirthday: false,
      expiresAt: null,
      isActive: true,
    },
    userType: 'anonymous',
    messages: [],
    stats: { totalMessages: 0, totalMembers: 1, hasMore: false },
    members: [],
    anonymousParticipants: [],
    currentUser: null,
    ...overrides,
  } as LinkConversationData;
}

describe('resolveSharedAccess — the visitor already belongs', () => {
  it('routes a conversation member to the full app view', () => {
    const access = resolveSharedAccess({
      data: makeLinkData({ userType: 'member' }),
      nowMs: NOW,
    });

    expect(access).toEqual({ state: 'member', conversationId: CONVERSATION_ID });
  });

  it('routes a joined anonymous participant to the live shared view', () => {
    const access = resolveSharedAccess({
      data: makeLinkData({
        currentUser: {
          id: 'anon-1',
          username: 'guest',
          firstName: 'Guest',
          lastName: 'One',
          language: 'fr',
          isMeeshyer: false,
        },
      }),
      nowMs: NOW,
    });

    expect(access).toEqual({ state: 'participant', conversationId: CONVERSATION_ID });
  });
});

describe('resolveSharedAccess — the visitor must still join', () => {
  it('treats a caller with no identity as an anonymous visitor', () => {
    const access = resolveSharedAccess({ data: makeLinkData(), nowMs: NOW });

    expect(access).toEqual({
      state: 'visitor',
      conversationId: CONVERSATION_ID,
      identity: 'none',
    });
  });

  // Un compte connecté qui n'est pas encore membre est renvoyé par le gateway
  // avec `userType: 'anonymous'` ET `isMeeshyer: true`. La modale doit lui
  // proposer « Rejoindre » sous son identité, pas un formulaire de connexion.
  it('recognises a signed-in non-member so the modal can offer a one-tap join', () => {
    const access = resolveSharedAccess({
      data: makeLinkData({
        currentUser: {
          id: 'user-9',
          username: 'bob',
          firstName: 'Bob',
          lastName: 'Jones',
          language: 'en',
          isMeeshyer: true,
        },
      }),
      nowMs: NOW,
    });

    expect(access).toEqual({
      state: 'visitor',
      conversationId: CONVERSATION_ID,
      identity: 'registered',
    });
  });
});

describe('resolveSharedAccess — the link itself is the problem', () => {
  it('reports a missing payload as an invalid link', () => {
    expect(resolveSharedAccess({ data: null, nowMs: NOW })).toEqual({
      state: 'error',
      reason: 'invalid',
    });
  });

  it('reports a deactivated link', () => {
    const data = makeLinkData();
    const access = resolveSharedAccess({
      data: { ...data, link: { ...data.link, isActive: false } },
      nowMs: NOW,
    });

    expect(access).toEqual({ state: 'error', reason: 'inactive' });
  });

  it('reports an expired link', () => {
    const data = makeLinkData();
    const access = resolveSharedAccess({
      data: { ...data, link: { ...data.link, expiresAt: '2026-08-14T12:00:00.000Z' } },
      nowMs: NOW,
    });

    expect(access).toEqual({ state: 'error', reason: 'expired' });
  });

  // Une expiration à venir ne doit rien casser : le test fige `nowMs`, donc un
  // `expiresAt` dans le futur reste valable.
  it('accepts a link whose expiry is still ahead', () => {
    const data = makeLinkData();
    const access = resolveSharedAccess({
      data: { ...data, link: { ...data.link, expiresAt: '2026-08-16T12:00:00.000Z' } },
      nowMs: NOW,
    });

    expect(access.state).toBe('visitor');
  });

  // Un membre garde l'accès même si le lien a expiré : le lien sert à ENTRER,
  // pas à rester. Le couper reviendrait à éjecter quelqu'un de sa propre
  // conversation parce qu'il a rouvert une vieille URL.
  it('keeps a member inside even when the share link has expired', () => {
    const data = makeLinkData({ userType: 'member' });
    const access = resolveSharedAccess({
      data: { ...data, link: { ...data.link, expiresAt: '2026-08-14T12:00:00.000Z', isActive: false } },
      nowMs: NOW,
    });

    expect(access).toEqual({ state: 'member', conversationId: CONVERSATION_ID });
  });
});
