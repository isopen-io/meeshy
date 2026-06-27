/**
 * Tests for hooks/use-stream-ui.ts
 */

import { renderHook, act } from '@testing-library/react';
import { useStreamUI } from '@/hooks/use-stream-ui';
import { createRef } from 'react';

const makeProps = (overrides: Record<string, unknown> = {}) => ({
  messages: [],
  messagesContainerRef: createRef<HTMLDivElement>(),
  ...overrides,
});

const setWindowWidth = (width: number) => {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width });
  window.dispatchEvent(new Event('resize'));
};

beforeEach(() => {
  setWindowWidth(1024);
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

// ─── initial state ────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('galleryOpen starts false', () => {
    const { result } = renderHook(() => useStreamUI(makeProps()));
    expect(result.current.galleryOpen).toBe(false);
  });

  it('selectedAttachmentId starts null', () => {
    const { result } = renderHook(() => useStreamUI(makeProps()));
    expect(result.current.selectedAttachmentId).toBeNull();
  });

  it('deletedAttachmentIds starts empty', () => {
    const { result } = renderHook(() => useStreamUI(makeProps()));
    expect(result.current.deletedAttachmentIds).toEqual([]);
  });

  it('attachmentIds starts empty', () => {
    const { result } = renderHook(() => useStreamUI(makeProps()));
    expect(result.current.attachmentIds).toEqual([]);
  });

  it('searchQuery starts empty', () => {
    const { result } = renderHook(() => useStreamUI(makeProps()));
    expect(result.current.searchQuery).toBe('');
  });

  it('trendingHashtags is populated on mount', async () => {
    const { result } = renderHook(() => useStreamUI(makeProps()));
    expect(result.current.trendingHashtags.length).toBeGreaterThan(0);
  });
});

// ─── isMobile ─────────────────────────────────────────────────────────────────

describe('isMobile', () => {
  it('isMobile=false on wide screen', () => {
    setWindowWidth(1024);
    const { result } = renderHook(() => useStreamUI(makeProps()));
    expect(result.current.isMobile).toBe(false);
  });

  it('isMobile=true when width < 768', () => {
    setWindowWidth(375);
    const { result } = renderHook(() => useStreamUI(makeProps()));
    expect(result.current.isMobile).toBe(true);
  });

  it('updates isMobile on resize', () => {
    setWindowWidth(1024);
    const { result } = renderHook(() => useStreamUI(makeProps()));
    expect(result.current.isMobile).toBe(false);
    act(() => { setWindowWidth(375); });
    expect(result.current.isMobile).toBe(true);
  });
});

// ─── gallery ─────────────────────────────────────────────────────────────────

describe('gallery', () => {
  it('handleImageClick opens gallery and sets selectedAttachmentId', () => {
    const { result } = renderHook(() => useStreamUI(makeProps()));
    act(() => { result.current.handleImageClick('att-1'); });
    expect(result.current.galleryOpen).toBe(true);
    expect(result.current.selectedAttachmentId).toBe('att-1');
  });

  it('setGalleryOpen closes gallery', () => {
    const { result } = renderHook(() => useStreamUI(makeProps()));
    act(() => { result.current.handleImageClick('att-1'); });
    act(() => { result.current.setGalleryOpen(false); });
    expect(result.current.galleryOpen).toBe(false);
  });

  it('handleNavigateToMessageFromGallery closes gallery', () => {
    const { result } = renderHook(() => useStreamUI(makeProps()));
    act(() => { result.current.handleImageClick('att-1'); });
    act(() => { result.current.handleNavigateToMessageFromGallery('msg-1'); });
    expect(result.current.galleryOpen).toBe(false);
  });

  it('handleAttachmentDeleted adds id to deletedAttachmentIds', () => {
    const { result } = renderHook(() => useStreamUI(makeProps()));
    act(() => { result.current.handleAttachmentDeleted('att-deleted'); });
    expect(result.current.deletedAttachmentIds).toContain('att-deleted');
  });
});

// ─── attachments ──────────────────────────────────────────────────────────────

describe('handleAttachmentsChange', () => {
  it('updates attachmentIds and mimeTypes', () => {
    const { result } = renderHook(() => useStreamUI(makeProps()));
    act(() => { result.current.handleAttachmentsChange(['id-1', 'id-2'], ['image/png', 'image/jpeg']); });
    expect(result.current.attachmentIds).toEqual(['id-1', 'id-2']);
    expect(result.current.attachmentMimeTypes).toEqual(['image/png', 'image/jpeg']);
  });

  it('does not update when arrays are identical', () => {
    const { result } = renderHook(() => useStreamUI(makeProps()));
    act(() => { result.current.handleAttachmentsChange(['id-1'], ['image/png']); });
    const ids1 = result.current.attachmentIds;
    act(() => { result.current.handleAttachmentsChange(['id-1'], ['image/png']); });
    expect(result.current.attachmentIds).toBe(ids1);
  });
});

// ─── search ───────────────────────────────────────────────────────────────────

describe('searchQuery', () => {
  it('setSearchQuery updates searchQuery', () => {
    const { result } = renderHook(() => useStreamUI(makeProps()));
    act(() => { result.current.setSearchQuery('hello world'); });
    expect(result.current.searchQuery).toBe('hello world');
  });
});

// ─── cleanup ─────────────────────────────────────────────────────────────────

describe('cleanup', () => {
  it('removes resize listener on unmount', () => {
    const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useStreamUI(makeProps()));
    unmount();
    expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));
    removeEventListenerSpy.mockRestore();
  });
});
