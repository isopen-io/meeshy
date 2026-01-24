/**
 * Tests for Settings Page (app/settings/page.tsx)
 *
 * Covers:
 * - Initial render states (loading, authenticated, unauthenticated)
 * - User settings display
 * - Settings update functionality
 * - Error handling
 * - Authentication flow
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';

// === MOCKS ===

// Mock Next.js router
const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    prefetch: jest.fn(),
    back: jest.fn(),
  }),
  usePathname: () => '/settings',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

// Mock sonner toast - using factory function to avoid hoisting issues
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

// Import toast mock after mock declaration
import { toast } from 'sonner';
const mockToast = toast as jest.Mocked<typeof toast>;

// Mock useI18n hook
jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string>) => {
      if (params) {
        return Object.entries(params).reduce(
          (str, [k, v]) => str.replace(`{${k}}`, v),
          key
        );
      }
      return key;
    },
    locale: 'fr',
    setLocale: jest.fn(),
  }),
}));

// Mock useI18n hook (aliased version)
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string>) => {
      if (params) {
        return Object.entries(params).reduce(
          (str, [k, v]) => str.replace(`{${k}}`, v),
          key
        );
      }
      return key;
    },
    locale: 'fr',
    setLocale: jest.fn(),
  }),
}));

// Mock use-accessibility hook
jest.mock('@/hooks/use-accessibility', () => ({
  useReducedMotion: () => false,
}));

// Mock buildApiUrl and API_ENDPOINTS
jest.mock('@/lib/config', () => ({
  buildApiUrl: (path: string) => `http://test-api${path}`,
  API_ENDPOINTS: {
    AUTH: {
      ME: '/auth/me',
    },
  },
}));

// Mock authManager - need to use function inside mock to avoid hoisting issues
let mockAuthToken: string | null = 'valid-token';
jest.mock('@/services/auth-manager.service', () => ({
  authManager: {
    getAuthToken: () => mockAuthToken,
    clearAllSessions: jest.fn(),
  },
}));

// Import authManager mock after mock declaration
import { authManager } from '@/services/auth-manager.service';
const mockClearAllSessions = authManager.clearAllSessions as jest.MockedFunction<typeof authManager.clearAllSessions>;

// Mock fetch responses
let mockFetchResponse: any = null;
let mockFetchError: Error | null = null;

// Mock DashboardLayout
jest.mock('@/components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children, title, className }: { children: React.ReactNode; title?: string; className?: string }) => (
    <div data-testid="dashboard-layout" data-title={title} className={className}>
      {children}
    </div>
  ),
}));

// Mock Footer
jest.mock('@/components/layout/Footer', () => ({
  Footer: () => <footer data-testid="footer">Footer</footer>,
}));

// Mock CompleteUserSettings component
let capturedOnUserUpdate: ((data: any) => void) | null = null;
jest.mock('@/components/settings/_archived/complete-user-settings', () => ({
  CompleteUserSettings: ({ user, onUserUpdate }: { user: any; onUserUpdate: (data: any) => void }) => {
    // Capture the callback so tests can trigger it
    capturedOnUserUpdate = onUserUpdate;
    return (
      <div data-testid="complete-user-settings" data-user-id={user?.id}>
        <button
          data-testid="update-settings-button"
          onClick={() => onUserUpdate({ firstName: 'Updated', lastName: 'User' })}
        >
          Update Settings
        </button>
        <span data-testid="user-username">{user?.username}</span>
        <span data-testid="user-email">{user?.email}</span>
      </div>
    );
  },
}));

// Import the component after mocks
import SettingsPage from '@/app/settings/page';

describe('SettingsPage', () => {
  const mockUser = {
    id: 'user-123',
    username: 'testuser',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    displayName: 'Test User',
    systemLanguage: 'fr',
    regionalLanguage: 'fr-FR',
    autoTranslateEnabled: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPush.mockClear();
    mockToast.success.mockClear();
    mockToast.error.mockClear();
    mockClearAllSessions.mockClear();
    mockAuthToken = 'valid-token';
    mockFetchError = null;
    capturedOnUserUpdate = null;

    // Setup default fetch mock
    global.fetch = jest.fn(() => {
      if (mockFetchError) {
        return Promise.reject(mockFetchError);
      }
      return Promise.resolve(mockFetchResponse);
    }) as jest.Mock;

    mockFetchResponse = {
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        success: true,
        data: { user: mockUser },
      }),
    };
  });

  describe('Loading State', () => {
    it('should render loading spinner initially', async () => {
      // Make fetch hang
      (global.fetch as jest.Mock).mockImplementation(() => new Promise(() => {}));

      const { container } = render(<SettingsPage />);

      expect(container.querySelector('.animate-spin') || container.querySelector('[class*="animate"]')).toBeInTheDocument();
      expect(screen.getByText('loadingSettings')).toBeInTheDocument();
    });

    it('should have proper accessibility for loading state', async () => {
      (global.fetch as jest.Mock).mockImplementation(() => new Promise(() => {}));

      render(<SettingsPage />);

      const loadingElement = screen.getByRole('status');
      expect(loadingElement).toBeInTheDocument();
      expect(screen.getByText(/Chargement en cours/i)).toBeInTheDocument();
    });

    it('should respect reduced motion preference', async () => {
      // This is mocked to return false, so animation should be present
      (global.fetch as jest.Mock).mockImplementation(() => new Promise(() => {}));

      const { container } = render(<SettingsPage />);

      // When reducedMotion is false, animation class should be present
      expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    });
  });

  describe('Authentication Flow', () => {
    it('should redirect to login if no auth token', async () => {
      mockAuthToken = null;

      render(<SettingsPage />);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/login');
      });
    });

    it('should redirect to login on 401 response', async () => {
      mockFetchResponse = {
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'Unauthorized' }),
      };

      render(<SettingsPage />);

      await waitFor(() => {
        expect(mockClearAllSessions).toHaveBeenCalled();
        expect(mockPush).toHaveBeenCalledWith('/login');
      });
    });

    it('should redirect to login on fetch error', async () => {
      mockFetchError = new Error('Network error');

      render(<SettingsPage />);

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalled();
        expect(mockPush).toHaveBeenCalledWith('/login');
      });
    });
  });

  describe('Success State', () => {
    it('should render settings page after successful load', async () => {
      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByTestId('dashboard-layout')).toBeInTheDocument();
        expect(screen.getByTestId('complete-user-settings')).toBeInTheDocument();
      });
    });

    it('should display page title', async () => {
      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('title')).toBeInTheDocument();
      });
    });

    it('should display hero section', async () => {
      render(<SettingsPage />);

      await waitFor(() => {
        // Check for the hero section content
        expect(screen.getByText('title')).toBeInTheDocument();
        expect(screen.getByText('pageTitle')).toBeInTheDocument();
      });
    });

    it('should display subtitle', async () => {
      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('subtitle')).toBeInTheDocument();
      });
    });

    it('should pass user data to CompleteUserSettings', async () => {
      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByTestId('complete-user-settings')).toHaveAttribute('data-user-id', 'user-123');
        expect(screen.getByTestId('user-username')).toHaveTextContent('testuser');
        expect(screen.getByTestId('user-email')).toHaveTextContent('test@example.com');
      });
    });

    it('should render footer', async () => {
      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByTestId('footer')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should show error toast on API error response', async () => {
      mockFetchResponse = {
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Server error' }),
      };

      render(<SettingsPage />);

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('Server error');
      });
    });

    it('should show error toast when response has no user data', async () => {
      mockFetchResponse = {
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          success: false,
          error: 'No user data',
        }),
      };

      render(<SettingsPage />);

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalled();
      });
    });

    it('should not render settings when user is null', async () => {
      mockFetchResponse = {
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          success: true,
          data: { user: null },
        }),
      };

      const { container } = render(<SettingsPage />);

      await waitFor(() => {
        // Wait for loading to complete
        expect(container.querySelector('.animate-spin')).not.toBeInTheDocument();
      });

      // CompleteUserSettings should not be rendered
      expect(screen.queryByTestId('complete-user-settings')).not.toBeInTheDocument();
    });
  });

  describe('Settings Update', () => {
    it('should call API when settings are updated', async () => {
      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByTestId('update-settings-button')).toBeInTheDocument();
      });

      // Setup the update response
      mockFetchResponse = {
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          success: true,
          data: { ...mockUser, firstName: 'Updated', lastName: 'User' },
        }),
      };

      fireEvent.click(screen.getByTestId('update-settings-button'));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          'http://test-api/users/me',
          expect.objectContaining({
            method: 'PATCH',
            headers: expect.objectContaining({
              'Content-Type': 'application/json',
              'Authorization': 'Bearer valid-token',
            }),
          })
        );
      });
    });

    it('should show success toast on successful update', async () => {
      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByTestId('update-settings-button')).toBeInTheDocument();
      });

      // Setup the update response
      mockFetchResponse = {
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          success: true,
          data: { ...mockUser, firstName: 'Updated' },
        }),
      };

      fireEvent.click(screen.getByTestId('update-settings-button'));

      await waitFor(() => {
        expect(mockToast.success).toHaveBeenCalledWith('success.settingsUpdated');
      });
    });

    it('should show error toast on failed update', async () => {
      // Setup fetch to first succeed (load), then fail (update)
      let callCount = 0;
      (global.fetch as jest.Mock).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Initial load
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
              success: true,
              data: { user: mockUser },
            }),
          });
        } else {
          // Update call fails
          return Promise.resolve({
            ok: false,
            status: 500,
            json: () => Promise.resolve({ error: 'Update failed' }),
          });
        }
      });

      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByTestId('update-settings-button')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('update-settings-button'));

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('Update failed');
      });
    });

    it('should redirect to login if token becomes invalid during update', async () => {
      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByTestId('update-settings-button')).toBeInTheDocument();
      });

      // Simulate token becoming invalid
      mockAuthToken = null;

      fireEvent.click(screen.getByTestId('update-settings-button'));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/login');
      });
    });
  });

  describe('API Request Headers', () => {
    it('should include proper headers in initial load request', async () => {
      render(<SettingsPage />);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          'http://test-api/auth/me',
          expect.objectContaining({
            headers: {
              'Authorization': 'Bearer valid-token',
              'Content-Type': 'application/json',
            },
          })
        );
      });
    });
  });
});
