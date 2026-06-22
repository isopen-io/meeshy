import { renderHook, act } from '@testing-library/react';
import { useAdminSettings } from '@/hooks/admin/use-admin-settings';
import type { ConfigSection, ConfigSetting } from '@/types/admin-settings';

const noop = () => null as any;

function makeSetting(overrides: Partial<ConfigSetting> & { key: string }): ConfigSetting {
  return {
    key: overrides.key,
    label: overrides.label ?? overrides.key,
    description: '',
    type: 'text',
    value: overrides.value ?? 'initial',
    defaultValue: overrides.defaultValue ?? 'default',
    implemented: overrides.implemented ?? true,
    category: 'system',
    ...overrides,
  };
}

function makeSection(id: string, settings: ConfigSetting[]): ConfigSection {
  return { id, title: id, description: '', icon: noop, settings };
}

const sectionA = makeSection('sectionA', [
  makeSetting({ key: 'key1', value: 'val1', defaultValue: 'def1' }),
  makeSetting({ key: 'key2', value: 42, defaultValue: 0, type: 'number' }),
]);

const sectionB = makeSection('sectionB', [
  makeSetting({ key: 'key3', value: true, defaultValue: false, type: 'boolean' }),
]);

describe('useAdminSettings', () => {
  describe('initialization', () => {
    it('loads all settings from configSections into the map', () => {
      const { result } = renderHook(() => useAdminSettings([sectionA, sectionB]));
      expect(result.current.settings.size).toBe(3);
      expect(result.current.settings.get('key1')?.value).toBe('val1');
      expect(result.current.settings.get('key2')?.value).toBe(42);
      expect(result.current.settings.get('key3')?.value).toBe(true);
    });

    it('starts with hasChanges=false', () => {
      const { result } = renderHook(() => useAdminSettings([sectionA]));
      expect(result.current.hasChanges).toBe(false);
    });

    it('returns empty settings for empty configSections', () => {
      const { result } = renderHook(() => useAdminSettings([]));
      expect(result.current.settings.size).toBe(0);
    });
  });

  describe('updateSetting', () => {
    it('updates the value for a known key', () => {
      const { result } = renderHook(() => useAdminSettings([sectionA]));
      act(() => { result.current.updateSetting('key1', 'newVal'); });
      expect(result.current.settings.get('key1')?.value).toBe('newVal');
    });

    it('sets hasChanges to true after update', () => {
      const { result } = renderHook(() => useAdminSettings([sectionA]));
      act(() => { result.current.updateSetting('key1', 'x'); });
      expect(result.current.hasChanges).toBe(true);
    });

    it('preserves other setting fields when updating value', () => {
      const { result } = renderHook(() => useAdminSettings([sectionA]));
      act(() => { result.current.updateSetting('key1', 'changed'); });
      const setting = result.current.settings.get('key1');
      expect(setting?.key).toBe('key1');
      expect(setting?.defaultValue).toBe('def1');
      expect(setting?.type).toBe('text');
    });

    it('is a no-op for an unknown key', () => {
      const { result } = renderHook(() => useAdminSettings([sectionA]));
      act(() => { result.current.updateSetting('nonexistent', 'x'); });
      expect(result.current.settings.size).toBe(2);
    });
  });

  describe('resetSetting', () => {
    it('restores a setting to its defaultValue', () => {
      const { result } = renderHook(() => useAdminSettings([sectionA]));
      act(() => { result.current.updateSetting('key1', 'changed'); });
      act(() => { result.current.resetSetting('key1'); });
      expect(result.current.settings.get('key1')?.value).toBe('def1');
    });

    it('keeps hasChanges=true after reset (single setting)', () => {
      const { result } = renderHook(() => useAdminSettings([sectionA]));
      act(() => { result.current.updateSetting('key1', 'changed'); });
      act(() => { result.current.resetSetting('key1'); });
      expect(result.current.hasChanges).toBe(true);
    });

    it('is a no-op for an unknown key', () => {
      const { result } = renderHook(() => useAdminSettings([sectionA]));
      const before = result.current.settings.get('key1')?.value;
      act(() => { result.current.resetSetting('nonexistent'); });
      expect(result.current.settings.get('key1')?.value).toBe(before);
    });
  });

  describe('resetAll', () => {
    it('restores all settings to their defaultValues', () => {
      const { result } = renderHook(() => useAdminSettings([sectionA, sectionB]));
      act(() => {
        result.current.updateSetting('key1', 'changed');
        result.current.updateSetting('key2', 99);
      });
      act(() => { result.current.resetAll(); });
      expect(result.current.settings.get('key1')?.value).toBe('def1');
      expect(result.current.settings.get('key2')?.value).toBe(0);
    });

    it('sets hasChanges=false after resetAll', () => {
      const { result } = renderHook(() => useAdminSettings([sectionA]));
      act(() => { result.current.updateSetting('key1', 'changed'); });
      expect(result.current.hasChanges).toBe(true);
      act(() => { result.current.resetAll(); });
      expect(result.current.hasChanges).toBe(false);
    });

    it('sets hasChanges=false even when called without prior changes', () => {
      const { result } = renderHook(() => useAdminSettings([sectionA]));
      act(() => { result.current.resetAll(); });
      expect(result.current.hasChanges).toBe(false);
    });
  });

  describe('getSettingsBySection', () => {
    it('returns settings for a valid section id', () => {
      const { result } = renderHook(() => useAdminSettings([sectionA, sectionB]));
      const settings = result.current.getSettingsBySection('sectionA');
      expect(settings).toHaveLength(2);
      expect(settings[0].key).toBe('key1');
      expect(settings[1].key).toBe('key2');
    });

    it('returns [] for an unknown section id', () => {
      const { result } = renderHook(() => useAdminSettings([sectionA]));
      expect(result.current.getSettingsBySection('unknown')).toEqual([]);
    });

    it('reflects current (updated) values for settings in the section', () => {
      const { result } = renderHook(() => useAdminSettings([sectionA]));
      act(() => { result.current.updateSetting('key1', 'updated-value'); });
      const settings = result.current.getSettingsBySection('sectionA');
      const key1 = settings.find(s => s.key === 'key1');
      expect(key1?.value).toBe('updated-value');
    });

    it('returns all settings from the section even after resetAll', () => {
      const { result } = renderHook(() => useAdminSettings([sectionA]));
      act(() => { result.current.updateSetting('key1', 'x'); });
      act(() => { result.current.resetAll(); });
      const settings = result.current.getSettingsBySection('sectionA');
      expect(settings).toHaveLength(2);
      expect(settings[0].value).toBe('def1');
    });

    it('falls back to original section setting when a key is absent from the map', () => {
      // When configSections is re-rendered with a new section that has a key not in the
      // initial map, getSettingsBySection falls back to the section's original setting (|| s).
      const { result, rerender } = renderHook(
        ({ sections }: { sections: ConfigSection[] }) => useAdminSettings(sections),
        { initialProps: { sections: [sectionA] } }
      );

      const newSection = makeSection('newSection', [
        makeSetting({ key: 'brand-new-key', value: 'fresh-value', defaultValue: 'fresh-default' }),
      ]);

      // Re-render with an additional section; the map was only initialized with sectionA keys.
      rerender({ sections: [sectionA, newSection] });

      // 'brand-new-key' is not in the settings Map → falls back to the section's original setting
      const sectionSettings = result.current.getSettingsBySection('newSection');
      expect(sectionSettings).toHaveLength(1);
      expect(sectionSettings[0].value).toBe('fresh-value');
    });
  });
});
