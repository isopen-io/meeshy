/**
 * Smoke tests for barrel index files to ensure all re-exports are present.
 */

jest.mock('@/hooks/v2/use-conversations-v2', () => ({ useConversationsV2: jest.fn() }));
jest.mock('@/hooks/v2/use-contacts-v2', () => ({ useContactsV2: jest.fn() }));
jest.mock('@/hooks/v2/use-friend-requests-v2', () => ({ useFriendRequestsV2: jest.fn() }));
jest.mock('@/hooks/v2/use-blocked-users-v2', () => ({ useBlockedUsersV2: jest.fn() }));
jest.mock('@/hooks/v2/use-profile-v2', () => ({ useProfileV2: jest.fn() }));

jest.mock('@/hooks/conversations/useConversationSelection', () => ({ useConversationSelection: jest.fn() }));
jest.mock('@/hooks/conversations/useConversationUI', () => ({ useConversationUI: jest.fn() }));
jest.mock('@/hooks/conversations/useConversationTyping', () => ({ useConversationTyping: jest.fn() }));
jest.mock('@/hooks/conversations/useComposerDrafts', () => ({ useComposerDrafts: jest.fn() }));
jest.mock('@/hooks/conversations/useMessageActions', () => ({ useMessageActions: jest.fn() }));
jest.mock('@/hooks/conversations/use-participants', () => ({ useParticipants: jest.fn() }));
jest.mock('@/hooks/conversations/use-translation-state', () => ({ useTranslationState: jest.fn() }));
jest.mock('@/hooks/conversations/use-video-call', () => ({ useVideoCall: jest.fn() }));

jest.mock('@/hooks/composer/useAttachmentUpload', () => ({ useAttachmentUpload: jest.fn() }));
jest.mock('@/hooks/composer/useAudioRecorder', () => ({ useAudioRecorder: jest.fn() }));
jest.mock('@/hooks/composer/useMentions', () => ({ useMentions: jest.fn() }));
jest.mock('@/hooks/composer/useTextareaAutosize', () => ({ useTextareaAutosize: jest.fn() }));

import * as v2Barrel from '@/hooks/v2';
import * as conversationsBarrel from '@/hooks/conversations';
import * as composerBarrel from '@/hooks/composer';

// ─── hooks/v2/index.ts ────────────────────────────────────────────────────────

describe('hooks/v2 barrel', () => {
  it('exports useConversationsV2', () => {
    expect(typeof v2Barrel.useConversationsV2).toBe('function');
  });

  it('exports useContactsV2', () => {
    expect(typeof v2Barrel.useContactsV2).toBe('function');
  });

  it('exports useFriendRequestsV2', () => {
    expect(typeof v2Barrel.useFriendRequestsV2).toBe('function');
  });

  it('exports useBlockedUsersV2', () => {
    expect(typeof v2Barrel.useBlockedUsersV2).toBe('function');
  });

  it('exports useProfileV2', () => {
    expect(typeof v2Barrel.useProfileV2).toBe('function');
  });
});

// ─── hooks/conversations/index.ts ─────────────────────────────────────────────

describe('hooks/conversations barrel', () => {
  it('exports useConversationSelection', () => {
    expect(typeof conversationsBarrel.useConversationSelection).toBe('function');
  });

  it('exports useConversationUI', () => {
    expect(typeof conversationsBarrel.useConversationUI).toBe('function');
  });

  it('exports useConversationTyping', () => {
    expect(typeof conversationsBarrel.useConversationTyping).toBe('function');
  });

  it('exports useComposerDrafts', () => {
    expect(typeof conversationsBarrel.useComposerDrafts).toBe('function');
  });

  it('exports useMessageActions', () => {
    expect(typeof conversationsBarrel.useMessageActions).toBe('function');
  });

  it('exports useParticipants', () => {
    expect(typeof conversationsBarrel.useParticipants).toBe('function');
  });

  it('exports useTranslationState', () => {
    expect(typeof conversationsBarrel.useTranslationState).toBe('function');
  });

  it('exports useVideoCall', () => {
    expect(typeof conversationsBarrel.useVideoCall).toBe('function');
  });
});

// ─── hooks/composer/index.ts ──────────────────────────────────────────────────

describe('hooks/composer barrel', () => {
  it('exports useAttachmentUpload', () => {
    expect(typeof composerBarrel.useAttachmentUpload).toBe('function');
  });

  it('exports useAudioRecorder', () => {
    expect(typeof composerBarrel.useAudioRecorder).toBe('function');
  });

  it('exports useMentions', () => {
    expect(typeof composerBarrel.useMentions).toBe('function');
  });

  it('exports useTextareaAutosize', () => {
    expect(typeof composerBarrel.useTextareaAutosize).toBe('function');
  });
});
