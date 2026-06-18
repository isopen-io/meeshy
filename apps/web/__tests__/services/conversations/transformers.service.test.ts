/**
 * Tests for TransformersService
 *
 * Tests data transformation from backend format to frontend format:
 * role mapping, conversation type mapping, message/conversation transformations,
 * cache behaviour, and edge cases.
 */

import { TransformersService } from '@/services/conversations/transformers.service';
import { UserRoleEnum, MemberRole } from '@meeshy/shared/types';

// ─── Factories ─────────────────────────────────────────────────────────────

const makeRawSender = (overrides: Record<string, unknown> = {}) => ({
  id: 'user-1',
  username: 'alice',
  firstName: 'Alice',
  lastName: 'Smith',
  displayName: 'Alice S.',
  email: 'alice@example.com',
  phoneNumber: '+33600000000',
  role: 'USER',
  systemLanguage: 'fr',
  regionalLanguage: 'fr',
  autoTranslateEnabled: false,
  isOnline: true,
  isActive: true,
  avatar: 'https://cdn.meeshy.me/avatars/alice.png',
  createdAt: '2026-01-01T00:00:00.000Z',
  lastActiveAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
  ...overrides,
});

const makeRawTranslation = (overrides: Record<string, unknown> = {}) => ({
  id: 'trans-1',
  messageId: 'msg-1',
  sourceLanguage: 'en',
  targetLanguage: 'fr',
  translatedContent: 'Bonjour',
  translationModel: 'nllb-200',
  cacheKey: 'cache-1',
  confidenceScore: 0.95,
  createdAt: '2026-01-01T00:00:00.000Z',
  cached: true,
  ...overrides,
});

const makeRawAttachment = (overrides: Record<string, unknown> = {}) => ({
  id: 'att-1',
  messageId: 'msg-1',
  fileName: 'photo.jpg',
  originalName: 'my-photo.jpg',
  fileUrl: 'https://cdn.meeshy.me/files/photo.jpg',
  mimeType: 'image/jpeg',
  fileSize: 204800,
  thumbnailUrl: 'https://cdn.meeshy.me/thumbs/photo.jpg',
  width: 800,
  height: 600,
  duration: undefined,
  bitrate: undefined,
  sampleRate: undefined,
  codec: undefined,
  channels: undefined,
  fps: undefined,
  videoCodec: undefined,
  pageCount: undefined,
  lineCount: undefined,
  uploadedBy: 'user-1',
  isAnonymous: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  isForwarded: false,
  isViewOnce: false,
  viewOnceCount: 0,
  isBlurred: false,
  viewedCount: 2,
  downloadedCount: 1,
  consumedCount: 0,
  isEncrypted: false,
  ...overrides,
});

const makeRawMessage = (overrides: Record<string, unknown> = {}) => ({
  id: 'msg-1',
  content: 'Hello world',
  senderId: 'participant-1',
  conversationId: 'conv-1',
  originalLanguage: 'en',
  messageType: 'text',
  messageSource: 'user',
  isEdited: false,
  isViewOnce: false,
  viewOnceCount: 0,
  isBlurred: false,
  deliveredCount: 2,
  readCount: 1,
  reactionCount: 0,
  isEncrypted: false,
  createdAt: '2026-06-01T10:00:00.000Z',
  updatedAt: '2026-06-01T10:00:00.000Z',
  sender: makeRawSender({ id: 'user-1', userId: 'user-1' }),
  translations: [makeRawTranslation()],
  attachments: [],
  ...overrides,
});

const makeRawParticipant = (overrides: Record<string, unknown> = {}) => ({
  id: 'part-1',
  role: 'MEMBER',
  isActive: true,
  user: {
    id: 'user-1',
    username: 'alice',
    displayName: 'Alice S.',
    firstName: 'Alice',
    lastName: 'Smith',
    avatar: 'https://cdn.meeshy.me/avatars/alice.png',
    isOnline: true,
    lastActiveAt: '2026-06-01T00:00:00.000Z',
  },
  ...overrides,
});

const makeRawConversation = (overrides: Record<string, unknown> = {}) => ({
  id: 'conv-1',
  type: 'group',
  title: 'My Group',
  description: 'A test group',
  image: null,
  avatar: null,
  banner: null,
  communityId: null,
  isActive: true,
  isArchived: false,
  memberCount: 3,
  lastMessageAt: '2026-06-01T10:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
  participants: [makeRawParticipant()],
  unreadCount: 0,
  ...overrides,
});

// ─── Test suite ────────────────────────────────────────────────────────────

describe('TransformersService', () => {
  let svc: TransformersService;

  beforeEach(() => {
    svc = new TransformersService();
  });

  // ── Role mapping ──────────────────────────────────────────────────────────

  describe('stringToUserRole', () => {
    it.each([
      ['ADMIN', UserRoleEnum.ADMIN],
      ['MODERATOR', UserRoleEnum.MODERATOR],
      ['BIGBOSS', UserRoleEnum.BIGBOSS],
      ['CREATOR', MemberRole.CREATOR],
      ['AUDIT', UserRoleEnum.AUDIT],
      ['ANALYST', UserRoleEnum.ANALYST],
      ['USER', UserRoleEnum.USER],
      ['MEMBER', MemberRole.MEMBER],
    ])('maps %s to %s', (input, expected) => {
      expect(svc.stringToUserRole(input)).toBe(expected);
    });

    it('is case-insensitive', () => {
      expect(svc.stringToUserRole('admin')).toBe(UserRoleEnum.ADMIN);
      expect(svc.stringToUserRole('moderator')).toBe(UserRoleEnum.MODERATOR);
    });

    it('falls back to MEMBER for unknown roles', () => {
      expect(svc.stringToUserRole('SUPERUSER')).toBe(MemberRole.MEMBER);
      expect(svc.stringToUserRole('')).toBe(MemberRole.MEMBER);
    });
  });

  describe('mapUserRoleToString', () => {
    it.each([
      ['ADMIN', 'admin'],
      ['BIGBOSS', 'admin'],
      ['CREATOR', 'admin'],
      ['MODERATOR', 'moderator'],
      ['AUDIT', 'moderator'],
      ['ANALYST', 'moderator'],
      ['USER', 'member'],
      ['MEMBER', 'member'],
    ] as const)('maps %s → %s', (input, expected) => {
      expect(svc.mapUserRoleToString(input)).toBe(expected);
    });

    it('is case-insensitive', () => {
      expect(svc.mapUserRoleToString('admin')).toBe('admin');
    });

    it('falls back to member for unknown roles', () => {
      expect(svc.mapUserRoleToString('UNKNOWN')).toBe('member');
    });
  });

  describe('mapConversationType', () => {
    it.each([
      ['direct', 'direct'],
      ['group', 'group'],
      ['public', 'public'],
      ['global', 'global'],
      ['broadcast', 'broadcast'],
      ['anonymous', 'direct'],
    ] as const)('maps %s → %s', (input, expected) => {
      expect(svc.mapConversationType(input)).toBe(expected);
    });

    it('is case-insensitive', () => {
      expect(svc.mapConversationType('GROUP')).toBe('group');
    });

    it('falls back to direct for unknown types', () => {
      expect(svc.mapConversationType('unknown-type')).toBe('direct');
    });
  });

  describe('mapConversationVisibility', () => {
    it.each([
      ['public', 'public'],
      ['global', 'public'],
      ['direct', 'private'],
      ['group', 'private'],
      ['anonymous', 'private'],
    ] as const)('maps %s → %s', (input, expected) => {
      expect(svc.mapConversationVisibility(input)).toBe(expected);
    });

    it('falls back to private for broadcast (not in visibility map)', () => {
      expect(svc.mapConversationVisibility('broadcast')).toBe('private');
    });

    it('is case-insensitive', () => {
      expect(svc.mapConversationVisibility('PUBLIC')).toBe('public');
    });
  });

  // ── transformMessageData ─────────────────────────────────────────────────

  describe('transformMessageData', () => {
    it('returns a well-formed Message from a complete backend payload', () => {
      const raw = makeRawMessage();
      const msg = svc.transformMessageData(raw);

      expect(msg.id).toBe('msg-1');
      expect(msg.content).toBe('Hello world');
      expect(msg.conversationId).toBe('conv-1');
      expect(msg.originalLanguage).toBe('en');
      expect(msg.messageType).toBe('text');
      expect(msg.messageSource).toBe('user');
      expect(msg.isEdited).toBe(false);
      expect(msg.isEncrypted).toBe(false);
      expect(msg.deliveredCount).toBe(2);
      expect(msg.readCount).toBe(1);
      expect(msg.createdAt).toBeInstanceOf(Date);
      expect(msg.timestamp).toEqual(msg.createdAt);
    });

    it('maps sender flat fields correctly', () => {
      const raw = makeRawMessage();
      const msg = svc.transformMessageData(raw);

      expect(msg.sender.username).toBe('alice');
      expect(msg.sender.firstName).toBe('Alice');
      expect(msg.sender.lastName).toBe('Smith');
      expect(msg.sender.systemLanguage).toBe('fr');
      expect(msg.sender.isOnline).toBe(true);
    });

    it('resolves sender from nested participant.user structure', () => {
      const raw = makeRawMessage({
        sender: {
          id: 'part-1',
          userId: 'user-2',
          user: {
            id: 'user-2',
            username: 'bob',
            displayName: 'Bob B.',
            firstName: 'Bob',
            lastName: 'Brown',
            avatar: null,
          },
        },
      });
      const msg = svc.transformMessageData(raw);
      expect(msg.sender.username).toBe('bob');
    });

    it('uses nickname over displayName for sender displayName', () => {
      const raw = makeRawMessage({
        sender: makeRawSender({ nickname: 'NickAlice', displayName: 'Alice S.' }),
      });
      const msg = svc.transformMessageData(raw);
      expect(msg.sender.displayName).toBe('NickAlice');
    });

    it('creates a default user when sender is null/undefined', () => {
      const raw = makeRawMessage({ sender: undefined });
      const msg = svc.transformMessageData(raw);

      expect(msg.sender.displayName).toBe('Utilisateur Inconnu');
      expect(msg.sender.email).toBe('unknown@example.com');
    });

    it('maps translations array correctly', () => {
      const raw = makeRawMessage({
        translations: [makeRawTranslation(), makeRawTranslation({ id: 'trans-2', targetLanguage: 'es' })],
      });
      const msg = svc.transformMessageData(raw);

      expect(msg.translations).toHaveLength(2);
      expect(msg.translations[0].targetLanguage).toBe('fr');
      expect(msg.translations[1].targetLanguage).toBe('es');
      expect(msg.translations[0].cached).toBe(true);
      expect(msg.translations[0].createdAt).toBeInstanceOf(Date);
    });

    it('returns empty translations when translations is not an array', () => {
      const raw = makeRawMessage({ translations: null });
      const msg = svc.transformMessageData(raw);
      expect(msg.translations).toEqual([]);
    });

    it('returns undefined attachments when attachments array is empty', () => {
      const raw = makeRawMessage({ attachments: [] });
      const msg = svc.transformMessageData(raw);
      expect(msg.attachments).toBeUndefined();
    });

    it('transforms attachments array with all fields', () => {
      const raw = makeRawMessage({
        attachments: [
          makeRawAttachment({ width: 1920, height: 1080, duration: 5.5, bitrate: 128000 }),
        ],
      });
      const msg = svc.transformMessageData(raw);

      expect(msg.attachments).toHaveLength(1);
      const att = msg.attachments![0];
      expect(att.fileName).toBe('photo.jpg');
      expect(att.originalName).toBe('my-photo.jpg');
      expect(att.mimeType).toBe('image/jpeg');
      expect(att.fileSize).toBe(204800);
      expect(att.width).toBe(1920);
      expect(att.height).toBe(1080);
      expect(att.duration).toBe(5.5);
      expect(att.bitrate).toBe(128000);
      expect(att.isEncrypted).toBe(false);
      expect(att.viewOnceCount).toBe(0);
    });

    it('returns undefined for optional attachment numeric fields when missing', () => {
      const raw = makeRawMessage({
        attachments: [makeRawAttachment({ width: undefined, height: undefined, duration: undefined })],
      });
      const msg = svc.transformMessageData(raw);
      const att = msg.attachments![0];
      expect(att.width).toBeUndefined();
      expect(att.height).toBeUndefined();
      expect(att.duration).toBeUndefined();
    });

    it('maps replyTo correctly when present', () => {
      const raw = makeRawMessage({
        replyTo: {
          id: 'msg-0',
          content: 'Original message',
          senderId: 'user-0',
          conversationId: 'conv-1',
          originalLanguage: 'en',
          messageType: 'text',
          createdAt: '2026-06-01T09:00:00.000Z',
          updatedAt: '2026-06-01T09:00:00.000Z',
          sender: makeRawSender({ id: 'user-0', username: 'eve' }),
        },
      });
      const msg = svc.transformMessageData(raw);

      expect(msg.replyTo).toBeDefined();
      expect(msg.replyTo!.id).toBe('msg-0');
      expect(msg.replyTo!.content).toBe('Original message');
      expect(msg.replyTo!.sender.username).toBe('eve');
      expect(msg.replyTo!.createdAt).toBeInstanceOf(Date);
    });

    it('leaves replyTo undefined when absent', () => {
      const raw = makeRawMessage({ replyTo: undefined });
      const msg = svc.transformMessageData(raw);
      expect(msg.replyTo).toBeUndefined();
    });

    it('maps validatedMentions when present', () => {
      const raw = makeRawMessage({ validatedMentions: ['alice', 'bob'] });
      const msg = svc.transformMessageData(raw);
      expect(msg.validatedMentions).toEqual(['alice', 'bob']);
    });

    it('leaves validatedMentions undefined when absent', () => {
      const raw = makeRawMessage({ validatedMentions: undefined });
      const msg = svc.transformMessageData(raw);
      expect(msg.validatedMentions).toBeUndefined();
    });

    it('uses originalLanguage fallback fr when missing', () => {
      const raw = makeRawMessage({ originalLanguage: undefined });
      const msg = svc.transformMessageData(raw);
      expect(msg.originalLanguage).toBe('fr');
    });

    it('maps deletedAt as Date when present', () => {
      const raw = makeRawMessage({ deletedAt: '2026-06-01T11:00:00.000Z' });
      const msg = svc.transformMessageData(raw);
      expect(msg.deletedAt).toBeInstanceOf(Date);
    });

    it('keeps deletedAt undefined when absent', () => {
      const raw = makeRawMessage({ deletedAt: undefined });
      const msg = svc.transformMessageData(raw);
      expect(msg.deletedAt).toBeUndefined();
    });

    it('maps reactionSummary when present', () => {
      const reactionSummary = { '👍': 3, '❤️': 1 };
      const raw = makeRawMessage({ reactionSummary });
      const msg = svc.transformMessageData(raw);
      expect(msg.reactionSummary).toEqual(reactionSummary);
    });

    it('maps encryptionMode and encryptionMetadata', () => {
      const raw = makeRawMessage({
        isEncrypted: true,
        encryptionMode: 'e2ee',
        encryptedContent: 'base64ciphertext',
        encryptionMetadata: { keyId: 'key-1' },
      });
      const msg = svc.transformMessageData(raw);

      expect(msg.isEncrypted).toBe(true);
      expect(msg.encryptionMode).toBe('e2ee');
      expect(msg.encryptedContent).toBe('base64ciphertext');
      expect(msg.encryptionMetadata).toEqual({ keyId: 'key-1' });
    });

    it('returns cached result for the same object reference', () => {
      const raw = makeRawMessage() as object;
      const first = svc.transformMessageData(raw);
      const second = svc.transformMessageData(raw);
      expect(second).toBe(first);
    });

    it('returns distinct results for distinct objects with same content', () => {
      const raw1 = makeRawMessage();
      const raw2 = makeRawMessage();
      const msg1 = svc.transformMessageData(raw1);
      const msg2 = svc.transformMessageData(raw2);
      expect(msg1).not.toBe(msg2);
      expect(msg1).toEqual(msg2);
    });
  });

  // ── transformConversationData ────────────────────────────────────────────

  describe('transformConversationData', () => {
    it('returns a well-formed Conversation from a complete backend payload', () => {
      const raw = makeRawConversation();
      const conv = svc.transformConversationData(raw);

      expect(conv.id).toBe('conv-1');
      expect(conv.title).toBe('My Group');
      expect(conv.type).toBe('group');
      expect(conv.visibility).toBe('private');
      expect(conv.isGroup).toBe(true);
      expect(conv.isPrivate).toBe(true);
      expect(conv.isActive).toBe(true);
      expect(conv.isArchived).toBe(false);
      expect(conv.status).toBe('active');
      expect(conv.memberCount).toBe(3);
      expect(conv.unreadCount).toBe(0);
      expect(conv.createdAt).toBeInstanceOf(Date);
      expect(conv.updatedAt).toBeInstanceOf(Date);
      expect(conv.lastMessageAt).toBeInstanceOf(Date);
    });

    it('maps participants with nested user data', () => {
      const raw = makeRawConversation({
        participants: [
          makeRawParticipant({ id: 'p1' }),
          makeRawParticipant({ id: 'p2', user: { ...makeRawParticipant().user, id: 'u2', username: 'bob' } }),
        ],
      });
      const conv = svc.transformConversationData(raw);

      expect(conv.participants).toHaveLength(2);
      expect((conv.participants as any)[0].user.username).toBe('alice');
      expect((conv.participants as any)[1].user.username).toBe('bob');
    });

    it('handles participants with null user gracefully', () => {
      const raw = makeRawConversation({
        participants: [{ id: 'p1', role: 'MEMBER', user: null }],
      });
      const conv = svc.transformConversationData(raw);
      expect((conv.participants as any)[0].user).toBeUndefined();
    });

    it('returns empty participants when not an array', () => {
      const raw = makeRawConversation({ participants: undefined });
      const conv = svc.transformConversationData(raw);
      expect(conv.participants).toEqual([]);
    });

    it('falls back to lastMessageAt → updatedAt when lastMessageAt missing', () => {
      const raw = makeRawConversation({ lastMessageAt: undefined, updatedAt: '2026-06-01T00:00:00.000Z' });
      const conv = svc.transformConversationData(raw);
      expect(conv.lastMessageAt).toBeInstanceOf(Date);
    });

    it('uses _count.participants when memberCount not present', () => {
      const raw = makeRawConversation({ memberCount: undefined, _count: { participants: 7 } });
      const conv = svc.transformConversationData(raw);
      expect(conv.memberCount).toBe(7);
    });

    it('falls back to participants.length when both memberCount and _count absent', () => {
      const raw = makeRawConversation({
        memberCount: undefined,
        _count: undefined,
        participants: [makeRawParticipant(), makeRawParticipant({ id: 'p2' })],
      });
      const conv = svc.transformConversationData(raw);
      expect(conv.memberCount).toBe(2);
    });

    it('transforms lastMessage when present', () => {
      const raw = makeRawConversation({ lastMessage: makeRawMessage() });
      const conv = svc.transformConversationData(raw);
      expect(conv.lastMessage).toBeDefined();
      expect(conv.lastMessage!.id).toBe('msg-1');
    });

    it('keeps lastMessage undefined when absent', () => {
      const raw = makeRawConversation({ lastMessage: undefined });
      const conv = svc.transformConversationData(raw);
      expect(conv.lastMessage).toBeUndefined();
    });

    it('extracts first userPreference when array has items', () => {
      const pref = { id: 'pref-1', isMuted: true };
      const raw = makeRawConversation({ userPreferences: [pref] });
      const conv = svc.transformConversationData(raw);
      expect(conv.userPreferences).toEqual(pref);
    });

    it('keeps userPreferences undefined when array is empty', () => {
      const raw = makeRawConversation({ userPreferences: [] });
      const conv = svc.transformConversationData(raw);
      expect(conv.userPreferences).toBeUndefined();
    });

    it('maps direct conversation to isGroup=false, isPrivate=true', () => {
      const raw = makeRawConversation({ type: 'direct' });
      const conv = svc.transformConversationData(raw);
      expect(conv.isGroup).toBe(false);
      expect(conv.isPrivate).toBe(true);
      expect(conv.type).toBe('direct');
    });

    it('maps public conversation to visibility=public, isPrivate=false', () => {
      const raw = makeRawConversation({ type: 'public' });
      const conv = svc.transformConversationData(raw);
      expect(conv.visibility).toBe('public');
      expect(conv.isPrivate).toBe(false);
    });

    it('maps anonymous type → type=direct, isPrivate=true', () => {
      const raw = makeRawConversation({ type: 'anonymous' });
      const conv = svc.transformConversationData(raw);
      expect(conv.type).toBe('direct');
      expect(conv.isPrivate).toBe(true);
    });

    it('returns cached result for the same object reference', () => {
      const raw = makeRawConversation() as object;
      const first = svc.transformConversationData(raw);
      const second = svc.transformConversationData(raw);
      expect(second).toBe(first);
    });

    it('returns distinct results for distinct objects', () => {
      const raw1 = makeRawConversation();
      const raw2 = makeRawConversation({ id: 'conv-2' });
      const c1 = svc.transformConversationData(raw1);
      const c2 = svc.transformConversationData(raw2);
      expect(c1).not.toBe(c2);
      expect(c2.id).toBe('conv-2');
    });

    it('user lastActiveAt is converted to Date when present', () => {
      const raw = makeRawConversation({
        participants: [makeRawParticipant({ user: { ...makeRawParticipant().user, lastActiveAt: '2026-06-01T00:00:00.000Z' } })],
      });
      const conv = svc.transformConversationData(raw);
      expect((conv.participants as any)[0].user.lastActiveAt).toBeInstanceOf(Date);
    });

    it('user lastActiveAt is undefined when missing', () => {
      const raw = makeRawConversation({
        participants: [makeRawParticipant({ user: { ...makeRawParticipant().user, lastActiveAt: undefined } })],
      });
      const conv = svc.transformConversationData(raw);
      expect((conv.participants as any)[0].user.lastActiveAt).toBeUndefined();
    });

    it('participant user displayName falls back to username when displayName missing', () => {
      const raw = makeRawConversation({
        participants: [makeRawParticipant({ user: { id: 'u1', username: 'charlie', displayName: '', isOnline: false } })],
      });
      const conv = svc.transformConversationData(raw);
      expect((conv.participants as any)[0].user.displayName).toBe('charlie');
    });

    it('participant user displayName falls back to empty string when both displayName and username missing', () => {
      const raw = makeRawConversation({
        participants: [makeRawParticipant({ user: { id: 'u1', username: '', displayName: '', isOnline: false } })],
      });
      const conv = svc.transformConversationData(raw);
      expect((conv.participants as any)[0].user.displayName).toBe('');
    });
  });

  // ── transformAttachments — optional fields ────────────────────────────────

  describe('transformAttachments — optional audio/video/document fields', () => {
    it('maps all optional numeric/string fields when present', () => {
      const raw = makeRawMessage({
        attachments: [
          makeRawAttachment({
            sampleRate: 44100,
            codec: 'aac',
            channels: 2,
            fps: 30,
            videoCodec: 'h264',
            pageCount: 5,
            lineCount: 100,
          }),
        ],
      });
      const msg = svc.transformMessageData(raw);
      const att = msg.attachments![0];

      expect(att.sampleRate).toBe(44100);
      expect(att.codec).toBe('aac');
      expect(att.channels).toBe(2);
      expect(att.fps).toBe(30);
      expect(att.videoCodec).toBe('h264');
      expect(att.pageCount).toBe(5);
      expect(att.lineCount).toBe(100);
    });

    it('falls back to senderId when uploadedBy is missing', () => {
      const raw = makeRawMessage({
        senderId: 'participant-99',
        attachments: [makeRawAttachment({ uploadedBy: undefined })],
      });
      const msg = svc.transformMessageData(raw);
      expect(msg.attachments![0].uploadedBy).toBe('participant-99');
    });

    it('maps metadata object when present', () => {
      const meta = { key: 'value', nested: { num: 42 } };
      const raw = makeRawMessage({
        attachments: [makeRawAttachment({ metadata: meta })],
      });
      const msg = svc.transformMessageData(raw);
      expect(msg.attachments![0].metadata).toEqual(meta);
    });

    it('uses current timestamp string when createdAt is missing on attachment', () => {
      const before = Date.now();
      const raw = makeRawMessage({
        attachments: [makeRawAttachment({ createdAt: undefined })],
      });
      const msg = svc.transformMessageData(raw);
      const createdAt = msg.attachments![0].createdAt;
      expect(typeof createdAt).toBe('string');
      expect(new Date(createdAt as string).getTime()).toBeGreaterThanOrEqual(before);
    });
  });

  // ── transformTranslations — falsy fields ─────────────────────────────────

  describe('transformTranslations — falsy field fallbacks', () => {
    it('uses originalLanguage when sourceLanguage is missing', () => {
      const raw = makeRawMessage({
        originalLanguage: 'pt',
        translations: [makeRawTranslation({ sourceLanguage: undefined })],
      });
      const msg = svc.transformMessageData(raw);
      expect(msg.translations[0].sourceLanguage).toBe('pt');
    });

    it('uses "basic" model when translationModel is missing', () => {
      const raw = makeRawMessage({
        translations: [makeRawTranslation({ translationModel: undefined })],
      });
      const msg = svc.transformMessageData(raw);
      expect(msg.translations[0].translationModel).toBe('basic');
    });

    it('maps empty string id and cacheKey when missing', () => {
      const raw = makeRawMessage({
        translations: [makeRawTranslation({ id: undefined, cacheKey: undefined })],
      });
      const msg = svc.transformMessageData(raw);
      expect(msg.translations[0].id).toBe('');
      expect(msg.translations[0].cacheKey).toBe('');
    });

    it('maps confidenceScore to undefined when zero (falsy)', () => {
      const raw = makeRawMessage({
        translations: [makeRawTranslation({ confidenceScore: 0 })],
      });
      const msg = svc.transformMessageData(raw);
      expect(msg.translations[0].confidenceScore).toBeUndefined();
    });
  });

  // ── transformSender — fallback paths ─────────────────────────────────────

  describe('transformSender — fallback paths', () => {
    it('returns empty string for username when sender has no username', () => {
      const raw = makeRawMessage({
        sender: makeRawSender({ username: undefined }),
      });
      const msg = svc.transformMessageData(raw);
      expect(msg.sender.username).toBe('');
    });

    it('uses nestedUser firstName and lastName when flat fields are missing', () => {
      const raw = makeRawMessage({
        sender: {
          id: 'part-2',
          userId: 'user-2',
          user: {
            id: 'user-2',
            username: 'dave',
            firstName: 'David',
            lastName: 'Jones',
            displayName: 'Dave J.',
          },
        },
      });
      const msg = svc.transformMessageData(raw);
      expect(msg.sender.firstName).toBe('David');
      expect(msg.sender.lastName).toBe('Jones');
    });

    it('falls back to defaultId when getSenderUserId returns null (no userId, no nested user.id)', () => {
      const raw = makeRawMessage({
        senderId: 'fallback-sender-id',
        sender: {
          username: 'ghost',
          displayName: 'Ghost User',
        },
      });
      const msg = svc.transformMessageData(raw);
      expect(msg.sender.id).toBe('fallback-sender-id');
    });
  });

  // ── replyTo — missing optional fields ────────────────────────────────────

  describe('replyTo — missing optional fields', () => {
    it('uses "fr" when replyTo.originalLanguage is missing', () => {
      const raw = makeRawMessage({
        replyTo: {
          id: 'msg-0',
          content: 'Reply content',
          senderId: 'user-0',
          conversationId: 'conv-1',
          originalLanguage: undefined,
          messageType: 'text',
          createdAt: '2026-06-01T09:00:00.000Z',
          updatedAt: '2026-06-01T09:00:00.000Z',
          sender: makeRawSender({ id: 'user-0' }),
        },
      });
      const msg = svc.transformMessageData(raw);
      expect(msg.replyTo!.originalLanguage).toBe('fr');
    });

    it('uses createdAt for updatedAt when replyTo.updatedAt is missing', () => {
      const createdAtStr = '2026-06-01T09:00:00.000Z';
      const raw = makeRawMessage({
        replyTo: {
          id: 'msg-0',
          content: 'Reply content',
          senderId: 'user-0',
          conversationId: 'conv-1',
          originalLanguage: 'en',
          messageType: 'text',
          createdAt: createdAtStr,
          updatedAt: undefined,
          sender: makeRawSender({ id: 'user-0' }),
        },
      });
      const msg = svc.transformMessageData(raw);
      expect(msg.replyTo!.updatedAt).toEqual(new Date(createdAtStr));
    });
  });

  // ── message — non-zero reactionCount ─────────────────────────────────────

  describe('message — non-zero reactionCount', () => {
    it('preserves non-zero reactionCount', () => {
      const raw = makeRawMessage({ reactionCount: 7 });
      const msg = svc.transformMessageData(raw);
      expect(msg.reactionCount).toBe(7);
    });
  });

  // ── message — additional fallback branches ────────────────────────────────

  describe('message — additional fallback branches', () => {
    it('uses "unknown" for senderId when missing', () => {
      const raw = makeRawMessage({ senderId: undefined, sender: undefined });
      const msg = svc.transformMessageData(raw);
      expect(msg.sender.id).toBe('unknown');
    });

    it('uses "text" for messageType when missing', () => {
      const raw = makeRawMessage({ messageType: undefined });
      const msg = svc.transformMessageData(raw);
      expect(msg.messageType).toBe('text');
    });

    it('uses "user" for messageSource when missing', () => {
      const raw = makeRawMessage({ messageSource: undefined });
      const msg = svc.transformMessageData(raw);
      expect(msg.messageSource).toBe('user');
    });

    it('uses 0 for readCount when zero', () => {
      const raw = makeRawMessage({ readCount: 0 });
      const msg = svc.transformMessageData(raw);
      expect(msg.readCount).toBe(0);
    });
  });

  // ── replyTo — senderId and messageType fallbacks ──────────────────────────

  describe('replyTo — senderId and messageType fallbacks', () => {
    it('uses "unknown" for replyTo.senderId when missing', () => {
      const raw = makeRawMessage({
        replyTo: {
          id: 'msg-0',
          content: 'Reply',
          senderId: undefined,
          conversationId: 'conv-1',
          originalLanguage: 'en',
          messageType: 'text',
          createdAt: '2026-06-01T09:00:00.000Z',
          updatedAt: '2026-06-01T09:00:00.000Z',
          sender: makeRawSender({ id: 'user-0' }),
        },
      });
      const msg = svc.transformMessageData(raw);
      expect(msg.replyTo!.senderId).toBe('');
    });

    it('uses "text" for replyTo.messageType when missing', () => {
      const raw = makeRawMessage({
        replyTo: {
          id: 'msg-0',
          content: 'Reply',
          senderId: 'user-0',
          conversationId: 'conv-1',
          originalLanguage: 'en',
          messageType: undefined,
          createdAt: '2026-06-01T09:00:00.000Z',
          updatedAt: '2026-06-01T09:00:00.000Z',
          sender: makeRawSender({ id: 'user-0' }),
        },
      });
      const msg = svc.transformMessageData(raw);
      expect(msg.replyTo!.messageType).toBe('text');
    });
  });

  // ── transformAttachments — minimal fields ─────────────────────────────────

  describe('transformAttachments — minimal/missing fields', () => {
    it('handles attachment with all falsy core fields', () => {
      const raw = makeRawMessage({
        senderId: 'sender-fallback',
        attachments: [{
          id: undefined,
          fileName: undefined,
          originalName: undefined,
          fileUrl: undefined,
          mimeType: undefined,
          fileSize: 0,
          thumbnailUrl: undefined,
          isAnonymous: false,
          uploadedBy: undefined,
          isForwarded: false,
          isViewOnce: false,
          viewOnceCount: 0,
          isBlurred: false,
          viewedCount: 0,
          downloadedCount: 0,
          consumedCount: 0,
          isEncrypted: false,
        }],
      });
      const msg = svc.transformMessageData(raw);
      const att = msg.attachments![0];

      expect(att.id).toBe('');
      expect(att.fileName).toBe('');
      expect(att.originalName).toBe('');
      expect(att.fileUrl).toBe('');
      expect(att.mimeType).toBe('');
      expect(att.fileSize).toBe(0);
      expect(att.thumbnailUrl).toBeUndefined();
      expect(att.uploadedBy).toBe('sender-fallback');
      expect(att.viewedCount).toBe(0);
      expect(att.downloadedCount).toBe(0);
    });
  });

  // ── transformTranslations — remaining falsy branches ─────────────────────

  describe('transformTranslations — remaining falsy branches', () => {
    it('uses empty string when targetLanguage is missing', () => {
      const raw = makeRawMessage({
        translations: [makeRawTranslation({ targetLanguage: undefined })],
      });
      const msg = svc.transformMessageData(raw);
      expect(msg.translations[0].targetLanguage).toBe('');
    });

    it('uses empty string when translatedContent is missing', () => {
      const raw = makeRawMessage({
        translations: [makeRawTranslation({ translatedContent: undefined })],
      });
      const msg = svc.transformMessageData(raw);
      expect(msg.translations[0].translatedContent).toBe('');
    });

    it('uses current date when translation createdAt is missing', () => {
      const raw = makeRawMessage({
        translations: [makeRawTranslation({ createdAt: undefined })],
      });
      const msg = svc.transformMessageData(raw);
      expect(msg.translations[0].createdAt).toBeInstanceOf(Date);
      expect(msg.translations[0].createdAt.getFullYear()).toBeGreaterThanOrEqual(2026);
    });
  });

  // ── transformConversationData — nullable fields ───────────────────────────

  describe('transformConversationData — nullable isActive/isArchived', () => {
    it('defaults isActive to true when field is undefined', () => {
      const raw = makeRawConversation({ isActive: undefined });
      const conv = svc.transformConversationData(raw);
      expect(conv.isActive).toBe(true);
    });

    it('defaults isArchived to false when field is undefined', () => {
      const raw = makeRawConversation({ isArchived: undefined });
      const conv = svc.transformConversationData(raw);
      expect(conv.isArchived).toBe(false);
    });

    it('uses "direct" type when type is undefined', () => {
      const raw = makeRawConversation({ type: undefined });
      const conv = svc.transformConversationData(raw);
      expect(conv.type).toBe('direct');
    });
  });

  // ── transformSender — lastName from nestedUser ────────────────────────────

  describe('transformSender — nestedUser lastName branch', () => {
    it('uses nestedUser lastName when flat lastName is missing', () => {
      const raw = makeRawMessage({
        sender: {
          id: 'part-3',
          userId: 'user-3',
          lastName: undefined,
          user: {
            id: 'user-3',
            username: 'frank',
            lastName: 'Franklin',
            displayName: 'Frank F.',
          },
        },
      });
      const msg = svc.transformMessageData(raw);
      expect(msg.sender.lastName).toBe('Franklin');
    });
  });
});
