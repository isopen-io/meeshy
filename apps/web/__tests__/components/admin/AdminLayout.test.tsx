import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockLogout = jest.fn();
jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ logout: mockLogout }),
}));

const mockSetTheme = jest.fn();
let mockUserValue: Record<string, unknown> | null = null;
jest.mock('@/stores', () => ({
  useUser: () => mockUserValue,
  useAppActions: () => ({ setTheme: mockSetTheme }),
}));

jest.mock('@/components/auth', () => ({
  AuthGuard: ({ children }: { children: React.ReactNode }) => <div data-testid="auth-guard">{children}</div>,
}));

const mockCanAccessAdmin = jest.fn();
const mockHasPermission = jest.fn();
const mockGetRoleDisplayName = jest.fn();
jest.mock('@/services/permissions.service', () => ({
  PermissionsService: {
    canAccessAdmin: (...args: unknown[]) => mockCanAccessAdmin(...args),
    hasPermission: (...args: unknown[]) => mockHasPermission(...args),
    getRoleDisplayName: (...args: unknown[]) => mockGetRoleDisplayName(...args),
  },
}));

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({ t: (key: string, p?: Record<string, unknown>) => p ? `${key}(${JSON.stringify(p)})` : key }),
}));

jest.mock('@/stores/language-store', () => ({
  useCurrentInterfaceLanguage: () => 'en',
}));

jest.mock('@/lib/lazy-components', () => ({
  preloadRouteModules: jest.fn(),
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() },
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, 'aria-label': ariaLabel, ...rest }: { children?: React.ReactNode; onClick?: () => void; 'aria-label'?: string; [key: string]: unknown }) => (
    <button onClick={onClick} aria-label={ariaLabel} data-testid="button" {...rest}>{children}</button>
  ),
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, className, variant }: { children?: React.ReactNode; className?: string; variant?: string }) => (
    <span data-testid="badge" data-variant={variant} className={className}>{children}</span>
  ),
}));

jest.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children?: React.ReactNode }) => <div data-testid="scroll-area">{children}</div>,
}));

jest.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children }: { children?: React.ReactNode }) => <div data-testid="avatar">{children}</div>,
  AvatarImage: ({ src, alt }: { src?: string; alt?: string }) => <img data-testid="avatar-image" src={src} alt={alt} />,
  AvatarFallback: ({ children }: { children?: React.ReactNode }) => <div data-testid="avatar-fallback">{children}</div>,
}));

jest.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children?: React.ReactNode }) => <div data-testid="dropdown-menu">{children}</div>,
  DropdownMenuTrigger: ({ children }: { children?: React.ReactNode }) => <div data-testid="dropdown-trigger">{children}</div>,
  DropdownMenuContent: ({ children }: { children?: React.ReactNode }) => <div data-testid="dropdown-content">{children}</div>,
  DropdownMenuItem: ({ children, onClick }: { children?: React.ReactNode; onClick?: () => void }) => (
    <div data-testid="dropdown-item" onClick={onClick}>{children}</div>
  ),
}));

jest.mock('lucide-react', () => ({
  Crown: ({ className }: { className?: string }) => <svg data-testid="icon-crown" className={className} />,
  LogOut: ({ className }: { className?: string }) => <svg data-testid="icon-logout" className={className} />,
  Menu: ({ className }: { className?: string }) => <svg data-testid="icon-menu" className={className} />,
  X: ({ className }: { className?: string }) => <svg data-testid="icon-x" className={className} />,
  Home: ({ className }: { className?: string }) => <svg data-testid="icon-home" className={className} />,
  Shield: ({ className }: { className?: string }) => <svg data-testid="icon-shield" className={className} />,
  Users: ({ className }: { className?: string }) => <svg data-testid="icon-users" className={className} />,
  BarChart3: ({ className }: { className?: string }) => <svg data-testid="icon-barchart3" className={className} />,
  Settings: ({ className }: { className?: string }) => <svg data-testid="icon-settings" className={className} />,
  FileText: ({ className }: { className?: string }) => <svg data-testid="icon-filetext" className={className} />,
  Bot: ({ className }: { className?: string }) => <svg data-testid="icon-bot" className={className} />,
  Activity: ({ className }: { className?: string }) => <svg data-testid="icon-activity" className={className} />,
  Trophy: ({ className }: { className?: string }) => <svg data-testid="icon-trophy" className={className} />,
  Mail: ({ className }: { className?: string }) => <svg data-testid="icon-mail" className={className} />,
  Link2: ({ className }: { className?: string }) => <svg data-testid="icon-link2" className={className} />,
  Sun: ({ className }: { className?: string }) => <svg data-testid="icon-sun" className={className} />,
  Moon: ({ className }: { className?: string }) => <svg data-testid="icon-moon" className={className} />,
  Laptop: ({ className }: { className?: string }) => <svg data-testid="icon-laptop" className={className} />,
}));

import AdminLayout from '@/components/admin/AdminLayout';

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: '1',
    username: 'admin',
    displayName: 'Admin User',
    role: 'ADMIN',
    avatar: '',
    permissions: {},
    ...overrides,
  };
}

describe('AdminLayout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserValue = makeUser();
    mockCanAccessAdmin.mockReturnValue(true);
    mockHasPermission.mockReturnValue(true);
    mockGetRoleDisplayName.mockReturnValue('Administrator');
  });

  describe('access control', () => {
    it('renders null when user is null', () => {
      mockUserValue = null;
      mockCanAccessAdmin.mockReturnValue(false);
      const { container } = render(<AdminLayout><div>content</div></AdminLayout>);
      expect(container.firstChild).toBeNull();
    });

    it('renders null when canAccessAdmin returns false', () => {
      mockCanAccessAdmin.mockReturnValue(false);
      const { container } = render(<AdminLayout><div>content</div></AdminLayout>);
      expect(container.firstChild).toBeNull();
    });

    it('redirects to /dashboard when user is null', () => {
      mockUserValue = null;
      mockCanAccessAdmin.mockReturnValue(false);
      render(<AdminLayout><div>content</div></AdminLayout>);
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
    });

    it('redirects to /dashboard when canAccessAdmin is false', () => {
      mockCanAccessAdmin.mockReturnValue(false);
      render(<AdminLayout><div>content</div></AdminLayout>);
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
    });
  });

  describe('rendering with admin access', () => {
    it('renders children inside AuthGuard when user has admin access', () => {
      render(<AdminLayout><div data-testid="child-content">hello</div></AdminLayout>);
      expect(screen.getByTestId('auth-guard')).toBeInTheDocument();
      expect(screen.getByTestId('child-content')).toBeInTheDocument();
    });

    it('renders skip-to-content link', () => {
      render(<AdminLayout><div>content</div></AdminLayout>);
      const skipLink = screen.getByRole('link', { name: /layout\.skipToContent/i });
      expect(skipLink).toBeInTheDocument();
      expect(skipLink).toHaveAttribute('href', '#main-content');
    });

    it('shows user displayName in sidebar', () => {
      render(<AdminLayout><div>content</div></AdminLayout>);
      expect(screen.getByText('Admin User')).toBeInTheDocument();
    });

    it('shows username when displayName is absent', () => {
      mockUserValue = makeUser({ displayName: '', username: 'superadmin' });
      render(<AdminLayout><div>content</div></AdminLayout>);
      expect(screen.getByText('superadmin')).toBeInTheDocument();
    });

    it('shows role badge', () => {
      render(<AdminLayout><div>content</div></AdminLayout>);
      const badges = screen.getAllByTestId('badge');
      const roleBadge = badges.find(b => b.textContent?.includes('ADMIN'));
      expect(roleBadge).toBeInTheDocument();
    });
  });

  describe('navigation filtering', () => {
    it('shows navigation items allowed by hasPermission', () => {
      mockHasPermission.mockReturnValue(true);
      render(<AdminLayout><div>content</div></AdminLayout>);
      expect(screen.getByText('layout.navDashboard')).toBeInTheDocument();
    });

    it('hides navigation items not allowed by hasPermission', () => {
      mockHasPermission.mockReturnValue(false);
      render(<AdminLayout><div>content</div></AdminLayout>);
      expect(screen.queryByText('layout.navUsers')).not.toBeInTheDocument();
    });

    it('calls hasPermission for each navigation item', () => {
      render(<AdminLayout><div>content</div></AdminLayout>);
      expect(mockHasPermission).toHaveBeenCalled();
    });
  });

  describe('sidebar toggle', () => {
    it('sidebar starts open (w-64 class present)', () => {
      render(<AdminLayout><div>content</div></AdminLayout>);
      const buttons = screen.getAllByTestId('button');
      const toggleBtn = buttons.find(b => b.getAttribute('aria-label') === 'layout.collapseMenu');
      expect(toggleBtn).toBeInTheDocument();
    });

    it('toggling sidebar changes aria-label from collapse to open', () => {
      render(<AdminLayout><div>content</div></AdminLayout>);
      const buttons = screen.getAllByTestId('button');
      const toggleBtn = buttons.find(b => b.getAttribute('aria-label') === 'layout.collapseMenu');
      expect(toggleBtn).toBeTruthy();
      fireEvent.click(toggleBtn!);
      const updatedButtons = screen.getAllByTestId('button');
      const openBtn = updatedButtons.find(b => b.getAttribute('aria-label') === 'layout.openMenu');
      expect(openBtn).toBeInTheDocument();
    });
  });

  describe('logout', () => {
    it('calls logout() when logout button is clicked', async () => {
      mockLogout.mockResolvedValue(undefined);
      render(<AdminLayout><div>content</div></AdminLayout>);
      const buttons = screen.getAllByTestId('button');
      const logoutBtn = buttons.find(b => b.textContent?.includes('layout.logout'));
      fireEvent.click(logoutBtn!);
      await waitFor(() => expect(mockLogout).toHaveBeenCalled());
    });

    it('calls toast.success on successful logout', async () => {
      mockLogout.mockResolvedValue(undefined);
      const { toast } = require('sonner');
      render(<AdminLayout><div>content</div></AdminLayout>);
      const buttons = screen.getAllByTestId('button');
      const logoutBtn = buttons.find(b => b.textContent?.includes('layout.logout'));
      fireEvent.click(logoutBtn!);
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('logoutSuccess'));
    });

    it('calls toast.error on logout failure', async () => {
      mockLogout.mockRejectedValue(new Error('network error'));
      const { toast } = require('sonner');
      render(<AdminLayout><div>content</div></AdminLayout>);
      const buttons = screen.getAllByTestId('button');
      const logoutBtn = buttons.find(b => b.textContent?.includes('layout.logout'));
      fireEvent.click(logoutBtn!);
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('logoutError'));
    });
  });

  describe('theme dropdown', () => {
    it('calls setTheme("light") when light option clicked', () => {
      render(<AdminLayout><div>content</div></AdminLayout>);
      const items = screen.getAllByTestId('dropdown-item');
      const lightItem = items.find(i => i.textContent?.includes('layout.themeLight'));
      fireEvent.click(lightItem!);
      expect(mockSetTheme).toHaveBeenCalledWith('light');
    });

    it('calls setTheme("dark") when dark option clicked', () => {
      render(<AdminLayout><div>content</div></AdminLayout>);
      const items = screen.getAllByTestId('dropdown-item');
      const darkItem = items.find(i => i.textContent?.includes('layout.themeDark'));
      fireEvent.click(darkItem!);
      expect(mockSetTheme).toHaveBeenCalledWith('dark');
    });

    it('calls setTheme("auto") when auto option clicked', () => {
      render(<AdminLayout><div>content</div></AdminLayout>);
      const items = screen.getAllByTestId('dropdown-item');
      const autoItem = items.find(i => i.textContent?.includes('layout.themeAuto'));
      fireEvent.click(autoItem!);
      expect(mockSetTheme).toHaveBeenCalledWith('auto');
    });
  });

  describe('currentPage prop', () => {
    it('renders admin page title when currentPage is /admin', () => {
      render(<AdminLayout currentPage="/admin"><div>content</div></AdminLayout>);
      expect(screen.getByText('layout.pageAdmin')).toBeInTheDocument();
    });

    it('renders users page title when currentPage is /admin/users', () => {
      render(<AdminLayout currentPage="/admin/users"><div>content</div></AdminLayout>);
      expect(screen.getByText('layout.pageUsers')).toBeInTheDocument();
    });

    it('renders agent page title when currentPage is /admin/agent', () => {
      render(<AdminLayout currentPage="/admin/agent"><div>content</div></AdminLayout>);
      expect(screen.getByText('layout.pageAgent')).toBeInTheDocument();
    });

    it('renders monitoring page title when currentPage is /admin/monitoring', () => {
      render(<AdminLayout currentPage="/admin/monitoring"><div>content</div></AdminLayout>);
      expect(screen.getByText('layout.pageMonitoring')).toBeInTheDocument();
    });
  });
});
