/**
 * apps/web (legacy) — la page de demande de magic link distingue enfin un
 * refus par débit (429 / `code: RATE_LIMITED`) du succès (#6665). Avant ce
 * correctif, `handleSubmit`/`handleResend` traitaient TOUTE réponse en échec
 * comme un envoi réussi — un compte SANS mot de passe (seule porte d'entrée)
 * était laissé dehors sans le savoir.
 *
 * Le cas nominal (adresse inconnue ⇒ toujours le message générique de
 * succès, aucune énumération) reste inchangé et est couvert ci-dessous.
 */

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: { children?: React.ReactNode } & Record<string, unknown>) => (
      <div {...props}>{children}</div>
    ),
    p: ({ children, ...props }: { children?: React.ReactNode } & Record<string, unknown>) => (
      <p {...props}>{children}</p>
    ),
  },
}));

// Même mock que le patron `use-recovery-submission-i18n.test.ts` : le 2e
// argument, s'il est une chaîne, EST le fallback anglais ; un objet
// d'interpolation n'est jamais rendu tel quel.
const mockT = jest.fn((key: string, paramsOrFallback?: unknown) =>
  typeof paramsOrFallback === 'string' ? paramsOrFallback : key
);
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: mockT }),
}));

jest.mock('@/stores/password-reset-store', () => ({
  usePasswordResetStore: () => ({ email: '' }),
}));

const mockRequestMagicLink = jest.fn();
jest.mock('@/services/magic-link.service', () => ({
  magicLinkService: {
    requestMagicLink: (...args: unknown[]) => mockRequestMagicLink(...args),
    validateMagicLink: jest.fn(),
  },
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

jest.mock('@/components/branding', () => ({
  LargeLogo: () => <div data-testid="logo" />,
}));

import { toast } from 'sonner';
import MagicLinkPage from '@/app/auth/magic-link/page';

const mockToast = toast as unknown as { success: jest.Mock; error: jest.Mock };

describe('MagicLinkPage — requestMagicLink refusé par débit (#6665)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  it('shows the generic "email sent" step on success (nominal path, unaffected)', async () => {
    const user = userEvent.setup();
    mockRequestMagicLink.mockResolvedValueOnce({ success: true });

    render(<MagicLinkPage />);

    await user.type(screen.getByLabelText('Email Address'), 'alice@example.com');
    await user.click(screen.getByRole('button', { name: /Send Magic Link/i }));

    await waitFor(() => {
      expect(screen.getByText('Check Your Email')).toBeInTheDocument();
    });
    expect(mockToast.success).toHaveBeenCalledTimes(1);
  });

  it('still shows the generic "email sent" step on an unrelated failure — no enumeration', async () => {
    const user = userEvent.setup();
    mockRequestMagicLink.mockResolvedValueOnce({ success: false, error: 'No account for this address' });

    render(<MagicLinkPage />);

    await user.type(screen.getByLabelText('Email Address'), 'unknown@example.com');
    await user.click(screen.getByRole('button', { name: /Send Magic Link/i }));

    await waitFor(() => {
      expect(screen.getByText('Check Your Email')).toBeInTheDocument();
    });
  });

  it('shows a dedicated rate-limit message instead of pretending the email was sent', async () => {
    const user = userEvent.setup();
    mockRequestMagicLink.mockResolvedValueOnce({
      success: false,
      error: 'Too many magic link requests. Please try again later.',
      code: 'RATE_LIMITED',
    });

    render(<MagicLinkPage />);

    await user.type(screen.getByLabelText('Email Address'), 'alice@example.com');
    await user.click(screen.getByRole('button', { name: /Send Magic Link/i }));

    await waitFor(() => {
      expect(
        screen.getByText('Too many attempts. Please try again in about an hour.')
      ).toBeInTheDocument();
    });
    // La régression visée : jamais l'écran/toast de succès sur un 429.
    expect(screen.queryByText('Check Your Email')).not.toBeInTheDocument();
    expect(mockToast.success).not.toHaveBeenCalled();
  });

  it('resend: reports rate-limiting instead of a fake "link resent" toast', async () => {
    jest.useFakeTimers({ legacyFakeTimers: false });
    const user = userEvent.setup({ delay: null, advanceTimers: jest.advanceTimersByTime });

    mockRequestMagicLink.mockResolvedValueOnce({ success: true });

    render(<MagicLinkPage />);

    await user.type(screen.getByLabelText('Email Address'), 'alice@example.com');
    await user.click(screen.getByRole('button', { name: /Send Magic Link/i }));
    await waitFor(() => expect(screen.getByText('Check Your Email')).toBeInTheDocument());

    // Fait expirer le compte à rebours (10 min) pour révéler le bouton de renvoi.
    act(() => {
      jest.advanceTimersByTime(10 * 60 * 1000 + 1000);
    });

    mockRequestMagicLink.mockResolvedValueOnce({
      success: false,
      error: 'Too many magic link requests. Please try again later.',
      code: 'RATE_LIMITED',
    });

    const resendButton = await screen.findByRole('button', { name: /Resend a new link/i });
    await user.click(resendButton);

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith(
        'Too many attempts. Please try again in about an hour.'
      );
    });
    expect(mockToast.success).not.toHaveBeenCalledWith('New link sent!');

    jest.useRealTimers();
  });
});
