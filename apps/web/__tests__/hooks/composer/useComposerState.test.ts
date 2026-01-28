// apps/web/__tests__/hooks/composer/useComposerState.test.ts
import { renderHook, act } from '@testing-library/react';
import { useComposerState } from '@/hooks/composer/useComposerState';

// Mock all the dependencies
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

jest.mock('@/stores/reply-store', () => ({
  useReplyStore: () => ({
    replyingTo: null,
    clearReply: jest.fn(),
  }),
}));

jest.mock('@/lib/constants/languages', () => ({
  getMaxMessageLength: () => 1000,
}));

jest.mock('@/hooks/composer/useTextareaAutosize', () => ({
  useTextareaAutosize: () => ({
    textareaRef: { current: null },
    handleTextareaChange: jest.fn(),
    resetTextareaSize: jest.fn(),
    focus: jest.fn(),
    blur: jest.fn(),
  }),
}));

jest.mock('@/hooks/composer/useAttachmentUpload', () => ({
  useAttachmentUpload: () => ({
    selectedFiles: [],
    uploadedAttachments: [],
    isUploading: false,
    isCompressing: false,
    compressionProgress: {},
    handleFilesSelected: jest.fn(),
    clearAttachments: jest.fn(),
  }),
}));

jest.mock('@/hooks/composer/useAudioRecorder', () => ({
  useAudioRecorder: () => ({
    isRecording: false,
    showAudioRecorder: false,
    resetAudioState: jest.fn(),
  }),
}));

jest.mock('@/hooks/composer/useMentions', () => ({
  useMentions: () => ({
    handleTextChange: jest.fn(),
    clearMentionedUserIds: jest.fn(),
  }),
}));

jest.mock('@/hooks/composer/useDraftAutosave', () => ({
  useDraftAutosave: () => ({
    saveDraft: jest.fn(),
    clearDraft: jest.fn(),
  }),
}));

describe('useComposerState', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockProps = {
    value: '',
    onChange: jest.fn(),
    onSend: jest.fn(),
    selectedLanguage: 'fr',
    onLanguageChange: jest.fn(),
    isComposingEnabled: true,
  };

  it('should compute hasContent correctly', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useComposerState({ ...mockProps, value }),
      { initialProps: { value: '' } }
    );

    expect(result.current.hasContent).toBe(false);

    rerender({ value: 'Hello' });
    expect(result.current.hasContent).toBe(true);
  });

  it('should compute canSend correctly', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useComposerState({ ...mockProps, value }),
      { initialProps: { value: '' } }
    );

    expect(result.current.canSend).toBe(false);

    rerender({ value: 'Test message' });
    expect(result.current.canSend).toBe(true);
  });

  it('should compute glow color based on length', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useComposerState({ ...mockProps, value, userRole: 'user' }),
      { initialProps: { value: '' } }
    );

    // 0-50%: blue
    expect(result.current.glowColor).toBe('rgba(59, 130, 246, 0.4)');

    // 50-90%: violet (assume max 1000 chars)
    rerender({ value: 'a'.repeat(600) });
    expect(result.current.glowColor).toBe('rgba(139, 92, 246, 0.4)');

    // 90-100%: pink
    rerender({ value: 'a'.repeat(950) });
    expect(result.current.glowColor).toBe('rgba(236, 72, 153, 0.4)');

    // >100%: red
    rerender({ value: 'a'.repeat(1100) });
    expect(result.current.glowColor).toBe('rgba(239, 68, 68, 0.5)');
  });

  it('should track typing state', async () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useComposerState(mockProps));

    expect(result.current.isTyping).toBe(false);

    act(() => {
      result.current.handleTextareaChangeComplete({
        target: { value: 'Hello', selectionStart: 5 }
      } as any);
    });

    expect(result.current.isTyping).toBe(true);

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(result.current.isTyping).toBe(false);

    jest.useRealTimers();
  });
});
