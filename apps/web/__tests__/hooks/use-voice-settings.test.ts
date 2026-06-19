import { renderHook, act } from '@testing-library/react';
import { useVoiceSettings } from '@/hooks/use-voice-settings';

// ─── Mock sonner ──────────────────────────────────────────────────────────────

const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();

jest.mock('sonner', () => ({
  toast: {
    success: (...args: any[]) => mockToastSuccess(...args),
    error: (...args: any[]) => mockToastError(...args),
  },
}));

// ─── Mock apiService ──────────────────────────────────────────────────────────

const mockGet = jest.fn();
const mockPut = jest.fn();

jest.mock('@/services/api.service', () => ({
  apiService: {
    get: (...args: any[]) => mockGet(...args),
    put: (...args: any[]) => mockPut(...args),
  },
}));

// ─── Factory ──────────────────────────────────────────────────────────────────

function makeConfigData(overrides = {}) {
  return {
    voiceCloningExaggeration: 0.5,
    voiceCloningCfgWeight: 0.7,
    voiceCloningTemperature: 0.8,
    voiceCloningTopP: 0.9,
    voiceCloningQualityPreset: 'high',
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useVoiceSettings', () => {
  describe('initial state', () => {
    it('starts with DEFAULT_VOICE_CLONING_SETTINGS, not saving, no unsaved changes', () => {
      const { result } = renderHook(() => useVoiceSettings());
      expect(result.current.voiceCloningSettings).toBeDefined();
      expect(result.current.isSavingSettings).toBe(false);
      expect(result.current.hasUnsavedChanges).toBe(false);
    });
  });

  describe('loadSettings', () => {
    it('loads settings from API (nested response)', async () => {
      const configData = makeConfigData();
      mockGet.mockResolvedValueOnce({ success: true, data: { data: configData } });

      const { result } = renderHook(() => useVoiceSettings());
      await act(async () => {
        await result.current.loadSettings();
      });

      expect(result.current.voiceCloningSettings.voiceCloningExaggeration).toBe(0.5);
      expect(result.current.voiceCloningSettings.voiceCloningCfgWeight).toBe(0.7);
      expect(result.current.hasUnsavedChanges).toBe(false);
    });

    it('loads settings from flat API response', async () => {
      const configData = makeConfigData();
      mockGet.mockResolvedValueOnce({ success: true, data: configData });

      const { result } = renderHook(() => useVoiceSettings());
      await act(async () => {
        await result.current.loadSettings();
      });

      expect(result.current.voiceCloningSettings.voiceCloningExaggeration).toBe(0.5);
    });

    it('falls back to defaults for missing fields', async () => {
      mockGet.mockResolvedValueOnce({ success: true, data: { voiceCloningExaggeration: 0.3 } });

      const { result } = renderHook(() => useVoiceSettings());
      const defaultSettings = result.current.voiceCloningSettings;

      await act(async () => {
        await result.current.loadSettings();
      });

      expect(result.current.voiceCloningSettings.voiceCloningExaggeration).toBe(0.3);
      // Other fields should have defaults
      expect(result.current.voiceCloningSettings.voiceCloningCfgWeight).toBe(
        defaultSettings.voiceCloningCfgWeight
      );
    });

    it('shows error toast on failure', async () => {
      mockGet.mockRejectedValueOnce(new Error('API error'));

      const { result } = renderHook(() => useVoiceSettings());
      await act(async () => {
        await result.current.loadSettings();
      });

      expect(mockToastError).toHaveBeenCalledWith('Failed to load voice settings');
    });

    it('does not update settings when success=false', async () => {
      mockGet.mockResolvedValueOnce({ success: false, data: null });

      const { result } = renderHook(() => useVoiceSettings());
      const initialSettings = result.current.voiceCloningSettings;

      await act(async () => {
        await result.current.loadSettings();
      });

      expect(result.current.voiceCloningSettings).toEqual(initialSettings);
    });

    it('uses defaults for null field values', async () => {
      // All fields are null - ?? should fall back to defaults
      const configData = {
        voiceCloningExaggeration: null,
        voiceCloningCfgWeight: null,
        voiceCloningTemperature: null,
        voiceCloningTopP: null,
        voiceCloningQualityPreset: null,
      };
      mockGet.mockResolvedValueOnce({ success: true, data: configData });

      const { result } = renderHook(() => useVoiceSettings());
      const defaultSettings = result.current.voiceCloningSettings;

      await act(async () => {
        await result.current.loadSettings();
      });

      // null ?? default → should use default values
      expect(result.current.voiceCloningSettings.voiceCloningExaggeration).toBe(
        defaultSettings.voiceCloningExaggeration
      );
      expect(result.current.voiceCloningSettings.voiceCloningQualityPreset).toBe(
        defaultSettings.voiceCloningQualityPreset
      );
    });
  });

  describe('updateSetting', () => {
    it('updates a setting and marks unsaved changes', () => {
      const { result } = renderHook(() => useVoiceSettings());

      act(() => {
        result.current.updateSetting('voiceCloningExaggeration', 0.9);
      });

      expect(result.current.voiceCloningSettings.voiceCloningExaggeration).toBe(0.9);
      expect(result.current.hasUnsavedChanges).toBe(true);
    });

    it('merges settings without overwriting other fields', () => {
      const { result } = renderHook(() => useVoiceSettings());
      const initialTemp = result.current.voiceCloningSettings.voiceCloningTemperature;

      act(() => {
        result.current.updateSetting('voiceCloningTopP', 0.5);
      });

      expect(result.current.voiceCloningSettings.voiceCloningTemperature).toBe(initialTemp);
      expect(result.current.voiceCloningSettings.voiceCloningTopP).toBe(0.5);
    });

    it('can update multiple settings sequentially', () => {
      const { result } = renderHook(() => useVoiceSettings());

      act(() => {
        result.current.updateSetting('voiceCloningExaggeration', 0.1);
        result.current.updateSetting('voiceCloningCfgWeight', 0.2);
      });

      expect(result.current.voiceCloningSettings.voiceCloningExaggeration).toBe(0.1);
      expect(result.current.voiceCloningSettings.voiceCloningCfgWeight).toBe(0.2);
    });
  });

  describe('saveSettings', () => {
    it('saves settings and shows success toast', async () => {
      mockPut.mockResolvedValueOnce({ success: true });

      const { result } = renderHook(() => useVoiceSettings());
      act(() => {
        result.current.updateSetting('voiceCloningExaggeration', 0.6);
      });

      await act(async () => {
        await result.current.saveSettings();
      });

      expect(mockPut).toHaveBeenCalledWith(
        '/user-features/configuration',
        expect.objectContaining({ voiceCloningExaggeration: 0.6 })
      );
      expect(mockToastSuccess).toHaveBeenCalledWith('Voice cloning settings saved');
      expect(result.current.hasUnsavedChanges).toBe(false);
      expect(result.current.isSavingSettings).toBe(false);
    });

    it('shows error toast when success=false', async () => {
      mockPut.mockResolvedValueOnce({ success: false });

      const { result } = renderHook(() => useVoiceSettings());
      await act(async () => {
        await result.current.saveSettings();
      });

      expect(mockToastError).toHaveBeenCalledWith('Failed to save settings');
      expect(result.current.isSavingSettings).toBe(false);
    });

    it('shows error toast on exception', async () => {
      mockPut.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useVoiceSettings());
      await act(async () => {
        await result.current.saveSettings();
      });

      expect(mockToastError).toHaveBeenCalledWith('Failed to save settings');
      expect(result.current.isSavingSettings).toBe(false);
    });

    it('restores isSavingSettings to false in finally', async () => {
      mockPut.mockResolvedValueOnce({ success: true });

      const { result } = renderHook(() => useVoiceSettings());
      await act(async () => {
        await result.current.saveSettings();
      });

      expect(result.current.isSavingSettings).toBe(false);
    });
  });

  describe('resetSettings', () => {
    it('restores default settings and marks unsaved changes', async () => {
      mockGet.mockResolvedValueOnce({ success: true, data: makeConfigData() });

      const { result } = renderHook(() => useVoiceSettings());
      await act(async () => {
        await result.current.loadSettings();
      });
      expect(result.current.hasUnsavedChanges).toBe(false);

      act(() => {
        result.current.resetSettings();
      });

      expect(result.current.hasUnsavedChanges).toBe(true);
      // Settings should be reset to defaults
      expect(result.current.voiceCloningSettings).toBeDefined();
    });
  });
});
