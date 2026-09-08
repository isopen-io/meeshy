import { describe, expect, test } from 'bun:test';

import { buildAwaitingYou, buildDigest } from './digest';
import { makeAwaitingItem, type DigestInputMessage, type DigestParticipant } from './types';

/**
 * `buildDigest` — miroir de `DigestBuilderTests.swift` (#5695, étape 5).
 * 17 cas iOS + 1 cas web (preuve vide jamais construite).
 */

const BASE = Date.UTC(2026, 0, 10, 9, 0, 0);
const MIN = 60_000;

const dm = (partial: Partial<DigestInputMessage> & { readonly id: string; readonly senderId: string; readonly createdAt: number }): DigestInputMessage => ({
  replyToId: null,
  isSystem: false,
  content: '',
  languageCode: null,
  attachmentKinds: [],
  linkCount: 0,
  mentionsViewer: false,
  ...partial,
});

const participant = (id: string): DigestParticipant => ({
  id,
  displayName: id,
  avatarUrl: null,
  colorHex: '#000000',
  presence: 'offline',
});

const VIEWER = 'viewer';

describe('buildDigest — les dix-sept cas iOS', () => {
  test('emptyMessages_producesEmptyDigest_isCompletePassedThrough', () => {
    const digest = buildDigest({ messages: [], participants: [], viewerId: VIEWER, episodes: [], windowCoversUnread: false });
    expect(digest.messageCount).toBe(0);
    expect(digest.participantCount).toBe(0);
    expect(digest.start).toBeNull();
    expect(digest.end).toBeNull();
    expect(digest.topSenders).toEqual([]);
    expect(digest.languages).toEqual([]);
    expect(digest.awaitingYou).toEqual([]);
    expect(digest.isComplete).toBe(false);
  });

  test('buildOnEmptyMessages_producesSkeletonDigest', () => {
    const digest = buildDigest({ messages: [], participants: [], viewerId: VIEWER, episodes: [], windowCoversUnread: true });
    expect(digest.messageCount).toBe(0);
    expect(digest.media).toEqual({ images: 0, videos: 0, audios: 0, files: 0, locations: 0, links: 0 });
    expect(digest.isComplete).toBe(true);
  });

  test('windowCoversUnread_true_producesIsCompleteTrue', () => {
    const digest = buildDigest({
      messages: [dm({ id: 'm1', senderId: 'u1', createdAt: BASE })],
      participants: [],
      viewerId: VIEWER,
      episodes: [],
      windowCoversUnread: true,
    });
    expect(digest.isComplete).toBe(true);
  });

  test('windowCoversUnread_false_producesIsCompleteFalse_evenWithData', () => {
    const digest = buildDigest({
      messages: [dm({ id: 'm1', senderId: 'u1', createdAt: BASE })],
      participants: [],
      viewerId: VIEWER,
      episodes: [],
      windowCoversUnread: false,
    });
    expect(digest.isComplete).toBe(false);
    expect(digest.messageCount).toBe(1);
  });

  test('messageCount_excludesSystemMessages', () => {
    const digest = buildDigest({
      messages: [
        dm({ id: 'm1', senderId: 'u1', createdAt: BASE }),
        dm({ id: 'm2', senderId: 'system', createdAt: BASE + MIN, isSystem: true }),
        dm({ id: 'm3', senderId: 'u2', createdAt: BASE + 2 * MIN }),
      ],
      participants: [],
      viewerId: VIEWER,
      episodes: [],
      windowCoversUnread: true,
    });
    expect(digest.messageCount).toBe(2);
  });

  test('participantCount_countsDistinctRealSenders_noRoster', () => {
    const digest = buildDigest({
      messages: [
        dm({ id: 'm1', senderId: 'u1', createdAt: BASE }),
        dm({ id: 'm2', senderId: 'u2', createdAt: BASE + MIN }),
        dm({ id: 'm3', senderId: 'u1', createdAt: BASE + 2 * MIN }),
      ],
      participants: [],
      viewerId: VIEWER,
      episodes: [],
      windowCoversUnread: true,
    });
    expect(digest.participantCount).toBe(2);
  });

  test('participantCount_withRoster_excludesUnknownGhostSender (personnes 1, messages 2)', () => {
    const digest = buildDigest({
      messages: [
        dm({ id: 'm1', senderId: 'u1', createdAt: BASE }),
        dm({ id: 'm2', senderId: 'ghost', createdAt: BASE + MIN }),
      ],
      participants: [participant('u1')],
      viewerId: VIEWER,
      episodes: [],
      windowCoversUnread: true,
    });
    expect(digest.participantCount).toBe(1);
    expect(digest.messageCount).toBe(2);
  });

  test("topSenders_sortedByCountDescending_thenUserIdAscending (['uA','uC','uB'])", () => {
    const messages: DigestInputMessage[] = [];
    for (let i = 0; i < 3; i += 1) messages.push(dm({ id: `a${i}`, senderId: 'uA', createdAt: BASE + i * MIN }));
    for (let i = 0; i < 2; i += 1) messages.push(dm({ id: `c${i}`, senderId: 'uC', createdAt: BASE + (10 + i) * MIN }));
    messages.push(dm({ id: 'b0', senderId: 'uB', createdAt: BASE + 20 * MIN }));
    const digest = buildDigest({ messages, participants: [], viewerId: VIEWER, episodes: [], windowCoversUnread: true });
    expect(digest.topSenders.map((s) => s.userId)).toEqual(['uA', 'uC', 'uB']);
  });

  test('languages_tallyByCode_ignoresNullOrEmpty', () => {
    const digest = buildDigest({
      messages: [
        dm({ id: 'm1', senderId: 'u1', createdAt: BASE, languageCode: 'fr' }),
        dm({ id: 'm2', senderId: 'u1', createdAt: BASE + MIN, languageCode: 'fr' }),
        dm({ id: 'm3', senderId: 'u2', createdAt: BASE + 2 * MIN, languageCode: 'en' }),
        dm({ id: 'm4', senderId: 'u2', createdAt: BASE + 3 * MIN, languageCode: null }),
        dm({ id: 'm5', senderId: 'u2', createdAt: BASE + 4 * MIN, languageCode: '' }),
      ],
      participants: [],
      viewerId: VIEWER,
      episodes: [],
      windowCoversUnread: true,
    });
    expect(digest.languages).toEqual([
      { code: 'fr', messageCount: 2 },
      { code: 'en', messageCount: 1 },
    ]);
  });

  test('media_tallySixBucketsFromRealAttachmentsAndLinks', () => {
    const digest = buildDigest({
      messages: [
        dm({ id: 'm1', senderId: 'u1', createdAt: BASE, attachmentKinds: ['image', 'image'], linkCount: 1 }),
        dm({ id: 'm2', senderId: 'u1', createdAt: BASE + MIN, attachmentKinds: ['video', 'audio', 'file', 'location'], linkCount: 2 }),
      ],
      participants: [],
      viewerId: VIEWER,
      episodes: [],
      windowCoversUnread: true,
    });
    expect(digest.media).toEqual({ images: 2, videos: 1, audios: 1, files: 1, locations: 1, links: 3 });
  });

  test('mention_unanswered_producesAwaitingItem_withNonEmptyEvidence', () => {
    const digest = buildDigest({
      messages: [dm({ id: 'm1', senderId: 'other', createdAt: BASE, mentionsViewer: true })],
      participants: [],
      viewerId: VIEWER,
      episodes: [],
      windowCoversUnread: true,
    });
    expect(digest.awaitingYou).toHaveLength(1);
    expect(digest.awaitingYou[0]?.kind).toBe('mention');
    expect(digest.awaitingYou[0]?.fromUserId).toBe('other');
    expect(digest.awaitingYou[0]?.evidenceMessageIds).toEqual(['m1']);
  });

  test('mention_answeredByLaterViewerMessage_producesNoAwaitingItem', () => {
    const digest = buildDigest({
      messages: [
        dm({ id: 'm1', senderId: 'other', createdAt: BASE, mentionsViewer: true }),
        dm({ id: 'm2', senderId: VIEWER, createdAt: BASE + MIN }),
      ],
      participants: [],
      viewerId: VIEWER,
      episodes: [],
      windowCoversUnread: true,
    });
    expect(digest.awaitingYou).toEqual([]);
  });

  test('directReply_toViewerMessage_producesAwaitingItem', () => {
    const digest = buildDigest({
      messages: [
        dm({ id: 'm1', senderId: VIEWER, createdAt: BASE }),
        dm({ id: 'm2', senderId: 'other', createdAt: BASE + MIN, replyToId: 'm1' }),
      ],
      participants: [],
      viewerId: VIEWER,
      episodes: [],
      windowCoversUnread: true,
    });
    expect(digest.awaitingYou).toHaveLength(1);
    expect(digest.awaitingYou[0]?.kind).toBe('directReply');
    expect(digest.awaitingYou[0]?.fromUserId).toBe('other');
    expect(digest.awaitingYou[0]?.evidenceMessageIds).toEqual(['m2']);
  });

  test('replyToSomeoneElseMessage_isNotADirectReplyToViewer', () => {
    const digest = buildDigest({
      messages: [
        dm({ id: 'm1', senderId: 'someoneElse', createdAt: BASE }),
        dm({ id: 'm2', senderId: 'other', createdAt: BASE + MIN, replyToId: 'm1' }),
      ],
      participants: [],
      viewerId: VIEWER,
      episodes: [],
      windowCoversUnread: true,
    });
    expect(digest.awaitingYou).toEqual([]);
  });

  test('unansweredQuestion_producesAwaitingItem', () => {
    const digest = buildDigest({
      messages: [dm({ id: 'm1', senderId: 'other', createdAt: BASE, content: 'Ça marche ?' })],
      participants: [],
      viewerId: VIEWER,
      episodes: [],
      windowCoversUnread: true,
    });
    expect(digest.awaitingYou).toHaveLength(1);
    expect(digest.awaitingYou[0]?.kind).toBe('unansweredQuestion');
    expect(digest.awaitingYou[0]?.fromUserId).toBe('other');
  });

  test('viewerOwnMessages_neverProduceAwaitingItems', () => {
    const digest = buildDigest({
      messages: [dm({ id: 'm1', senderId: VIEWER, createdAt: BASE, content: 'Ça marche ?', mentionsViewer: true })],
      participants: [],
      viewerId: VIEWER,
      episodes: [],
      windowCoversUnread: true,
    });
    expect(digest.awaitingYou).toEqual([]);
  });

  test('episodes_arePassedThroughUnmodified', () => {
    const episodes = [
      {
        id: 'e1',
        start: BASE,
        end: BASE + MIN,
        messageIds: ['m1'],
        participantIds: ['u1'],
        deterministicTitle: 'Aujourd’hui · 1 message',
        agentTitle: null,
      },
    ];
    const digest = buildDigest({
      messages: [dm({ id: 'm1', senderId: 'u1', createdAt: BASE })],
      participants: [],
      viewerId: VIEWER,
      episodes,
      windowCoversUnread: true,
    });
    expect(digest.episodes).toBe(episodes);
  });
});

describe('buildDigest — le cas web', () => {
  test('awaitingItem_withoutEvidence_isNeverConstructed', () => {
    expect(makeAwaitingItem({ id: 'x', kind: 'mention', fromUserId: 'u1', evidenceMessageIds: [], at: BASE })).toBeNull();
  });
});

describe('buildAwaitingYou — exportée pour le témoin de preuve vide', () => {
  test('ne produit rien sans messages réels', () => {
    expect(buildAwaitingYou([], new Map(), VIEWER)).toEqual([]);
  });
});
