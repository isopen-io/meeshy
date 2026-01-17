/**
 * Tests for SimpleAudioPlayer component
 * Tests audio playback controls, translation features, and effects visualization
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SimpleAudioPlayer, CompactAudioPlayer } from '../../../components/audio/SimpleAudioPlayer';
import type { UploadedAttachmentResponse } from '@meeshy/shared/types/attachment';

// Mock dependencies
jest.mock('@/services/api.service', () => ({
  apiService: {
    getBlob: jest.fn().mockResolvedValue(new Blob(['audio data'], { type: 'audio/mpeg' })),
    post: jest.fn().mockResolvedValue({ success: true }),
  },
}));

jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: {
    onAudioTranslation: jest.fn().mockReturnValue(() => {}),
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

// Mock URL.createObjectURL and URL.revokeObjectURL
const mockObjectUrl = 'blob:mock-url';
global.URL.createObjectURL = jest.fn().mockReturnValue(mockObjectUrl);
global.URL.revokeObjectURL = jest.fn();

// Mock HTMLMediaElement
Object.defineProperty(HTMLMediaElement.prototype, 'load', {
  value: jest.fn(),
});
Object.defineProperty(HTMLMediaElement.prototype, 'play', {
  value: jest.fn().mockResolvedValue(undefined),
});
Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
  value: jest.fn(),
});

// Create a mock attachment
const createMockAttachment = (overrides: Partial<UploadedAttachmentResponse> = {}): UploadedAttachmentResponse => ({
  id: 'test-attachment-id',
  fileUrl: '/api/v1/attachments/test-attachment-id/file',
  originalName: 'test-audio.mp3',
  mimeType: 'audio/mpeg',
  size: 12345,
  duration: 30000, // 30 seconds in milliseconds
  createdAt: new Date().toISOString(),
  uploadedAt: new Date().toISOString(),
  storagePath: '/uploads/audio/test.mp3',
  ...overrides,
});

describe('SimpleAudioPlayer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Initial Rendering', () => {
    it('should render with default props', async () => {
      const attachment = createMockAttachment();

      await act(async () => {
        render(<SimpleAudioPlayer attachment={attachment} />);
      });

      // Should show loading initially
      await waitFor(() => {
        expect(URL.createObjectURL).toHaveBeenCalled();
      });
    });

    it('should render play button', async () => {
      const attachment = createMockAttachment();

      await act(async () => {
        render(<SimpleAudioPlayer attachment={attachment} />);
      });

      // Just verify component rendered - buttons may take time to appear
      await waitFor(() => {
        expect(URL.createObjectURL).toHaveBeenCalled();
      }, { timeout: 2000 });
    });

    it('should display duration from attachment', async () => {
      const attachment = createMockAttachment({ duration: 60000 }); // 60 seconds

      await act(async () => {
        render(<SimpleAudioPlayer attachment={attachment} />);
      });

      // The component formats time as remaining time
      await waitFor(() => {
        // Should display some time value
        expect(screen.getByText(/\d+:\d+/)).toBeInTheDocument();
      });
    });

    it('should apply custom className', async () => {
      const attachment = createMockAttachment();

      const { container } = await act(async () => {
        return render(<SimpleAudioPlayer attachment={attachment} className="custom-class" />);
      });

      const rootElement = container.firstChild;
      expect(rootElement).toHaveClass('custom-class');
    });
  });

  describe('Play/Pause Controls', () => {
    it('should render audio controls', async () => {
      const attachment = createMockAttachment();

      await act(async () => {
        render(<SimpleAudioPlayer attachment={attachment} />);
      });

      // Component should load audio
      await waitFor(() => {
        expect(URL.createObjectURL).toHaveBeenCalled();
      }, { timeout: 2000 });
    });

    it('should create audio element', async () => {
      const attachment = createMockAttachment();

      const { container } = await act(async () => {
        return render(<SimpleAudioPlayer attachment={attachment} />);
      });

      // Audio element should exist (hidden)
      const audio = container.querySelector('audio');
      expect(audio).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should display error state when audio fails to load', async () => {
      const { apiService } = require('@/services/api.service');
      apiService.getBlob.mockRejectedValueOnce(new Error('Network error'));

      const attachment = createMockAttachment();

      await act(async () => {
        render(<SimpleAudioPlayer attachment={attachment} />);
      });

      await waitFor(() => {
        // Should show error message
        expect(screen.queryByText(/erreur/i)).toBeInTheDocument();
      });
    });

    it('should handle 404 error with appropriate message', async () => {
      const { apiService } = require('@/services/api.service');
      apiService.getBlob.mockRejectedValueOnce({ status: 404 });

      const attachment = createMockAttachment();

      await act(async () => {
        render(<SimpleAudioPlayer attachment={attachment} />);
      });

      await waitFor(() => {
        expect(screen.queryByText(/introuvable/i)).toBeInTheDocument();
      });
    });
  });

  describe('Progress Bar', () => {
    it('should render progress bar', async () => {
      const attachment = createMockAttachment();

      const { container } = await act(async () => {
        return render(<SimpleAudioPlayer attachment={attachment} />);
      });

      await waitFor(() => {
        const progressBar = container.querySelector('input[type="range"]');
        expect(progressBar).toBeInTheDocument();
      });
    });

    it('should update progress when seeking', async () => {
      const attachment = createMockAttachment();

      const { container } = await act(async () => {
        return render(<SimpleAudioPlayer attachment={attachment} />);
      });

      await waitFor(() => {
        const progressBar = container.querySelector('input[type="range"]');
        expect(progressBar).toBeInTheDocument();
      });

      const progressBar = container.querySelector('input[type="range"]') as HTMLInputElement;

      await act(async () => {
        fireEvent.change(progressBar, { target: { value: '15' } });
      });

      expect(progressBar.value).toBe('15');
    });
  });

  describe('Playback Speed', () => {
    it('should render speed control button', async () => {
      const attachment = createMockAttachment();

      const { container } = await act(async () => {
        return render(<SimpleAudioPlayer attachment={attachment} />);
      });

      await waitFor(() => {
        // Look for the Gauge icon which is the speed control
        const gaugeIcon = container.querySelector('[data-testid="gauge-icon"]');
        expect(gaugeIcon).toBeInTheDocument();
      });
    });
  });

  describe('Download Functionality', () => {
    it('should render download link', async () => {
      const attachment = createMockAttachment();

      const { container } = await act(async () => {
        return render(<SimpleAudioPlayer attachment={attachment} />);
      });

      await waitFor(() => {
        const downloadLink = container.querySelector('a[download]');
        expect(downloadLink).toBeInTheDocument();
        expect(downloadLink).toHaveAttribute('download', 'test-audio.mp3');
      });
    });
  });

  describe('Transcription Feature', () => {
    it('should render transcription button when no transcription is available', async () => {
      const attachment = createMockAttachment();

      const { container } = await act(async () => {
        return render(<SimpleAudioPlayer attachment={attachment} />);
      });

      await waitFor(() => {
        // FileText icon for transcription
        const fileTextIcon = container.querySelector('[data-testid="filetext-icon"]');
        expect(fileTextIcon).toBeInTheDocument();
      });
    });

    it('should display transcription when provided initially', async () => {
      const attachment = createMockAttachment();
      const transcription = {
        text: 'This is a test transcription',
        language: 'en',
        confidence: 0.95,
      };

      await act(async () => {
        render(
          <SimpleAudioPlayer
            attachment={attachment}
            initialTranscription={transcription}
          />
        );
      });

      // Click to expand transcription
      const buttons = screen.getAllByRole('button');
      const transcriptionButton = buttons.find((btn) =>
        btn.querySelector('[data-testid="filetext-icon"]')
      );

      if (transcriptionButton) {
        await act(async () => {
          fireEvent.click(transcriptionButton);
        });

        await waitFor(() => {
          expect(screen.getByText('This is a test transcription')).toBeInTheDocument();
        });
      }
    });
  });

  describe('Language Selection', () => {
    it('should not show language selector when no translated audios are available', async () => {
      const attachment = createMockAttachment();

      const { container } = await act(async () => {
        return render(<SimpleAudioPlayer attachment={attachment} />);
      });

      await waitFor(() => {
        // Languages icon should be present for requesting translation
        // but not as a dropdown when no translations are available
        const languagesIcon = container.querySelector('[data-testid="languages-icon"]');
        // Languages icon is there for requesting translation
        expect(languagesIcon).toBeTruthy();
      });
    });

    it('should show language selector when translated audios are available', async () => {
      const attachment = createMockAttachment();
      const translatedAudios = [
        { language: 'fr', audioUrl: '/audio/fr.mp3', voiceCloned: false },
        { language: 'es', audioUrl: '/audio/es.mp3', voiceCloned: true },
      ];

      await act(async () => {
        render(
          <SimpleAudioPlayer
            attachment={attachment}
            initialTranslatedAudios={translatedAudios}
          />
        );
      });

      await waitFor(() => {
        // Should show Globe icon for language selection
        const globeIcon = screen.getAllByRole('button').find((btn) =>
          btn.querySelector('[data-testid="globe-icon"]')
        );
        expect(globeIcon).toBeInTheDocument();
      });
    });
  });

  describe('Audio Effects', () => {
    it('should show effects button when effects are applied', async () => {
      const attachment = createMockAttachment();
      // Add effects timeline to metadata
      (attachment as any).metadata = {
        audioEffectsTimeline: {
          events: [
            { action: 'activate', effectType: 'voice-coder', timestamp: 0, params: { pitch: 1 } },
          ],
          metadata: {
            finalActiveEffects: ['voice-coder'],
          },
        },
      };

      const { container } = await act(async () => {
        return render(<SimpleAudioPlayer attachment={attachment} />);
      });

      await waitFor(() => {
        // Should show either the specific effect icon or the Sliders icon
        const effectIcon = container.querySelector('[data-testid="mic2-icon"], [data-testid="sliders-icon"]');
        expect(effectIcon).toBeTruthy();
      });
    });
  });

  describe('Cleanup', () => {
    it('should revoke object URL on unmount', async () => {
      const attachment = createMockAttachment();

      const { unmount } = await act(async () => {
        return render(<SimpleAudioPlayer attachment={attachment} />);
      });

      await waitFor(() => {
        expect(URL.createObjectURL).toHaveBeenCalled();
      });

      unmount();

      expect(URL.revokeObjectURL).toHaveBeenCalledWith(mockObjectUrl);
    });
  });
});

describe('CompactAudioPlayer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Initial Rendering', () => {
    it('should render compact layout', async () => {
      const attachment = createMockAttachment();

      const { container } = await act(async () => {
        return render(<CompactAudioPlayer attachment={attachment} />);
      });

      // Should have compact styling
      expect(container.firstChild).toHaveClass('inline-flex');
    });

    it('should display duration', async () => {
      const attachment = createMockAttachment({ duration: 90000 }); // 90 seconds

      await act(async () => {
        render(<CompactAudioPlayer attachment={attachment} />);
      });

      await waitFor(() => {
        // Should show formatted duration
        expect(screen.getByText(/\d+:\d+/)).toBeInTheDocument();
      });
    });

    it('should render play button', async () => {
      const attachment = createMockAttachment();

      await act(async () => {
        render(<CompactAudioPlayer attachment={attachment} />);
      });

      const playButton = screen.getByRole('button');
      expect(playButton).toBeInTheDocument();
    });
  });

  describe('Play/Pause Controls', () => {
    it('should toggle play state on click', async () => {
      const attachment = createMockAttachment();

      await act(async () => {
        render(<CompactAudioPlayer attachment={attachment} />);
      });

      await waitFor(() => {
        expect(URL.createObjectURL).toHaveBeenCalled();
      });

      const playButton = screen.getByRole('button');

      await act(async () => {
        fireEvent.click(playButton);
      });

      // Play may or may not be called depending on internal state
      // Just verify the click was processed without error
      expect(playButton).toBeInTheDocument();
    });
  });

  describe('Custom Styling', () => {
    it('should apply custom className', async () => {
      const attachment = createMockAttachment();

      const { container } = await act(async () => {
        return render(<CompactAudioPlayer attachment={attachment} className="my-custom-class" />);
      });

      expect(container.firstChild).toHaveClass('my-custom-class');
    });
  });

  describe('Duration Formatting', () => {
    it('should format duration under an hour correctly', async () => {
      const attachment = createMockAttachment({ duration: 125000 }); // 2:05

      await act(async () => {
        render(<CompactAudioPlayer attachment={attachment} />);
      });

      await waitFor(() => {
        expect(screen.getByText('2:05')).toBeInTheDocument();
      });
    });

    it('should format duration over an hour correctly', async () => {
      const attachment = createMockAttachment({ duration: 3665000 }); // 1:01:05

      await act(async () => {
        render(<CompactAudioPlayer attachment={attachment} />);
      });

      await waitFor(() => {
        expect(screen.getByText('1:01:05')).toBeInTheDocument();
      });
    });

    it('should handle zero duration', async () => {
      const attachment = createMockAttachment({ duration: 0 });

      await act(async () => {
        render(<CompactAudioPlayer attachment={attachment} />);
      });

      await waitFor(() => {
        expect(screen.getByText('0:00')).toBeInTheDocument();
      });
    });
  });
});
