/**
 * Tests for useFontPreference hook
 *
 * Tests cover:
 * - Initial font loading
 * - Font change functionality
 * - Reset to default
 * - localStorage integration
 * - Backend sync
 * - Error handling
 * - Document font application
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useFontPreference } from '@/hooks/use-font-preference';

// Mock auth manager
const mockGetAuthToken = jest.fn(() => 'auth-token-123');

jest.mock('@/services/auth-manager.service', () => ({
  authManager: {
    getAuthToken: () => mockGetAuthToken(),
  },
}));

// Mock fonts
const mockGetFontConfig = jest.fn((font: string) => ({
  name: font,
  cssClass: `font-${font}`,
  variable: `--font-${font}`,
}));

jest.mock('@/lib/fonts', () => ({
  FontFamily: {
    INTER: 'inter',
    ROBOTO: 'roboto',
  },
  defaultFont: 'inter',
  getFontConfig: (font: string) => mockGetFontConfig(font),
}));

// Mock config
jest.mock('@/lib/config', () => ({
  buildApiUrl: (path: string) => `https://api.example.com${path}`,
}));

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
    get store() {
      return store;
    },
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock document methods using spies (not replacing entire objects to preserve React Testing Library compatibility)
const mockClassListAdd = jest.fn();
const mockClassListRemove = jest.fn();
const mockSetProperty = jest.fn();

describe('useFontPreference', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.clear();
    mockClassListAdd.mockClear();
    mockClassListRemove.mockClear();
    mockSetProperty.mockClear();

    // Restore default auth token mock after clearAllMocks
    mockGetAuthToken.mockReturnValue('auth-token-123');

    // Restore default getFontConfig mock after clearAllMocks
    mockGetFontConfig.mockImplementation((font: string) => ({
      name: font,
      cssClass: `font-${font}`,
      variable: `--font-${font}`,
    }));

    // Spy on document methods instead of replacing entire objects
    jest.spyOn(document.body.classList, 'add').mockImplementation(mockClassListAdd);
    jest.spyOn(document.body.classList, 'remove').mockImplementation(mockClassListRemove);
    jest.spyOn(document.documentElement.style, 'setProperty').mockImplementation(mockSetProperty);

    // Default API response
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: { application: { fontFamily: 'inter' } },
      }),
    });

    // Suppress console warnings
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Initial State', () => {
    it('should return default font initially', () => {
      const { result } = renderHook(() => useFontPreference());

      expect(result.current.currentFont).toBe('nunito');
    });

    it('should return isLoading true initially', () => {
      const { result } = renderHook(() => useFontPreference());

      expect(result.current.isLoading).toBe(true);
    });

    it('should return error as null initially', () => {
      const { result } = renderHook(() => useFontPreference());

      expect(result.current.error).toBeNull();
    });

    it('should return fontConfig for current font', () => {
      const { result } = renderHook(() => useFontPreference());

      expect(result.current.fontConfig).toBeDefined();
    });
  });

  describe('Loading from localStorage', () => {
    it('should load font from localStorage', async () => {
      localStorageMock.setItem('font-family', 'roboto');

      // Backend also returns 'roboto' to match localStorage
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: { application: { fontFamily: 'roboto' } },
        }),
      });

      const { result } = renderHook(() => useFontPreference());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.currentFont).toBe('roboto');
    });

    it('should ignore invalid font from localStorage', async () => {
      localStorageMock.setItem('font-family', 'invalid-font');
      mockGetFontConfig.mockReturnValueOnce(null as any);

      const { result } = renderHook(() => useFontPreference());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.currentFont).toBe('inter');
    });
  });

  describe('Loading from Backend', () => {
    it('should fetch font preference from backend', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: { application: { fontFamily: 'roboto' } },
        }),
      });

      const { result } = renderHook(() => useFontPreference());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/v1/me/preferences?categories=application',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer auth-token-123',
          }),
        })
      );

      expect(result.current.currentFont).toBe('roboto');
    });

    it('should sync backend font to localStorage', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: { application: { fontFamily: 'roboto' } },
        }),
      });

      renderHook(() => useFontPreference());

      await waitFor(() => {
        expect(localStorageMock.setItem).toHaveBeenCalledWith('font-family', 'roboto');
      });
    });

    it('should handle backend error gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useFontPreference());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should fallback to default/localStorage
      expect(result.current.currentFont).toBe('nunito');
    });

    it('should not fetch if not authenticated', async () => {
      mockGetAuthToken.mockReturnValue(null as any);

      renderHook(() => useFontPreference());

      await waitFor(() => {
        // Give time for effect to run
        expect(true).toBe(true);
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('Change Font', () => {
    it('should change font and apply to document', async () => {
      const { result } = renderHook(() => useFontPreference());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.changeFontFamily('roboto');
      });

      expect(result.current.currentFont).toBe('roboto');
      expect(mockClassListAdd).toHaveBeenCalledWith('font-roboto');
    });

    it('should save font to localStorage', async () => {
      const { result } = renderHook(() => useFontPreference());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.changeFontFamily('roboto');
      });

      expect(localStorageMock.setItem).toHaveBeenCalledWith('font-family', 'roboto');
    });

    // Ce témoin exigeait un temps un `POST /user-preferences` (404 avalé,
    // #4189) puis, `#4181` n'ayant pas encore de route d'écriture, RIEN du
    // tout — le choix de police ne quittait jamais le navigateur, sur aucun
    // AUTRE appareil du même compte. #4181 fournit enfin cette route : ce
    // témoin garde qu'elle est désormais APPELÉE, avec la forme exacte que la
    // route unifiée attend (`fontFamily` sous la catégorie `application`).
    it('synchronise le changement sur /me/preferences (catégorie application, #4181)', async () => {
      const { result } = renderHook(() => useFontPreference());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      mockFetch.mockClear();
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ success: true }) });

      await act(async () => {
        await result.current.changeFontFamily('roboto');
      });

      // Plus JAMAIS l'adresse morte de #4189.
      const urlsAppelées = mockFetch.mock.calls.map((appel: unknown[]) => String(appel[0]));
      expect(urlsAppelées.filter((url) => url.includes('user-preferences'))).toEqual([]);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/v1/me/preferences',
        expect.objectContaining({
          method: 'PATCH',
          headers: expect.objectContaining({ Authorization: 'Bearer auth-token-123' }),
          body: JSON.stringify({ application: { fontFamily: 'roboto' } }),
        })
      );
      expect(localStorageMock.setItem).toHaveBeenCalledWith('font-family', 'roboto');
    });

    it('reste local — sans jeton, aucune synchronisation serveur ne part', async () => {
      const { result } = renderHook(() => useFontPreference());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      mockGetAuthToken.mockReturnValue(null as any);
      mockFetch.mockClear();

      await act(async () => {
        await result.current.changeFontFamily('roboto');
      });

      expect(mockFetch).not.toHaveBeenCalled();
      expect(localStorageMock.setItem).toHaveBeenCalledWith('font-family', 'roboto');
    });

    it('should set error for invalid font', async () => {
      // Mock getFontConfig to return null for the invalid font
      mockGetFontConfig.mockImplementation((font: string): any => {
        if (font === 'invalid') return null;
        return { name: font, cssClass: `font-${font}`, variable: `--font-${font}` };
      });

      const { result } = renderHook(() => useFontPreference());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.changeFontFamily('invalid' as any);
      });

      // Error should be set (either the French message or something similar)
      expect(result.current.error).not.toBeNull();
    });

    it('should handle backend save failure gracefully', async () => {
      const { result } = renderHook(() => useFontPreference());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      mockFetch.mockResolvedValueOnce({ ok: false });

      await act(async () => {
        await result.current.changeFontFamily('roboto');
      });

      // Should still update local state
      expect(result.current.currentFont).toBe('roboto');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('font-family', 'roboto');
    });
  });

  describe('Reset to Default', () => {
    it('should reset to default font', async () => {
      localStorageMock.setItem('font-family', 'roboto');

      const { result } = renderHook(() => useFontPreference());

      await waitFor(() => {
        expect(result.current.currentFont).toBe('roboto');
      });

      await act(async () => {
        result.current.resetToDefault();
      });

      await waitFor(() => {
        expect(result.current.currentFont).toBe('nunito');
      });
    });
  });

  describe('Document Font Application', () => {
    it('should update CSS custom property', async () => {
      const { result } = renderHook(() => useFontPreference());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.changeFontFamily('roboto');
      });

      expect(mockSetProperty).toHaveBeenCalledWith(
        '--font-primary',
        'var(--font-roboto)'
      );
    });

    it('should remove existing font classes', async () => {
      // Set className on actual document.body
      document.body.className = 'font-inter font-other some-class';

      const { result } = renderHook(() => useFontPreference());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.changeFontFamily('roboto');
      });

      expect(mockClassListRemove).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should set error on change failure', async () => {
      mockGetFontConfig.mockImplementation((font) => {
        if (font === 'error-font') {
          throw new Error('Font config error');
        }
        return { name: font, cssClass: `font-${font}`, variable: `--font-${font}` };
      });

      const { result } = renderHook(() => useFontPreference());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.changeFontFamily('error-font' as any);
      });

      expect(result.current.error).not.toBeNull();
    });

    it('should clear error on successful change', async () => {
      const { result } = renderHook(() => useFontPreference());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // First, cause an error
      mockGetFontConfig.mockReturnValueOnce(null as any);
      await act(async () => {
        await result.current.changeFontFamily('invalid' as any);
      });

      expect(result.current.error).not.toBeNull();

      // Then make successful change
      await act(async () => {
        await result.current.changeFontFamily('roboto');
      });

      expect(result.current.error).toBeNull();
    });
  });
});
