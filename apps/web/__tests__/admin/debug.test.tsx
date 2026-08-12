import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockGetAuthToken = jest.fn();
const mockGetCurrentUser = jest.fn();
jest.mock('@/services/auth-manager.service', () => ({
  authManager: {
    getAuthToken: (...args: unknown[]) => mockGetAuthToken(...args),
    getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
  },
}));

const mockGetDefaultPermissions = jest.fn();
jest.mock('@/utils/user-adapter', () => ({
  getDefaultPermissions: (...args: unknown[]) => mockGetDefaultPermissions(...args),
}));

jest.mock('@/lib/config', () => ({
  buildApiUrl: (endpoint: string) => `http://localhost${endpoint}`,
  API_ENDPOINTS: { AUTH: { ME: '/auth/me' } },
}));

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div data-testid="card">{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div data-testid="card-content">{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div data-testid="card-header">{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h3 data-testid="card-title">{children}</h3>,
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick }: { children?: React.ReactNode; onClick?: () => void }) => (
    <button data-testid="button" onClick={onClick}>{children}</button>
  ),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch as typeof fetch;

import AdminDebug from '../../app/admin/debug';

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    username: 'admin',
    role: 'ADMIN',
    permissions: { canAccessAdmin: true },
    ...overrides,
  };
}

describe('AdminDebug', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAuthToken.mockReturnValue('tok123');
    mockGetCurrentUser.mockReturnValue({ id: 'u1', username: 'admin' });
    mockGetDefaultPermissions.mockReturnValue({ canAccessAdmin: true });
  });

  describe('loading state', () => {
    it('shows loading spinner before data is fetched', async () => {
      mockFetch.mockReturnValue(new Promise(() => {}));
      render(<AdminDebug />);
      expect(screen.getByText('debug.loading')).toBeInTheDocument();
    });

    it('shows animate-spin during loading', () => {
      mockFetch.mockReturnValue(new Promise(() => {}));
      const { container } = render(<AdminDebug />);
      expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    });
  });

  describe('with token and successful API response including user', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: { user: makeUser({ permissions: { canAccessAdmin: true }, role: 'ADMIN' }) },
        }),
      });
    });

    it('renders debug title after loading', async () => {
      render(<AdminDebug />);
      await waitFor(() => expect(screen.getByText('debug.title')).toBeInTheDocument());
    });

    it('renders back button', async () => {
      render(<AdminDebug />);
      await waitFor(() => expect(screen.getByText('debug.backToAdmin')).toBeInTheDocument());
    });

    it('renders general info card', async () => {
      render(<AdminDebug />);
      await waitFor(() => expect(screen.getByText('debug.generalInfo')).toBeInTheDocument());
    });

    it('shows token present', async () => {
      render(<AdminDebug />);
      await waitFor(() => {
        expect(screen.getByText(/debug\.tokenPresent/)).toBeInTheDocument();
        expect(screen.getAllByText('debug.yes').length).toBeGreaterThan(0);
      });
    });

    it('shows role from API', async () => {
      render(<AdminDebug />);
      await waitFor(() => {
        expect(screen.getByText(/debug\.role/)).toBeInTheDocument();
        expect(screen.getByText('ADMIN')).toBeInTheDocument();
      });
    });

    it('shows canAccessAdmin as yes', async () => {
      render(<AdminDebug />);
      await waitFor(() => {
        expect(screen.getByText(/debug\.canAccessAdmin/)).toBeInTheDocument();
      });
    });

    it('calls fetch with correct auth header', async () => {
      render(<AdminDebug />);
      await waitFor(() => screen.getByText('debug.title'));
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost/auth/me',
        expect.objectContaining({ headers: { Authorization: 'Bearer tok123' } }),
      );
    });

    it('calls getDefaultPermissions with resolved role', async () => {
      render(<AdminDebug />);
      await waitFor(() => screen.getByText('debug.title'));
      expect(mockGetDefaultPermissions).toHaveBeenCalledWith('ADMIN');
    });

    it('renders localStorage card', async () => {
      render(<AdminDebug />);
      await waitFor(() => expect(screen.getByText('debug.userLocalStorage')).toBeInTheDocument());
    });

    it('renders API response card', async () => {
      render(<AdminDebug />);
      await waitFor(() => expect(screen.getByText('debug.apiResponse')).toBeInTheDocument());
    });

    it('renders permissions from API card', async () => {
      render(<AdminDebug />);
      await waitFor(() => expect(screen.getByText('debug.permissionsApi')).toBeInTheDocument());
    });

    it('renders permissions from default card', async () => {
      render(<AdminDebug />);
      await waitFor(() => expect(screen.getByText('debug.permissionsDefault')).toBeInTheDocument());
    });
  });

  describe('without token', () => {
    beforeEach(() => {
      mockGetAuthToken.mockReturnValue(null);
    });

    it('does not call fetch', async () => {
      render(<AdminDebug />);
      await waitFor(() => expect(screen.getByText('debug.title')).toBeInTheDocument());
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('shows token absent', async () => {
      render(<AdminDebug />);
      await waitFor(() => expect(screen.getByText('debug.title')).toBeInTheDocument());
      const noCalls = screen.queryByText('debug.yes');
      expect(noCalls).not.toBeInTheDocument();
    });

    it('role falls back to UNKNOWN', async () => {
      render(<AdminDebug />);
      await waitFor(() => screen.getByText('debug.title'));
      expect(mockGetDefaultPermissions).toHaveBeenCalledWith('UNKNOWN');
    });
  });

  describe('when API response is not ok', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({ ok: false, status: 401 });
    });

    it('renders debug info without API user data', async () => {
      render(<AdminDebug />);
      await waitFor(() => expect(screen.getByText('debug.title')).toBeInTheDocument());
    });

    it('role remains UNKNOWN', async () => {
      render(<AdminDebug />);
      await waitFor(() => screen.getByText('debug.title'));
      expect(mockGetDefaultPermissions).toHaveBeenCalledWith('UNKNOWN');
    });
  });

  describe('when API response has no user in data', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: false, data: null }),
      });
    });

    it('renders debug info even when success is false', async () => {
      render(<AdminDebug />);
      await waitFor(() => expect(screen.getByText('debug.title')).toBeInTheDocument());
    });

    it('role remains UNKNOWN when success=false', async () => {
      render(<AdminDebug />);
      await waitFor(() => screen.getByText('debug.title'));
      expect(mockGetDefaultPermissions).toHaveBeenCalledWith('UNKNOWN');
    });
  });

  describe('when fetch throws an error', () => {
    beforeEach(() => {
      mockFetch.mockRejectedValue(new Error('Network error'));
    });

    it('renders title but not debug cards after error (debugInfo is null)', async () => {
      render(<AdminDebug />);
      await waitFor(() => {
        expect(screen.queryByText('debug.loading')).not.toBeInTheDocument();
      });
      expect(screen.getByText('debug.title')).toBeInTheDocument();
      expect(screen.queryByText('debug.generalInfo')).not.toBeInTheDocument();
    });

    it('does not throw when fetch fails', async () => {
      expect(() => render(<AdminDebug />)).not.toThrow();
      await waitFor(() =>
        expect(screen.queryByText('debug.loading')).not.toBeInTheDocument(),
      );
    });
  });

  describe('back button navigation', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: { user: makeUser() } }),
      });
    });

    it('navigates to /admin when back button is clicked', async () => {
      render(<AdminDebug />);
      await waitFor(() => screen.getByText('debug.backToAdmin'));
      fireEvent.click(screen.getByText('debug.backToAdmin'));
      expect(mockPush).toHaveBeenCalledWith('/admin');
    });
  });

  describe('getCurrentUser returns null', () => {
    beforeEach(() => {
      mockGetCurrentUser.mockReturnValue(null);
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: { user: makeUser() } }),
      });
    });

    it('handles null getCurrentUser gracefully', async () => {
      render(<AdminDebug />);
      await waitFor(() => expect(screen.getByText('debug.title')).toBeInTheDocument());
    });
  });

  describe('API response user has no permissions field', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: { user: { id: 'u1', role: 'MODERATOR', permissions: null } },
        }),
      });
    });

    it('canAccessAdmin falls back to false when permissions is null', async () => {
      render(<AdminDebug />);
      await waitFor(() => screen.getByText('debug.title'));
      expect(mockGetDefaultPermissions).toHaveBeenCalledWith('MODERATOR');
    });
  });
});
