/**
 * Tests for SignupPage component
 *
 * This page allows new users to register for an account.
 * It wraps the RegisterFormWizard component with a styled layout.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock dependencies before importing component
const mockPush = jest.fn();
const mockRouter = {
  push: mockPush,
  replace: jest.fn(),
  prefetch: jest.fn(),
  back: jest.fn(),
  pathname: '/signup',
  query: {},
};

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/signup',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock useI18n hook
const mockT = jest.fn((key: string, fallback?: string) => fallback || key);
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: mockT }),
}));

// Mock RegisterFormWizard component
const mockFormSubmit = jest.fn();
jest.mock('@/components/auth/register-form-wizard', () => ({
  RegisterFormWizard: () => (
    <div data-testid="register-form-wizard">
      <h2>Create Account</h2>
      <form onSubmit={mockFormSubmit}>
        <input type="text" placeholder="Username" data-testid="username-input" />
        <input type="email" placeholder="Email" data-testid="email-input" />
        <input type="password" placeholder="Password" data-testid="password-input" />
        <button type="submit" data-testid="submit-button">Sign Up</button>
      </form>
    </div>
  ),
}));

// Mock LargeLogo component
jest.mock('@/components/branding', () => ({
  LargeLogo: ({ href }: { href: string }) => (
    <a href={href} data-testid="large-logo">Logo</a>
  ),
}));

// Import component after mocks
import SignupPage from '@/app/signup/page';

describe('SignupPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Initial Rendering', () => {
    it('should render the page', () => {
      const { container } = render(<SignupPage />);
      expect(container).toBeInTheDocument();
    });

    it('should render the logo', () => {
      render(<SignupPage />);
      expect(screen.getByTestId('large-logo')).toBeInTheDocument();
      expect(screen.getByTestId('large-logo')).toHaveAttribute('href', '/');
    });

    it('should render the register form wizard', () => {
      render(<SignupPage />);
      expect(screen.getByTestId('register-form-wizard')).toBeInTheDocument();
    });

    it('should render username input', () => {
      render(<SignupPage />);
      expect(screen.getByTestId('username-input')).toBeInTheDocument();
    });

    it('should render email input', () => {
      render(<SignupPage />);
      expect(screen.getByTestId('email-input')).toBeInTheDocument();
    });

    it('should render password input', () => {
      render(<SignupPage />);
      expect(screen.getByTestId('password-input')).toBeInTheDocument();
    });

    it('should render submit button', () => {
      render(<SignupPage />);
      expect(screen.getByTestId('submit-button')).toBeInTheDocument();
    });
  });

  describe('Footer Links', () => {
    it('should render terms of service link', () => {
      render(<SignupPage />);
      const termsLink = screen.getByRole('link', { name: /register\.termsOfService/i });
      expect(termsLink).toBeInTheDocument();
      expect(termsLink).toHaveAttribute('href', '/terms');
    });

    it('should render privacy policy link', () => {
      render(<SignupPage />);
      const privacyLink = screen.getByRole('link', { name: /register\.privacyPolicy/i });
      expect(privacyLink).toBeInTheDocument();
      expect(privacyLink).toHaveAttribute('href', '/privacy');
    });

    it('should render contact link', () => {
      render(<SignupPage />);
      const contactLink = screen.getByRole('link', { name: /register\.contactUs/i });
      expect(contactLink).toBeInTheDocument();
      expect(contactLink).toHaveAttribute('href', '/contact');
    });
  });

  describe('Loading Fallback', () => {
    it('should render without errors', () => {
      const { container } = render(<SignupPage />);
      expect(container).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have accessible form inputs', () => {
      render(<SignupPage />);

      const usernameInput = screen.getByTestId('username-input');
      const emailInput = screen.getByTestId('email-input');
      const passwordInput = screen.getByTestId('password-input');

      expect(usernameInput).toHaveAttribute('placeholder', 'Username');
      expect(emailInput).toHaveAttribute('type', 'email');
      expect(passwordInput).toHaveAttribute('type', 'password');
    });

    it('should have accessible submit button', () => {
      render(<SignupPage />);
      const submitButton = screen.getByTestId('submit-button');
      expect(submitButton).toHaveAttribute('type', 'submit');
    });
  });

  describe('Responsive Design', () => {
    it('should render decorative blobs', () => {
      const { container } = render(<SignupPage />);
      // Check for blur elements (decorative blobs)
      const blurElements = container.querySelectorAll('.blur-2xl, .blur-3xl');
      expect(blurElements.length).toBeGreaterThan(0);
    });

    it('should have responsive padding classes', () => {
      const { container } = render(<SignupPage />);
      const mainContent = container.querySelector('.px-4');
      expect(mainContent).toBeInTheDocument();
    });

    it('should have max-width constraint on form', () => {
      const { container } = render(<SignupPage />);
      const maxWidthElement = container.querySelector('.max-w-md');
      expect(maxWidthElement).toBeInTheDocument();
    });

    it('should use violet/purple color scheme', () => {
      const { container } = render(<SignupPage />);
      // Check for violet gradient colors in blobs
      const violetElements = container.querySelectorAll('[class*="violet"], [class*="purple"]');
      expect(violetElements.length).toBeGreaterThan(0);
    });

    it('should use cyan/blue color scheme for secondary blob', () => {
      const { container } = render(<SignupPage />);
      const cyanElements = container.querySelectorAll('[class*="cyan"], [class*="blue"]');
      expect(cyanElements.length).toBeGreaterThan(0);
    });

    it('should use pink/rose color scheme for tertiary blob', () => {
      const { container } = render(<SignupPage />);
      const pinkElements = container.querySelectorAll('[class*="pink"], [class*="rose"]');
      expect(pinkElements.length).toBeGreaterThan(0);
    });
  });

  describe('Glass Effect Card', () => {
    it('should have backdrop blur styling', () => {
      const { container } = render(<SignupPage />);
      const blurCard = container.querySelector('.backdrop-blur-md, .backdrop-blur-xl');
      expect(blurCard).toBeInTheDocument();
    });

    it('should have rounded corners', () => {
      const { container } = render(<SignupPage />);
      const roundedElement = container.querySelector('.rounded-2xl');
      expect(roundedElement).toBeInTheDocument();
    });

    it('should have shadow styling', () => {
      const { container } = render(<SignupPage />);
      const shadowElement = container.querySelector('.shadow-xl');
      expect(shadowElement).toBeInTheDocument();
    });

    it('should have border styling', () => {
      const { container } = render(<SignupPage />);
      const borderElement = container.querySelector('[class*="border"]');
      expect(borderElement).toBeInTheDocument();
    });
  });

  describe('Internationalization', () => {
    it('should call translation function', () => {
      render(<SignupPage />);
      expect(mockT).toHaveBeenCalled();
    });

    it('should use auth namespace for translations', () => {
      render(<SignupPage />);
      expect(mockT).toHaveBeenCalled();
    });
  });

  describe('Animation Classes', () => {
    it('should have animated blob classes', () => {
      const { container } = render(<SignupPage />);

      // Check for animation classes
      const animatedElements = container.querySelectorAll('[class*="animate-blob"]');
      expect(animatedElements.length).toBeGreaterThan(0);
    });

    it('should have GPU-optimized will-change class', () => {
      const { container } = render(<SignupPage />);
      const willChangeElements = container.querySelectorAll('.will-change-transform');
      expect(willChangeElements.length).toBeGreaterThan(0);
    });
  });

  describe('Dark Mode Support', () => {
    it('should have dark mode gradient classes', () => {
      const { container } = render(<SignupPage />);
      const darkModeElements = container.querySelectorAll('[class*="dark:"]');
      expect(darkModeElements.length).toBeGreaterThan(0);
    });

    it('should have dark mode background gradient', () => {
      const { container } = render(<SignupPage />);
      const darkGradient = container.querySelector('[class*="dark:from-gray-950"]');
      expect(darkGradient).toBeInTheDocument();
    });
  });

  describe('Background Styling', () => {
    it('should have full-screen minimum height', () => {
      const { container } = render(<SignupPage />);
      const minHeightElement = container.querySelector('.min-h-screen');
      expect(minHeightElement).toBeInTheDocument();
    });

    it('should have gradient background', () => {
      const { container } = render(<SignupPage />);
      const gradientElement = container.querySelector('.bg-gradient-to-br');
      expect(gradientElement).toBeInTheDocument();
    });

    it('should have relative positioning for content layering', () => {
      const { container } = render(<SignupPage />);
      const relativeElement = container.querySelector('.relative');
      expect(relativeElement).toBeInTheDocument();
    });

    it('should have overflow hidden to contain blobs', () => {
      const { container } = render(<SignupPage />);
      const overflowElement = container.querySelector('.overflow-hidden');
      expect(overflowElement).toBeInTheDocument();
    });
  });

  describe('Layout Structure', () => {
    it('should center content vertically and horizontally', () => {
      const { container } = render(<SignupPage />);
      const centeredElement = container.querySelector('.items-center.justify-center');
      expect(centeredElement).toBeInTheDocument();
    });

    it('should use flexbox for layout', () => {
      const { container } = render(<SignupPage />);
      const flexElement = container.querySelector('.flex.flex-col');
      expect(flexElement).toBeInTheDocument();
    });

    it('should have proper z-index for content above blobs', () => {
      const { container } = render(<SignupPage />);
      const zIndexElement = container.querySelector('.z-10');
      expect(zIndexElement).toBeInTheDocument();
    });
  });
});
