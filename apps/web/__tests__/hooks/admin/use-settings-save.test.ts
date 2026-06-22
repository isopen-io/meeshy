import { renderHook, act } from '@testing-library/react';
import { useSettingsSave } from '@/hooks/admin/use-settings-save';
import type { ConfigSetting } from '@/types/admin-settings';

function makeSetting(key: string, overrides: Partial<ConfigSetting> = {}): ConfigSetting {
  return {
    key,
    label: key,
    description: '',
    type: 'text',
    value: 'val',
    defaultValue: 'default',
    implemented: true,
    category: 'system',
    envVar: key.toUpperCase(),
    ...overrides,
  };
}

function makeSettingsMap(settings: ConfigSetting[]): Map<string, ConfigSetting> {
  return new Map(settings.map(s => [s.key, s]));
}

describe('useSettingsSave', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('initial state', () => {
    it('starts with isSaving=false', () => {
      const { result } = renderHook(() => useSettingsSave());
      expect(result.current.isSaving).toBe(false);
    });

    it('starts with saveError=null', () => {
      const { result } = renderHook(() => useSettingsSave());
      expect(result.current.saveError).toBeNull();
    });
  });

  describe('saveSettings', () => {
    it('completes with isSaving=false after the simulated API call', async () => {
      const { result } = renderHook(() => useSettingsSave());
      const map = makeSettingsMap([makeSetting('KEY')]);

      await act(async () => {
        const p = result.current.saveSettings(map);
        jest.runAllTimers();
        await p;
      });

      expect(result.current.isSaving).toBe(false);
      expect(result.current.saveError).toBeNull();
    });

    it('filters out non-implemented settings before saving', async () => {
      const { result } = renderHook(() => useSettingsSave());
      const map = makeSettingsMap([
        makeSetting('IMPL_KEY', { implemented: true }),
        makeSetting('SKIP_KEY', { implemented: false }),
      ]);

      await act(async () => {
        const p = result.current.saveSettings(map);
        jest.runAllTimers();
        await p;
      });

      const logCalls = (console.log as jest.Mock).mock.calls;
      const payload = logCalls.find(([label]) => label === 'Saving settings:')?.[1] as { key: string }[];
      expect(payload).toBeDefined();
      expect(payload.map(s => s.key)).toContain('IMPL_KEY');
      expect(payload.map(s => s.key)).not.toContain('SKIP_KEY');
    });

    it('includes key, value, and envVar in the payload for each implemented setting', async () => {
      const { result } = renderHook(() => useSettingsSave());
      const map = makeSettingsMap([
        makeSetting('MY_KEY', { value: 'myval', envVar: 'MY_ENV', implemented: true }),
      ]);

      await act(async () => {
        const p = result.current.saveSettings(map);
        jest.runAllTimers();
        await p;
      });

      const payload = (console.log as jest.Mock).mock.calls.find(([l]) => l === 'Saving settings:')?.[1] as any[];
      expect(payload[0]).toEqual({ key: 'MY_KEY', value: 'myval', envVar: 'MY_ENV' });
    });

    it('logs a restart warning when a PORT key is included', async () => {
      const { result } = renderHook(() => useSettingsSave());
      const map = makeSettingsMap([makeSetting('SERVER_PORT', { implemented: true })]);

      await act(async () => {
        const p = result.current.saveSettings(map);
        jest.runAllTimers();
        await p;
      });

      expect(console.warn).toHaveBeenCalled();
    });

    it('logs a restart warning when a DATABASE key is included', async () => {
      const { result } = renderHook(() => useSettingsSave());
      const map = makeSettingsMap([makeSetting('DATABASE_URL', { implemented: true })]);

      await act(async () => {
        const p = result.current.saveSettings(map);
        jest.runAllTimers();
        await p;
      });

      expect(console.warn).toHaveBeenCalled();
    });

    it('logs a restart warning when NODE_ENV is included', async () => {
      const { result } = renderHook(() => useSettingsSave());
      const map = makeSettingsMap([makeSetting('NODE_ENV', { implemented: true })]);

      await act(async () => {
        const p = result.current.saveSettings(map);
        jest.runAllTimers();
        await p;
      });

      expect(console.warn).toHaveBeenCalled();
    });

    it('does not log a restart warning for unrelated keys', async () => {
      const { result } = renderHook(() => useSettingsSave());
      const map = makeSettingsMap([makeSetting('FEATURE_FLAG', { implemented: true })]);

      await act(async () => {
        const p = result.current.saveSettings(map);
        jest.runAllTimers();
        await p;
      });

      expect(console.warn).not.toHaveBeenCalled();
    });

    it('sets saveError and re-throws on failure', async () => {
      jest.spyOn(console, 'log').mockImplementation(() => {
        throw new Error('API failure');
      });

      const { result } = renderHook(() => useSettingsSave());
      const map = makeSettingsMap([makeSetting('KEY')]);

      let caughtError: unknown = null;
      await act(async () => {
        try {
          await result.current.saveSettings(map);
        } catch (e) {
          caughtError = e;
        }
      });

      expect((caughtError as Error)?.message).toBe('API failure');
      expect(result.current.saveError).toBe('API failure');
      expect(result.current.isSaving).toBe(false);
    });

    it('handles non-Error rejections by setting a default message', async () => {
      jest.spyOn(console, 'log').mockImplementation(() => {
        // eslint-disable-next-line @typescript-eslint/no-throw-literal
        throw 'raw string error';
      });

      const { result } = renderHook(() => useSettingsSave());
      const map = makeSettingsMap([makeSetting('KEY')]);

      let caughtError: unknown = null;
      await act(async () => {
        try {
          await result.current.saveSettings(map);
        } catch (e) {
          caughtError = e;
        }
      });

      expect(caughtError).toBe('raw string error');
      expect(result.current.saveError).toBe('Erreur lors de la sauvegarde');
    });
  });

  describe('clearError', () => {
    it('resets saveError to null', async () => {
      jest.spyOn(console, 'log').mockImplementation(() => {
        throw new Error('fail');
      });

      const { result } = renderHook(() => useSettingsSave());
      const map = makeSettingsMap([makeSetting('KEY')]);

      await act(async () => {
        await result.current.saveSettings(map).catch(() => {});
      });

      expect(result.current.saveError).toBe('fail');

      act(() => { result.current.clearError(); });

      expect(result.current.saveError).toBeNull();
    });
  });
});
