/**
 * Tests for the tracking-link redirect page (`app/l/[token]/page.tsx`).
 *
 * Verifies the §21.3 routing-by-targetType behavior on top of the existing
 * click-tracking pipeline:
 *   - POST /tracking-links/:token/click is always recorded (preserved)
 *   - GET  /tracking-links/:token/resolve drives the destination
 *   - CONVERSATION / PROFILE / EXTERNAL navigate via location.replace
 *   - expired (isActive:false) links render the "Lien expiré" screen
 */

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';

// --- next/navigation mock (token param + empty search params) ---
let currentToken = 'abc123';
jest.mock('next/navigation', () => ({
  useParams: () => ({ token: currentToken }),
  useSearchParams: () => new URLSearchParams(),
}));

// --- config mock: deterministic absolute URLs ---
jest.mock('@/lib/config', () => ({
  buildApiUrl: (endpoint: string) => `https://gate.test${endpoint}`,
}));

// --- navigation seam mock: observe redirect intent without touching jsdom's
//     non-configurable window.location ---
const replaceMock = jest.fn();
const assignMock = jest.fn();
jest.mock('@/lib/navigate', () => ({
  replaceLocation: (url: string) => replaceMock(url),
  assignLocation: (url: string) => assignMock(url),
}));

import TrackingLinkPage from '@/app/l/[token]/page';

// Helper: build a fetch mock that routes by URL.
function mockFetch(routes: { click?: unknown; resolve?: unknown; clickOk?: boolean; resolveOk?: boolean }) {
  return jest.fn((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/click')) {
      return Promise.resolve({
        ok: routes.clickOk ?? true,
        json: () => Promise.resolve(routes.click ?? {}),
      } as Response);
    }
    if (url.includes('/resolve')) {
      return Promise.resolve({
        ok: routes.resolveOk ?? true,
        json: () => Promise.resolve(routes.resolve ?? {}),
      } as Response);
    }
    if (url.includes('/redirect-status')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) } as Response);
  });
}

const replaceSpy = replaceMock;

beforeAll(() => {
  Object.defineProperty(navigator, 'sendBeacon', {
    configurable: true,
    writable: true,
    value: jest.fn().mockReturnValue(true),
  });
});

describe('TrackingLinkPage routing by targetType', () => {
  beforeEach(() => {
    currentToken = 'abc123';
    jest.clearAllMocks();
  });

  it('always records the click before resolving', async () => {
    global.fetch = mockFetch({
      click: { data: { clickId: 'c1', originalUrl: 'https://example.com/x' } },
      resolve: { data: { targetType: 'EXTERNAL', originalUrl: 'https://example.com/x', isActive: true } },
    }) as unknown as typeof fetch;

    render(<TrackingLinkPage />);

    await waitFor(() => {
      const calls = (global.fetch as jest.Mock).mock.calls.map((c) => c[0] as string);
      expect(calls.some((u) => u.includes('/tracking-links/abc123/click'))).toBe(true);
      expect(calls.some((u) => u.includes('/tracking-links/abc123/resolve'))).toBe(true);
    });
  });

  it('routes CONVERSATION to /conversations/<id>', async () => {
    global.fetch = mockFetch({
      click: { data: { clickId: 'c1' } },
      resolve: { data: { targetType: 'CONVERSATION', targetId: 'conv9', isActive: true } },
    }) as unknown as typeof fetch;

    render(<TrackingLinkPage />);

    await waitFor(() => {
      expect(replaceSpy).toHaveBeenCalledWith('/conversations/conv9');
    });
  });

  it('routes PROFILE to /u/<id>', async () => {
    global.fetch = mockFetch({
      click: { data: { clickId: 'c1' } },
      resolve: { data: { targetType: 'PROFILE', targetId: 'user42', isActive: true } },
    }) as unknown as typeof fetch;

    render(<TrackingLinkPage />);

    await waitFor(() => {
      expect(replaceSpy).toHaveBeenCalledWith('/u/user42');
    });
  });

  it('routes EXTERNAL to a validated originalUrl', async () => {
    global.fetch = mockFetch({
      click: { data: { clickId: 'c1', originalUrl: 'https://safe.example/dest' } },
      resolve: { data: { targetType: 'EXTERNAL', originalUrl: 'https://safe.example/dest', isActive: true } },
    }) as unknown as typeof fetch;

    render(<TrackingLinkPage />);

    await waitFor(() => {
      expect(replaceSpy).toHaveBeenCalledWith('https://safe.example/dest');
    });
  });

  it('rejects a javascript: EXTERNAL url and shows error', async () => {
    global.fetch = mockFetch({
      click: { data: { clickId: 'c1' } },
      // eslint-disable-next-line no-script-url
      resolve: { data: { targetType: 'EXTERNAL', originalUrl: 'javascript:alert(1)', isActive: true } },
    }) as unknown as typeof fetch;

    render(<TrackingLinkPage />);

    await waitFor(() => {
      expect(screen.getByText('Lien introuvable')).toBeInTheDocument();
    });
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it('renders "Lien expiré" when isActive is false', async () => {
    global.fetch = mockFetch({
      click: { data: { clickId: 'c1' } },
      resolve: { data: { targetType: 'EXTERNAL', originalUrl: 'https://example.com', isActive: false } },
    }) as unknown as typeof fetch;

    render(<TrackingLinkPage />);

    await waitFor(() => {
      expect(screen.getByText('Lien expiré')).toBeInTheDocument();
    });
    // expired with a valid fallback offers a "Continuer" link
    expect(screen.getByText('Continuer vers la destination')).toBeInTheDocument();
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it('falls back to legacy originalUrl when resolve is unavailable', async () => {
    global.fetch = mockFetch({
      click: { data: { clickId: 'c1', originalUrl: 'https://legacy.example/dest' } },
      resolveOk: false,
    }) as unknown as typeof fetch;

    render(<TrackingLinkPage />);

    await waitFor(() => {
      expect(replaceSpy).toHaveBeenCalledWith('https://legacy.example/dest');
    });
  });

  describe('post-family native app-open + web fallback', () => {
    // Flush queued microtasks (promise continuations) under fake timers.
    const flush = async () => {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });
    };

    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
    });

    it('POST attempts native app-open then falls back to /post/<id>', async () => {
      global.fetch = mockFetch({
        click: { data: { clickId: 'c1' } },
        resolve: { data: { targetType: 'POST', targetId: 'post7', isActive: true } },
      }) as unknown as typeof fetch;

      render(<TrackingLinkPage />);
      await flush();

      // 1) native open attempted via custom scheme
      expect(assignMock).toHaveBeenCalledWith('meeshy://p/post7');
      // 2) no web fallback yet (timeout pending, app may take over)
      expect(replaceSpy).not.toHaveBeenCalled();

      // 3) advance past the fallback window → web fallback fires
      act(() => {
        jest.advanceTimersByTime(1600);
      });
      expect(replaceSpy).toHaveBeenCalledWith('/post/post7');
    });

    it('STORY uses the meeshy://s/<id> scheme', async () => {
      global.fetch = mockFetch({
        click: { data: { clickId: 'c1' } },
        resolve: { data: { targetType: 'STORY', targetId: 'story3', isActive: true } },
      }) as unknown as typeof fetch;

      render(<TrackingLinkPage />);
      await flush();

      expect(assignMock).toHaveBeenCalledWith('meeshy://s/story3');
    });
  });
});
