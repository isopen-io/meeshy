/**
 * Tests for useAudioPlayback — trackConsumption (author included).
 *
 * user 2026-08-18 : « remonter les lectures de l'audio même si c'est
 * l'auteur qui le lit » — le gate `isOwnMessage` a été retiré de
 * `trackConsumption`. Ces témoins fixent le nouveau contrat : l'écoute
 * remonte au gateway POUR TOUT LE MONDE, auteur compris, et une seule
 * fois par lecture (dédup).
 */

import React from 'react';
import { render, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useAudioPlayback } from '@/hooks/use-audio-playback';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('@/services/api.service', () => ({
  apiService: {
    post: jest.fn().mockResolvedValue({}),
    getBlob: jest.fn().mockResolvedValue(new Blob()),
  },
}));

jest.mock('@/utils/media-manager', () => ({
  __esModule: true,
  default: {
    getInstance: jest.fn().mockReturnValue({
      play: jest.fn(),
      stop: jest.fn(),
    }),
  },
}));

import { apiService } from '@/services/api.service';

const mockApiPost = apiService.post as jest.Mock;

// ── Factory & TestComponent ───────────────────────────────────────────────────

type HookOptions = {
  audioUrl?: string;
  attachmentId?: string;
  isOwnMessage?: boolean;
};

function makeOptions(overrides: HookOptions = {}) {
  return {
    audioUrl: 'https://example.com/voice.m4a',
    attachmentId: 'att-audio-001',
    isOwnMessage: false,
    ...overrides,
  };
}

type HookResult = ReturnType<typeof useAudioPlayback>;

function TestComponent({
  options,
  hookRef,
}: {
  options: ReturnType<typeof makeOptions>;
  hookRef: React.MutableRefObject<HookResult | null>;
}) {
  const result = useAudioPlayback(options);
  hookRef.current = result;
  return <audio ref={result.audioRef} data-testid="audio" />;
}

function renderHook(options: ReturnType<typeof makeOptions> = makeOptions()) {
  const hookRef = React.createRef() as React.MutableRefObject<HookResult | null>;
  const utils = render(<TestComponent options={options} hookRef={hookRef} />);
  return { hookRef, ...utils };
}

// ── trackConsumption ──────────────────────────────────────────────────────────

describe('useAudioPlayback — trackConsumption', () => {
  beforeEach(() => {
    mockApiPost.mockClear();
  });

  it('reports the listen on ended for a received message', () => {
    const { hookRef } = renderHook(makeOptions({ isOwnMessage: false }));
    act(() => {
      hookRef.current!.handleEnded();
    });
    expect(mockApiPost).toHaveBeenCalledTimes(1);
    expect(mockApiPost).toHaveBeenCalledWith(
      '/api/v1/attachments/att-audio-001/status',
      expect.objectContaining({ action: 'listened', complete: true }),
    );
  });

  // user 2026-08-18 : l'écoute de l'AUTEUR compte aussi — parité iOS, dont
  // le report n'a jamais exclu l'auteur. Une PR qui ré-ajouterait
  // `if (isOwnMessage) return;` doit tomber ici.
  it('reports the listen even when isOwnMessage=true (author listens count)', () => {
    const { hookRef } = renderHook(makeOptions({ isOwnMessage: true }));
    act(() => {
      hookRef.current!.handleEnded();
    });
    expect(mockApiPost).toHaveBeenCalledTimes(1);
    expect(mockApiPost).toHaveBeenCalledWith(
      '/api/v1/attachments/att-audio-001/status',
      expect.objectContaining({ action: 'listened' }),
    );
  });

  it('deduplicates the completion report across repeated ended events', () => {
    const { hookRef } = renderHook(makeOptions({ isOwnMessage: true }));
    act(() => {
      hookRef.current!.handleEnded();
    });
    act(() => {
      hookRef.current!.handleEnded();
    });
    expect(mockApiPost).toHaveBeenCalledTimes(1);
  });
});
