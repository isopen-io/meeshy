/**
 * Tests for hooks/use-i18n.ts (and useI18n.ts barrel)
 */

const mockCurrentInterfaceLanguage = { value: 'en' };
const mockSetInterfaceLanguage = jest.fn();

jest.mock('@/stores', () => ({
  useLanguageStore: (selector: (s: { currentInterfaceLanguage: string; setInterfaceLanguage: typeof mockSetInterfaceLanguage }) => unknown) =>
    selector({ currentInterfaceLanguage: mockCurrentInterfaceLanguage.value, setInterfaceLanguage: mockSetInterfaceLanguage }),
}));

// Mock dynamic locale imports (files exist on disk — we override with controlled fixtures)
jest.mock(
  '@/locales/en/common.json',
  () => ({ greeting: 'Hello', nested: { deep: 'Deep value' }, items: ['a', 'b', 'c'], number: 42 })
);
jest.mock(
  '@/locales/fr/common.json',
  () => ({ greeting: 'Bonjour', nested: { deep: 'Valeur profonde' }, items: ['x', 'y'] })
);
jest.mock(
  '@/locales/en/auth.json',
  () => ({ login: 'Login', template: 'Hello {name}!' })
);

import { renderHook, act, waitFor } from '@testing-library/react';
import { useI18n, clearTranslationsCache } from '@/hooks/use-i18n';

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentInterfaceLanguage.value = 'en';
  clearTranslationsCache();
});

// ─── initial state ────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('starts with isLoading = true', () => {
    const { result } = renderHook(() => useI18n('common'));
    expect(result.current.isLoading).toBe(true);
  });

  it('exposes setLocale', () => {
    const { result } = renderHook(() => useI18n('common'));
    expect(typeof result.current.setLocale).toBe('function');
  });
});

// ─── locale reflects store ────────────────────────────────────────────────────

describe('locale', () => {
  it('locale matches current interface language', async () => {
    mockCurrentInterfaceLanguage.value = 'fr';
    const { result } = renderHook(() => useI18n('common'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.locale).toBe('fr');
    expect(result.current.currentLanguage).toBe('fr');
  });

  it('setLocale delegates to store action', async () => {
    const { result } = renderHook(() => useI18n('common'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => { result.current.setLocale('es'); });
    expect(mockSetInterfaceLanguage).toHaveBeenCalledWith('es');
  });
});

// ─── t — translation function ─────────────────────────────────────────────────

describe('t — translation function', () => {
  it('translates a simple key', async () => {
    const { result } = renderHook(() => useI18n('common'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.t('greeting')).toBe('Hello');
  });

  it('translates a nested key with dot notation', async () => {
    const { result } = renderHook(() => useI18n('common'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.t('nested.deep')).toBe('Deep value');
  });

  it('returns the key itself when translation is missing', async () => {
    const { result } = renderHook(() => useI18n('common'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.t('nonexistent.key')).toBe('nonexistent.key');
  });

  it('returns fallback string when key is missing', async () => {
    const { result } = renderHook(() => useI18n('common'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.t('missing.key', 'default text')).toBe('default text');
  });

  it('substitutes params in template string', async () => {
    const { result } = renderHook(() => useI18n('auth'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.t('template', { name: 'Alice' })).toBe('Hello Alice!');
  });

  it('returns key when value is not a string (e.g. object)', async () => {
    const { result } = renderHook(() => useI18n('common'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.t('nested')).toBe('nested');
  });

  it('returns key when value is a number', async () => {
    const { result } = renderHook(() => useI18n('common'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.t('number')).toBe('number');
  });
});

// ─── tArray ───────────────────────────────────────────────────────────────────

describe('tArray', () => {
  it('returns an array for an array key', async () => {
    const { result } = renderHook(() => useI18n('common'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.tArray('items')).toEqual(['a', 'b', 'c']);
  });

  it('returns empty array for missing key', async () => {
    const { result } = renderHook(() => useI18n('common'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.tArray('does.not.exist')).toEqual([]);
  });

  it('returns empty array for non-array key', async () => {
    const { result } = renderHook(() => useI18n('common'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.tArray('greeting')).toEqual([]);
  });
});

// ─── locale change reloads translations ──────────────────────────────────────

describe('locale change', () => {
  it('reloads translations when locale changes', async () => {
    mockCurrentInterfaceLanguage.value = 'en';
    const { result, rerender } = renderHook(() => useI18n('common'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.t('greeting')).toBe('Hello');

    mockCurrentInterfaceLanguage.value = 'fr';
    rerender();
    await waitFor(() => expect(result.current.t('greeting')).toBe('Bonjour'));
  });
});

// ─── namespace load ───────────────────────────────────────────────────────────

describe('namespace load', () => {
  it('loads a different namespace (auth)', async () => {
    const { result } = renderHook(() => useI18n('auth'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.t('login')).toBe('Login');
  });
});
