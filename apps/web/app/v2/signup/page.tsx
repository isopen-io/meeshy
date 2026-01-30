'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button, Card, Input, Badge, LanguageOrb, theme } from '@/components/v2';

export default function V2SignupPage() {
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('fr');
  const [isLoading, setIsLoading] = useState(false);

  const languages = [
    { code: 'fr', name: 'Français' },
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Español' },
    { code: 'zh', name: '中文' },
    { code: 'ar', name: 'العربية' },
    { code: 'ja', name: '日本語' },
    { code: 'de', name: 'Deutsch' },
    { code: 'pt', name: 'Português' },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 1) {
      setStep(2);
    } else {
      setIsLoading(true);
      setTimeout(() => setIsLoading(false), 2000);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: theme.colors.warmCanvas }}
    >
      {/* Background */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            radial-gradient(circle at 100% 100%, ${theme.colors.terracotta}20 0%, transparent 50%),
            radial-gradient(circle at 0% 0%, ${theme.colors.deepTeal}20 0%, transparent 50%)
          `,
        }}
      />

      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <Link href="/v2/landing" className="flex items-center justify-center gap-3 mb-8">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-xl"
            style={{ background: `linear-gradient(135deg, ${theme.colors.terracotta}, ${theme.colors.deepTeal})` }}
          >
            M
          </div>
          <span
            className="text-2xl font-semibold"
            style={{ fontFamily: theme.fonts.display, color: theme.colors.charcoal }}
          >
            Meeshy
          </span>
        </Link>

        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div
            className="w-3 h-3 rounded-full transition-colors"
            style={{ background: theme.colors.terracotta }}
          />
          <div
            className="w-12 h-1 rounded-full transition-colors"
            style={{ background: step >= 2 ? theme.colors.terracotta : theme.colors.parchment }}
          />
          <div
            className="w-3 h-3 rounded-full transition-colors"
            style={{ background: step >= 2 ? theme.colors.terracotta : theme.colors.parchment }}
          />
        </div>

        <Card variant="elevated" hover={false} className="p-8">
          {step === 1 ? (
            <>
              <div className="text-center mb-8">
                <h1
                  className="text-2xl font-bold mb-2"
                  style={{ fontFamily: theme.fonts.display, color: theme.colors.charcoal }}
                >
                  Créez votre compte
                </h1>
                <p style={{ color: theme.colors.textSecondary }}>
                  Rejoignez la communauté Meeshy en quelques secondes
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: theme.colors.textPrimary }}>
                    Nom complet
                  </label>
                  <Input
                    type="text"
                    placeholder="Jean Dupont"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    icon={
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    }
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: theme.colors.textPrimary }}>
                    Email
                  </label>
                  <Input
                    type="email"
                    placeholder="vous@exemple.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    icon={
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                      </svg>
                    }
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: theme.colors.textPrimary }}>
                    Mot de passe
                  </label>
                  <Input
                    type="password"
                    placeholder="Minimum 8 caractères"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    icon={
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    }
                  />
                </div>

                <Button type="submit" variant="primary" size="lg" className="w-full">
                  Continuer
                </Button>
              </form>
            </>
          ) : (
            <>
              <div className="text-center mb-8">
                <h1
                  className="text-2xl font-bold mb-2"
                  style={{ fontFamily: theme.fonts.display, color: theme.colors.charcoal }}
                >
                  Choisissez votre langue
                </h1>
                <p style={{ color: theme.colors.textSecondary }}>
                  C'est la langue dans laquelle vous verrez les messages traduits
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-4 gap-3">
                  {languages.map((lang) => (
                    <button
                      key={lang.code}
                      type="button"
                      onClick={() => setSelectedLanguage(lang.code)}
                      className={`p-3 rounded-xl border-2 transition-all ${
                        selectedLanguage === lang.code
                          ? 'border-[#E76F51] bg-[#E76F51]/5'
                          : 'border-transparent bg-[#F5EDE3]/50 hover:bg-[#F5EDE3]'
                      }`}
                    >
                      <LanguageOrb code={lang.code} size="sm" pulse={false} className="mx-auto mb-2" />
                      <span className="text-xs font-medium" style={{ color: theme.colors.textPrimary }}>
                        {lang.name}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="lg"
                    className="flex-1"
                    onClick={() => setStep(1)}
                  >
                    Retour
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    className="flex-1"
                    isLoading={isLoading}
                  >
                    Créer mon compte
                  </Button>
                </div>
              </form>
            </>
          )}

          <p className="text-xs text-center mt-6" style={{ color: theme.colors.textMuted }}>
            En créant un compte, vous acceptez nos{' '}
            <Link href="/v2/terms" style={{ color: theme.colors.terracotta }}>
              Conditions d'utilisation
            </Link>
          </p>
        </Card>

        <p className="text-center mt-6" style={{ color: theme.colors.textSecondary }}>
          Déjà un compte ?{' '}
          <Link href="/v2/login" className="font-medium" style={{ color: theme.colors.terracotta }}>
            Se connecter
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
