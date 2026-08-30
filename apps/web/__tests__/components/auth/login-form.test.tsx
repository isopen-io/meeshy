/**
 * LoginForm Component Tests
 *
 * Tests the login form including:
 * - Form rendering and initial state
 * - Form validation
 * - Successful login flow
 * - Error handling
 * - Password visibility toggle
 * - Remember device checkbox
 * - Bot protection
 * - Loading states
 * - Accessibility
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { LoginForm, buildVerifyTwoFactorUrl } from '../../../components/auth/login-form';
import { SESSION_STORAGE_KEYS } from '@/services/auth-manager.service';

// Mock next/navigation
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    prefetch: jest.fn(),
  }),
}));

// Mock useAuth hook
const mockLogin = jest.fn();
jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    login: mockLogin,
  }),
}));

// Mock useI18n hook
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'login.validation.required': 'Username and password are required',
        'login.errors.loginFailed': 'Login failed',
        'login.errors.invalidCredentials': 'Invalid credentials',
        'login.errors.serverError': 'Server error',
        'login.errors.networkError': 'Network error',
        'login.errors.unknownError': 'Unknown error',
        'login.success.loginSuccess': 'Login successful!',
        'login.usernameLabel': 'Username or phone',
        'login.usernamePlaceholder': 'Pseudonyme ou numero de telephone',
        'login.passwordLabel': 'Password',
        'login.passwordPlaceholder': 'Mot de passe',
        'login.forgotPassword': 'Forgot password?',
        'login.rememberDevice': 'Remember this device',
        'login.loggingIn': 'Logging in...',
        'login.loginButton': 'Login',
        'login.showPassword': 'Show password',
        'login.hidePassword': 'Hide password',
        'login.noAccount': "Don't have an account?",
        'login.registerLink': 'Sign up',
      };
      return translations[key] || key;
    },
    locale: 'en',
  }),
}));

// Mock useFeatureFlags hook
jest.mock('@/hooks/use-feature-flags', () => ({
  useFeatureFlags: () => ({
    isPasswordResetConfigured: () => true,
  }),
}));

// Mock useBotProtection hook
const mockValidateSubmission = jest.fn().mockReturnValue({ isHuman: true, botError: null });
jest.mock('@/hooks/use-bot-protection', () => ({
  useBotProtection: () => ({
    honeypotProps: {
      name: 'website',
      value: '',
      onChange: jest.fn(),
      style: { display: 'none' },
      tabIndex: -1,
      autoComplete: 'off',
      'aria-hidden': true,
    },
    validateSubmission: mockValidateSubmission,
    reset: jest.fn(),
  }),
}));

// Mock auth form store
const mockAuthFormStore = {
  identifier: '',
  setIdentifier: jest.fn(),
};
jest.mock('@/stores/auth-form-store', () => ({
  useAuthFormStore: () => mockAuthFormStore,
}));

// Mock sonner toast
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));
const mockToast = jest.requireMock('sonner').toast;

// Mock geolocation
jest.mock('@/lib/geolocation', () => ({
  requestBrowserGeolocation: jest.fn(),
  getGeolocationHeaders: jest.fn(() => ({})),
}));

// Mock buildApiUrl and API_ENDPOINTS
jest.mock('@/lib/config', () => ({
  buildApiUrl: jest.fn((endpoint: string) => `http://localhost:3000${endpoint}`),
  API_ENDPOINTS: {
    auth: {
      login: '/api/auth/login',
    },
  },
}));

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock window.location
const savedLocation = window.location;

beforeAll(() => {
  window.location = {
    href: '',
    pathname: '/login',
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
});

afterAll(() => {
  window.location = savedLocation;
});

describe('LoginForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
    mockValidateSubmission.mockReturnValue({ isHuman: true, botError: null });
    window.location.href = '';
    window.location.pathname = '/login';
    window.location.search = '';
    sessionStorage.clear();
  });

  describe('Initial Rendering', () => {
    it('renders the login form correctly', () => {
      render(<LoginForm />);

      expect(screen.getByPlaceholderText(/Pseudonyme ou numero de telephone/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Mot de passe/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Login/i })).toBeInTheDocument();
    });

    it('renders forgot password link when configured', () => {
      render(<LoginForm />);

      expect(screen.getByText('Forgot password?')).toBeInTheDocument();
    });

    it('renders remember device checkbox', () => {
      render(<LoginForm />);

      expect(screen.getByRole('checkbox')).toBeInTheDocument();
      expect(screen.getByText('Remember this device')).toBeInTheDocument();
    });

    it('renders sign up link', () => {
      render(<LoginForm />);

      expect(screen.getByText("Don't have an account?")).toBeInTheDocument();
      expect(screen.getByText('Sign up')).toBeInTheDocument();
    });

    it('has honeypot field hidden from users', () => {
      const { container } = render(<LoginForm />);

      const honeypotInput = container.querySelector('input[name="website"]');
      expect(honeypotInput).toBeInTheDocument();
      expect(honeypotInput).toHaveStyle('display: none');
    });
  });

  describe('Form Validation', () => {
    it('shows error when username is empty', async () => {
      const user = userEvent.setup();
      const { container } = render(<LoginForm />);

      const passwordInput = screen.getByPlaceholderText(/Mot de passe/i);
      await user.type(passwordInput, 'password123');

      // Use fireEvent.submit to bypass HTML5 required constraint validation
      const form = container.querySelector('form')!;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('Username and password are required');
      });
    });

    it('shows error when password is empty', async () => {
      const user = userEvent.setup();
      const { container } = render(<LoginForm />);

      const usernameInput = screen.getByPlaceholderText(/Pseudonyme ou numero de telephone/i);
      await user.type(usernameInput, 'testuser');

      // Use fireEvent.submit to bypass HTML5 required constraint validation
      const form = container.querySelector('form')!;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('Username and password are required');
      });
    });

    it('shows bot detection error when validation fails', async () => {
      const user = userEvent.setup();
      mockValidateSubmission.mockReturnValue({ isHuman: false, botError: 'Bot detected' });

      render(<LoginForm />);

      const usernameInput = screen.getByPlaceholderText(/Pseudonyme ou numero de telephone/i);
      const passwordInput = screen.getByPlaceholderText(/Mot de passe/i);
      await user.type(usernameInput, 'testuser');
      await user.type(passwordInput, 'password123');

      const submitButton = screen.getByRole('button', { name: /Login/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('Bot detected');
      });
    });
  });

  describe('Password Visibility Toggle', () => {
    it('initially hides password', () => {
      render(<LoginForm />);

      const passwordInput = screen.getByPlaceholderText(/Mot de passe/i);
      expect(passwordInput).toHaveAttribute('type', 'password');
    });

    it('shows password when toggle is clicked', async () => {
      const user = userEvent.setup();
      render(<LoginForm />);

      const toggleButton = screen.getByRole('button', { name: /Show password/i });
      await user.click(toggleButton);

      const passwordInput = screen.getByPlaceholderText(/Mot de passe/i);
      expect(passwordInput).toHaveAttribute('type', 'text');
    });

    it('hides password again when toggle is clicked twice', async () => {
      const user = userEvent.setup();
      render(<LoginForm />);

      const toggleButton = screen.getByRole('button', { name: /Show password/i });
      await user.click(toggleButton);
      await user.click(toggleButton);

      const passwordInput = screen.getByPlaceholderText(/Mot de passe/i);
      expect(passwordInput).toHaveAttribute('type', 'password');
    });
  });

  describe('Remember Device Checkbox', () => {
    it('checkbox is unchecked by default', () => {
      render(<LoginForm />);

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).not.toBeChecked();
    });

    it('checkbox can be checked', async () => {
      const user = userEvent.setup();
      render(<LoginForm />);

      const checkbox = screen.getByRole('checkbox');
      await user.click(checkbox);

      expect(checkbox).toBeChecked();
    });
  });

  describe('Successful Login', () => {
    it('submits form with correct data', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: {
            user: { id: '1', username: 'testuser' },
            token: 'test-token',
          },
        }),
      });

      render(<LoginForm />);

      const usernameInput = screen.getByPlaceholderText(/Pseudonyme ou numero de telephone/i);
      const passwordInput = screen.getByPlaceholderText(/Mot de passe/i);

      await user.type(usernameInput, 'testuser');
      await user.type(passwordInput, 'password123');

      const submitButton = screen.getByRole('button', { name: /Login/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:3000/api/auth/login',
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              username: 'testuser',
              password: 'password123',
              rememberDevice: false,
            }),
          })
        );
      });
    });

    it('calls login function on successful response', async () => {
      const user = userEvent.setup();
      const mockUser = { id: '1', username: 'testuser' };
      const mockToken = 'test-token';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: { user: mockUser, token: mockToken },
        }),
      });

      render(<LoginForm />);

      const usernameInput = screen.getByPlaceholderText(/Pseudonyme ou numero de telephone/i);
      const passwordInput = screen.getByPlaceholderText(/Mot de passe/i);

      await user.type(usernameInput, 'testuser');
      await user.type(passwordInput, 'password123');

      const submitButton = screen.getByRole('button', { name: /Login/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith(mockUser, mockToken, undefined, undefined);
      });
    });

    it('shows success toast on successful login', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: {
            user: { id: '1', username: 'testuser' },
            token: 'test-token',
          },
        }),
      });

      render(<LoginForm />);

      const usernameInput = screen.getByPlaceholderText(/Pseudonyme ou numero de telephone/i);
      const passwordInput = screen.getByPlaceholderText(/Mot de passe/i);

      await user.type(usernameInput, 'testuser');
      await user.type(passwordInput, 'password123');

      const submitButton = screen.getByRole('button', { name: /Login/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockToast.success).toHaveBeenCalledWith('Login successful!');
      });
    });

    it('calls onSuccess callback if provided', async () => {
      const user = userEvent.setup();
      const onSuccess = jest.fn();
      const mockUser = { id: '1', username: 'testuser' };
      const mockToken = 'test-token';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: { user: mockUser, token: mockToken },
        }),
      });

      render(<LoginForm onSuccess={onSuccess} />);

      const usernameInput = screen.getByPlaceholderText(/Pseudonyme ou numero de telephone/i);
      const passwordInput = screen.getByPlaceholderText(/Mot de passe/i);

      await user.type(usernameInput, 'testuser');
      await user.type(passwordInput, 'password123');

      const submitButton = screen.getByRole('button', { name: /Login/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledWith(mockUser, mockToken);
      });
    });

  });

  describe('Two-Factor Authentication (#4458)', () => {
    // Measured contract — services/gateway/src/routes/auth/login.ts:121-135
    // (registerLoginRoutes, POST /login): when the account carries a second
    // factor, the gateway returns `{ success: true, data: { requires2FA: true,
    // twoFactorToken, rememberDevice, user: {...no-token profile...}, message } }`.
    // No `token` — the three-branch cascade below this point in the component
    // requires one, so this shape used to fall through to the generic
    // "unknown error" message instead of reaching /auth/verify-2fa (issue #4458).
    //
    // Keys aligned with what /auth/verify-2fa actually reads (its own
    // sessionStorage.getItem calls) and with what the sibling
    // /auth/magic-link/validate flow already writes for the same screen —
    // SESSION_STORAGE_KEYS.TWO_FACTOR_TEMP_TOKEN / _USER_ID / _USERNAME.
    //
    // Redirect is asserted via next/navigation's router.push (mockPush) —
    // jsdom 26+ makes window.location and its methods non-configurable own
    // properties in this repo's test environment (see the ErrorBoundary and
    // safe-redirect suites), so an assignment to location.href cannot be
    // observed from a test. What IS observed, per the task's own directive,
    // is what's really persisted: the sessionStorage keys /auth/verify-2fa
    // actually reads on mount.
    it('stores the pending 2FA session and redirects to /auth/verify-2fa when the gateway requires a second factor', async () => {
      const user = userEvent.setup();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: {
            requires2FA: true,
            twoFactorToken: 'temp-token-abc',
            rememberDevice: false,
            user: { id: 'user-42', username: 'testuser', email: 'testuser@example.com' },
            message: 'Veuillez entrer votre code d\'authentification à deux facteurs',
          },
        }),
      });

      render(<LoginForm />);

      const usernameInput = screen.getByPlaceholderText(/Pseudonyme ou numero de telephone/i);
      const passwordInput = screen.getByPlaceholderText(/Mot de passe/i);

      await user.type(usernameInput, 'testuser');
      await user.type(passwordInput, 'password123');

      const submitButton = screen.getByRole('button', { name: /Login/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(sessionStorage.getItem(SESSION_STORAGE_KEYS.TWO_FACTOR_TEMP_TOKEN)).toBe('temp-token-abc');
      });
      expect(sessionStorage.getItem(SESSION_STORAGE_KEYS.TWO_FACTOR_USER_ID)).toBe('user-42');
      expect(sessionStorage.getItem(SESSION_STORAGE_KEYS.TWO_FACTOR_USERNAME)).toBe('testuser');
      expect(mockPush).toHaveBeenCalledWith('/auth/verify-2fa');

      // Never a partial/soft "success" — no token was ever granted for this
      // login, so the session must not be established.
      expect(mockLogin).not.toHaveBeenCalled();
      expect(screen.queryByText('Unknown error')).not.toBeInTheDocument();
    });

    it('does not redirect to the 2FA screen on an ordinary token-bearing success (negative witness)', async () => {
      const user = userEvent.setup();
      const mockUser = { id: '1', username: 'testuser' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: { user: mockUser, token: 'test-token' },
        }),
      });

      render(<LoginForm />);

      const usernameInput = screen.getByPlaceholderText(/Pseudonyme ou numero de telephone/i);
      const passwordInput = screen.getByPlaceholderText(/Mot de passe/i);

      await user.type(usernameInput, 'testuser');
      await user.type(passwordInput, 'password123');

      const submitButton = screen.getByRole('button', { name: /Login/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith(mockUser, 'test-token', undefined, undefined);
      });

      expect(mockPush).not.toHaveBeenCalled();
      expect(sessionStorage.getItem(SESSION_STORAGE_KEYS.TWO_FACTOR_TEMP_TOKEN)).toBeNull();
    });
  });

  describe('buildVerifyTwoFactorUrl (#4458)', () => {
    // window.location.search cannot be simulated in this jsdom environment
    // (same non-configurable-Location limitation as above), so the
    // returnUrl-forwarding + safe-path clamping is exercised directly as the
    // pure function the component calls, rather than through a form
    // submission that could never actually vary the input.
    it('targets the plain 2FA screen when no returnUrl is present', () => {
      expect(buildVerifyTwoFactorUrl('')).toBe('/auth/verify-2fa');
    });

    it('forwards a same-origin returnUrl, percent-encoded', () => {
      expect(buildVerifyTwoFactorUrl('?returnUrl=%2Fsettings')).toBe(
        '/auth/verify-2fa?returnUrl=%2Fsettings'
      );
    });

    it('clamps an off-origin returnUrl to "/" rather than forwarding it verbatim', () => {
      expect(buildVerifyTwoFactorUrl('?returnUrl=https%3A%2F%2Fattacker.example')).toBe(
        '/auth/verify-2fa?returnUrl=%2F'
      );
    });
  });

  describe('Error Handling', () => {
    it('handles 401 unauthorized error', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'Unauthorized' }),
      });

      render(<LoginForm />);

      const usernameInput = screen.getByPlaceholderText(/Pseudonyme ou numero de telephone/i);
      const passwordInput = screen.getByPlaceholderText(/Mot de passe/i);

      await user.type(usernameInput, 'testuser');
      await user.type(passwordInput, 'wrongpassword');

      const submitButton = screen.getByRole('button', { name: /Login/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
      });
    });

    it('handles 500 server error', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Internal Server Error' }),
      });

      render(<LoginForm />);

      const usernameInput = screen.getByPlaceholderText(/Pseudonyme ou numero de telephone/i);
      const passwordInput = screen.getByPlaceholderText(/Mot de passe/i);

      await user.type(usernameInput, 'testuser');
      await user.type(passwordInput, 'password123');

      const submitButton = screen.getByRole('button', { name: /Login/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Server error')).toBeInTheDocument();
      });
    });

    it('handles network error', async () => {
      const user = userEvent.setup();
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      render(<LoginForm />);

      const usernameInput = screen.getByPlaceholderText(/Pseudonyme ou numero de telephone/i);
      const passwordInput = screen.getByPlaceholderText(/Mot de passe/i);

      await user.type(usernameInput, 'testuser');
      await user.type(passwordInput, 'password123');

      const submitButton = screen.getByRole('button', { name: /Login/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalled();
      });
    });

    it('handles invalid response format', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ invalid: 'format' }),
      });

      render(<LoginForm />);

      const usernameInput = screen.getByPlaceholderText(/Pseudonyme ou numero de telephone/i);
      const passwordInput = screen.getByPlaceholderText(/Mot de passe/i);

      await user.type(usernameInput, 'testuser');
      await user.type(passwordInput, 'password123');

      const submitButton = screen.getByRole('button', { name: /Login/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalled();
      });
    });

    it('rejects the legacy unwrapped access_token contract the gateway no longer serves', async () => {
      // services/gateway/src/routes/auth/login.ts always wraps its payload
      // via sendSuccess() -> { success, data }, and `access_token` has zero
      // occurrences anywhere under services/gateway/src. This top-level
      // `{ user, access_token }` shape (no `success`, no `data` envelope) was
      // one of two dead branches in the token cascade (#4458) — asserting its
      // rejection here keeps it from being silently reintroduced.
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          user: { id: '1', username: 'testuser' },
          access_token: 'test-access-token',
        }),
      });

      render(<LoginForm />);

      const usernameInput = screen.getByPlaceholderText(/Pseudonyme ou numero de telephone/i);
      const passwordInput = screen.getByPlaceholderText(/Mot de passe/i);

      await user.type(usernameInput, 'testuser');
      await user.type(passwordInput, 'password123');

      const submitButton = screen.getByRole('button', { name: /Login/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('Unknown error');
      });
      expect(mockLogin).not.toHaveBeenCalled();
    });
  });

  describe('Loading State', () => {
    it('shows loading state during submission', async () => {
      const user = userEvent.setup();

      let resolvePromise: (value: any) => void;
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      mockFetch.mockReturnValueOnce(pendingPromise);

      render(<LoginForm />);

      const usernameInput = screen.getByPlaceholderText(/Pseudonyme ou numero de telephone/i);
      const passwordInput = screen.getByPlaceholderText(/Mot de passe/i);

      await user.type(usernameInput, 'testuser');
      await user.type(passwordInput, 'password123');

      const submitButton = screen.getByRole('button', { name: /Login/i });
      await user.click(submitButton);

      // Check loading state
      expect(screen.getByRole('button', { name: /Logging in/i })).toBeDisabled();

      // Cleanup
      resolvePromise!({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: {
            user: { id: '1', username: 'testuser' },
            token: 'test-token',
          },
        }),
      });
    });

    it('disables inputs during submission', async () => {
      const user = userEvent.setup();

      let resolvePromise: (value: any) => void;
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      mockFetch.mockReturnValueOnce(pendingPromise);

      render(<LoginForm />);

      const usernameInput = screen.getByPlaceholderText(/Pseudonyme ou numero de telephone/i);
      const passwordInput = screen.getByPlaceholderText(/Mot de passe/i);

      await user.type(usernameInput, 'testuser');
      await user.type(passwordInput, 'password123');

      const submitButton = screen.getByRole('button', { name: /Login/i });
      await user.click(submitButton);

      expect(usernameInput).toBeDisabled();
      expect(passwordInput).toBeDisabled();

      // Cleanup
      resolvePromise!({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: {
            user: { id: '1', username: 'testuser' },
            token: 'test-token',
          },
        }),
      });
    });
  });

  describe('Accessibility', () => {
    it('has proper input labels', () => {
      render(<LoginForm />);

      // Check for sr-only labels - use exact label text from i18n mock
      expect(screen.getByLabelText('Username or phone')).toBeInTheDocument();
      expect(screen.getByLabelText('Password')).toBeInTheDocument();
    });

    it('shows error in alert role', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'Unauthorized' }),
      });

      render(<LoginForm />);

      const usernameInput = screen.getByPlaceholderText(/Pseudonyme ou numero de telephone/i);
      const passwordInput = screen.getByPlaceholderText(/Mot de passe/i);

      await user.type(usernameInput, 'testuser');
      await user.type(passwordInput, 'wrongpassword');

      const submitButton = screen.getByRole('button', { name: /Login/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });

    it('has proper autocomplete attributes', () => {
      render(<LoginForm />);

      const usernameInput = screen.getByPlaceholderText(/Pseudonyme ou numero de telephone/i);
      const passwordInput = screen.getByPlaceholderText(/Mot de passe/i);

      expect(usernameInput).toHaveAttribute('autocomplete', 'username');
      expect(passwordInput).toHaveAttribute('autocomplete', 'current-password');
    });
  });

  describe('Pre-filled Values', () => {
    it('pre-fills username from auth form store', () => {
      mockAuthFormStore.identifier = 'storeduser';

      render(<LoginForm />);

      const usernameInput = screen.getByPlaceholderText(/Pseudonyme ou numero de telephone/i);
      expect(usernameInput).toHaveValue('storeduser');

      // Reset for other tests
      mockAuthFormStore.identifier = '';
    });

    it('updates auth form store when username changes', async () => {
      const user = userEvent.setup();
      render(<LoginForm />);

      const usernameInput = screen.getByPlaceholderText(/Pseudonyme ou numero de telephone/i);
      await user.type(usernameInput, 'newuser');

      expect(mockAuthFormStore.setIdentifier).toHaveBeenCalled();
    });
  });
});
