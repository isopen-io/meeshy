/**
 * `useReadingModesFlag` — WF-110 (workshop §5 V4). MÊME gamme de vecteurs
 * que le bloc `lentille_list` de `__tests__/hooks/use-feature-flags.test.tsx`
 * (WL-100), appliqué à un hook et un cookie INDÉPENDANTS.
 */
let mockSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));

import { renderHook } from '@testing-library/react';
import { useReadingModesFlag } from '../use-reading-modes-flag';

function clearAllCookies(): void {
  document.cookie.split(';').forEach((entry) => {
    const name = entry.split('=')[0]?.trim();
    if (name) {
      document.cookie = `${name}=; max-age=0; path=/`;
    }
  });
}

const originalEnv = process.env;

describe('useReadingModesFlag', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    mockSearchParams = new URLSearchParams();
    clearAllCookies();
  });

  afterEach(() => {
    process.env = originalEnv;
    clearAllCookies();
  });

  it('OFF par défaut (aucun searchParam, aucun cookie, aucun env)', () => {
    const { result } = renderHook(() => useReadingModesFlag());
    expect(result.current.active).toBe(false);
  });

  it('?reading_modes=1 → actif, ET pose le cookie meeshy_reading_modes=1 (effet appliqué par le hook)', () => {
    mockSearchParams = new URLSearchParams('reading_modes=1');
    const { result } = renderHook(() => useReadingModesFlag());
    expect(result.current.active).toBe(true);
    expect(document.cookie).toContain('meeshy_reading_modes=1');
  });

  it('?reading_modes=0 → inactif, ET efface un cookie meeshy_reading_modes=1 préexistant', () => {
    document.cookie = 'meeshy_reading_modes=1; path=/';
    mockSearchParams = new URLSearchParams('reading_modes=0');
    const { result } = renderHook(() => useReadingModesFlag());
    expect(result.current.active).toBe(false);
    expect(document.cookie).not.toContain('meeshy_reading_modes=1');
  });

  it('cookie meeshy_reading_modes=1 (sans searchParam) → actif, persiste entre visites', () => {
    document.cookie = 'meeshy_reading_modes=1; path=/';
    const { result } = renderHook(() => useReadingModesFlag());
    expect(result.current.active).toBe(true);
  });

  it('NEXT_PUBLIC_READING_MODES_DEFAULT=true (sans searchParam ni cookie) → actif', () => {
    process.env.NEXT_PUBLIC_READING_MODES_DEFAULT = 'true';
    const { result } = renderHook(() => useReadingModesFlag());
    expect(result.current.active).toBe(true);
  });

  it('n\'affecte JAMAIS le cookie lentille_list — les deux drapeaux sont indépendants', () => {
    mockSearchParams = new URLSearchParams('reading_modes=1');
    renderHook(() => useReadingModesFlag());
    expect(document.cookie).not.toContain('meeshy_lentille=');
  });
});
