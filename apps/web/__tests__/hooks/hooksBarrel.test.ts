/**
 * Smoke tests for hooks/index.ts barrel to ensure all re-exports are present.
 */

jest.mock('@/hooks/use-socketio-messaging', () => ({ useSocketIOMessaging: jest.fn() }));
jest.mock('@/hooks/use-messaging', () => ({ useMessaging: jest.fn() }));
jest.mock('@/hooks/useMessageTranslation', () => ({ useMessageTranslation: jest.fn() }));
jest.mock('@/hooks/useI18n', () => ({ useI18n: jest.fn() }));
jest.mock('@/hooks/use-message-translations', () => ({ useMessageTranslations: jest.fn() }));
jest.mock('@/hooks/queries/use-conversation-messages-rq', () => ({
  useConversationMessagesRQ: jest.fn(),
}));
jest.mock('@/hooks/use-language', () => ({ useLanguage: jest.fn() }));
jest.mock('@/hooks/use-font-preference', () => ({ useFontPreference: jest.fn() }));
jest.mock('@/hooks/use-fix-z-index', () => ({ useFixRadixZIndex: jest.fn() }));
jest.mock('@/hooks/use-auth', () => ({ useAuth: jest.fn() }));
jest.mock('@/hooks/use-auth-guard', () => ({ useAuthGuard: jest.fn() }));
jest.mock('@/hooks/use-encryption', () => ({
  useEncryption: jest.fn(),
  getEncryptionService: jest.fn(),
}));
jest.mock('@/hooks/conversations', () => ({
  useConversationSelection: jest.fn(),
  useConversationUI: jest.fn(),
  useConversationTyping: jest.fn(),
  useComposerDrafts: jest.fn(),
  useMessageActions: jest.fn(),
}));
jest.mock('@/hooks/composer', () => ({
  useAttachmentUpload: jest.fn(),
  useAudioRecorder: jest.fn(),
  useMentions: jest.fn(),
  useTextareaAutosize: jest.fn(),
}));
jest.mock('@/hooks/use-video-playback', () => ({ useVideoPlayback: jest.fn() }));
jest.mock('@/hooks/use-fullscreen', () => ({ useFullscreen: jest.fn() }));
jest.mock('@/hooks/use-volume', () => ({ useVolume: jest.fn() }));
jest.mock('@/hooks/use-contacts-data', () => ({ useContactsData: jest.fn() }));
jest.mock('@/hooks/use-contacts-filtering', () => ({ useContactsFiltering: jest.fn() }));
jest.mock('@/hooks/use-contacts-actions', () => ({ useContactsActions: jest.fn() }));

import * as hooksBarrel from '@/hooks';

describe('hooks/index.ts barrel', () => {
  it('exports useSocketIOMessaging', () => expect(typeof hooksBarrel.useSocketIOMessaging).toBe('function'));
  it('exports useMessaging', () => expect(typeof hooksBarrel.useMessaging).toBe('function'));
  it('exports useMessageTranslation', () => expect(typeof hooksBarrel.useMessageTranslation).toBe('function'));
  it('exports useI18n', () => expect(typeof hooksBarrel.useI18n).toBe('function'));
  it('exports useMessageTranslations', () => expect(typeof hooksBarrel.useMessageTranslations).toBe('function'));
  it('exports useConversationMessages', () => expect(typeof hooksBarrel.useConversationMessages).toBe('function'));
  it('exports useLanguage', () => expect(typeof hooksBarrel.useLanguage).toBe('function'));
  it('exports useFontPreference', () => expect(typeof hooksBarrel.useFontPreference).toBe('function'));
  it('exports useFixRadixZIndex', () => expect(typeof hooksBarrel.useFixRadixZIndex).toBe('function'));
  it('exports useAuth', () => expect(typeof hooksBarrel.useAuth).toBe('function'));
  it('exports useAuthGuard', () => expect(typeof hooksBarrel.useAuthGuard).toBe('function'));
  it('exports useEncryption', () => expect(typeof hooksBarrel.useEncryption).toBe('function'));
  it('exports getEncryptionService', () => expect(typeof hooksBarrel.getEncryptionService).toBe('function'));
  it('exports useConversationSelection', () => expect(typeof hooksBarrel.useConversationSelection).toBe('function'));
  it('exports useConversationUI', () => expect(typeof hooksBarrel.useConversationUI).toBe('function'));
  it('exports useConversationTyping', () => expect(typeof hooksBarrel.useConversationTyping).toBe('function'));
  it('exports useComposerDrafts', () => expect(typeof hooksBarrel.useComposerDrafts).toBe('function'));
  it('exports useMessageActions', () => expect(typeof hooksBarrel.useMessageActions).toBe('function'));
  it('exports useAttachmentUpload', () => expect(typeof hooksBarrel.useAttachmentUpload).toBe('function'));
  it('exports useAudioRecorder', () => expect(typeof hooksBarrel.useAudioRecorder).toBe('function'));
  it('exports useMentions', () => expect(typeof hooksBarrel.useMentions).toBe('function'));
  it('exports useTextareaAutosize', () => expect(typeof hooksBarrel.useTextareaAutosize).toBe('function'));
  it('exports useVideoPlayback', () => expect(typeof hooksBarrel.useVideoPlayback).toBe('function'));
  it('exports useFullscreen', () => expect(typeof hooksBarrel.useFullscreen).toBe('function'));
  it('exports useVolume', () => expect(typeof hooksBarrel.useVolume).toBe('function'));
  it('exports useContactsData', () => expect(typeof hooksBarrel.useContactsData).toBe('function'));
  it('exports useContactsFiltering', () => expect(typeof hooksBarrel.useContactsFiltering).toBe('function'));
  it('exports useContactsActions', () => expect(typeof hooksBarrel.useContactsActions).toBe('function'));
});
