# MessageComposer Refactor - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactoriser MessageComposer en composant ultra-minimaliste avec animations fluides, glassmorphisme premium, et support complet desktop/mobile incluant édition de messages, auto-save brouillons, paste images, retry automatique uploads.

**Architecture:** Architecture modulaire avec hooks spécialisés (useComposerState, useComposerAnimations, useComposerKeyboard), système de performance adaptative (high/medium/low profiles), et composants découplés par section (Reply, Attachment, Textarea, Toolbar, SendButton).

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Framer Motion (animations), use-debounce, sonner (toasts), lucide-react (icons)

---

## Phase 1: Foundation & Core Infrastructure (Parallélisable)

### Task 1.1: Setup Performance Detection System

**Files:**
- Create: `apps/web/hooks/usePerformanceProfile.ts`
- Create: `apps/web/constants/animations.ts`
- Test: `apps/web/__tests__/hooks/usePerformanceProfile.test.ts`

**Step 1: Write the failing test**

```typescript
// apps/web/__tests__/hooks/usePerformanceProfile.test.ts
import { renderHook } from '@testing-library/react';
import { usePerformanceProfile } from '@/hooks/usePerformanceProfile';

describe('usePerformanceProfile', () => {
  it('should detect high performance profile on capable device', () => {
    // Mock navigator properties
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: 8, configurable: true });
    Object.defineProperty(navigator, 'deviceMemory', { value: 8, configurable: true });

    const { result } = renderHook(() => usePerformanceProfile());

    expect(result.current).toBe('high');
  });

  it('should detect low performance profile on constrained device', () => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: 2, configurable: true });
    Object.defineProperty(navigator, 'deviceMemory', { value: 2, configurable: true });

    const { result } = renderHook(() => usePerformanceProfile());

    expect(result.current).toBe('low');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm test usePerformanceProfile.test.ts`
Expected: FAIL with "Cannot find module '@/hooks/usePerformanceProfile'"

**Step 3: Write minimal implementation**

```typescript
// apps/web/hooks/usePerformanceProfile.ts
import { useState, useEffect } from 'react';

export type PerformanceProfile = 'high' | 'medium' | 'low';

export const usePerformanceProfile = (): PerformanceProfile => {
  const [profile, setProfile] = useState<PerformanceProfile>('high');

  useEffect(() => {
    const cores = navigator.hardwareConcurrency || 4;
    const memory = (navigator as any).deviceMemory || 4;
    const connection = (navigator as any).connection;
    const isSlowConnection = connection?.effectiveType === '2g' ||
                             connection?.effectiveType === 'slow-2g';

    if (cores <= 2 || memory <= 2 || isSlowConnection) {
      setProfile('low');
    } else if (cores <= 4 || memory <= 4) {
      setProfile('medium');
    }

    // Performance test
    const startTime = performance.now();
    requestAnimationFrame(() => {
      const frameDuration = performance.now() - startTime;
      if (frameDuration > 32) {
        setProfile('low');
      }
    });
  }, []);

  return profile;
};
```

**Step 4: Create animation config constants**

```typescript
// apps/web/constants/animations.ts
import { PerformanceProfile } from '@/hooks/usePerformanceProfile';

export interface AnimationConfig {
  blur: string;
  sendButtonDuration: number;
  enableRotation: boolean;
  enableGradient: boolean;
  enableShimmer: boolean;
  staggerDelay: number;
  dropdownAnimation: 'radial' | 'scale' | 'fade';
}

export const getAnimationConfig = (profile: PerformanceProfile): AnimationConfig => {
  switch (profile) {
    case 'high':
      return {
        blur: 'blur(20px)',
        sendButtonDuration: 400,
        enableRotation: true,
        enableGradient: true,
        enableShimmer: true,
        staggerDelay: 30,
        dropdownAnimation: 'radial',
      };

    case 'medium':
      return {
        blur: 'blur(16px)',
        sendButtonDuration: 300,
        enableRotation: false,
        enableGradient: true,
        enableShimmer: false,
        staggerDelay: 50,
        dropdownAnimation: 'scale',
      };

    case 'low':
      return {
        blur: 'blur(8px)',
        sendButtonDuration: 200,
        enableRotation: false,
        enableGradient: false,
        enableShimmer: false,
        staggerDelay: 0,
        dropdownAnimation: 'fade',
      };
  }
};
```

**Step 5: Run tests to verify they pass**

Run: `cd apps/web && pnpm test usePerformanceProfile.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add apps/web/hooks/usePerformanceProfile.ts apps/web/constants/animations.ts apps/web/__tests__/hooks/usePerformanceProfile.test.ts
git commit -m "feat(composer): add performance detection system

- Add usePerformanceProfile hook with device capability detection
- Add animation config by performance profile (high/medium/low)
- Include tests for performance profile detection

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 1.2: Create Draft Autosave Hook (Priorité HAUTE - Parallèle avec 1.1)

**Files:**
- Create: `apps/web/hooks/composer/useDraftAutosave.ts`
- Test: `apps/web/__tests__/hooks/composer/useDraftAutosave.test.ts`

**Step 1: Write the failing test**

```typescript
// apps/web/__tests__/hooks/composer/useDraftAutosave.test.ts
import { renderHook, act, waitFor } from '@testing-library/react';
import { useDraftAutosave } from '@/hooks/composer/useDraftAutosave';

describe('useDraftAutosave', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should save draft to localStorage after debounce', async () => {
    const conversationId = 'conv-123';
    const { result } = renderHook(() =>
      useDraftAutosave({ conversationId, enabled: true })
    );

    act(() => {
      result.current.saveDraft('Hello world');
    });

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    const saved = localStorage.getItem(`draft-${conversationId}`);
    expect(saved).toBe('Hello world');
  });

  it('should restore draft on mount', () => {
    const conversationId = 'conv-456';
    localStorage.setItem(`draft-${conversationId}`, 'Restored message');

    const { result } = renderHook(() =>
      useDraftAutosave({ conversationId, enabled: true })
    );

    expect(result.current.draft).toBe('Restored message');
  });

  it('should clear draft after successful send', () => {
    const conversationId = 'conv-789';
    localStorage.setItem(`draft-${conversationId}`, 'To be cleared');

    const { result } = renderHook(() =>
      useDraftAutosave({ conversationId, enabled: true })
    );

    act(() => {
      result.current.clearDraft();
    });

    expect(localStorage.getItem(`draft-${conversationId}`)).toBeNull();
    expect(result.current.draft).toBe('');
  });

  it('should auto-clear draft older than 24h', () => {
    const conversationId = 'conv-old';
    const oldTimestamp = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago

    localStorage.setItem(`draft-${conversationId}`, JSON.stringify({
      content: 'Old draft',
      timestamp: oldTimestamp
    }));

    const { result } = renderHook(() =>
      useDraftAutosave({ conversationId, enabled: true })
    );

    expect(result.current.draft).toBe('');
    expect(localStorage.getItem(`draft-${conversationId}`)).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm test useDraftAutosave.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
// apps/web/hooks/composer/useDraftAutosave.ts
import { useState, useEffect, useCallback } from 'react';
import { useDebouncedCallback } from 'use-debounce';

interface UseDraftAutosaveProps {
  conversationId?: string;
  enabled?: boolean;
}

interface DraftData {
  content: string;
  timestamp: number;
}

const DRAFT_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

export const useDraftAutosave = ({
  conversationId,
  enabled = true
}: UseDraftAutosaveProps) => {
  const [draft, setDraft] = useState<string>('');
  const storageKey = conversationId ? `draft-${conversationId}` : null;

  // Restore draft on mount
  useEffect(() => {
    if (!storageKey || !enabled) return;

    try {
      const saved = localStorage.getItem(storageKey);
      if (!saved) return;

      const parsed: DraftData = JSON.parse(saved);
      const age = Date.now() - parsed.timestamp;

      if (age > DRAFT_EXPIRY_MS) {
        localStorage.removeItem(storageKey);
        return;
      }

      setDraft(parsed.content);
    } catch (error) {
      console.error('Failed to restore draft:', error);
      if (storageKey) {
        localStorage.removeItem(storageKey);
      }
    }
  }, [storageKey, enabled]);

  // Save draft with debounce
  const saveDraftDebounced = useDebouncedCallback((content: string) => {
    if (!storageKey || !enabled) return;

    try {
      if (!content.trim()) {
        localStorage.removeItem(storageKey);
        return;
      }

      const data: DraftData = {
        content,
        timestamp: Date.now()
      };

      localStorage.setItem(storageKey, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save draft:', error);
    }
  }, 2000); // 2 seconds debounce

  const saveDraft = useCallback((content: string) => {
    setDraft(content);
    saveDraftDebounced(content);
  }, [saveDraftDebounced]);

  const clearDraft = useCallback(() => {
    setDraft('');
    if (storageKey) {
      localStorage.removeItem(storageKey);
    }
  }, [storageKey]);

  return {
    draft,
    saveDraft,
    clearDraft,
  };
};
```

**Step 4: Run tests to verify they pass**

Run: `cd apps/web && pnpm test useDraftAutosave.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/hooks/composer/useDraftAutosave.ts apps/web/__tests__/hooks/composer/useDraftAutosave.test.ts
git commit -m "feat(composer): add draft autosave hook

- Auto-save drafts to localStorage every 2s
- Restore drafts on mount
- Auto-expire drafts after 24h
- Clear draft on send

Priorité HAUTE

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 1.3: Create Upload Retry Hook (Priorité MOYENNE - Parallèle avec 1.1 et 1.2)

**Files:**
- Create: `apps/web/hooks/composer/useUploadRetry.ts`
- Test: `apps/web/__tests__/hooks/composer/useUploadRetry.test.ts`

**Step 1: Write the failing test**

```typescript
// apps/web/__tests__/hooks/composer/useUploadRetry.test.ts
import { renderHook, act, waitFor } from '@testing-library/react';
import { useUploadRetry } from '@/hooks/composer/useUploadRetry';

describe('useUploadRetry', () => {
  jest.useFakeTimers();

  it('should retry failed upload with exponential backoff', async () => {
    const uploadFn = jest.fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({ success: true, attachmentId: 'file-123' });

    const { result } = renderHook(() => useUploadRetry({ maxRetries: 3 }));

    const promise = act(() => {
      return result.current.uploadWithRetry('test-file', uploadFn);
    });

    // First attempt fails immediately
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });

    // Retry 1 after 1s
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1000);
    });

    // Retry 2 after 2s
    await act(async () => {
      await jest.advanceTimersByTimeAsync(2000);
    });

    const result = await promise;

    expect(uploadFn).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ success: true, attachmentId: 'file-123' });
  });

  it('should fail after max retries', async () => {
    const uploadFn = jest.fn().mockRejectedValue(new Error('Permanent error'));

    const { result } = renderHook(() => useUploadRetry({ maxRetries: 2 }));

    await expect(
      act(() => result.current.uploadWithRetry('test-file', uploadFn))
    ).rejects.toThrow('Permanent error');

    expect(uploadFn).toHaveBeenCalledTimes(3); // Initial + 2 retries
  });

  it('should track retry attempts', async () => {
    const uploadFn = jest.fn()
      .mockRejectedValueOnce(new Error('Error'))
      .mockResolvedValueOnce({ success: true });

    const { result } = renderHook(() => useUploadRetry({ maxRetries: 3 }));

    act(() => {
      result.current.uploadWithRetry('test-file', uploadFn);
    });

    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });

    expect(result.current.retryStatus['test-file']).toEqual({
      attempt: 1,
      maxRetries: 3,
      isRetrying: true
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm test useUploadRetry.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

```typescript
// apps/web/hooks/composer/useUploadRetry.ts
import { useState, useCallback } from 'react';

interface RetryStatus {
  attempt: number;
  maxRetries: number;
  isRetrying: boolean;
}

interface UseUploadRetryProps {
  maxRetries?: number;
}

type UploadFunction = () => Promise<any>;

export const useUploadRetry = ({ maxRetries = 3 }: UseUploadRetryProps = {}) => {
  const [retryStatus, setRetryStatus] = useState<Record<string, RetryStatus>>({});

  const uploadWithRetry = useCallback(
    async (fileId: string, uploadFn: UploadFunction): Promise<any> => {
      let lastError: Error | null = null;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          // Update status
          setRetryStatus(prev => ({
            ...prev,
            [fileId]: {
              attempt,
              maxRetries,
              isRetrying: attempt > 0
            }
          }));

          // Attempt upload
          const result = await uploadFn();

          // Success - clear status
          setRetryStatus(prev => {
            const { [fileId]: _, ...rest } = prev;
            return rest;
          });

          return result;

        } catch (error) {
          lastError = error as Error;

          // Don't wait after last attempt
          if (attempt < maxRetries) {
            // Exponential backoff: 1s, 2s, 4s
            const delay = Math.pow(2, attempt) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      // All retries failed - clear status and throw
      setRetryStatus(prev => {
        const { [fileId]: _, ...rest } = prev;
        return rest;
      });

      throw lastError;
    },
    [maxRetries]
  );

  const clearRetryStatus = useCallback((fileId: string) => {
    setRetryStatus(prev => {
      const { [fileId]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  return {
    uploadWithRetry,
    retryStatus,
    clearRetryStatus,
  };
};
```

**Step 4: Run tests to verify they pass**

Run: `cd apps/web && pnpm test useUploadRetry.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/hooks/composer/useUploadRetry.ts apps/web/__tests__/hooks/composer/useUploadRetry.test.ts
git commit -m "feat(composer): add upload retry hook with exponential backoff

- Retry failed uploads up to 3 times
- Exponential backoff: 1s, 2s, 4s
- Track retry attempts per file
- Clear status on success or final failure

Priorité MOYENNE

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Phase 2: Core Composer State & Logic (Dépend de Phase 1)

### Task 2.1: Create Main Composer State Hook

**Files:**
- Create: `apps/web/hooks/composer/useComposerState.ts`
- Test: `apps/web/__tests__/hooks/composer/useComposerState.test.ts`

**Step 1: Write the failing test**

```typescript
// apps/web/__tests__/hooks/composer/useComposerState.test.ts
import { renderHook, act } from '@testing-library/react';
import { useComposerState } from '@/hooks/composer/useComposerState';

describe('useComposerState', () => {
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
    const { result } = renderHook(() => useComposerState(mockProps));

    expect(result.current.canSend).toBe(false);

    act(() => {
      mockProps.onChange('Test message');
    });

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
```

**Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm test useComposerState.test.ts`
Expected: FAIL

**Step 3: Write implementation** (Voir le design doc, Section 10 pour le code complet)

```typescript
// apps/web/hooks/composer/useComposerState.ts
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { useReplyStore } from '@/stores/reply-store';
import { getMaxMessageLength } from '@/lib/constants/languages';
import { useTextareaAutosize } from '@/hooks/composer/useTextareaAutosize';
import { useAttachmentUpload } from '@/hooks/composer/useAttachmentUpload';
import { useAudioRecorder } from '@/hooks/composer/useAudioRecorder';
import { useMentions } from '@/hooks/composer/useMentions';
import { useDraftAutosave } from '@/hooks/composer/useDraftAutosave';

interface MessageComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  selectedLanguage: string;
  onLanguageChange: (language: string) => void;
  location?: string;
  isComposingEnabled?: boolean;
  placeholder?: string;
  onKeyPress?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  className?: string;
  choices?: any[];
  onAttachmentsChange?: (attachmentIds: string[], mimeTypes: string[]) => void;
  token?: string;
  userRole?: string;
  conversationId?: string;
}

export const useComposerState = (props: MessageComposerProps) => {
  const { t } = useI18n('conversations');
  const { replyingTo, clearReply } = useReplyStore();
  const maxMessageLength = getMaxMessageLength(props.userRole);

  // Mobile detection
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Textarea autosize
  const {
    textareaRef,
    handleTextareaChange: handleAutosize,
    resetTextareaSize,
    focus,
    blur,
  } = useTextareaAutosize({ minHeight: 80, maxHeight: 160, isMobile });

  // Attachments
  const attachmentState = useAttachmentUpload({
    token: props.token,
    maxAttachments: 50,
    onAttachmentsChange: props.onAttachmentsChange,
    t,
  });

  // Audio recorder
  const audioState = useAudioRecorder({
    onAudioReady: attachmentState.handleFilesSelected,
  });

  // Mentions
  const mentionState = useMentions({
    conversationId: props.conversationId
  });

  // Draft autosave
  const { saveDraft, clearDraft } = useDraftAutosave({
    conversationId: props.conversationId,
    enabled: true,
  });

  // Typing state & glow color
  const [isTyping, setIsTyping] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();

  const glowColor = useMemo(() => {
    const percentage = (props.value.length / maxMessageLength) * 100;
    if (percentage < 50) return 'rgba(59, 130, 246, 0.4)';
    if (percentage < 90) return 'rgba(139, 92, 246, 0.4)';
    if (percentage < 100) return 'rgba(236, 72, 153, 0.4)';
    return 'rgba(239, 68, 68, 0.5)';
  }, [props.value.length, maxMessageLength]);

  // Toolbar visibility
  const [toolbarVisible, setToolbarVisible] = useState(false);

  // Computed values
  const hasContent = useMemo(() => {
    return props.value.trim() ||
           attachmentState.selectedFiles.length > 0 ||
           attachmentState.uploadedAttachments.length > 0;
  }, [props.value, attachmentState.selectedFiles.length, attachmentState.uploadedAttachments.length]);

  const activeSections = useMemo(() => ({
    hasReply: !!replyingTo,
    hasAttachments: attachmentState.selectedFiles.length > 0 || audioState.showAudioRecorder,
    hasCompression: attachmentState.isCompressing && Object.keys(attachmentState.compressionProgress).length > 0,
  }), [replyingTo, attachmentState.selectedFiles.length, audioState.showAudioRecorder, attachmentState.isCompressing, attachmentState.compressionProgress]);

  const canSend = useMemo(() => {
    return hasContent &&
           props.value.length <= maxMessageLength &&
           props.isComposingEnabled &&
           !attachmentState.isUploading &&
           !attachmentState.isCompressing &&
           !audioState.isRecording &&
           (attachmentState.selectedFiles.length + attachmentState.uploadedAttachments.length) <= 50;
  }, [hasContent, props.value.length, maxMessageLength, props.isComposingEnabled, attachmentState.isUploading, attachmentState.isCompressing, audioState.isRecording, attachmentState.selectedFiles.length, attachmentState.uploadedAttachments.length]);

  // Handlers
  const handleTextareaChangeComplete = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    props.onChange(newValue);
    handleAutosize(e);

    // Save draft
    saveDraft(newValue);

    // Typing state
    setIsTyping(true);
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 1000);

    // Mention detection
    const cursorPosition = e.target.selectionStart;
    mentionState.handleTextChange(newValue, cursorPosition, textareaRef.current);
  }, [props.onChange, handleAutosize, saveDraft, mentionState.handleTextChange]);

  const handleSendMessage = useCallback(() => {
    props.onSend();
    resetTextareaSize();
    mentionState.clearMentionedUserIds();
    clearDraft();
    setIsTyping(false);
  }, [props.onSend, resetTextareaSize, mentionState.clearMentionedUserIds, clearDraft]);

  const clearAttachments = useCallback(() => {
    attachmentState.clearAttachments();
    audioState.resetAudioState();
  }, [attachmentState.clearAttachments, audioState.resetAudioState]);

  return {
    // Refs
    textareaRef,

    // State
    isMobile,
    isTyping,
    toolbarVisible,
    setToolbarVisible,
    hasContent,
    canSend,
    glowColor,
    maxMessageLength,
    finalPlaceholder: props.placeholder || t('writeMessage'),
    activeSections,
    replyingTo,

    // Attachments
    ...attachmentState,

    // Audio
    ...audioState,

    // Mentions
    ...mentionState,

    // Methods
    focus,
    blur,
    handleTextareaChangeComplete,
    handleSendMessage,
    clearAttachments,
    clearReply,
    resetTextareaSize,
  };
};
```

**Step 4: Run tests to verify they pass**

Run: `cd apps/web && pnpm test useComposerState.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/hooks/composer/useComposerState.ts apps/web/__tests__/hooks/composer/useComposerState.test.ts
git commit -m "feat(composer): add main composer state hook

- Centralize all composer state logic
- Compute hasContent, canSend, glowColor
- Integrate draft autosave
- Track typing state
- Manage attachments, audio, mentions

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Phase 3: UI Components (Parallélisable après Phase 2)

### Task 3.1: Create SendButton Component with Animations

**Files:**
- Create: `apps/web/components/common/message-composer/SendButton.tsx`
- Create: `apps/web/components/common/message-composer/SendButton.module.css`
- Test: `apps/web/__tests__/components/common/message-composer/SendButton.test.tsx`

**Step 1: Write the failing test**

```typescript
// apps/web/__tests__/components/common/message-composer/SendButton.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { SendButton } from '@/components/common/message-composer/SendButton';

describe('SendButton', () => {
  it('should not render when not visible', () => {
    const { container } = render(
      <SendButton
        isVisible={false}
        canSend={false}
        onClick={jest.fn()}
        performanceProfile="high"
        animConfig={{
          sendButtonDuration: 400,
          enableRotation: true,
          enableGradient: true,
        }}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('should render with gradient when visible and high performance', () => {
    render(
      <SendButton
        isVisible={true}
        canSend={true}
        onClick={jest.fn()}
        performanceProfile="high"
        animConfig={{
          sendButtonDuration: 400,
          enableRotation: true,
          enableGradient: true,
        }}
      />
    );

    const button = screen.getByRole('button', { name: /envoyer/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass('with-gradient');
  });

  it('should call onClick when clicked', () => {
    const handleClick = jest.fn();
    render(
      <SendButton
        isVisible={true}
        canSend={true}
        onClick={handleClick}
        performanceProfile="high"
        animConfig={{
          sendButtonDuration: 400,
          enableRotation: true,
          enableGradient: true,
        }}
      />
    );

    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('should be disabled when canSend is false', () => {
    render(
      <SendButton
        isVisible={true}
        canSend={false}
        onClick={jest.fn()}
        performanceProfile="high"
        animConfig={{
          sendButtonDuration: 400,
          enableRotation: true,
          enableGradient: true,
        }}
      />
    );

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm test SendButton.test.tsx`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// apps/web/components/common/message-composer/SendButton.tsx
'use client';

import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AnimationConfig } from '@/constants/animations';
import { PerformanceProfile } from '@/hooks/usePerformanceProfile';
import styles from './SendButton.module.css';

interface SendButtonProps {
  isVisible: boolean;
  canSend: boolean;
  onClick: () => void;
  isCompressing?: boolean;
  isRecording?: boolean;
  isUploading?: boolean;
  performanceProfile: PerformanceProfile;
  animConfig: AnimationConfig;
}

export const SendButton = ({
  isVisible,
  canSend,
  onClick,
  isCompressing,
  isRecording,
  isUploading,
  performanceProfile,
  animConfig,
}: SendButtonProps) => {
  if (!isVisible) return null;

  const getAriaLabel = () => {
    if (isCompressing) return 'Compression en cours';
    if (isRecording) return "Arrêtez l'enregistrement avant d'envoyer";
    if (isUploading) return 'Upload en cours';
    return 'Envoyer le message';
  };

  return (
    <Button
      onClick={onClick}
      disabled={!canSend}
      size="sm"
      className={`
        ${styles.sendButton}
        ${animConfig.enableGradient ? styles.withGradient : styles.solidColor}
        ${animConfig.enableRotation ? styles.withRotation : styles.simpleScale}
        bg-blue-600 hover:bg-blue-700 text-white
        h-6 w-6 sm:h-9 sm:w-9 p-0 rounded-full
        shadow-lg hover:shadow-xl transition-all duration-200
        focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
      `}
      style={{
        animationDuration: `${animConfig.sendButtonDuration}ms`,
      }}
      aria-label={getAriaLabel()}
      aria-keyshortcuts="Enter"
    >
      <Send className="h-3 w-3 sm:h-5 sm:w-5" aria-hidden="true" />
    </Button>
  );
};
```

```css
/* apps/web/components/common/message-composer/SendButton.module.css */
@keyframes sendButtonAppear {
  0% {
    transform: scale(0) rotate(15deg);
    opacity: 0;
  }
  60% {
    transform: scale(1.15) rotate(-3deg);
  }
  100% {
    transform: scale(1) rotate(0deg);
    opacity: 1;
  }
}

@keyframes sendButtonAppearSimple {
  0% {
    transform: scale(0);
    opacity: 0;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

@keyframes gradientShift {
  0%, 100% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
}

.sendButton {
  animation: sendButtonAppear cubic-bezier(0.34, 1.56, 0.64, 1);
  animation-fill-mode: both;
}

.sendButton.simpleScale {
  animation-name: sendButtonAppearSimple;
  animation-timing-function: ease-out;
}

.sendButton.withGradient {
  background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 50%, #3b82f6 100%);
  background-size: 200% 200%;
  animation: sendButtonAppear cubic-bezier(0.34, 1.56, 0.64, 1),
             gradientShift 3s ease infinite;
}

.sendButton.solidColor {
  background: #3b82f6;
}

/* Reduced motion support */
@media (prefers-reduced-motion: reduce) {
  .sendButton {
    animation: none !important;
    opacity: 1;
    transform: none;
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd apps/web && pnpm test SendButton.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/components/common/message-composer/SendButton.tsx apps/web/components/common/message-composer/SendButton.module.css apps/web/__tests__/components/common/message-composer/SendButton.test.tsx
git commit -m "feat(composer): add SendButton with animated appearance

- Scale + rotate + bounce animation
- Gradient background with shift animation (high perf)
- Solid color fallback (low perf)
- Disabled states with contextual labels

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 3.2: Create Clipboard Image Paste Handler (Priorité HAUTE - Parallèle avec 3.1)

**Files:**
- Create: `apps/web/hooks/composer/useClipboardPaste.ts`
- Test: `apps/web/__tests__/hooks/composer/useClipboardPaste.test.ts`

**Step 1: Write the failing test**

```typescript
// apps/web/__tests__/hooks/composer/useClipboardPaste.test.ts
import { renderHook } from '@testing-library/react';
import { useClipboardPaste } from '@/hooks/composer/useClipboardPaste';

describe('useClipboardPaste', () => {
  it('should detect pasted images', async () => {
    const onImagesPasted = jest.fn();
    const { result } = renderHook(() => useClipboardPaste({ onImagesPasted }));

    // Create mock clipboard event
    const mockFile = new File(['image content'], 'test.png', { type: 'image/png' });
    const mockClipboardData = {
      files: [mockFile],
      items: [{
        kind: 'file',
        type: 'image/png',
        getAsFile: () => mockFile
      }]
    };

    const mockEvent = new ClipboardEvent('paste', {
      clipboardData: mockClipboardData as any
    });

    // Simulate paste
    await result.current.handlePaste(mockEvent);

    expect(onImagesPasted).toHaveBeenCalledWith([mockFile]);
  });

  it('should ignore non-image files', async () => {
    const onImagesPasted = jest.fn();
    const { result } = renderHook(() => useClipboardPaste({ onImagesPasted }));

    const mockFile = new File(['text'], 'test.txt', { type: 'text/plain' });
    const mockClipboardData = {
      files: [mockFile],
      items: [{
        kind: 'file',
        type: 'text/plain',
        getAsFile: () => mockFile
      }]
    };

    const mockEvent = new ClipboardEvent('paste', {
      clipboardData: mockClipboardData as any
    });

    await result.current.handlePaste(mockEvent);

    expect(onImagesPasted).not.toHaveBeenCalled();
  });

  it('should handle multiple images', async () => {
    const onImagesPasted = jest.fn();
    const { result } = renderHook(() => useClipboardPaste({ onImagesPasted }));

    const mockFile1 = new File(['img1'], 'test1.png', { type: 'image/png' });
    const mockFile2 = new File(['img2'], 'test2.jpg', { type: 'image/jpeg' });

    const mockClipboardData = {
      files: [mockFile1, mockFile2],
      items: [
        { kind: 'file', type: 'image/png', getAsFile: () => mockFile1 },
        { kind: 'file', type: 'image/jpeg', getAsFile: () => mockFile2 }
      ]
    };

    const mockEvent = new ClipboardEvent('paste', {
      clipboardData: mockClipboardData as any
    });

    await result.current.handlePaste(mockEvent);

    expect(onImagesPasted).toHaveBeenCalledWith([mockFile1, mockFile2]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm test useClipboardPaste.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// apps/web/hooks/composer/useClipboardPaste.ts
import { useCallback } from 'react';

interface UseClipboardPasteProps {
  onImagesPasted: (files: File[]) => void;
  onTextPasted?: (text: string) => void;
  enabled?: boolean;
}

const IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
];

export const useClipboardPaste = ({
  onImagesPasted,
  onTextPasted,
  enabled = true,
}: UseClipboardPasteProps) => {

  const handlePaste = useCallback(async (e: ClipboardEvent) => {
    if (!enabled) return;

    const clipboardData = e.clipboardData;
    if (!clipboardData) return;

    // Check for files first
    const { files, items } = clipboardData;

    if (files.length > 0 || items.length > 0) {
      const imageFiles: File[] = [];

      // Extract files from items (better browser support)
      for (let i = 0; i < items.length; i++) {
        const item = items[i];

        if (item.kind === 'file' && IMAGE_MIME_TYPES.includes(item.type)) {
          const file = item.getAsFile();
          if (file) {
            imageFiles.push(file);
          }
        }
      }

      // Fallback to files array
      if (imageFiles.length === 0) {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          if (IMAGE_MIME_TYPES.includes(file.type)) {
            imageFiles.push(file);
          }
        }
      }

      // If images found, prevent default and handle
      if (imageFiles.length > 0) {
        e.preventDefault();
        onImagesPasted(imageFiles);
        return;
      }
    }

    // Handle text paste if no images
    if (onTextPasted) {
      const text = clipboardData.getData('text');
      if (text) {
        onTextPasted(text);
      }
    }
  }, [enabled, onImagesPasted, onTextPasted]);

  return {
    handlePaste,
  };
};
```

**Step 4: Run tests to verify they pass**

Run: `cd apps/web && pnpm test useClipboardPaste.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/hooks/composer/useClipboardPaste.ts apps/web/__tests__/hooks/composer/useClipboardPaste.test.ts
git commit -m "feat(composer): add clipboard image paste handler

- Detect pasted images from clipboard
- Support PNG, JPEG, GIF, WebP, SVG
- Handle multiple images
- Prevent default for image paste

Priorité HAUTE

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Phase 4: Integration & Polish (Séquentiel après Phase 3)

### Task 4.1: Integrate All Components into Main MessageComposer

**Files:**
- Modify: `apps/web/components/common/message-composer.tsx`
- Create: `apps/web/components/common/message-composer/index.tsx` (nouveau point d'entrée)

**Step 1: Create new entry point with all integrations**

```typescript
// apps/web/components/common/message-composer/index.tsx
'use client';

import { forwardRef, useImperativeHandle, useEffect } from 'react';
import { usePerformanceProfile } from '@/hooks/usePerformanceProfile';
import { getAnimationConfig } from '@/constants/animations';
import { useComposerState } from '@/hooks/composer/useComposerState';
import { useComposerAnimations } from '@/hooks/composer/useComposerAnimations';
import { useComposerKeyboard } from '@/hooks/composer/useComposerKeyboard';
import { useClipboardPaste } from '@/hooks/composer/useClipboardPaste';
import { useUploadRetry } from '@/hooks/composer/useUploadRetry';

import { ComposerContainer } from './ComposerContainer';
import { SendButton } from './SendButton';
// ... autres imports

export interface MessageComposerRef {
  focus: () => void;
  blur: () => void;
  clearAttachments?: () => void;
  getMentionedUserIds?: () => string[];
  clearMentionedUserIds?: () => void;
  resetTextareaSize?: () => void;
}

interface MessageComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  selectedLanguage: string;
  onLanguageChange: (language: string) => void;
  location?: string;
  isComposingEnabled?: boolean;
  placeholder?: string;
  onKeyPress?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  className?: string;
  choices?: any[];
  onAttachmentsChange?: (attachmentIds: string[], mimeTypes: string[]) => void;
  token?: string;
  userRole?: string;
  conversationId?: string;
}

export const MessageComposer = forwardRef<MessageComposerRef, MessageComposerProps>(
  (props, ref) => {
    // Performance profile
    const performanceProfile = usePerformanceProfile();
    const animConfig = getAnimationConfig(performanceProfile);

    // État centralisé
    const composerState = useComposerState(props);

    // Animations
    const animations = useComposerAnimations({
      performanceProfile,
      hasContent: composerState.hasContent,
      isTyping: composerState.isTyping,
    });

    // Upload retry
    const { uploadWithRetry, retryStatus } = useUploadRetry({ maxRetries: 3 });

    // Clipboard paste
    const { handlePaste } = useClipboardPaste({
      onImagesPasted: composerState.handleFilesSelected,
      enabled: props.isComposingEnabled,
    });

    // Setup paste listener
    useEffect(() => {
      const textarea = composerState.textareaRef.current;
      if (!textarea) return;

      textarea.addEventListener('paste', handlePaste as any);
      return () => textarea.removeEventListener('paste', handlePaste as any);
    }, [handlePaste, composerState.textareaRef]);

    // Navigation clavier
    useComposerKeyboard({
      textareaRef: composerState.textareaRef,
      canSend: composerState.canSend,
      onSend: composerState.handleSendMessage,
      showMentionAutocomplete: composerState.showMentionAutocomplete,
      replyingTo: composerState.replyingTo,
      clearReply: composerState.clearReply,
      closeMentionAutocomplete: composerState.closeMentionAutocomplete,
      navigateMentions: composerState.navigateMentions,
      toggleAttachmentDropdown: composerState.toggleAttachmentDropdown,
      handleMicrophoneClick: composerState.handleMicrophoneClick,
      languageSelectorRef: composerState.languageSelectorRef,
    });

    // Exposer méthodes via ref
    useImperativeHandle(ref, () => ({
      focus: composerState.focus,
      blur: composerState.blur,
      clearAttachments: composerState.clearAttachments,
      getMentionedUserIds: composerState.getMentionedUserIds,
      clearMentionedUserIds: composerState.clearMentionedUserIds,
      resetTextareaSize: composerState.resetTextareaSize,
    }));

    return (
      <ComposerContainer
        isDragOver={composerState.isDragOver}
        activeSections={composerState.activeSections}
        isOffline={composerState.isOffline}
        isComposingEnabled={composerState.isComposingEnabled}
        disabledReason={composerState.disabledReason}
        onDragEnter={composerState.handleDragEnter}
        onDragOver={composerState.handleDragOver}
        onDragLeave={composerState.handleDragLeave}
        onDrop={composerState.handleDrop}
        animConfig={animConfig}
      >
        {/* Tous les sous-composants */}

        <SendButton
          isVisible={composerState.hasContent}
          canSend={composerState.canSend}
          onClick={composerState.handleSendMessage}
          isCompressing={composerState.isCompressing}
          isRecording={composerState.isRecording}
          isUploading={composerState.isUploading}
          performanceProfile={performanceProfile}
          animConfig={animConfig}
        />
      </ComposerContainer>
    );
  }
);

MessageComposer.displayName = 'MessageComposer';
```

**Step 2: Test integration manually**

Run: `cd apps/web && pnpm dev`
Test:
1. Ouvrir une conversation
2. Vérifier que le composer s'affiche
3. Taper du texte → bouton Envoyer apparaît
4. Coller une image → devrait s'ajouter aux attachments
5. Taper @ → mentions apparaissent

**Step 3: Commit**

```bash
git add apps/web/components/common/message-composer/
git commit -m "feat(composer): integrate all components into main MessageComposer

- Performance-aware rendering
- Draft autosave integration
- Clipboard image paste
- Upload retry logic
- Keyboard navigation
- All animations

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Phase 5: Rate Limiting & Batch Upload (Priorité MOYENNE)

### Task 5.1: Add Rate Limiting Hook

**Files:**
- Create: `apps/web/hooks/composer/useRateLimiting.ts`
- Test: `apps/web/__tests__/hooks/composer/useRateLimiting.test.ts`

**Step 1: Write the failing test**

```typescript
// apps/web/__tests__/hooks/composer/useRateLimiting.test.ts
import { renderHook, act, waitFor } from '@testing-library/react';
import { useRateLimiting } from '@/hooks/composer/useRateLimiting';

describe('useRateLimiting', () => {
  jest.useFakeTimers();

  it('should enforce cooldown between sends', async () => {
    const onSend = jest.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useRateLimiting({ cooldownMs: 500, onSend }));

    // First send should work immediately
    await act(async () => {
      await result.current.sendWithRateLimit();
    });

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(result.current.isInCooldown).toBe(true);

    // Second send should be blocked
    await act(async () => {
      await result.current.sendWithRateLimit();
    });

    expect(onSend).toHaveBeenCalledTimes(1); // Still 1

    // After cooldown, should work again
    act(() => {
      jest.advanceTimersByTime(500);
    });

    await act(async () => {
      await result.current.sendWithRateLimit();
    });

    expect(onSend).toHaveBeenCalledTimes(2);
  });

  it('should queue multiple sends', async () => {
    const onSend = jest.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useRateLimiting({
      cooldownMs: 500,
      onSend,
      enableQueue: true
    }));

    // Send 3 messages rapidly
    await act(async () => {
      result.current.sendWithRateLimit();
      result.current.sendWithRateLimit();
      result.current.sendWithRateLimit();
    });

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(result.current.queueLength).toBe(2);

    // Process queue
    act(() => {
      jest.advanceTimersByTime(500);
    });

    await waitFor(() => {
      expect(onSend).toHaveBeenCalledTimes(2);
    });

    act(() => {
      jest.advanceTimersByTime(500);
    });

    await waitFor(() => {
      expect(onSend).toHaveBeenCalledTimes(3);
      expect(result.current.queueLength).toBe(0);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm test useRateLimiting.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// apps/web/hooks/composer/useRateLimiting.ts
import { useState, useCallback, useRef, useEffect } from 'react';

interface UseRateLimitingProps {
  cooldownMs?: number;
  onSend: () => Promise<void> | void;
  enableQueue?: boolean;
}

export const useRateLimiting = ({
  cooldownMs = 500,
  onSend,
  enableQueue = false,
}: UseRateLimitingProps) => {
  const [isInCooldown, setIsInCooldown] = useState(false);
  const [queueLength, setQueueLength] = useState(0);
  const lastSendTime = useRef<number>(0);
  const queueRef = useRef<Array<() => Promise<void>>>([]);
  const processingRef = useRef(false);

  const processQueue = useCallback(async () => {
    if (processingRef.current || queueRef.current.length === 0) return;

    processingRef.current = true;

    while (queueRef.current.length > 0) {
      const now = Date.now();
      const timeSinceLastSend = now - lastSendTime.current;

      if (timeSinceLastSend < cooldownMs) {
        const waitTime = cooldownMs - timeSinceLastSend;
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      const sendFn = queueRef.current.shift();
      if (sendFn) {
        await sendFn();
        lastSendTime.current = Date.now();
        setQueueLength(queueRef.current.length);
      }
    }

    processingRef.current = false;
    setIsInCooldown(false);
  }, [cooldownMs]);

  const sendWithRateLimit = useCallback(async () => {
    const now = Date.now();
    const timeSinceLastSend = now - lastSendTime.current;

    if (timeSinceLastSend < cooldownMs) {
      if (enableQueue) {
        // Add to queue
        queueRef.current.push(async () => {
          await onSend();
        });
        setQueueLength(queueRef.current.length);
        setIsInCooldown(true);
        processQueue();
      }
      return;
    }

    // Send immediately
    setIsInCooldown(true);
    await onSend();
    lastSendTime.current = Date.now();

    // Check cooldown
    setTimeout(() => {
      if (queueRef.current.length === 0) {
        setIsInCooldown(false);
      }
    }, cooldownMs);

    if (enableQueue) {
      processQueue();
    }
  }, [cooldownMs, onSend, enableQueue, processQueue]);

  return {
    sendWithRateLimit,
    isInCooldown,
    queueLength,
  };
};
```

**Step 4: Run tests to verify they pass**

Run: `cd apps/web && pnpm test useRateLimiting.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/hooks/composer/useRateLimiting.ts apps/web/__tests__/hooks/composer/useRateLimiting.test.ts
git commit -m "feat(composer): add rate limiting hook

- Enforce 500ms cooldown between sends
- Optional message queue for rapid sends
- Track cooldown state and queue length

Priorité MOYENNE

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 5.2: Add Batch Upload for 50+ Files

**Files:**
- Modify: `apps/web/hooks/composer/useAttachmentUpload.ts`
- Test: `apps/web/__tests__/hooks/composer/useAttachmentUpload-batch.test.ts`

**Step 1: Write the failing test**

```typescript
// apps/web/__tests__/hooks/composer/useAttachmentUpload-batch.test.ts
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAttachmentUpload } from '@/hooks/composer/useAttachmentUpload';

describe('useAttachmentUpload - batch upload', () => {
  it('should upload files in batches of 10', async () => {
    const mockUpload = jest.fn().mockResolvedValue({ attachmentId: 'file-x' });

    const { result } = renderHook(() =>
      useAttachmentUpload({
        token: 'test-token',
        maxAttachments: 100,
        batchSize: 10,
        onAttachmentsChange: jest.fn(),
        uploadFn: mockUpload,
      })
    );

    // Create 25 files
    const files = Array.from({ length: 25 }, (_, i) =>
      new File([`content ${i}`], `file${i}.txt`, { type: 'text/plain' })
    );

    await act(async () => {
      await result.current.handleFilesSelected(files);
    });

    // Should have 3 batches: 10, 10, 5
    await waitFor(() => {
      expect(mockUpload).toHaveBeenCalledTimes(25);
    });

    // Verify batch progress
    expect(result.current.batchProgress).toEqual({
      current: 25,
      total: 25,
      currentBatch: 3,
      totalBatches: 3
    });
  });

  it('should track global progress across batches', async () => {
    const mockUpload = jest.fn()
      .mockImplementation(() => new Promise(resolve => setTimeout(() => resolve({ attachmentId: 'x' }), 100)));

    const { result } = renderHook(() =>
      useAttachmentUpload({
        token: 'test-token',
        batchSize: 5,
        uploadFn: mockUpload,
      })
    );

    const files = Array.from({ length: 15 }, (_, i) =>
      new File([`content ${i}`], `file${i}.txt`, { type: 'text/plain' })
    );

    act(() => {
      result.current.handleFilesSelected(files);
    });

    // Check intermediate progress
    await waitFor(() => {
      expect(result.current.batchProgress.current).toBeGreaterThan(0);
    });

    await waitFor(() => {
      expect(result.current.batchProgress.current).toBe(15);
    }, { timeout: 5000 });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm test useAttachmentUpload-batch.test.ts`
Expected: FAIL

**Step 3: Modify existing hook to add batch support**

```typescript
// apps/web/hooks/composer/useAttachmentUpload.ts (ajouter au hook existant)

// Ajouter à l'interface
interface BatchProgress {
  current: number;
  total: number;
  currentBatch: number;
  totalBatches: number;
}

interface UseAttachmentUploadProps {
  // ... props existantes
  batchSize?: number;
}

export const useAttachmentUpload = ({
  // ... props existantes
  batchSize = 10,
}: UseAttachmentUploadProps) => {
  // ... state existant

  const [batchProgress, setBatchProgress] = useState<BatchProgress>({
    current: 0,
    total: 0,
    currentBatch: 0,
    totalBatches: 0,
  });

  // Nouvelle fonction pour upload par batch
  const uploadFilesInBatches = useCallback(async (files: File[]) => {
    const totalFiles = files.length;
    const totalBatches = Math.ceil(totalFiles / batchSize);

    setBatchProgress({
      current: 0,
      total: totalFiles,
      currentBatch: 0,
      totalBatches,
    });

    let uploadedCount = 0;

    for (let i = 0; i < totalBatches; i++) {
      const start = i * batchSize;
      const end = Math.min(start + batchSize, totalFiles);
      const batch = files.slice(start, end);

      setBatchProgress(prev => ({
        ...prev,
        currentBatch: i + 1,
      }));

      // Upload batch en parallèle
      const batchPromises = batch.map(file => uploadSingleFile(file));
      await Promise.all(batchPromises);

      uploadedCount += batch.length;
      setBatchProgress(prev => ({
        ...prev,
        current: uploadedCount,
      }));
    }

    setBatchProgress({
      current: 0,
      total: 0,
      currentBatch: 0,
      totalBatches: 0,
    });
  }, [batchSize, uploadSingleFile]);

  // Modifier handleFilesSelected pour utiliser batch si > batchSize
  const handleFilesSelected = useCallback(async (files: File[]) => {
    // ... validation existante

    if (files.length > batchSize) {
      await uploadFilesInBatches(files);
    } else {
      // Upload normal pour petits lots
      await Promise.all(files.map(uploadSingleFile));
    }
  }, [batchSize, uploadFilesInBatches, uploadSingleFile]);

  return {
    // ... retours existants
    batchProgress,
  };
};
```

**Step 4: Run tests to verify they pass**

Run: `cd apps/web && pnpm test useAttachmentUpload-batch.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/hooks/composer/useAttachmentUpload.ts apps/web/__tests__/hooks/composer/useAttachmentUpload-batch.test.ts
git commit -m "feat(composer): add batch upload for 50+ files

- Upload in batches of 10 files
- Track global progress across batches
- Display current batch / total batches

Priorité MOYENNE

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Phase 6: Testing & Documentation

### Task 6.1: Add E2E Tests

**Files:**
- Create: `apps/web/__tests__/e2e/message-composer.e2e.test.ts`

**Step 1: Write E2E test scenarios**

```typescript
// apps/web/__tests__/e2e/message-composer.e2e.test.ts
import { test, expect } from '@playwright/test';

test.describe('MessageComposer E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/conversations/test-conv-123');
    await page.waitForSelector('[data-testid="message-composer"]');
  });

  test('should send a simple message', async ({ page }) => {
    const composer = page.locator('[data-testid="message-composer"]');
    const textarea = composer.locator('textarea');
    const sendButton = composer.locator('button[aria-label*="Envoyer"]');

    // SendButton ne devrait pas être visible initialement
    await expect(sendButton).not.toBeVisible();

    // Taper un message
    await textarea.fill('Hello world');

    // SendButton devrait apparaître avec animation
    await expect(sendButton).toBeVisible();

    // Cliquer sur Envoyer
    await sendButton.click();

    // Message devrait être envoyé et textarea vidé
    await expect(textarea).toHaveValue('');
    await expect(sendButton).not.toBeVisible();
  });

  test('should reveal toolbar buttons on hover', async ({ page }) => {
    const composer = page.locator('[data-testid="message-composer"]');
    const textarea = composer.locator('textarea');
    const micButton = composer.locator('button[aria-label*="vocal"]');
    const attachmentButton = composer.locator('button[aria-label*="fichiers"]');

    // Boutons ne devraient pas être visibles initialement
    await expect(micButton).not.toBeVisible();
    await expect(attachmentButton).not.toBeVisible();

    // Hover sur textarea
    await textarea.hover();

    // Boutons devraient apparaître avec stagger
    await expect(micButton).toBeVisible();
    await expect(attachmentButton).toBeVisible();
  });

  test('should paste and attach image from clipboard', async ({ page }) => {
    const composer = page.locator('[data-testid="message-composer"]');
    const textarea = composer.locator('textarea');

    // Focus textarea
    await textarea.focus();

    // Simuler paste d'image
    const buffer = await page.screenshot();
    await page.evaluate(async (imageBuffer) => {
      const blob = new Blob([imageBuffer], { type: 'image/png' });
      const file = new File([blob], 'screenshot.png', { type: 'image/png' });

      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: dataTransfer,
        bubbles: true,
      });

      document.querySelector('textarea')?.dispatchEvent(pasteEvent);
    }, buffer);

    // Vérifier qu'une image est ajoutée
    await expect(composer.locator('[data-testid="attachment-preview"]')).toBeVisible();
  });

  test('should show mentions autocomplete', async ({ page }) => {
    const composer = page.locator('[data-testid="message-composer"]');
    const textarea = composer.locator('textarea');

    // Taper @
    await textarea.fill('@');

    // Liste de mentions devrait apparaître
    const mentionList = page.locator('[role="listbox"][aria-label*="mentions"]');
    await expect(mentionList).toBeVisible();

    // Vérifier qu'il y a des suggestions
    const mentionItems = mentionList.locator('[role="option"]');
    await expect(mentionItems).toHaveCount.toBeGreaterThan(0);

    // Sélectionner la première mention
    await mentionItems.first().click();

    // Le @ devrait être remplacé par le username
    const textareaValue = await textarea.inputValue();
    expect(textareaValue).toMatch(/@\w+/);
  });

  test('should save and restore draft', async ({ page }) => {
    const composer = page.locator('[data-testid="message-composer"]');
    const textarea = composer.locator('textarea');

    // Taper un brouillon
    await textarea.fill('Draft message not sent');

    // Attendre autosave (2s)
    await page.waitForTimeout(2500);

    // Recharger la page
    await page.reload();

    // Attendre que le composer soit chargé
    await page.waitForSelector('[data-testid="message-composer"]');

    // Le brouillon devrait être restauré
    await expect(textarea).toHaveValue('Draft message not sent');
  });
});
```

**Step 2: Run E2E tests**

Run: `cd apps/web && pnpm test:e2e message-composer.e2e.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/web/__tests__/e2e/message-composer.e2e.test.ts
git commit -m "test(composer): add E2E tests for core flows

- Send simple message
- Toolbar reveal on hover
- Clipboard image paste
- Mentions autocomplete
- Draft autosave/restore

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 6.2: Update Documentation

**Files:**
- Create: `apps/web/components/common/message-composer/README.md`

**Step 1: Write comprehensive README**

```markdown
# MessageComposer

Composant de composition de messages ultra-minimaliste avec animations fluides, effet glassmorphique premium, et support complet desktop/mobile.

## Features

✅ **Ultra-minimaliste**: Zone épurée, éléments révélés progressivement
✅ **Animations fluides**: Scale + rotate + bounce adaptatif selon performance
✅ **Glassmorphisme premium**: Backdrop blur + gradient animé + reflets
✅ **Desktop + Mobile**: Touch targets, safe areas, clavier virtuel
✅ **Accessibilité WCAG 2.1 AA**: Navigation clavier, ARIA, screen readers
✅ **Performance adaptative**: High/Medium/Low profiles selon appareil
✅ **Draft autosave**: Sauvegarde auto toutes les 2s, restauration au mount
✅ **Clipboard images**: Paste d'images depuis clipboard
✅ **Upload retry**: 3 tentatives avec exponential backoff
✅ **Rate limiting**: Cooldown 500ms entre envois
✅ **Batch upload**: Upload par batch de 10 pour 50+ fichiers

## Usage

\`\`\`tsx
import { MessageComposer } from '@/components/common/message-composer';

<MessageComposer
  value={message}
  onChange={setMessage}
  onSend={handleSend}
  selectedLanguage="fr"
  onLanguageChange={setLanguage}
  conversationId="conv-123"
  token="auth-token"
  isComposingEnabled={true}
/>
\`\`\`

## Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| value | string | ✅ | Contenu actuel du message |
| onChange | (value: string) => void | ✅ | Callback lors du changement de texte |
| onSend | () => void | ✅ | Callback lors de l'envoi |
| selectedLanguage | string | ✅ | Code langue sélectionnée |
| onLanguageChange | (lang: string) => void | ✅ | Callback changement langue |
| conversationId | string | ❌ | ID conversation pour mentions/drafts |
| token | string | ❌ | Token auth pour uploads |
| isComposingEnabled | boolean | ❌ | Activer/désactiver composition |
| placeholder | string | ❌ | Placeholder custom |
| userRole | string | ❌ | Rôle pour limite caractères |
| location | string | ❌ | Position géographique |
| choices | LanguageChoice[] | ❌ | Choix langues disponibles |
| onAttachmentsChange | (ids, mimes) => void | ❌ | Callback attachments |

## Ref Methods

\`\`\`tsx
const composerRef = useRef<MessageComposerRef>(null);

// Méthodes disponibles
composerRef.current?.focus();
composerRef.current?.blur();
composerRef.current?.clearAttachments();
composerRef.current?.getMentionedUserIds();
composerRef.current?.clearMentionedUserIds();
composerRef.current?.resetTextareaSize();
\`\`\`

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Enter | Envoyer le message |
| Shift + Enter | Nouvelle ligne |
| Cmd/Ctrl + K | Focus sélecteur langue |
| Cmd/Ctrl + Shift + A | Ouvrir pièces jointes |
| Cmd/Ctrl + Shift + V | Enregistrement vocal |
| Escape | Fermer dropdown/mentions |
| ArrowUp/Down | Navigation mentions |
| Tab | Navigation toolbar |

## Architecture

\`\`\`
MessageComposer
├── usePerformanceProfile (détection capacités)
├── useComposerState (état centralisé)
├── useComposerAnimations (gestion animations)
├── useComposerKeyboard (navigation clavier)
├── useDraftAutosave (brouillons auto)
├── useClipboardPaste (paste images)
├── useUploadRetry (retry uploads)
└── useRateLimiting (cooldown envois)
\`\`\`

## Performance Profiles

**High** (8+ cores, 8+ GB RAM):
- Blur 20px
- Rotation 3D
- Gradient animé
- Shimmer actif
- Stagger 30ms
- Dropdown radial

**Medium** (4-8 cores, 4-8 GB RAM):
- Blur 16px
- Pas de rotation
- Gradient animé
- Pas de shimmer
- Stagger 50ms
- Dropdown scale

**Low** (≤4 cores, ≤4 GB RAM):
- Blur 8px
- Pas de rotation
- Couleur solide
- Pas de shimmer
- Stagger 0ms
- Dropdown fade

## Testing

\`\`\`bash
# Tests unitaires
pnpm test message-composer

# Tests E2E
pnpm test:e2e message-composer.e2e

# Coverage
pnpm test:coverage
\`\`\`

## Troubleshooting

**Le bouton Envoyer n'apparaît pas**
→ Vérifier que `isComposingEnabled={true}` et que `hasContent` est vrai

**Les animations sont saccadées**
→ Vérifier le profile de performance détecté, forcer profile `low` si besoin

**Le brouillon ne se sauvegarde pas**
→ Vérifier que `conversationId` est fourni

**Les images paste ne fonctionnent pas**
→ Vérifier que `token` est fourni pour l'upload
\`\`\`

**Step 2: Commit**

```bash
git add apps/web/components/common/message-composer/README.md
git commit -m "docs(composer): add comprehensive README

- Usage examples
- Props documentation
- Keyboard shortcuts
- Architecture overview
- Performance profiles
- Troubleshooting guide

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Summary & Execution Options

**Plan complet sauvegardé dans:** `docs/plans/2026-01-28-message-composer-implementation.md`

**Phases d'implémentation:**
1. ✅ **Phase 1 (Parallélisable)**: Foundation (Performance, Autosave, Retry)
2. ✅ **Phase 2 (Séquentiel)**: Core State Hook
3. ✅ **Phase 3 (Parallélisable)**: UI Components (SendButton, Clipboard Paste)
4. ✅ **Phase 4 (Séquentiel)**: Integration
5. ✅ **Phase 5 (Parallélisable)**: Rate Limiting + Batch Upload
6. ✅ **Phase 6 (Séquentiel)**: Testing + Docs

**Développement parallèle possible:**
- Phase 1: Tasks 1.1, 1.2, 1.3 en parallèle (3 devs)
- Phase 3: Tasks 3.1, 3.2 en parallèle (2 devs)
- Phase 5: Tasks 5.1, 5.2 en parallèle (2 devs)

**Estimation totale:** 8-12 heures (avec parallélisation)
**Sans parallélisation:** 14-18 heures

---

## Options d'exécution

**1. Subagent-Driven (cette session)** - Dispatch fresh subagent par task, review entre tasks, itération rapide

**2. Parallel Session (séparée)** - Ouvrir nouvelle session avec executing-plans, batch execution avec checkpoints

**Quelle approche préférez-vous?**
