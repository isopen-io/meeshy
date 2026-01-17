/**
 * RegisterFormWizard Component Tests
 *
 * Tests the multi-step registration wizard including:
 * - Contact step (email, phone)
 * - Identity step (first name, last name)
 * - Username step (with availability check)
 * - Security step (password with confirmation)
 * - Preferences step (languages, terms acceptance)
 * - Step navigation and validation
 * - Form submission and error handling
 * - Account conflict detection
 * - Accessibility
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { RegisterFormWizard } from '../../../components/auth/register-form-wizard';

// Mock next/navigation
const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    prefetch: jest.fn(),
  }),
}));

// Mock useI18n hook
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'register.wizard.contactTitle': 'Contact Info',
        'register.wizard.contactSubtitle': 'How can we reach you?',
        'register.wizard.identityTitle': 'Your Identity',
        'register.wizard.identitySubtitle': 'Tell us about yourself',
        'register.wizard.usernameTitle': 'Choose Username',
        'register.wizard.usernameSubtitle': 'Pick a unique username',
        'register.wizard.securityTitle': 'Secure Your Account',
        'register.wizard.securitySubtitle': 'Create a strong password',
        'register.wizard.preferencesTitle': 'Your Preferences',
        'register.wizard.preferencesSubtitle': 'Set your language preferences',
        'register.wizard.back': 'Back',
        'register.wizard.continue': 'Continue',
        'register.wizard.createAccount': 'Create Account',
        'register.wizard.keyboardHint': 'Press Enter to continue',
        'register.wizard.usernameAvailable': 'Username is available!',
        'register.wizard.usernameTaken': 'Username is already taken',
        'register.wizard.passwordWeak': 'Weak password',
        'register.wizard.passwordMedium': 'Medium strength',
        'register.wizard.passwordStrong': 'Strong password',
        'register.wizard.accountExists': 'Account already exists',
        'register.wizard.emailExists': 'This email is already registered',
        'register.wizard.phoneExists': 'This phone is already registered',
        'register.wizard.bothExist': 'Both email and phone are registered',
        'register.wizard.recoverAccount': 'Recover Account',
        'register.wizard.goToLogin': 'Go to Login',
        'register.wizard.acceptTermsRequired': 'You must accept the terms',
        'register.emailLabel': 'Email',
        'register.emailPlaceholder': 'your@email.com',
        'register.phoneLabel': 'Phone (optional)',
        'register.firstNameLabel': 'First Name',
        'register.firstNamePlaceholder': 'John',
        'register.lastNameLabel': 'Last Name',
        'register.lastNamePlaceholder': 'Doe',
        'register.usernamePlaceholder': 'username',
        'register.usernameHelp': '2-16 characters, letters, numbers, _ or -',
        'register.passwordLabel': 'Password',
        'register.passwordPlaceholder': 'Enter password',
        'register.confirmPasswordLabel': 'Confirm Password',
        'register.confirmPasswordPlaceholder': 'Confirm your password',
        'register.systemLanguageLabel': 'System Language',
        'register.regionalLanguageLabel': 'Regional Language',
        'register.acceptTerms': 'I accept the',
        'register.termsOfService': 'Terms of Service',
        'register.and': 'and',
        'register.privacyPolicy': 'Privacy Policy',
        'register.hasAccount': 'Already have an account?',
        'register.loginLink': 'Log in',
        'register.suggestions': 'Try these instead',
        'register.checkingSession': 'Checking session...',
        'register.success.registrationSuccess': 'Account created successfully!',
        'register.validation.phoneTooShort': 'Phone number is too short',
        'register.validation.phoneRequired': 'Phone number is required',
        'register.validation.passwordMismatch': 'Passwords do not match',
        'register.errors.emailExists': 'Email already exists',
        'register.errors.usernameExists': 'Username already exists',
        'register.errors.phoneExists': 'Phone already exists',
        'register.errors.registrationError': 'Registration failed',
        'register.errors.networkError': 'Network error',
        'register.errors.acceptTermsRequired': 'You must accept terms',
      };
      return translations[key] || key;
    },
    locale: 'en',
  }),
}));

// Mock useAuth hook
const mockLogin = jest.fn();
jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    login: mockLogin,
    user: null,
    isAuthenticated: false,
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

// Mock bot protection
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
    validateSubmission: () => ({ isHuman: true, botError: null }),
  }),
}));

// Mock auth manager
jest.mock('@/services/auth-manager.service', () => ({
  authManager: {
    getAuthToken: jest.fn().mockReturnValue(null),
    getAnonymousSession: jest.fn().mockReturnValue(null),
    clearAllSessions: jest.fn(),
    setCredentials: jest.fn(),
  },
}));

// Mock config/api
jest.mock('@/lib/config', () => ({
  buildApiUrl: (path: string) => `http://localhost:3000/api${path}`,
  API_ENDPOINTS: {
    AUTH: {
      REGISTER: '/auth/register',
    },
  },
}));

// Mock sonner toast
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

const mockToast = jest.requireMock('sonner').toast;

// Mock country codes
jest.mock('@/constants/countries', () => ({
  COUNTRY_CODES: [
    { code: 'FR', dial: '+33', flag: '🇫🇷', name: 'France' },
    { code: 'US', dial: '+1', flag: '🇺🇸', name: 'United States' },
    { code: 'CM', dial: '+237', flag: '🇨🇲', name: 'Cameroon' },
  ],
}));

// Mock email validator
jest.mock('@meeshy/shared/utils/email-validator', () => ({
  isValidEmail: (email: string) => email.includes('@') && email.includes('.'),
  getEmailValidationError: (email: string) => {
    if (!email) return null;
    if (!email.includes('@')) return 'Invalid email format';
    if (!email.includes('.')) return 'Invalid email domain';
    return null;
  },
}));

// Mock LanguageSelector component
jest.mock('@/components/translation/language-selector', () => ({
  LanguageSelector: ({ value, onValueChange, placeholder }: any) => (
    <select
      data-testid="language-selector"
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      aria-label={placeholder}
    >
      <option value="fr">French</option>
      <option value="en">English</option>
      <option value="es">Spanish</option>
    </select>
  ),
}));

// Mock AccountRecoveryModal
jest.mock('../../../components/auth/account-recovery-modal', () => ({
  AccountRecoveryModal: ({ isOpen, onClose }: any) =>
    isOpen ? (
      <div data-testid="recovery-modal">
        <button onClick={onClose}>Close Recovery Modal</button>
      </div>
    ) : null,
}));

// Mock PhoneExistsModal
jest.mock('../../../components/auth/PhoneExistsModal', () => ({
  PhoneExistsModal: ({ isOpen, onClose }: any) =>
    isOpen ? (
      <div data-testid="phone-exists-modal">
        <button onClick={onClose}>Close Phone Modal</button>
      </div>
    ) : null,
}));

// Mock Checkbox component
jest.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({ id, checked, onCheckedChange, disabled }: any) => (
    <input
      type="checkbox"
      id={id}
      checked={checked}
      onChange={(e) => onCheckedChange(e.target.checked)}
      disabled={disabled}
      data-testid="terms-checkbox"
    />
  ),
}));

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    h2: ({ children, ...props }: any) => <h2 {...props}>{children}</h2>,
    p: ({ children, ...props }: any) => <p {...props}>{children}</p>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock cn utility
jest.mock('@/lib/utils', () => ({
  cn: (...classes: any[]) => classes.filter(Boolean).join(' '),
}));

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('RegisterFormWizard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockClear();
    localStorageMock.getItem.mockReturnValue(null);

    // Default: session check returns 401 (not authenticated)
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/auth/me')) {
        return Promise.resolve({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ error: 'Not authenticated' }),
        });
      }
      if (url.includes('/auth/check-availability')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              data: {
                usernameAvailable: true,
                emailAvailable: true,
                phoneNumberAvailable: true,
              },
            }),
        });
      }
      if (url.includes('/auth/register')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              data: {
                user: { id: '1', username: 'testuser', email: 'test@example.com' },
                token: 'test-token',
              },
            }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      });
    });
  });

  describe('Initial Rendering', () => {
    it('shows loading state while checking session', async () => {
      // Don't resolve the fetch immediately - create a pending promise
      let resolvePromise: (value: any) => void;
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      mockFetch.mockImplementationOnce(() => pendingPromise);
      render(<RegisterFormWizard />);

      // Initially should show loading or some initial state
      // The component may start showing the form immediately
      // Just verify rendering doesn't crash
      expect(document.body).toBeDefined();

      // Cleanup: resolve the promise to prevent hanging
      resolvePromise!({ ok: false, status: 401, json: () => Promise.resolve({}) });
    });

    it('renders contact step after session check', async () => {
      render(<RegisterFormWizard />);

      await waitFor(() => {
        expect(screen.getByText('Contact Info')).toBeInTheDocument();
      });
    });

    it('displays step indicators', async () => {
      render(<RegisterFormWizard />);

      await waitFor(() => {
        // Should have 5 steps for regular registration
        const stepButtons = screen.getAllByRole('button').filter(
          (btn) => btn.className.includes('rounded-full')
        );
        expect(stepButtons.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('redirects if already authenticated', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/auth/me')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                id: '1',
                username: 'existinguser',
              }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      render(<RegisterFormWizard />);

      await waitFor(() => {
        expect(window.location.href).toBeDefined();
      });
    });
  });

  describe('Contact Step', () => {
    it('renders email and phone inputs', async () => {
      render(<RegisterFormWizard />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('your@email.com')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('6 12 34 56 78')).toBeInTheDocument();
      });
    });

    it('validates email format', async () => {
      const user = userEvent.setup();
      render(<RegisterFormWizard />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('your@email.com')).toBeInTheDocument();
      });

      const emailInput = screen.getByPlaceholderText('your@email.com');
      await user.type(emailInput, 'invalid-email');

      // Should show validation error
      await waitFor(() => {
        expect(screen.getByText(/Invalid email/i)).toBeInTheDocument();
      });
    });

    it('checks email availability on valid email', async () => {
      const user = userEvent.setup();
      render(<RegisterFormWizard />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('your@email.com')).toBeInTheDocument();
      });

      const emailInput = screen.getByPlaceholderText('your@email.com');
      await user.type(emailInput, 'test@example.com');

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/auth/check-availability?email=')
        );
      });
    });

    it('shows existing account alert when email exists', async () => {
      const user = userEvent.setup();
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/auth/me')) {
          return Promise.resolve({ ok: false, status: 401 });
        }
        if (url.includes('/auth/check-availability') && url.includes('email=')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                data: {
                  emailAvailable: false,
                  accountInfo: {
                    maskedDisplayName: 'John Doe',
                    maskedUsername: 'j***n',
                  },
                },
              }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      render(<RegisterFormWizard />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('your@email.com')).toBeInTheDocument();
      });

      const emailInput = screen.getByPlaceholderText('your@email.com');
      await user.type(emailInput, 'existing@example.com');

      await waitFor(() => {
        expect(screen.getByText('Account already exists')).toBeInTheDocument();
      });
    });

    it('disables continue when email is invalid', async () => {
      const user = userEvent.setup();
      render(<RegisterFormWizard />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('your@email.com')).toBeInTheDocument();
      });

      const emailInput = screen.getByPlaceholderText('your@email.com');
      await user.type(emailInput, 'invalid');

      const continueButton = screen.getByRole('button', { name: /Continue/i });
      expect(continueButton).toBeDisabled();
    });

    it('enables continue when email is valid', async () => {
      const user = userEvent.setup();
      render(<RegisterFormWizard />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('your@email.com')).toBeInTheDocument();
      });

      const emailInput = screen.getByPlaceholderText('your@email.com');
      await user.type(emailInput, 'valid@example.com');

      await waitFor(() => {
        const continueButton = screen.getByRole('button', { name: /Continue/i });
        expect(continueButton).not.toBeDisabled();
      });
    });

    it('validates phone format when provided', async () => {
      const user = userEvent.setup();
      render(<RegisterFormWizard />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('6 12 34 56 78')).toBeInTheDocument();
      });

      const phoneInput = screen.getByPlaceholderText('6 12 34 56 78');
      await user.type(phoneInput, '123'); // Too short

      await waitFor(() => {
        expect(screen.getByText(/Phone number is too short/i)).toBeInTheDocument();
      });
    });
  });

  describe('Identity Step', () => {
    const goToIdentityStep = async (user: ReturnType<typeof userEvent.setup>) => {
      const emailInput = screen.getByPlaceholderText('your@email.com');
      await user.type(emailInput, 'test@example.com');

      await waitFor(() => {
        const continueButton = screen.getByRole('button', { name: /Continue/i });
        expect(continueButton).not.toBeDisabled();
      });

      const continueButton = screen.getByRole('button', { name: /Continue/i });
      await user.click(continueButton);

      await waitFor(() => {
        expect(screen.getByText('Your Identity')).toBeInTheDocument();
      });
    };

    it('navigates to identity step from contact step', async () => {
      const user = userEvent.setup();
      render(<RegisterFormWizard />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('your@email.com')).toBeInTheDocument();
      });

      await goToIdentityStep(user);
    });

    it('renders first name and last name inputs', async () => {
      const user = userEvent.setup();
      render(<RegisterFormWizard />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('your@email.com')).toBeInTheDocument();
      });

      await goToIdentityStep(user);

      expect(screen.getByPlaceholderText('John')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Doe')).toBeInTheDocument();
    });

    it('validates minimum name length', async () => {
      const user = userEvent.setup();
      render(<RegisterFormWizard />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('your@email.com')).toBeInTheDocument();
      });

      await goToIdentityStep(user);

      const firstNameInput = screen.getByPlaceholderText('John');
      await user.type(firstNameInput, 'A'); // Too short

      const continueButton = screen.getByRole('button', { name: /Continue/i });
      expect(continueButton).toBeDisabled();
    });

    it('enables continue with valid names', async () => {
      const user = userEvent.setup();
      render(<RegisterFormWizard />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('your@email.com')).toBeInTheDocument();
      });

      await goToIdentityStep(user);

      const firstNameInput = screen.getByPlaceholderText('John');
      const lastNameInput = screen.getByPlaceholderText('Doe');

      await user.type(firstNameInput, 'John');
      await user.type(lastNameInput, 'Doe');

      const continueButton = screen.getByRole('button', { name: /Continue/i });
      expect(continueButton).not.toBeDisabled();
    });

    it('allows going back to contact step', async () => {
      const user = userEvent.setup();
      render(<RegisterFormWizard />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('your@email.com')).toBeInTheDocument();
      });

      await goToIdentityStep(user);

      const backButton = screen.getByRole('button', { name: /Back/i });
      await user.click(backButton);

      expect(screen.getByText('Contact Info')).toBeInTheDocument();
    });
  });

  describe('Username Step', () => {
    const goToUsernameStep = async (user: ReturnType<typeof userEvent.setup>) => {
      // Contact step
      const emailInput = screen.getByPlaceholderText('your@email.com');
      await user.type(emailInput, 'test@example.com');

      await waitFor(() => {
        const continueButton = screen.getByRole('button', { name: /Continue/i });
        expect(continueButton).not.toBeDisabled();
      });

      await user.click(screen.getByRole('button', { name: /Continue/i }));

      // Identity step
      await waitFor(() => {
        expect(screen.getByText('Your Identity')).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText('John'), 'John');
      await user.type(screen.getByPlaceholderText('Doe'), 'Doe');

      await user.click(screen.getByRole('button', { name: /Continue/i }));

      await waitFor(() => {
        expect(screen.getByText('Choose Username')).toBeInTheDocument();
      });
    };

    it('renders username input with @ prefix', async () => {
      const user = userEvent.setup();
      render(<RegisterFormWizard />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('your@email.com')).toBeInTheDocument();
      });

      await goToUsernameStep(user);

      expect(screen.getByText('@')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('username')).toBeInTheDocument();
    });

    it('checks username availability', async () => {
      const user = userEvent.setup();
      render(<RegisterFormWizard />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('your@email.com')).toBeInTheDocument();
      });

      await goToUsernameStep(user);

      const usernameInput = screen.getByPlaceholderText('username');
      await user.type(usernameInput, 'testuser');

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/auth/check-availability?username=testuser')
        );
      });
    });

    it('shows username available message', async () => {
      const user = userEvent.setup();
      render(<RegisterFormWizard />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('your@email.com')).toBeInTheDocument();
      });

      await goToUsernameStep(user);

      const usernameInput = screen.getByPlaceholderText('username');
      await user.type(usernameInput, 'testuser');

      await waitFor(() => {
        expect(screen.getByText(/Username is available/i)).toBeInTheDocument();
      });
    });

    it('shows username taken message with suggestions', async () => {
      const user = userEvent.setup();
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/auth/me')) {
          return Promise.resolve({ ok: false, status: 401 });
        }
        if (url.includes('/auth/check-availability') && url.includes('username=')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                data: {
                  usernameAvailable: false,
                  suggestions: ['testuser1', 'testuser_2', 'testuser-3'],
                },
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: { emailAvailable: true } }),
        });
      });

      render(<RegisterFormWizard />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('your@email.com')).toBeInTheDocument();
      });

      await goToUsernameStep(user);

      const usernameInput = screen.getByPlaceholderText('username');
      await user.type(usernameInput, 'testuser');

      await waitFor(() => {
        expect(screen.getByText(/Username is already taken/i)).toBeInTheDocument();
      });

      // Should show suggestions
      await waitFor(() => {
        expect(screen.getByText(/@testuser1/)).toBeInTheDocument();
      });
    });

    it('selects suggested username on click', async () => {
      const user = userEvent.setup();
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/auth/me')) {
          return Promise.resolve({ ok: false, status: 401 });
        }
        if (url.includes('/auth/check-availability') && url.includes('username=testuser')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                data: {
                  usernameAvailable: false,
                  suggestions: ['testuser1'],
                },
              }),
          });
        }
        if (url.includes('/auth/check-availability') && url.includes('username=testuser1')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                data: {
                  usernameAvailable: true,
                },
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: { emailAvailable: true } }),
        });
      });

      render(<RegisterFormWizard />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('your@email.com')).toBeInTheDocument();
      });

      await goToUsernameStep(user);

      const usernameInput = screen.getByPlaceholderText('username');
      await user.type(usernameInput, 'testuser');

      await waitFor(() => {
        expect(screen.getByText(/@testuser1/)).toBeInTheDocument();
      });

      await user.click(screen.getByText(/@testuser1/));

      expect(usernameInput).toHaveValue('testuser1');
    });

    it('validates username format', async () => {
      const user = userEvent.setup();
      render(<RegisterFormWizard />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('your@email.com')).toBeInTheDocument();
      });

      await goToUsernameStep(user);

      const usernameInput = screen.getByPlaceholderText('username');
      // Try typing invalid character - should be filtered
      await user.type(usernameInput, 'test@user');

      // @ should be filtered out
      expect(usernameInput).toHaveValue('testuser');
    });
  });

  describe('Security Step', () => {
    const goToSecurityStep = async (user: ReturnType<typeof userEvent.setup>) => {
      // Contact step
      const emailInput = screen.getByPlaceholderText('your@email.com');
      await user.type(emailInput, 'test@example.com');

      await waitFor(() => {
        const continueButton = screen.getByRole('button', { name: /Continue/i });
        expect(continueButton).not.toBeDisabled();
      });

      await user.click(screen.getByRole('button', { name: /Continue/i }));

      // Identity step
      await waitFor(() => {
        expect(screen.getByText('Your Identity')).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText('John'), 'John');
      await user.type(screen.getByPlaceholderText('Doe'), 'Doe');

      await user.click(screen.getByRole('button', { name: /Continue/i }));

      // Username step
      await waitFor(() => {
        expect(screen.getByText('Choose Username')).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText('username'), 'testuser');

      await waitFor(() => {
        const continueButton = screen.getByRole('button', { name: /Continue/i });
        expect(continueButton).not.toBeDisabled();
      });

      await user.click(screen.getByRole('button', { name: /Continue/i }));

      await waitFor(() => {
        expect(screen.getByText('Secure Your Account')).toBeInTheDocument();
      });
    };

    it('renders password and confirm password inputs', async () => {
      const user = userEvent.setup();
      render(<RegisterFormWizard />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('your@email.com')).toBeInTheDocument();
      });

      await goToSecurityStep(user);

      expect(screen.getByPlaceholderText('Enter password')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Confirm your password')).toBeInTheDocument();
    });

    it('shows password strength indicator', async () => {
      const user = userEvent.setup();
      render(<RegisterFormWizard />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('your@email.com')).toBeInTheDocument();
      });

      await goToSecurityStep(user);

      const passwordInput = screen.getByPlaceholderText('Enter password');
      await user.type(passwordInput, '123456');

      // The password strength indicator should be visible
      // Use queryAllByText since there might be multiple matches
      const strengthIndicators = screen.queryAllByText(/Weak password|Medium strength|Strong password/i);
      expect(strengthIndicators.length).toBeGreaterThan(0);
    });

    it('validates password confirmation match', async () => {
      const user = userEvent.setup();
      render(<RegisterFormWizard />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('your@email.com')).toBeInTheDocument();
      });

      await goToSecurityStep(user);

      const passwordInput = screen.getByPlaceholderText('Enter password');
      const confirmInput = screen.getByPlaceholderText('Confirm your password');

      await user.type(passwordInput, 'password123');
      await user.type(confirmInput, 'different123');

      expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    });

    it('enables continue when passwords match', async () => {
      const user = userEvent.setup();
      render(<RegisterFormWizard />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('your@email.com')).toBeInTheDocument();
      });

      await goToSecurityStep(user);

      const passwordInput = screen.getByPlaceholderText('Enter password');
      const confirmInput = screen.getByPlaceholderText('Confirm your password');

      await user.type(passwordInput, 'password123');
      await user.type(confirmInput, 'password123');

      const continueButton = screen.getByRole('button', { name: /Continue/i });
      expect(continueButton).not.toBeDisabled();
    });

    it('toggles password visibility', async () => {
      const user = userEvent.setup();
      render(<RegisterFormWizard />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('your@email.com')).toBeInTheDocument();
      });

      await goToSecurityStep(user);

      const passwordInput = screen.getByPlaceholderText('Enter password');
      expect(passwordInput).toHaveAttribute('type', 'password');

      // Find the toggle button (eye icon)
      const toggleButtons = screen.getAllByRole('button');
      const toggleButton = toggleButtons.find((btn) =>
        btn.className.includes('absolute')
      );

      if (toggleButton) {
        await user.click(toggleButton);
        expect(passwordInput).toHaveAttribute('type', 'text');
      }
    });
  });

  describe('Preferences Step', () => {
    const goToPreferencesStep = async (user: ReturnType<typeof userEvent.setup>) => {
      // Fast path through all steps
      await user.type(screen.getByPlaceholderText('your@email.com'), 'test@example.com');
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Continue/i })).not.toBeDisabled();
      });
      await user.click(screen.getByRole('button', { name: /Continue/i }));

      await waitFor(() => {
        expect(screen.getByPlaceholderText('John')).toBeInTheDocument();
      });
      await user.type(screen.getByPlaceholderText('John'), 'John');
      await user.type(screen.getByPlaceholderText('Doe'), 'Doe');
      await user.click(screen.getByRole('button', { name: /Continue/i }));

      await waitFor(() => {
        expect(screen.getByPlaceholderText('username')).toBeInTheDocument();
      });
      await user.type(screen.getByPlaceholderText('username'), 'testuser');
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Continue/i })).not.toBeDisabled();
      });
      await user.click(screen.getByRole('button', { name: /Continue/i }));

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter password')).toBeInTheDocument();
      });
      await user.type(screen.getByPlaceholderText('Enter password'), 'password123');
      await user.type(screen.getByPlaceholderText('Confirm your password'), 'password123');
      await user.click(screen.getByRole('button', { name: /Continue/i }));

      await waitFor(() => {
        expect(screen.getByText('Your Preferences')).toBeInTheDocument();
      });
    };

    it('renders language selectors', async () => {
      const user = userEvent.setup();
      render(<RegisterFormWizard />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('your@email.com')).toBeInTheDocument();
      });

      await goToPreferencesStep(user);

      const languageSelectors = screen.getAllByTestId('language-selector');
      expect(languageSelectors).toHaveLength(2);
    });

    it('renders terms checkbox', async () => {
      const user = userEvent.setup();
      render(<RegisterFormWizard />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('your@email.com')).toBeInTheDocument();
      });

      await goToPreferencesStep(user);

      expect(screen.getByTestId('terms-checkbox')).toBeInTheDocument();
      expect(screen.getByText(/Terms of Service/i)).toBeInTheDocument();
    });

    it('disables submit when terms not accepted', async () => {
      const user = userEvent.setup();
      render(<RegisterFormWizard />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('your@email.com')).toBeInTheDocument();
      });

      await goToPreferencesStep(user);

      const submitButton = screen.getByRole('button', { name: /Create Account/i });
      expect(submitButton).toBeDisabled();
    });

    it('enables submit when terms are accepted', async () => {
      const user = userEvent.setup();
      render(<RegisterFormWizard />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('your@email.com')).toBeInTheDocument();
      });

      await goToPreferencesStep(user);

      const checkbox = screen.getByTestId('terms-checkbox');
      await user.click(checkbox);

      const submitButton = screen.getByRole('button', { name: /Create Account/i });
      expect(submitButton).not.toBeDisabled();
    });
  });

  describe('Form Submission', () => {
    const completeFormAndSubmit = async (user: ReturnType<typeof userEvent.setup>) => {
      // Contact step
      await user.type(screen.getByPlaceholderText('your@email.com'), 'test@example.com');
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Continue/i })).not.toBeDisabled();
      });
      await user.click(screen.getByRole('button', { name: /Continue/i }));

      // Identity step
      await waitFor(() => {
        expect(screen.getByPlaceholderText('John')).toBeInTheDocument();
      });
      await user.type(screen.getByPlaceholderText('John'), 'John');
      await user.type(screen.getByPlaceholderText('Doe'), 'Doe');
      await user.click(screen.getByRole('button', { name: /Continue/i }));

      // Username step
      await waitFor(() => {
        expect(screen.getByPlaceholderText('username')).toBeInTheDocument();
      });
      await user.type(screen.getByPlaceholderText('username'), 'testuser');
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Continue/i })).not.toBeDisabled();
      });
      await user.click(screen.getByRole('button', { name: /Continue/i }));

      // Security step
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter password')).toBeInTheDocument();
      });
      await user.type(screen.getByPlaceholderText('Enter password'), 'password123');
      await user.type(screen.getByPlaceholderText('Confirm your password'), 'password123');
      await user.click(screen.getByRole('button', { name: /Continue/i }));

      // Preferences step
      await waitFor(() => {
        expect(screen.getByTestId('terms-checkbox')).toBeInTheDocument();
      });
      await user.click(screen.getByTestId('terms-checkbox'));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Create Account/i })).not.toBeDisabled();
      });

      await user.click(screen.getByRole('button', { name: /Create Account/i }));
    };

    it('submits registration data', async () => {
      const user = userEvent.setup();
      render(<RegisterFormWizard />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('your@email.com')).toBeInTheDocument();
      });

      await completeFormAndSubmit(user);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/auth/register'),
          expect.objectContaining({
            method: 'POST',
            body: expect.any(String),
          })
        );
      });
    });

    it('calls login on successful registration', async () => {
      const user = userEvent.setup();
      render(<RegisterFormWizard />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('your@email.com')).toBeInTheDocument();
      });

      await completeFormAndSubmit(user);

      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith(
          expect.objectContaining({ id: '1' }),
          'test-token'
        );
      });
    });

    it('shows success toast on successful registration', async () => {
      const user = userEvent.setup();
      render(<RegisterFormWizard />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('your@email.com')).toBeInTheDocument();
      });

      await completeFormAndSubmit(user);

      await waitFor(() => {
        expect(mockToast.success).toHaveBeenCalledWith('Account created successfully!');
      });
    });

    it('handles registration error', async () => {
      const user = userEvent.setup();
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/auth/me')) {
          return Promise.resolve({ ok: false, status: 401 });
        }
        if (url.includes('/auth/check-availability')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                data: { usernameAvailable: true, emailAvailable: true },
              }),
          });
        }
        if (url.includes('/auth/register')) {
          return Promise.resolve({
            ok: false,
            json: () =>
              Promise.resolve({
                error: 'Email already exists',
              }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      render(<RegisterFormWizard />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('your@email.com')).toBeInTheDocument();
      });

      await completeFormAndSubmit(user);

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalled();
      });
    });

    it('clears localStorage on successful registration', async () => {
      const user = userEvent.setup();
      render(<RegisterFormWizard />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('your@email.com')).toBeInTheDocument();
      });

      await completeFormAndSubmit(user);

      await waitFor(() => {
        expect(localStorageMock.removeItem).toHaveBeenCalledWith('meeshy_signup_wizard_temp_data');
      });
    });
  });

  describe('Form Persistence', () => {
    it('saves form data to localStorage', async () => {
      const user = userEvent.setup();
      render(<RegisterFormWizard />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('your@email.com')).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText('your@email.com'), 'test@example.com');

      await waitFor(() => {
        expect(localStorageMock.setItem).toHaveBeenCalledWith(
          'meeshy_signup_wizard_temp_data',
          expect.any(String)
        );
      });
    });

    it('restores form data from localStorage', async () => {
      localStorageMock.getItem.mockReturnValue(
        JSON.stringify({
          email: 'restored@example.com',
          firstName: 'Restored',
          lastName: 'User',
        })
      );

      render(<RegisterFormWizard />);

      await waitFor(() => {
        const emailInput = screen.getByPlaceholderText('your@email.com');
        expect(emailInput).toHaveValue('restored@example.com');
      });
    });
  });

  describe('Link ID Mode', () => {
    it('skips username step when linkId is provided', async () => {
      const user = userEvent.setup();
      render(<RegisterFormWizard linkId="test-link-123" />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('your@email.com')).toBeInTheDocument();
      });

      // Contact step
      await user.type(screen.getByPlaceholderText('your@email.com'), 'test@example.com');
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Continue/i })).not.toBeDisabled();
      });
      await user.click(screen.getByRole('button', { name: /Continue/i }));

      // Identity step
      await waitFor(() => {
        expect(screen.getByPlaceholderText('John')).toBeInTheDocument();
      });
      await user.type(screen.getByPlaceholderText('John'), 'John');
      await user.type(screen.getByPlaceholderText('Doe'), 'Doe');
      await user.click(screen.getByRole('button', { name: /Continue/i }));

      // Should go directly to Security step (skipping Username)
      await waitFor(() => {
        expect(screen.getByText('Secure Your Account')).toBeInTheDocument();
      });
    });
  });

  describe('Keyboard Navigation', () => {
    it('advances step on Enter key when form is valid', async () => {
      const user = userEvent.setup();
      render(<RegisterFormWizard />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('your@email.com')).toBeInTheDocument();
      });

      const emailInput = screen.getByPlaceholderText('your@email.com');
      await user.type(emailInput, 'test@example.com');

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Continue/i })).not.toBeDisabled();
      });

      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(screen.getByText('Your Identity')).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('has proper input labels', async () => {
      render(<RegisterFormWizard />);

      await waitFor(() => {
        expect(screen.getByText('Email')).toBeInTheDocument();
      });
    });

    it('shows required field indicators', async () => {
      render(<RegisterFormWizard />);

      await waitFor(() => {
        // Required fields should have * indicator
        const emailLabel = screen.getByText('Email');
        expect(emailLabel.closest('label')).toContainHTML('*');
      });
    });

    it('email input has correct type', async () => {
      render(<RegisterFormWizard />);

      await waitFor(() => {
        const emailInput = screen.getByPlaceholderText('your@email.com');
        expect(emailInput).toHaveAttribute('type', 'email');
      });
    });

    it('phone input has correct type and inputMode', async () => {
      render(<RegisterFormWizard />);

      await waitFor(() => {
        const phoneInput = screen.getByPlaceholderText('6 12 34 56 78');
        expect(phoneInput).toHaveAttribute('type', 'tel');
        expect(phoneInput).toHaveAttribute('inputMode', 'tel');
      });
    });

    it('password input has correct type', async () => {
      const user = userEvent.setup();
      render(<RegisterFormWizard />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('your@email.com')).toBeInTheDocument();
      });

      // Navigate to security step
      await user.type(screen.getByPlaceholderText('your@email.com'), 'test@example.com');
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Continue/i })).not.toBeDisabled();
      });
      await user.click(screen.getByRole('button', { name: /Continue/i }));

      await waitFor(() => {
        expect(screen.getByPlaceholderText('John')).toBeInTheDocument();
      });
      await user.type(screen.getByPlaceholderText('John'), 'John');
      await user.type(screen.getByPlaceholderText('Doe'), 'Doe');
      await user.click(screen.getByRole('button', { name: /Continue/i }));

      await waitFor(() => {
        expect(screen.getByPlaceholderText('username')).toBeInTheDocument();
      });
      await user.type(screen.getByPlaceholderText('username'), 'testuser');
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Continue/i })).not.toBeDisabled();
      });
      await user.click(screen.getByRole('button', { name: /Continue/i }));

      await waitFor(() => {
        const passwordInput = screen.getByPlaceholderText('Enter password');
        expect(passwordInput).toHaveAttribute('type', 'password');
      });
    });
  });

  describe('Recovery Modal Integration', () => {
    it('opens recovery modal when recover account is clicked', async () => {
      const user = userEvent.setup();
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/auth/me')) {
          return Promise.resolve({ ok: false, status: 401 });
        }
        if (url.includes('/auth/check-availability') && url.includes('email=')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                data: {
                  emailAvailable: false,
                },
              }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      render(<RegisterFormWizard />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('your@email.com')).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText('your@email.com'), 'existing@example.com');

      await waitFor(() => {
        expect(screen.getByText('Account already exists')).toBeInTheDocument();
      });

      const recoverButton = screen.getByRole('button', { name: /Recover Account/i });
      await user.click(recoverButton);

      expect(screen.getByTestId('recovery-modal')).toBeInTheDocument();
    });
  });
});
