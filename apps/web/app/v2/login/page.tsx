'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { Button, Card, Input, theme } from '@/components/v2';
import { useLoginV2 } from '@/hooks/v2/use-login-v2';

function LoginForm() {
  const {
    state,
    setEmail,
    setPassword,
    setRememberMe,
    handleSubmit,
  } = useLoginV2();

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
          <div className="text-center mb-8">
            <h1
              className="text-2xl font-bold mb-2"
              style={{ fontFamily: theme.fonts.display, color: 'var(--gp-charcoal)' }}
            >
              Bon retour !
            </h1>
            <p style={{ color: 'var(--gp-text-secondary)' }}>
              Connectez-vous pour continuer vos conversations
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

            <div>
              <label
                className="block text-sm font-medium mb-2"
                style={{ color: 'var(--gp-text-primary)' }}
              >
                Mot de passe
              </label>
              <Input
                type="password"
                placeholder="********"
                value={state.password}
                onChange={(e) => setPassword(e.target.value)}
                icon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                }
              />
            </div>

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded"
                  checked={state.rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span style={{ color: 'var(--gp-text-secondary)' }}>Se souvenir de moi</span>
              </label>
              <Link
                href="/v2/forgot-password"
                className="font-medium hover:underline"
                style={{ color: 'var(--gp-terracotta)' }}
              >
                Mot de passe oublie ?
              </Link>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full"
              isLoading={state.isLoading}
            >
              Se connecter
            </Button>
          </form>

          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t" style={{ borderColor: 'var(--gp-border)' }} />
            </div>
            <div className="relative flex justify-center">
              <span
                className="px-4 text-sm"
                style={{ background: 'var(--gp-surface)', color: 'var(--gp-text-muted)' }}
              >
                ou continuer avec
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Button variant="outline" className="w-full">
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Google
            </Button>
            <Button variant="outline" className="w-full">
              <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
              </svg>
              GitHub
            </Button>
          </div>
        </Card>

        <p className="text-center mt-6" style={{ color: 'var(--gp-text-secondary)' }}>
          Pas encore de compte ?{' '}
          <Link
            href="/v2/signup"
            className="font-medium"
            style={{ color: 'var(--gp-terracotta)' }}
          >
            Creer un compte
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

export default function V2LoginPage() {
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
      <LoginForm />
    </Suspense>
  );
}
