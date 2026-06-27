/**
 * Tests for hooks/use-stream-ui.ts
 */

const mockFetch = jest.fn();
global.fetch = mockFetch;

import { renderHook, act, waitFor } from '@testing-library/react';
import { useStreamUI } from '@/hooks/use-stream-ui';

const makeOptions = (overrides: Record<string, unknown> = {}) => ({
  messages: [],
  messagesContainerRef: { current: null } as any,
  ...overrides,
});

beforeEach(() => {
  jest.resetAllMocks();
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: 1024,
  });
  // Mock geolocation to prevent async side effects
  Object.defineProperty(navigator, 'geolocation', {
    writable: true,
    configurable: true,
    value: undefined,
  });
  Object.defineProperty(navigator, 'permissions', {
    writable: true,
    configurable: true,
    value: undefined,
  });
});

// ─── isMobile ─────────────────────────────────────────────────────────────────

describe('isMobile', () => {
  it('starts false on desktop (innerWidth >= 768)', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 });
    const { result } = renderHook(() => useStreamUI(makeOptions()));
    expect(result.current.isMobile).toBe(false);
  });

  it('starts true on mobile (innerWidth < 768)', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 375 });
    const { result } = renderHook(() => useStreamUI(makeOptions()));
    expect(result.current.isMobile).toBe(true);
  });

  it('updates on resize', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 });
    const { result } = renderHook(() => useStreamUI(makeOptions()));
    expect(result.current.isMobile).toBe(false);

    act(() => {
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 375 });
      window.dispatchEvent(new Event('resize'));
    });

    expect(result.current.isMobile).toBe(true);
  });
});

// ─── gallery state ────────────────────────────────────────────────────────────

describe('gallery state', () => {
  it('starts with galleryOpen=false', () => {
    const { result } = renderHook(() => useStreamUI(makeOptions()));
    expect(result.current.galleryOpen).toBe(false);
  });

  it('starts with selectedAttachmentId=null', () => {
    const { result } = renderHook(() => useStreamUI(makeOptions()));
    expect(result.current.selectedAttachmentId).toBeNull();
  });

  it('setGalleryOpen opens the gallery', () => {
    const { result } = renderHook(() => useStreamUI(makeOptions()));
    act(() => { result.current.setGalleryOpen(true); });
    expect(result.current.galleryOpen).toBe(true);
  });

  it('handleImageClick sets selectedAttachmentId and opens gallery', () => {
    const { result } = renderHook(() => useStreamUI(makeOptions()));

    act(() => { result.current.handleImageClick('att-123'); });

    expect(result.current.selectedAttachmentId).toBe('att-123');
    expect(result.current.galleryOpen).toBe(true);
  });
});

// ─── handleAttachmentDeleted ──────────────────────────────────────────────────

describe('handleAttachmentDeleted', () => {
  it('starts with empty deletedAttachmentIds', () => {
    const { result } = renderHook(() => useStreamUI(makeOptions()));
    expect(result.current.deletedAttachmentIds).toEqual([]);
  });

  it('adds attachment ID to deletedAttachmentIds', () => {
    const { result } = renderHook(() => useStreamUI(makeOptions()));

    act(() => { result.current.handleAttachmentDeleted('att-1'); });

    expect(result.current.deletedAttachmentIds).toContain('att-1');
  });

  it('accumulates multiple deleted IDs', () => {
    const { result } = renderHook(() => useStreamUI(makeOptions()));

    act(() => {
      result.current.handleAttachmentDeleted('att-1');
      result.current.handleAttachmentDeleted('att-2');
    });

    expect(result.current.deletedAttachmentIds).toHaveLength(2);
  });
});

// ─── handleAttachmentsChange ──────────────────────────────────────────────────

describe('handleAttachmentsChange', () => {
  it('starts with empty attachmentIds and mimeTypes', () => {
    const { result } = renderHook(() => useStreamUI(makeOptions()));
    expect(result.current.attachmentIds).toEqual([]);
    expect(result.current.attachmentMimeTypes).toEqual([]);
  });

  it('updates attachmentIds and mimeTypes', () => {
    const { result } = renderHook(() => useStreamUI(makeOptions()));

    act(() => {
      result.current.handleAttachmentsChange(['att-1'], ['image/jpeg']);
    });

    expect(result.current.attachmentIds).toEqual(['att-1']);
    expect(result.current.attachmentMimeTypes).toEqual(['image/jpeg']);
  });

  it('does not re-render if same IDs passed again', () => {
    const { result } = renderHook(() => useStreamUI(makeOptions()));

    act(() => { result.current.handleAttachmentsChange(['att-1'], ['image/jpeg']); });
    const ids1 = result.current.attachmentIds;

    act(() => { result.current.handleAttachmentsChange(['att-1'], ['image/jpeg']); });
    const ids2 = result.current.attachmentIds;

    expect(ids1).toBe(ids2);
  });
});

// ─── searchQuery ──────────────────────────────────────────────────────────────

describe('searchQuery', () => {
  it('starts empty', () => {
    const { result } = renderHook(() => useStreamUI(makeOptions()));
    expect(result.current.searchQuery).toBe('');
  });

  it('setSearchQuery updates the query', () => {
    const { result } = renderHook(() => useStreamUI(makeOptions()));

    act(() => { result.current.setSearchQuery('hello'); });

    expect(result.current.searchQuery).toBe('hello');
  });
});

// ─── trendingHashtags ─────────────────────────────────────────────────────────

describe('trendingHashtags', () => {
  it('populates trendingHashtags on mount', async () => {
    const { result } = renderHook(() => useStreamUI(makeOptions()));

    await waitFor(() => expect(result.current.trendingHashtags.length).toBeGreaterThan(0));
    expect(result.current.trendingHashtags[0]).toMatch(/^#/);
  });
});

// ─── handleNavigateToMessageFromGallery ───────────────────────────────────────

describe('handleNavigateToMessageFromGallery', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    jest.useRealTimers();
  });

  it('closes the gallery when navigating', () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useStreamUI(makeOptions()));

    act(() => { result.current.setGalleryOpen(true); });
    act(() => { result.current.handleNavigateToMessageFromGallery('msg-1'); });

    expect(result.current.galleryOpen).toBe(false);
  });

  it('scrolls to the message element after delay', () => {
    jest.useFakeTimers();
    const el = document.createElement('div');
    el.id = 'message-msg-42';
    document.body.appendChild(el);
    const scrollSpy = jest.spyOn(el, 'scrollIntoView').mockImplementation(() => {});

    const { result } = renderHook(() => useStreamUI(makeOptions()));

    act(() => {
      result.current.handleNavigateToMessageFromGallery('msg-42');
      jest.advanceTimersByTime(300);
    });

    expect(scrollSpy).toHaveBeenCalled();
  });
});
