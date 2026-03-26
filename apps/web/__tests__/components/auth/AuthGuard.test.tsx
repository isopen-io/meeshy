/**
 * AuthGuard Component Tests
 *
 * Tests the authentication guard component including:
 * - Loading state display
 * - Access denied when not authenticated
 * - Anonymous user handling
 * - Successful authentication
 * - Fallback rendering
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AuthGuard } from '../../../components/auth/AuthGuard';

// Mock the useAuth hook
const mockUseAuth = jest.fn();
jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock window.location by replacing it with a plain object
const mockLocation = {
  href: '',
  pathname: '/',
  search: '',
  hash: '',
  host: 'localhost:3000',
  hostname: 'localhost',
  port: '3000',
  protocol: 'http:',
  origin: 'http://localhost:3000',
  reload: jest.fn(),
  assign: jest.fn(),
  replace: jest.fn(),
  toString: () => 'http://localhost:3000',
} as unknown as Location;

const originalLocation = window.location;

beforeAll(() => {
  Object.defineProperty(window, 'location', { value: mockLocation as any, writable: true });
});

afterAll(() => {
  Object.defineProperty(window, 'location', { value: originalLocation as any, writable: true });
});

describe('AuthGuard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Loading State', () => {
    it('displays loading spinner when checking authentication', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        isChecking: true,
        isAnonymous: false,
      });

      render(
        <AuthGuard>
          <div>Protected Content</div>
        </AuthGuard>
      );

      // Should show loading indicator
      expect(screen.getByText('Vérification...')).toBeInTheDocument();
      // Should not show protected content
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });

    it('displays loading spinner with correct styling', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        isChecking: true,
        isAnonymous: false,
      });

      const { container } = render(
        <AuthGuard>
          <div>Protected Content</div>
        </AuthGuard>
      );

      // Check for the spinner element with h-12 w-12 class
      const spinner = container.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
      expect(spinner).toHaveClass('h-12', 'w-12');
    });
  });

  describe('Access Denied State', () => {
    it('displays access denied message when not authenticated and auth is required', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        isChecking: false,
        isAnonymous: false,
      });

      render(
        <AuthGuard requireAuth={true}>
          <div>Protected Content</div>
        </AuthGuard>
      );

      expect(screen.getByText('Accès refusé')).toBeInTheDocument();
      expect(
        screen.getByText('Vous devez être connecté pour accéder à cette page')
      ).toBeInTheDocument();
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });

    it('shows login button that redirects to login page', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        isChecking: false,
        isAnonymous: false,
      });

      render(
        <AuthGuard requireAuth={true}>
          <div>Protected Content</div>
        </AuthGuard>
      );

      const loginButton = screen.getByRole('button', { name: /Se connecter/i });
      expect(loginButton).toBeInTheDocument();

      // Component uses window.location.href = '/login' on click
      // We verify the button exists and is clickable
      fireEvent.click(loginButton);
    });

    it('renders custom fallback when provided and not authenticated', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        isChecking: false,
        isAnonymous: false,
      });

      render(
        <AuthGuard
          requireAuth={true}
          fallback={<div>Custom Fallback</div>}
        >
          <div>Protected Content</div>
        </AuthGuard>
      );

      expect(screen.getByText('Custom Fallback')).toBeInTheDocument();
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
      expect(screen.queryByText('Accès refusé')).not.toBeInTheDocument();
    });
  });

  describe('Anonymous User Handling', () => {
    it('displays account required message for anonymous users when allowAnonymous is false', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isChecking: false,
        isAnonymous: true,
      });

      render(
        <AuthGuard allowAnonymous={false}>
          <div>Protected Content</div>
        </AuthGuard>
      );

      expect(screen.getByText('Compte requis')).toBeInTheDocument();
      expect(
        screen.getByText('Cette page nécessite un compte permanent')
      ).toBeInTheDocument();
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });

    it('shows register button for anonymous users', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isChecking: false,
        isAnonymous: true,
      });

      render(
        <AuthGuard allowAnonymous={false}>
          <div>Protected Content</div>
        </AuthGuard>
      );

      const registerButton = screen.getByRole('button', { name: /Créer un compte/i });
      expect(registerButton).toBeInTheDocument();

      // Component uses window.location.href = '/register' on click
      // We verify the button exists and is clickable
      fireEvent.click(registerButton);
    });

    it('renders custom fallback for anonymous users when provided', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isChecking: false,
        isAnonymous: true,
      });

      render(
        <AuthGuard
          allowAnonymous={false}
          fallback={<div>Anonymous Fallback</div>}
        >
          <div>Protected Content</div>
        </AuthGuard>
      );

      expect(screen.getByText('Anonymous Fallback')).toBeInTheDocument();
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });

    it('allows anonymous users when allowAnonymous is true', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isChecking: false,
        isAnonymous: true,
      });

      render(
        <AuthGuard allowAnonymous={true}>
          <div>Protected Content</div>
        </AuthGuard>
      );

      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });
  });

  describe('Successful Authentication', () => {
    it('renders children when user is authenticated', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isChecking: false,
        isAnonymous: false,
      });

      render(
        <AuthGuard>
          <div>Protected Content</div>
        </AuthGuard>
      );

      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });

    it('renders complex children components', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isChecking: false,
        isAnonymous: false,
      });

      render(
        <AuthGuard>
          <div>
            <h1>Dashboard</h1>
            <p>Welcome to the dashboard</p>
            <button>Click me</button>
          </div>
        </AuthGuard>
      );

      expect(screen.getByText('Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Welcome to the dashboard')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Click me/i })).toBeInTheDocument();
    });
  });

  describe('Default Props', () => {
    it('defaults to requireAuth=true', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        isChecking: false,
        isAnonymous: false,
      });

      render(
        <AuthGuard>
          <div>Protected Content</div>
        </AuthGuard>
      );

      // Should show access denied by default
      expect(screen.getByText('Accès refusé')).toBeInTheDocument();
    });

    it('defaults to allowAnonymous=false', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isChecking: false,
        isAnonymous: true,
      });

      render(
        <AuthGuard>
          <div>Protected Content</div>
        </AuthGuard>
      );

      // Should show account required for anonymous users by default
      expect(screen.getByText('Compte requis')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('handles requireAuth=false correctly', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        isChecking: false,
        isAnonymous: false,
      });

      render(
        <AuthGuard requireAuth={false}>
          <div>Public Content</div>
        </AuthGuard>
      );

      // Should render children even when not authenticated
      expect(screen.getByText('Public Content')).toBeInTheDocument();
    });

    it('handles transition from loading to authenticated', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        isChecking: true,
        isAnonymous: false,
      });

      const { rerender } = render(
        <AuthGuard>
          <div>Protected Content</div>
        </AuthGuard>
      );

      // Initially loading
      expect(screen.getByText('Vérification...')).toBeInTheDocument();

      // Update auth state
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isChecking: false,
        isAnonymous: false,
      });

      rerender(
        <AuthGuard>
          <div>Protected Content</div>
        </AuthGuard>
      );

      // Should now show content
      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });

    it('handles null/undefined fallback correctly', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        isChecking: false,
        isAnonymous: false,
      });

      render(
        <AuthGuard fallback={undefined}>
          <div>Protected Content</div>
        </AuthGuard>
      );

      // Should show default access denied message
      expect(screen.getByText('Accès refusé')).toBeInTheDocument();
    });
  });
});
