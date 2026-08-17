/**
 * `useRiverModeFlag` — R-134. MÊME gamme de vecteurs que
 * `use-reading-modes-flag.test.ts` (WF-110), appliquée à un hook et un cookie
 * INDÉPENDANTS.
 */
let mockSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));

import { renderHook } from '@testing-library/react';
import { useRiverModeFlag } from '../use-river-mode-flag';

function clearAllCookies(): void {
  document.cookie.split(';').forEach((entry) => {
    const name = entry.split('=')[0]?.trim();
    if (name) {
      document.cookie = `${name}=; max-age=0; path=/`;
    }
  });
}

const originalEnv = process.env;

describe('useRiverModeFlag', () => {
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
    const { result } = renderHook(() => useRiverModeFlag());
    expect(result.current.active).toBe(false);
  });

  it('?riviere_mode=1 → actif, ET pose le cookie meeshy_riviere_mode=1 (effet appliqué par le hook)', () => {
    mockSearchParams = new URLSearchParams('riviere_mode=1');
    const { result } = renderHook(() => useRiverModeFlag());
    expect(result.current.active).toBe(true);
    expect(document.cookie).toContain('meeshy_riviere_mode=1');
  });

  it('?riviere_mode=0 → inactif, ET efface un cookie meeshy_riviere_mode=1 préexistant', () => {
    document.cookie = 'meeshy_riviere_mode=1; path=/';
    mockSearchParams = new URLSearchParams('riviere_mode=0');
    const { result } = renderHook(() => useRiverModeFlag());
    expect(result.current.active).toBe(false);
    expect(document.cookie).not.toContain('meeshy_riviere_mode=1');
  });

  it('cookie meeshy_riviere_mode=1 (sans searchParam) → actif, persiste entre visites', () => {
    document.cookie = 'meeshy_riviere_mode=1; path=/';
    const { result } = renderHook(() => useRiverModeFlag());
    expect(result.current.active).toBe(true);
  });

  it('NEXT_PUBLIC_RIVIERE_MODE_DEFAULT=true (sans searchParam ni cookie) → actif', () => {
    process.env.NEXT_PUBLIC_RIVIERE_MODE_DEFAULT = 'true';
    const { result } = renderHook(() => useRiverModeFlag());
    expect(result.current.active).toBe(true);
  });

  it('n\'affecte JAMAIS les cookies lentille_list/reading_modes — trois drapeaux indépendants', () => {
    mockSearchParams = new URLSearchParams('riviere_mode=1');
    renderHook(() => useRiverModeFlag());
    expect(document.cookie).not.toContain('meeshy_lentille=');
    expect(document.cookie).not.toContain('meeshy_reading_modes=');
  });
});
