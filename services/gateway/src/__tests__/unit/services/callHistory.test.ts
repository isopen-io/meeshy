import {
  buildCallHistoryItem,
  deriveCallDirection,
  callIsVideo,
  deriveDurationSec,
  clampNonNegativeInt,
  type CallHistoryRow,
  type CallHistoryPeer,
} from '../../../services/callHistory';

const baseRow = (over: Partial<CallHistoryRow> = {}): CallHistoryRow => ({
  id: 'call1',
  conversationId: 'conv1',
  mode: 'p2p',
  status: 'ended',
  endReason: 'completed',
  initiatorId: 'me',
  startedAt: new Date('2026-06-20T10:00:00.000Z'),
  answeredAt: new Date('2026-06-20T10:00:05.000Z'),
  endedAt: new Date('2026-06-20T10:01:05.000Z'),
  duration: 60,
  bytesSent: 1000,
  bytesReceived: 2000,
  metadata: { type: 'video' },
  conversation: { type: 'direct', title: null, avatar: null },
  ...over,
});

describe('callHistory pure helpers', () => {
  describe('deriveCallDirection', () => {
    it('outgoing when I initiated', () => {
      expect(deriveCallDirection('me', 'me', null)).toBe('outgoing');
    });
    it('incoming when other initiated and it was answered', () => {
      expect(deriveCallDirection('other', 'me', new Date())).toBe('incoming');
    });
    it('missed when other initiated and never answered', () => {
      expect(deriveCallDirection('other', 'me', null)).toBe('missed');
    });
  });

  describe('callIsVideo', () => {
    it('true when metadata.type === video', () => {
      expect(callIsVideo({ type: 'video' })).toBe(true);
    });
    it('false for audio / null / non-object', () => {
      expect(callIsVideo({ type: 'audio' })).toBe(false);
      expect(callIsVideo(null)).toBe(false);
      expect(callIsVideo('video')).toBe(false);
      expect(callIsVideo(undefined)).toBe(false);
    });
  });

  describe('clampNonNegativeInt', () => {
    it('floors a valid byte counter', () => {
      expect(clampNonNegativeInt(12.9)).toBe(12);
    });
    it('null for negative / NaN / nullish', () => {
      expect(clampNonNegativeInt(-1)).toBeNull();
      expect(clampNonNegativeInt(Number.NaN)).toBeNull();
      expect(clampNonNegativeInt(undefined)).toBeNull();
      expect(clampNonNegativeInt(null)).toBeNull();
    });
  });

  describe('deriveDurationSec', () => {
    it('prefers the persisted duration', () => {
      expect(
        deriveDurationSec({ duration: 42, answeredAt: new Date(0), endedAt: new Date(10_000) })
      ).toBe(42);
    });
    it('derives from answered→ended when duration is null', () => {
      expect(
        deriveDurationSec({
          duration: null,
          answeredAt: new Date('2026-01-01T00:00:00.000Z'),
          endedAt: new Date('2026-01-01T00:00:30.000Z'),
        })
      ).toBe(30);
    });
    it('0 when unanswered', () => {
      expect(deriveDurationSec({ duration: null, answeredAt: null, endedAt: new Date() })).toBe(0);
    });
  });

  describe('buildCallHistoryItem', () => {
    it('maps an answered outgoing video direct call with a peer', () => {
      const peer: CallHistoryPeer = {
        userId: 'u2',
        username: 'bob',
        displayName: 'Bob',
        avatar: null,
        phoneNumber: '+33123456789',
        isOnline: true,
      };
      const item = buildCallHistoryItem(baseRow(), 'me', peer);
      expect(item).toMatchObject({
        callId: 'call1',
        conversationId: 'conv1',
        conversationType: 'direct',
        direction: 'outgoing',
        isVideo: true,
        durationSec: 60,
        bytesSent: 1000,
        bytesReceived: 2000,
        peer,
      });
      expect(item.startedAt).toBe('2026-06-20T10:00:00.000Z');
      expect(item.answeredAt).toBe('2026-06-20T10:00:05.000Z');
      expect(item.endedAt).toBe('2026-06-20T10:01:05.000Z');
    });

    it('marks a missed incoming call with null timestamps and no peer', () => {
      const item = buildCallHistoryItem(
        baseRow({
          initiatorId: 'other',
          answeredAt: null,
          endedAt: null,
          duration: null,
          status: 'missed',
        }),
        'me',
        null
      );
      expect(item.direction).toBe('missed');
      expect(item.answeredAt).toBeNull();
      expect(item.endedAt).toBeNull();
      expect(item.durationSec).toBe(0);
      expect(item.peer).toBeNull();
    });

    it('outputs endReason: null when the row has no endReason', () => {
      const item = buildCallHistoryItem(baseRow({ endReason: null }), 'me', null);
      expect(item.endReason).toBeNull();
    });

    it('treats audio metadata as not-video and surfaces group conversation display fields', () => {
      const item = buildCallHistoryItem(
        baseRow({
          metadata: { type: 'audio' },
          conversation: { type: 'group', title: 'Squad', avatar: 'a.png' },
        }),
        'me',
        null
      );
      expect(item.isVideo).toBe(false);
      expect(item.conversationType).toBe('group');
      expect(item.conversationTitle).toBe('Squad');
      expect(item.conversationAvatar).toBe('a.png');
    });
  });
});
