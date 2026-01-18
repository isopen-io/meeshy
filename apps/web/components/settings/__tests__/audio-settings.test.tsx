/**
 * AudioSettings Component Tests
 * Tests for the refactored AudioSettings using usePreferences hook
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AudioSettings } from '../audio-settings';
import { usePreferences } from '@/hooks/use-preferences';
import type { AudioPreference } from '@meeshy/shared/types/preferences';

// Mock the usePreferences hook
jest.mock('@/hooks/use-preferences');
const mockUsePreferences = usePreferences as jest.MockedFunction<typeof usePreferences>;

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
  const mockPreferences: AudioPreference = {
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

  const mockUpdateField = jest.fn();
  const mockUpdatePreferences = jest.fn();
  const mockResetPreferences = jest.fn();
  const mockRefresh = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    mockUsePreferences.mockReturnValue({
      preferences: mockPreferences,
      isLoading: false,
      isSaving: false,
      error: null,
      consentViolations: null,
      updateField: mockUpdateField,
      updatePreferences: mockUpdatePreferences,
      resetPreferences: mockResetPreferences,
      refresh: mockRefresh,
    });
  });

  describe('Loading State', () => {
    it('should show loader when loading', () => {
      mockUsePreferences.mockReturnValue({
        preferences: null,
        isLoading: true,
        isSaving: false,
        error: null,
        consentViolations: null,
        updateField: mockUpdateField,
        updatePreferences: mockUpdatePreferences,
        resetPreferences: mockResetPreferences,
        refresh: mockRefresh,
      });

      render(<AudioSettings />);

      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByLabelText(/chargement/i)).toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('should show error message when error occurs', () => {
      const errorMessage = 'Failed to load preferences';
      mockUsePreferences.mockReturnValue({
        preferences: null,
        isLoading: false,
        isSaving: false,
        error: errorMessage,
        consentViolations: null,
        updateField: mockUpdateField,
        updatePreferences: mockUpdatePreferences,
        resetPreferences: mockResetPreferences,
        refresh: mockRefresh,
      });

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

      expect(mockUpdateField).toHaveBeenCalledWith('transcriptionEnabled', false);
    });

    it('should change transcription source', async () => {
      render(<AudioSettings />);

      const sourceSelect = screen.getByLabelText(/source de transcription/i);
      await userEvent.click(sourceSelect);

      const serverOption = screen.getByText(/serveur \(meilleure qualité\)/i);
      await userEvent.click(serverOption);

      expect(mockUpdateField).toHaveBeenCalledWith('transcriptionSource', 'server');
    });

    it('should show auto transcribe option when transcription enabled', () => {
      render(<AudioSettings />);

      expect(screen.getByText(/transcription automatique/i)).toBeInTheDocument();
    });

    it('should hide auto transcribe option when transcription disabled', () => {
      mockUsePreferences.mockReturnValue({
        preferences: { ...mockPreferences, transcriptionEnabled: false },
        isLoading: false,
        isSaving: false,
        error: null,
        consentViolations: null,
        updateField: mockUpdateField,
        updatePreferences: mockUpdatePreferences,
        resetPreferences: mockResetPreferences,
        refresh: mockRefresh,
      });

      render(<AudioSettings />);

      expect(screen.queryByText(/transcription automatique/i)).not.toBeInTheDocument();
    });
  });

  describe('Translation Settings', () => {
    it('should render translation section', () => {
      render(<AudioSettings />);

      expect(screen.getByText(/traduction audio/i)).toBeInTheDocument();
    });

    it('should toggle audio translation', async () => {
      render(<AudioSettings />);

      const translationSwitch = screen.getByLabelText(/activer la traduction audio/i);
      expect(translationSwitch).not.toBeChecked();

      await userEvent.click(translationSwitch);

      expect(mockUpdateField).toHaveBeenCalledWith('audioTranslationEnabled', true);
    });

    it('should change translated audio format', async () => {
      mockUsePreferences.mockReturnValue({
        preferences: { ...mockPreferences, audioTranslationEnabled: true },
        isLoading: false,
        isSaving: false,
        error: null,
        consentViolations: null,
        updateField: mockUpdateField,
        updatePreferences: mockUpdatePreferences,
        resetPreferences: mockResetPreferences,
        refresh: mockRefresh,
      });

      render(<AudioSettings />);

      const formatSelect = screen.getByLabelText(/format audio traduit/i);
      await userEvent.click(formatSelect);

      const oggOption = screen.getByText(/ogg \(meilleure qualité\)/i);
      await userEvent.click(oggOption);

      expect(mockUpdateField).toHaveBeenCalledWith('translatedAudioFormat', 'ogg');
    });
  });

  describe('TTS Settings', () => {
    it('should render TTS section', () => {
      render(<AudioSettings />);

      expect(screen.getByText(/synthèse vocale \(TTS\)/i)).toBeInTheDocument();
    });

    it('should toggle TTS enabled', async () => {
      render(<AudioSettings />);

      const ttsSwitch = screen.getByLabelText(/activer la synthèse vocale/i);
      expect(ttsSwitch).not.toBeChecked();

      await userEvent.click(ttsSwitch);

      expect(mockUpdateField).toHaveBeenCalledWith('ttsEnabled', true);
    });

    it('should show TTS options when enabled', () => {
      mockUsePreferences.mockReturnValue({
        preferences: { ...mockPreferences, ttsEnabled: true, ttsVoice: 'default' },
        isLoading: false,
        isSaving: false,
        error: null,
        consentViolations: null,
        updateField: mockUpdateField,
        updatePreferences: mockUpdatePreferences,
        resetPreferences: mockResetPreferences,
        refresh: mockRefresh,
      });

      render(<AudioSettings />);

      expect(screen.getByText(/vitesse de lecture/i)).toBeInTheDocument();
      expect(screen.getByText(/tonalité/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/voix TTS/i)).toBeInTheDocument();
    });

    it('should update TTS speed', async () => {
      mockUsePreferences.mockReturnValue({
        preferences: { ...mockPreferences, ttsEnabled: true },
        isLoading: false,
        isSaving: false,
        error: null,
        consentViolations: null,
        updateField: mockUpdateField,
        updatePreferences: mockUpdatePreferences,
        resetPreferences: mockResetPreferences,
        refresh: mockRefresh,
      });

      render(<AudioSettings />);

      const speedSlider = screen.getByLabelText(/vitesse de lecture/i);
      fireEvent.change(speedSlider, { target: { value: '1.5' } });

      expect(mockUpdateField).toHaveBeenCalledWith('ttsSpeed', 1.5);
    });
  });

  describe('Audio Quality Settings', () => {
    it('should render audio quality section', () => {
      render(<AudioSettings />);

      expect(screen.getByText(/qualité audio/i)).toBeInTheDocument();
    });

    it('should change audio quality', async () => {
      render(<AudioSettings />);

      const qualitySelect = screen.getByLabelText(/niveau de qualité/i);
      await userEvent.click(qualitySelect);

      const losslessOption = screen.getByText(/sans perte \(meilleure qualité\)/i);
      await userEvent.click(losslessOption);

      expect(mockUpdateField).toHaveBeenCalledWith('audioQuality', 'lossless');
    });

    it('should toggle noise suppression', async () => {
      render(<AudioSettings />);

      const noiseSwitch = screen.getByLabelText(/suppression du bruit/i);
      expect(noiseSwitch).toBeChecked();

      await userEvent.click(noiseSwitch);

      expect(mockUpdateField).toHaveBeenCalledWith('noiseSuppression', false);
    });

    it('should toggle echo cancellation', async () => {
      render(<AudioSettings />);

      const echoSwitch = screen.getByLabelText(/annulation d'écho/i);
      expect(echoSwitch).toBeChecked();

      await userEvent.click(echoSwitch);

      expect(mockUpdateField).toHaveBeenCalledWith('echoCancellation', false);
    });

    it('should show voice clone quality when voice profile enabled', () => {
      mockUsePreferences.mockReturnValue({
        preferences: { ...mockPreferences, voiceProfileEnabled: true },
        isLoading: false,
        isSaving: false,
        error: null,
        consentViolations: null,
        updateField: mockUpdateField,
        updatePreferences: mockUpdatePreferences,
        resetPreferences: mockResetPreferences,
        refresh: mockRefresh,
      });

      render(<AudioSettings />);

      expect(screen.getByText(/qualité du clonage vocal/i)).toBeInTheDocument();
    });
  });

  describe('Disabled State', () => {
    it('should disable all controls when saving', () => {
      mockUsePreferences.mockReturnValue({
        preferences: mockPreferences,
        isLoading: false,
        isSaving: true,
        error: null,
        consentViolations: null,
        updateField: mockUpdateField,
        updatePreferences: mockUpdatePreferences,
        resetPreferences: mockResetPreferences,
        refresh: mockRefresh,
      });

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

      expect(screen.getByText(/informations sur vos données/i)).toBeInTheDocument();
      expect(screen.getByText(/vos données audio sont traitées conformément au RGPD/i)).toBeInTheDocument();
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
      mockUsePreferences.mockReturnValue({
        preferences: null,
        isLoading: true,
        isSaving: false,
        error: null,
        consentViolations: null,
        updateField: mockUpdateField,
        updatePreferences: mockUpdatePreferences,
        resetPreferences: mockResetPreferences,
        refresh: mockRefresh,
      });

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
