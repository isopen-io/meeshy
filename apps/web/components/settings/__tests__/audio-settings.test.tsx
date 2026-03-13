/**
 * AudioSettings Component Tests
 * Tests for the refactored AudioSettings using usePreferences hook
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AudioSettings } from '../audio-settings';

// Mock the usePreferences hook
const mockUpdatePreferences = jest.fn();

let mockUsePreferencesReturn: any;

jest.mock('@/hooks/use-preferences', () => ({
  usePreferences: () => mockUsePreferencesReturn,
}));

// Mock next/dynamic
jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: (loader: () => Promise<any>) => {
    const Component = (props: any) => {
      const [Comp, setComp] = React.useState<any>(null);
      React.useEffect(() => {
        loader().then((mod) => setComp(() => mod.default));
      }, []);
      return Comp ? <Comp {...props} /> : <div>Loading...</div>;
    };
    return Component;
  },
}));

// Mock i18n
jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, fallback?: string) => fallback || key,
  }),
}));

// Mock accessibility
jest.mock('@/hooks/use-accessibility', () => ({
  useReducedMotion: () => false,
}));

describe('AudioSettings', () => {
  const mockPreferences = {
    transcriptionEnabled: true,
    transcriptionSource: 'auto',
    autoTranscribeIncoming: false,
    audioTranslationEnabled: false,
    translatedAudioFormat: 'mp3',
    ttsEnabled: false,
    ttsSpeed: 1.0,
    ttsPitch: 1.0,
    audioQuality: 'high',
    noiseSuppression: true,
    echoCancellation: true,
    voiceProfileEnabled: false,
    voiceCloneQuality: 'balanced',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockUsePreferencesReturn = {
      data: mockPreferences,
      isLoading: false,
      isUpdating: false,
      error: null,
      consentViolations: null,
      updatePreferences: mockUpdatePreferences,
      refetch: jest.fn(),
    };
  });

  describe('Loading State', () => {
    it('should show loader when loading', () => {
      mockUsePreferencesReturn = {
        ...mockUsePreferencesReturn,
        data: null,
        isLoading: true,
      };

      render(<AudioSettings />);

      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByLabelText(/chargement/i)).toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('should show error message when error occurs', () => {
      const errorMessage = 'Failed to load preferences';
      mockUsePreferencesReturn = {
        ...mockUsePreferencesReturn,
        data: null,
        error: { message: errorMessage },
      };

      render(<AudioSettings />);

      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });
  });

  describe('Transcription Settings', () => {
    it('should render transcription section', () => {
      render(<AudioSettings />);

      expect(screen.getByText(/transcription audio/i)).toBeInTheDocument();
      expect(screen.getByText(/convertir vos messages audio en texte/i)).toBeInTheDocument();
    });

    it('should toggle transcription enabled', async () => {
      render(<AudioSettings />);

      const transcriptionSwitch = screen.getByLabelText(/activer la transcription/i);
      expect(transcriptionSwitch).toBeChecked();

      await userEvent.click(transcriptionSwitch);

      expect(mockUpdatePreferences).toHaveBeenCalledWith({ transcriptionEnabled: false });
    });

    it('should render transcription source select', () => {
      render(<AudioSettings />);

      const sourceSelect = screen.getByLabelText(/source de transcription/i);
      expect(sourceSelect).toBeInTheDocument();
      expect(sourceSelect).toHaveAttribute('role', 'combobox');
    });

    it('should show auto transcribe option when transcription enabled', () => {
      render(<AudioSettings />);

      expect(screen.getByText(/transcription automatique/i)).toBeInTheDocument();
    });

    it('should hide auto transcribe option when transcription disabled', () => {
      mockUsePreferencesReturn = {
        ...mockUsePreferencesReturn,
        data: { ...mockPreferences, transcriptionEnabled: false },
      };

      render(<AudioSettings />);

      expect(screen.queryByText(/transcription automatique/i)).not.toBeInTheDocument();
    });
  });

  describe('Translation Settings', () => {
    it('should render translation section', () => {
      render(<AudioSettings />);

      expect(screen.getAllByText(/traduction audio/i).length).toBeGreaterThanOrEqual(1);
    });

    it('should toggle audio translation', async () => {
      render(<AudioSettings />);

      const translationSwitch = screen.getByLabelText(/activer la traduction audio/i);
      expect(translationSwitch).not.toBeChecked();

      await userEvent.click(translationSwitch);

      expect(mockUpdatePreferences).toHaveBeenCalledWith({ audioTranslationEnabled: true });
    });

    it('should render format select when translation enabled', () => {
      mockUsePreferencesReturn = {
        ...mockUsePreferencesReturn,
        data: { ...mockPreferences, audioTranslationEnabled: true },
      };

      render(<AudioSettings />);

      const formatSelect = screen.getByLabelText(/format audio traduit/i);
      expect(formatSelect).toBeInTheDocument();
      expect(formatSelect).toHaveAttribute('role', 'combobox');
    });
  });

  describe('TTS Settings', () => {
    it('should render TTS section', () => {
      render(<AudioSettings />);

      expect(screen.getByText(/synth.se vocale \(TTS\)/i)).toBeInTheDocument();
    });

    it('should toggle TTS enabled', async () => {
      render(<AudioSettings />);

      const ttsSwitch = screen.getByLabelText(/activer la synth.se vocale/i);
      expect(ttsSwitch).not.toBeChecked();

      await userEvent.click(ttsSwitch);

      expect(mockUpdatePreferences).toHaveBeenCalledWith({ ttsEnabled: true });
    });

    it('should show TTS options when enabled', () => {
      mockUsePreferencesReturn = {
        ...mockUsePreferencesReturn,
        data: { ...mockPreferences, ttsEnabled: true, ttsVoice: 'default' },
      };

      render(<AudioSettings />);

      expect(screen.getByText(/vitesse de lecture/i)).toBeInTheDocument();
      expect(screen.getByText(/tonalit/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/voix TTS/i)).toBeInTheDocument();
    });

    it('should update TTS speed', async () => {
      mockUsePreferencesReturn = {
        ...mockUsePreferencesReturn,
        data: { ...mockPreferences, ttsEnabled: true },
      };

      render(<AudioSettings />);

      const speedSlider = screen.getByLabelText(/vitesse de lecture/i);
      fireEvent.change(speedSlider, { target: { value: '1.5' } });

      expect(mockUpdatePreferences).toHaveBeenCalledWith({ ttsSpeed: 1.5 });
    });
  });

  describe('Audio Quality Settings', () => {
    it('should render audio quality section', () => {
      render(<AudioSettings />);

      expect(screen.getAllByText(/qualit. audio/i).length).toBeGreaterThanOrEqual(1);
    });

    it('should render audio quality select', () => {
      render(<AudioSettings />);

      const qualitySelect = screen.getByLabelText(/niveau de qualit/i);
      expect(qualitySelect).toBeInTheDocument();
      expect(qualitySelect).toHaveAttribute('role', 'combobox');
    });

    it('should toggle noise suppression', async () => {
      render(<AudioSettings />);

      const noiseSwitch = screen.getByLabelText(/suppression du bruit/i);
      expect(noiseSwitch).toBeChecked();

      await userEvent.click(noiseSwitch);

      expect(mockUpdatePreferences).toHaveBeenCalledWith({ noiseSuppression: false });
    });

    it('should toggle echo cancellation', async () => {
      render(<AudioSettings />);

      const echoSwitch = screen.getByLabelText(/annulation d.écho/i);
      expect(echoSwitch).toBeChecked();

      await userEvent.click(echoSwitch);

      expect(mockUpdatePreferences).toHaveBeenCalledWith({ echoCancellation: false });
    });

    it('should show voice clone quality when voice profile enabled', () => {
      mockUsePreferencesReturn = {
        ...mockUsePreferencesReturn,
        data: { ...mockPreferences, voiceProfileEnabled: true },
      };

      render(<AudioSettings />);

      expect(screen.getByText(/qualit. du clonage vocal/i)).toBeInTheDocument();
    });
  });

  describe('Disabled State', () => {
    it('should disable all controls when saving', () => {
      mockUsePreferencesReturn = {
        ...mockUsePreferencesReturn,
        isUpdating: true,
      };

      render(<AudioSettings />);

      const switches = screen.getAllByRole('switch');
      switches.forEach((switchEl) => {
        expect(switchEl).toBeDisabled();
      });
    });
  });

  describe('GDPR Information', () => {
    it('should render GDPR information card', () => {
      render(<AudioSettings />);

      expect(screen.getByText(/informations sur vos donn.es/i)).toBeInTheDocument();
      expect(screen.getByText(/vos donn.es audio sont trait.es conform.ment au RGPD/i)).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<AudioSettings />);

      expect(screen.getByLabelText(/activer la transcription/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/source de transcription/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/activer la traduction audio/i)).toBeInTheDocument();
    });

    it('should have proper role attributes', () => {
      mockUsePreferencesReturn = {
        ...mockUsePreferencesReturn,
        data: null,
        isLoading: true,
      };

      render(<AudioSettings />);

      expect(screen.getByRole('status')).toBeInTheDocument();
    });
  });

  describe('Responsive Design', () => {
    it('should render mobile-friendly layout', () => {
      const { container } = render(<AudioSettings />);

      // Check for responsive classes
      expect(container.querySelector('.sm\\:space-y-6')).toBeInTheDocument();
      expect(container.querySelector('.sm\\:text-base')).toBeInTheDocument();
    });
  });
});
