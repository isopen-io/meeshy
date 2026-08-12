import { renderHook } from '@testing-library/react';
import { useSettingsValidation } from '@/hooks/admin/use-settings-validation';
import type { ConfigSetting } from '@/types/admin-settings';

function makeSetting(overrides: Partial<ConfigSetting> & { key: string }): ConfigSetting {
  return {
    key: overrides.key,
    label: overrides.key,
    description: '',
    type: 'text',
    value: 'valid text',
    defaultValue: 'default',
    implemented: true,
    category: 'system',
    ...overrides,
  };
}

function renderValidation(settings: ConfigSetting[]) {
  const map = new Map(settings.map(s => [s.key, s]));
  return renderHook(() => useSettingsValidation(map));
}

describe('useSettingsValidation', () => {
  describe('isValid and errors', () => {
    it('is valid and has no errors when all settings pass', () => {
      const { result } = renderValidation([
        makeSetting({ key: 'A', type: 'text', value: 'hello' }),
        makeSetting({ key: 'B', type: 'number', value: 42 }),
        makeSetting({ key: 'C', type: 'boolean', value: true }),
      ]);
      expect(result.current.isValid).toBe(true);
      expect(result.current.errors).toHaveLength(0);
    });

    it('is invalid when at least one setting fails', () => {
      const { result } = renderValidation([
        makeSetting({ key: 'A', type: 'number', value: -5 }),
      ]);
      expect(result.current.isValid).toBe(false);
      expect(result.current.errors).toHaveLength(1);
    });

    it('accumulates one error per failing setting', () => {
      const { result } = renderValidation([
        makeSetting({ key: 'A', type: 'number', value: -1 }),
        makeSetting({ key: 'B', type: 'text', value: '' }),
      ]);
      expect(result.current.errors).toHaveLength(2);
      const keys = result.current.errors.map(e => e.key);
      expect(keys).toContain('A');
      expect(keys).toContain('B');
    });

    it('skips validation for unimplemented settings', () => {
      const { result } = renderValidation([
        makeSetting({ key: 'A', type: 'number', value: -999, implemented: false }),
      ]);
      expect(result.current.isValid).toBe(true);
      expect(result.current.errors).toHaveLength(0);
    });

    it('has no errors for an empty settings map', () => {
      const { result } = renderHook(() => useSettingsValidation(new Map()));
      expect(result.current.isValid).toBe(true);
      expect(result.current.errors).toHaveLength(0);
    });
  });

  describe('number type validation', () => {
    it('accepts a positive integer', () => {
      const { result } = renderValidation([
        makeSetting({ key: 'PORT', type: 'number', value: 3000 }),
      ]);
      expect(result.current.isValid).toBe(true);
    });

    it('accepts zero', () => {
      const { result } = renderValidation([
        makeSetting({ key: 'N', type: 'number', value: 0 }),
      ]);
      expect(result.current.isValid).toBe(true);
    });

    it('rejects negative numbers', () => {
      const { result } = renderValidation([
        makeSetting({ key: 'N', type: 'number', value: -1 }),
      ]);
      expect(result.current.errors[0]?.message).toMatch(/négative/);
    });

    it('rejects NaN', () => {
      const { result } = renderValidation([
        makeSetting({ key: 'N', type: 'number', value: NaN }),
      ]);
      expect(result.current.errors[0]?.message).toMatch(/nombre valide/);
    });

    it('rejects a string stored as a number-type setting', () => {
      const { result } = renderValidation([
        makeSetting({ key: 'N', type: 'number', value: 'not-a-number' as any }),
      ]);
      expect(result.current.isValid).toBe(false);
    });
  });

  describe('text type validation', () => {
    it('accepts a non-empty string', () => {
      const { result } = renderValidation([
        makeSetting({ key: 'T', type: 'text', value: 'hello world' }),
      ]);
      expect(result.current.isValid).toBe(true);
    });

    it('rejects an empty string', () => {
      const { result } = renderValidation([
        makeSetting({ key: 'T', type: 'text', value: '' }),
      ]);
      expect(result.current.errors[0]?.message).toMatch(/vide/);
    });

    it('rejects a whitespace-only string', () => {
      const { result } = renderValidation([
        makeSetting({ key: 'T', type: 'text', value: '   ' }),
      ]);
      expect(result.current.errors[0]?.message).toMatch(/vide/);
    });

    it('rejects a non-string value for text type', () => {
      const { result } = renderValidation([
        makeSetting({ key: 'T', type: 'text', value: 123 as any }),
      ]);
      expect(result.current.isValid).toBe(false);
    });

    it('validates URL for keys containing "URL"', () => {
      const { result } = renderValidation([
        makeSetting({ key: 'API_URL', type: 'text', value: 'not-a-url' }),
      ]);
      expect(result.current.errors[0]?.message).toMatch(/URL invalide/);
    });

    it('accepts a valid URL for URL keys', () => {
      const { result } = renderValidation([
        makeSetting({ key: 'API_URL', type: 'text', value: 'https://example.com/api' }),
      ]);
      expect(result.current.isValid).toBe(true);
    });

    it('does not validate URL format for non-URL keys', () => {
      const { result } = renderValidation([
        makeSetting({ key: 'NAME', type: 'text', value: 'just-a-name' }),
      ]);
      expect(result.current.isValid).toBe(true);
    });
  });

  describe('boolean type validation', () => {
    it('accepts true', () => {
      const { result } = renderValidation([
        makeSetting({ key: 'B', type: 'boolean', value: true }),
      ]);
      expect(result.current.isValid).toBe(true);
    });

    it('accepts false', () => {
      const { result } = renderValidation([
        makeSetting({ key: 'B', type: 'boolean', value: false }),
      ]);
      expect(result.current.isValid).toBe(true);
    });

    it('rejects a non-boolean value', () => {
      const { result } = renderValidation([
        makeSetting({ key: 'B', type: 'boolean', value: 'true' as any }),
      ]);
      expect(result.current.errors[0]?.message).toMatch(/true ou false/);
    });
  });

  describe('select type validation', () => {
    const options = [
      { label: 'Low', value: 'low' },
      { label: 'High', value: 'high' },
    ];

    it('accepts a value present in options', () => {
      const { result } = renderValidation([
        makeSetting({ key: 'S', type: 'select', value: 'low', options }),
      ]);
      expect(result.current.isValid).toBe(true);
    });

    it('rejects a value not present in options', () => {
      const { result } = renderValidation([
        makeSetting({ key: 'S', type: 'select', value: 'medium', options }),
      ]);
      expect(result.current.errors[0]?.message).toMatch(/invalide/);
    });

    it('rejects when options is undefined', () => {
      const { result } = renderValidation([
        makeSetting({ key: 'S', type: 'select', value: 'low', options: undefined }),
      ]);
      expect(result.current.isValid).toBe(false);
    });
  });

  describe('validateSetting (exposed function)', () => {
    it('returns null for a valid setting', () => {
      const { result } = renderHook(() => useSettingsValidation(new Map()));
      const setting = makeSetting({ key: 'T', type: 'text', value: 'ok' });
      expect(result.current.validateSetting(setting)).toBeNull();
    });

    it('returns an error message for a failing setting', () => {
      const { result } = renderHook(() => useSettingsValidation(new Map()));
      const setting = makeSetting({ key: 'N', type: 'number', value: -1 });
      expect(result.current.validateSetting(setting)).toMatch(/négative/);
    });

    it('returns null for unimplemented setting regardless of value', () => {
      const { result } = renderHook(() => useSettingsValidation(new Map()));
      const setting = makeSetting({ key: 'N', type: 'number', value: -999, implemented: false });
      expect(result.current.validateSetting(setting)).toBeNull();
    });
  });
});
