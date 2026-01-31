'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button, Card, Input, theme } from '@/components/v2';
import { useForgotPasswordV2 } from '@/hooks/v2/use-forgot-password-v2';

function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const {
    state,
    setEmail,
    handleSubmit,
    resetState,
    setNewPassword,
    setConfirmPassword,
    handleResetSubmit,
    getPasswordStrengthLabel,
    getPasswordStrengthColor,
  } = useForgotPasswordV2();

  // If we have a token, show reset password form
  if (token) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-6"
        style={{ background: 'var(--gp-warm-canvas)' }}
      >
        {/* Background */}
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            backgroundImage: `
              radial-gradient(circle at 0% 100%, var(--gp-terracotta) 0%, transparent 50%),
              radial-gradient(circle at 100% 0%, var(--gp-deep-teal) 0%, transparent 50%)
            `,
            opacity: 0.2,
          }}
        />

        <div className="relative z-10 w-full max-w-md">
          {/* Logo */}
          <Link href="/v2/landing" className="flex items-center justify-center gap-3 mb-8">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-xl"
              style={{ background: `linear-gradient(135deg, var(--gp-terracotta), var(--gp-deep-teal))` }}
            >
              M
            </div>
            <span
              className="text-2xl font-semibold"
              style={{ fontFamily: theme.fonts.display, color: 'var(--gp-charcoal)' }}
            >
              Meeshy
            </span>
          </Link>

          <Card variant="elevated" hover={false} className="p-8">
            {resetState.isSuccess ? (
              <div className="text-center">
                <div
                  className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
                  style={{ background: 'color-mix(in srgb, var(--gp-success) 15%, transparent)' }}
                >
                  <svg className="w-8 h-8" style={{ color: 'var(--gp-success)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h1
                  className="text-2xl font-bold mb-2"
                  style={{ fontFamily: theme.fonts.display, color: 'var(--gp-charcoal)' }}
                >
                  Mot de passe modifie !
                </h1>
                <p style={{ color: 'var(--gp-text-secondary)' }}>
                  Vous allez etre redirige vers la page de connexion...
                </p>
              </div>
            ) : (
              <>
                <div className="text-center mb-8">
                  <h1
                    className="text-2xl font-bold mb-2"
                    style={{ fontFamily: theme.fonts.display, color: 'var(--gp-charcoal)' }}
                  >
                    Nouveau mot de passe
                  </h1>
                  <p style={{ color: 'var(--gp-text-secondary)' }}>
                    Choisissez un nouveau mot de passe securise
                  </p>
                </div>

                {/* Error message */}
                {resetState.error && (
                  <div
                    className="p-4 rounded-xl mb-4 flex items-center gap-3"
                    style={{
                      background: 'color-mix(in srgb, var(--gp-error) 15%, transparent)',
                      border: '1px solid color-mix(in srgb, var(--gp-error) 30%, transparent)'
                    }}
                  >
                    <svg className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--gp-error)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span style={{ color: 'var(--gp-error)' }}>{resetState.error}</span>
                  </div>
                )}

                <form onSubmit={handleResetSubmit} className="space-y-5">
                  <div>
                    <label
                      className="block text-sm font-medium mb-2"
                      style={{ color: 'var(--gp-text-primary)' }}
                    >
                      Nouveau mot de passe
                    </label>
                    <Input
                      type="password"
                      placeholder="********"
                      value={resetState.newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      icon={
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      }
                    />
                    {/* Password strength indicator */}
                    {resetState.newPassword && (
                      <div className="mt-2">
                        <div className="flex gap-1 mb-1">
                          {[0, 1, 2, 3].map((i) => (
                            <div
                              key={i}
                              className="h-1 flex-1 rounded-full transition-colors"
                              style={{
                                background: i < resetState.passwordStrength
                                  ? getPasswordStrengthColor()
                                  : 'var(--gp-border)',
                              }}
                            />
                          ))}
                        </div>
                        <p className="text-xs" style={{ color: getPasswordStrengthColor() }}>
                          {getPasswordStrengthLabel()}
                        </p>
                      </div>
                    )}
                  </div>

                  <div>
                    <label
                      className="block text-sm font-medium mb-2"
                      style={{ color: 'var(--gp-text-primary)' }}
                    >
                      Confirmer le mot de passe
                    </label>
                    <Input
                      type="password"
                      placeholder="********"
                      value={resetState.confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      icon={
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      }
                    />
                  </div>

                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    className="w-full"
                    isLoading={resetState.isLoading}
                  >
                    Reinitialiser le mot de passe
                  </Button>
                </form>
              </>
            )}
          </Card>

          <p className="text-center mt-6" style={{ color: 'var(--gp-text-secondary)' }}>
            <Link
              href="/v2/login"
              className="font-medium"
              style={{ color: 'var(--gp-terracotta)' }}
            >
              Retour a la connexion
            </Link>
          </p>
        </div>
      </div>
    );
  }

  // Request reset form (no token)
  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: 'var(--gp-warm-canvas)' }}
    >
      {/* Background */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            radial-gradient(circle at 0% 100%, var(--gp-terracotta) 0%, transparent 50%),
            radial-gradient(circle at 100% 0%, var(--gp-deep-teal) 0%, transparent 50%)
          `,
          opacity: 0.2,
        }}
      />

      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <Link href="/v2/landing" className="flex items-center justify-center gap-3 mb-8">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-xl"
            style={{ background: `linear-gradient(135deg, var(--gp-terracotta), var(--gp-deep-teal))` }}
          >
            M
          </div>
          <span
            className="text-2xl font-semibold"
            style={{ fontFamily: theme.fonts.display, color: 'var(--gp-charcoal)' }}
          >
            Meeshy
          </span>
        </Link>

        <Card variant="elevated" hover={false} className="p-8">
          {state.isSuccess ? (
            <div className="text-center">
              <div
                className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
                style={{ background: 'color-mix(in srgb, var(--gp-success) 15%, transparent)' }}
              >
                <svg className="w-8 h-8" style={{ color: 'var(--gp-success)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h1
                className="text-2xl font-bold mb-2"
                style={{ fontFamily: theme.fonts.display, color: 'var(--gp-charcoal)' }}
              >
                Email envoye !
              </h1>
              <p style={{ color: 'var(--gp-text-secondary)' }}>
                Si un compte existe avec cet email, vous recevrez un lien de reinitialisation.
              </p>
              <p className="mt-4 text-sm" style={{ color: 'var(--gp-text-muted)' }}>
                Pensez a verifier vos spams.
              </p>
            </div>
          ) : (
            <>
              <div className="text-center mb-8">
                <h1
                  className="text-2xl font-bold mb-2"
                  style={{ fontFamily: theme.fonts.display, color: 'var(--gp-charcoal)' }}
                >
                  Mot de passe oublie ?
                </h1>
                <p style={{ color: 'var(--gp-text-secondary)' }}>
                  Entrez votre email pour recevoir un lien de reinitialisation
                </p>
              </div>

              {/* Error message */}
              {state.error && (
                <div
                  className="p-4 rounded-xl mb-4 flex items-center gap-3"
                  style={{
                    background: 'color-mix(in srgb, var(--gp-error) 15%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--gp-error) 30%, transparent)'
                  }}
                >
                  <svg className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--gp-error)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span style={{ color: 'var(--gp-error)' }}>{state.error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label
                    className="block text-sm font-medium mb-2"
                    style={{ color: 'var(--gp-text-primary)' }}
                  >
                    Email
                  </label>
                  <Input
                    type="email"
                    placeholder="vous@exemple.com"
                    value={state.email}
                    onChange={(e) => setEmail(e.target.value)}
                    icon={
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                      </svg>
                    }
                  />
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  className="w-full"
                  isLoading={state.isLoading}
                >
                  Envoyer le lien
                </Button>
              </form>
            </>
          )}
        </Card>

        <p className="text-center mt-6" style={{ color: 'var(--gp-text-secondary)' }}>
          <Link
            href="/v2/login"
            className="font-medium"
            style={{ color: 'var(--gp-terracotta)' }}
          >
            Retour a la connexion
          </Link>
        </p>
      </div>

      {/* Fonts */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />
    </div>
  );
}

export default function V2ForgotPasswordPage() {
  return (
    <Suspense fallback={
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--gp-warm-canvas)' }}
      >
        <div className="text-center space-y-4">
          <div
            className="w-12 h-12 rounded-xl mx-auto animate-pulse"
            style={{
              background: 'linear-gradient(135deg, var(--gp-terracotta), var(--gp-deep-teal))'
            }}
          />
          <p style={{ color: 'var(--gp-text-muted)' }}>
            Chargement...
          </p>
        </div>
      </div>
    }>
      <ForgotPasswordForm />
    </Suspense>
  );
}
