/**
 * Tests for useAudioRecorder hook
 *
 * Tests cover:
 * - Initial state
 * - Recording state management
 * - Audio blob handling
 * - Safari-safe file creation
 * - Audio completion and upload
 * - Recording removal
 * - Microphone click behavior (start, stop, upload)
 * - Before stop handler
 * - Reset audio state
 * - Audio file extension detection
 */

import { renderHook, act } from '@testing-library/react';
import { useAudioRecorder } from '@/hooks/composer/useAudioRecorder';

// Helper to create mock Blob
function createMockBlob(size: number, type: string): Blob {
  const content = new ArrayBuffer(size);
  return new Blob([content], { type });
}

// Helper to create mock AudioBlobData
function createMockAudioBlobData(size: number, type: string, duration: number) {
  return {
    blob: createMockBlob(size, type),
    duration,
  };
}

describe('useAudioRecorder', () => {
  let mockOnAudioReady: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockOnAudioReady = jest.fn().mockResolvedValue(undefined);

    // Suppress console logs in tests
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Initial State', () => {
    it('should return initial state with false flags and null blob', () => {
      const { result } = renderHook(() =>
        useAudioRecorder({ onAudioReady: mockOnAudioReady })
      );

      expect(result.current.showAudioRecorder).toBe(false);
      expect(result.current.currentAudioBlob).toBeNull();
      expect(result.current.audioRecorderKey).toBe(0);
      expect(result.current.isRecording).toBe(false);
    });

    it('should return all handler functions', () => {
      const { result } = renderHook(() =>
        useAudioRecorder({ onAudioReady: mockOnAudioReady })
      );

      expect(typeof result.current.handleRecordingStateChange).toBe('function');
      expect(typeof result.current.handleAudioRecordingComplete).toBe('function');
      expect(typeof result.current.handleRemoveAudioRecording).toBe('function');
      expect(typeof result.current.handleBeforeStop).toBe('function');
      expect(typeof result.current.handleMicrophoneClick).toBe('function');
      expect(typeof result.current.resetAudioState).toBe('function');
    });

    it('should provide audioRecorderRef', () => {
      const { result } = renderHook(() =>
        useAudioRecorder({ onAudioReady: mockOnAudioReady })
      );

      expect(result.current.audioRecorderRef).toBeDefined();
      expect(result.current.audioRecorderRef.current).toBeNull();
    });
  });

  describe('Recording State Change (handleRecordingStateChange)', () => {
    it('should update isRecording when recording starts', () => {
      const { result } = renderHook(() =>
        useAudioRecorder({ onAudioReady: mockOnAudioReady })
      );

      act(() => {
        result.current.handleRecordingStateChange(true);
      });

      expect(result.current.isRecording).toBe(true);
    });

    it('should update isRecording when recording stops', () => {
      const { result } = renderHook(() =>
        useAudioRecorder({ onAudioReady: mockOnAudioReady })
      );

      act(() => {
        result.current.handleRecordingStateChange(true);
      });

      act(() => {
        result.current.handleRecordingStateChange(false);
      });

      expect(result.current.isRecording).toBe(false);
    });
  });

  describe('Audio Recording Complete (handleAudioRecordingComplete)', () => {
    it('should store audio blob data', async () => {
      const { result } = renderHook(() =>
        useAudioRecorder({ onAudioReady: mockOnAudioReady })
      );

      const mockBlob = createMockBlob(1024, 'audio/webm');

      await act(async () => {
        await result.current.handleAudioRecordingComplete(mockBlob, 5.5);
      });

      expect(result.current.currentAudioBlob).not.toBeNull();
      expect(result.current.currentAudioBlob?.blob).toBe(mockBlob);
      expect(result.current.currentAudioBlob?.duration).toBe(5.5);
    });

    it('should auto-upload when shouldUploadAfterStop flag is set', async () => {
      const { result } = renderHook(() =>
        useAudioRecorder({ onAudioReady: mockOnAudioReady })
      );

      const mockBlob = createMockBlob(1024, 'audio/webm');

      // Set the flag via handleBeforeStop
      act(() => {
        result.current.handleBeforeStop();
      });

      await act(async () => {
        await result.current.handleAudioRecordingComplete(mockBlob, 5.5);
      });

      expect(mockOnAudioReady).toHaveBeenCalled();
      // State should be reset after upload
      expect(result.current.currentAudioBlob).toBeNull();
      expect(result.current.showAudioRecorder).toBe(false);
      expect(result.current.isRecording).toBe(false);
    });

    it('should pass metadata to onAudioReady when provided', async () => {
      const { result } = renderHook(() =>
        useAudioRecorder({ onAudioReady: mockOnAudioReady })
      );

      const mockBlob = createMockBlob(1024, 'audio/webm');
      const mockMetadata = {
        audioEffectsTimeline: { events: [{ type: 'effect', timestamp: 1000 }] },
      };

      // Set the flag via handleBeforeStop
      act(() => {
        result.current.handleBeforeStop();
      });

      await act(async () => {
        await result.current.handleAudioRecordingComplete(mockBlob, 5.5, mockMetadata);
      });

      expect(mockOnAudioReady).toHaveBeenCalledWith(
        expect.any(Array),
        [mockMetadata]
      );
    });

    it('should not auto-upload without shouldUploadAfterStop flag', async () => {
      const { result } = renderHook(() =>
        useAudioRecorder({ onAudioReady: mockOnAudioReady })
      );

      const mockBlob = createMockBlob(1024, 'audio/webm');

      await act(async () => {
        await result.current.handleAudioRecordingComplete(mockBlob, 5.5);
      });

      expect(mockOnAudioReady).not.toHaveBeenCalled();
      expect(result.current.currentAudioBlob).not.toBeNull();
    });
  });

  describe('Remove Audio Recording (handleRemoveAudioRecording)', () => {
    it('should clear all audio state', async () => {
      const { result } = renderHook(() =>
        useAudioRecorder({ onAudioReady: mockOnAudioReady })
      );

      // First, set some state
      act(() => {
        result.current.handleRecordingStateChange(true);
      });

      const mockBlob = createMockBlob(1024, 'audio/webm');
      await act(async () => {
        await result.current.handleAudioRecordingComplete(mockBlob, 5.5);
      });

      // Now remove
      act(() => {
        result.current.handleRemoveAudioRecording();
      });

      expect(result.current.showAudioRecorder).toBe(false);
      expect(result.current.currentAudioBlob).toBeNull();
      expect(result.current.isRecording).toBe(false);
    });
  });

  describe('Before Stop Handler (handleBeforeStop)', () => {
    it('should set upload flag for subsequent recording complete', async () => {
      const { result } = renderHook(() =>
        useAudioRecorder({ onAudioReady: mockOnAudioReady })
      );

      act(() => {
        result.current.handleBeforeStop();
      });

      const mockBlob = createMockBlob(1024, 'audio/webm');
      await act(async () => {
        await result.current.handleAudioRecordingComplete(mockBlob, 5.5);
      });

      // Should have triggered upload
      expect(mockOnAudioReady).toHaveBeenCalled();
    });
  });

  describe('Microphone Click (handleMicrophoneClick)', () => {
    it('should open recorder when not showing', async () => {
      const { result } = renderHook(() =>
        useAudioRecorder({ onAudioReady: mockOnAudioReady })
      );

      await act(async () => {
        await result.current.handleMicrophoneClick();
      });

      expect(result.current.showAudioRecorder).toBe(true);
      expect(result.current.audioRecorderKey).toBe(1);
    });

    it('should increment key each time recorder opens', async () => {
      const { result } = renderHook(() =>
        useAudioRecorder({ onAudioReady: mockOnAudioReady })
      );

      await act(async () => {
        await result.current.handleMicrophoneClick();
      });

      expect(result.current.audioRecorderKey).toBe(1);

      // Close and reopen
      act(() => {
        result.current.handleRemoveAudioRecording();
      });

      await act(async () => {
        await result.current.handleMicrophoneClick();
      });

      expect(result.current.audioRecorderKey).toBe(2);
    });

    it('should stop recording when recording is in progress', async () => {
      const mockStopRecording = jest.fn();
      const { result } = renderHook(() =>
        useAudioRecorder({ onAudioReady: mockOnAudioReady })
      );

      // Open recorder
      await act(async () => {
        await result.current.handleMicrophoneClick();
      });

      // Set recording state and mock ref
      act(() => {
        result.current.handleRecordingStateChange(true);
        (result.current.audioRecorderRef as any).current = {
          stopRecording: mockStopRecording,
        };
      });

      // Click mic while recording
      await act(async () => {
        await result.current.handleMicrophoneClick();
      });

      expect(mockStopRecording).toHaveBeenCalled();
    });

    it('should upload existing audio blob when recorder is open but not recording', async () => {
      const { result } = renderHook(() =>
        useAudioRecorder({ onAudioReady: mockOnAudioReady })
      );

      // Open recorder
      await act(async () => {
        await result.current.handleMicrophoneClick();
      });

      // Complete a recording without auto-upload flag
      const mockBlob = createMockBlob(1024, 'audio/webm');
      await act(async () => {
        await result.current.handleAudioRecordingComplete(mockBlob, 5.5);
      });

      expect(result.current.currentAudioBlob).not.toBeNull();

      // Click mic again to upload
      await act(async () => {
        await result.current.handleMicrophoneClick();
      });

      expect(mockOnAudioReady).toHaveBeenCalled();
      expect(result.current.currentAudioBlob).toBeNull();
      expect(result.current.showAudioRecorder).toBe(false);
    });
  });

  describe('Reset Audio State', () => {
    it('should reset all state to initial values', async () => {
      const { result } = renderHook(() =>
        useAudioRecorder({ onAudioReady: mockOnAudioReady })
      );

      // Set various states
      await act(async () => {
        await result.current.handleMicrophoneClick();
      });

      act(() => {
        result.current.handleRecordingStateChange(true);
      });

      const mockBlob = createMockBlob(1024, 'audio/webm');
      await act(async () => {
        await result.current.handleAudioRecordingComplete(mockBlob, 5.5);
      });

      // Reset
      act(() => {
        result.current.resetAudioState();
      });

      expect(result.current.showAudioRecorder).toBe(false);
      expect(result.current.currentAudioBlob).toBeNull();
      expect(result.current.audioRecorderKey).toBe(0);
      expect(result.current.isRecording).toBe(false);
    });
  });

  describe('Audio File Extensions', () => {
    const testCases = [
      { mimeType: 'audio/webm', expectedExtension: 'webm' },
      { mimeType: 'audio/webm;codecs=opus', expectedExtension: 'webm' },
      { mimeType: 'audio/mp4', expectedExtension: 'm4a' },
      { mimeType: 'audio/x-m4a', expectedExtension: 'm4a' },
      { mimeType: 'audio/ogg', expectedExtension: 'ogg' },
      { mimeType: 'audio/wav', expectedExtension: 'wav' },
      { mimeType: 'audio/mpeg', expectedExtension: 'mp3' },
      { mimeType: 'audio/mp3', expectedExtension: 'mp3' },
      { mimeType: 'audio/unknown', expectedExtension: 'webm' }, // Default
    ];

    testCases.forEach(({ mimeType, expectedExtension }) => {
      it(`should create file with .${expectedExtension} extension for ${mimeType}`, async () => {
        const { result } = renderHook(() =>
          useAudioRecorder({ onAudioReady: mockOnAudioReady })
        );

        // Open recorder and set up for upload
        await act(async () => {
          await result.current.handleMicrophoneClick();
        });

        const mockBlob = createMockBlob(1024, mimeType);
        await act(async () => {
          await result.current.handleAudioRecordingComplete(mockBlob, 5.5);
        });

        // Click to upload
        await act(async () => {
          await result.current.handleMicrophoneClick();
        });

        expect(mockOnAudioReady).toHaveBeenCalled();
        const [[files]] = mockOnAudioReady.mock.calls;
        expect(files[0].name).toMatch(new RegExp(`\\.${expectedExtension}$`));
      });
    });
  });

  describe('Safari-Safe File Creation', () => {
    it('should create valid File from Blob via arrayBuffer', async () => {
      const { result } = renderHook(() =>
        useAudioRecorder({ onAudioReady: mockOnAudioReady })
      );

      // Open recorder
      await act(async () => {
        await result.current.handleMicrophoneClick();
      });

      const mockBlob = createMockBlob(1024, 'audio/webm');
      await act(async () => {
        await result.current.handleAudioRecordingComplete(mockBlob, 5.5);
      });

      // Upload
      await act(async () => {
        await result.current.handleMicrophoneClick();
      });

      expect(mockOnAudioReady).toHaveBeenCalled();
      const [[files]] = mockOnAudioReady.mock.calls;
      expect(files[0]).toBeInstanceOf(File);
      expect(files[0].size).toBe(1024);
      expect(files[0].type).toBe('audio/webm');
    });

    it('should reject empty blobs', async () => {
      const { result } = renderHook(() =>
        useAudioRecorder({ onAudioReady: mockOnAudioReady })
      );

      // Open recorder
      await act(async () => {
        await result.current.handleMicrophoneClick();
      });

      // Create empty blob
      const emptyBlob = new Blob([], { type: 'audio/webm' });

      // Set the upload flag
      act(() => {
        result.current.handleBeforeStop();
      });

      // This should throw or handle the error
      await expect(
        act(async () => {
          await result.current.handleAudioRecordingComplete(emptyBlob, 0);
        })
      ).rejects.toThrow('Cannot create file from empty blob');
    });
  });

  describe('Handler Stability', () => {
    it('should return stable handler references', () => {
      const { result, rerender } = renderHook(() =>
        useAudioRecorder({ onAudioReady: mockOnAudioReady })
      );

      const firstHandlers = {
        handleRecordingStateChange: result.current.handleRecordingStateChange,
        handleRemoveAudioRecording: result.current.handleRemoveAudioRecording,
        handleBeforeStop: result.current.handleBeforeStop,
        resetAudioState: result.current.resetAudioState,
      };

      rerender();

      expect(result.current.handleRecordingStateChange).toBe(firstHandlers.handleRecordingStateChange);
      expect(result.current.handleRemoveAudioRecording).toBe(firstHandlers.handleRemoveAudioRecording);
      expect(result.current.handleBeforeStop).toBe(firstHandlers.handleBeforeStop);
      expect(result.current.resetAudioState).toBe(firstHandlers.resetAudioState);
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid open/close cycles', async () => {
      const { result } = renderHook(() =>
        useAudioRecorder({ onAudioReady: mockOnAudioReady })
      );

      for (let i = 0; i < 5; i++) {
        await act(async () => {
          await result.current.handleMicrophoneClick();
        });

        act(() => {
          result.current.handleRemoveAudioRecording();
        });
      }

      expect(result.current.showAudioRecorder).toBe(false);
      expect(result.current.audioRecorderKey).toBe(5);
    });

    it('should handle recording completion without opening recorder first', async () => {
      const { result } = renderHook(() =>
        useAudioRecorder({ onAudioReady: mockOnAudioReady })
      );

      // Directly call completion (edge case simulation)
      const mockBlob = createMockBlob(1024, 'audio/webm');
      await act(async () => {
        await result.current.handleAudioRecordingComplete(mockBlob, 5.5);
      });

      expect(result.current.currentAudioBlob).not.toBeNull();
    });

    it('should not throw when stopping recording with null ref', async () => {
      const { result } = renderHook(() =>
        useAudioRecorder({ onAudioReady: mockOnAudioReady })
      );

      // Open recorder
      await act(async () => {
        await result.current.handleMicrophoneClick();
      });

      // Set recording state but leave ref null
      act(() => {
        result.current.handleRecordingStateChange(true);
      });

      // Should not throw
      await act(async () => {
        await result.current.handleMicrophoneClick();
      });

      // stopRecording would have been called on null, which should be handled gracefully
      expect(result.current.showAudioRecorder).toBe(true);
    });
  });
});
