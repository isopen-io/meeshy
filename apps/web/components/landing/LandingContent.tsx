'use client';

import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LanguageSelector } from '@/components/translation/language-selector';
import {
  MessageSquare,
  Globe,
  Users,
  Zap,
  Shield,
  LogIn,
  UserPlus,
  ArrowRight,
  Languages,
  Sparkles,
  Building2,
  GraduationCap,
  Youtube,
  Twitter,
  Linkedin,
  Instagram,
} from 'lucide-react';
import Link from 'next/link';
import { useI18n } from '@/hooks/useI18n';

interface LandingContentProps {
  locale: string;
  onLocaleChange: (locale: string) => void;
}

export function LandingContent({ locale, onLocaleChange }: LandingContentProps) {
  const { t } = useI18n('landing');

  return (
    <>
      {/* Hero Section */}
      <section className="container mx-auto px-4 py-16 lg:py-24">
        <div className="text-center max-w-5xl mx-auto">
          <Badge variant="secondary" className="mb-6 px-4 py-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 mr-2" />
            {t('hero.badge')}
          </Badge>

          <h1 className="text-5xl lg:text-7xl font-bold text-gray-900 dark:text-white mb-8 leading-tight">
            {t('hero.title')}{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600">
              {t('hero.titleHighlight')}
            </span>
          </h1>

          <p className="text-xl text-gray-600 dark:text-gray-400 mb-8 leading-relaxed">
            {t('hero.subtitle')}
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link href="/login">
              <Button size="lg" variant="outline" className="flex items-center space-x-2">
                <LogIn className="h-5 w-5" />
                <span>{t('hero.login')}</span>
              </Button>
            </Link>

            <Link href="/signup">
              <Button size="lg" className="flex items-center space-x-2">
                <UserPlus className="h-5 w-5" />
                <span>{t('hero.startFree')}</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>

            <LanguageSelector
              value={locale}
              onValueChange={onLocaleChange}
              interfaceOnly={true}
              className="min-w-[150px]"
            />
          </div>
        </div>
      </section>

      {/* Mission Section */}
      <section className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-900 py-20 lg:py-32">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-4xl mx-auto">
            <div className="mb-8">
              <h2 className="text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white mb-6">
                {t('mission.title')}
              </h2>
              <div className="w-24 h-1 bg-gradient-to-r from-blue-600 to-indigo-600 mx-auto mb-8" />
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl dark:shadow-gray-900/30 p-8 lg:p-12 mb-8">
              <h3 className="text-3xl lg:text-4xl font-bold text-gray-900 dark:text-white mb-6">
                {t('mission.slogan')}
              </h3>
              <p className="text-xl lg:text-2xl text-gray-700 dark:text-gray-300 mb-8 leading-relaxed font-medium">
                {t('mission.tagline')}
              </p>
              <p className="text-lg text-gray-600 dark:text-gray-400 leading-relaxed">
                {t('mission.description')}
              </p>
            </div>

            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-6 lg:p-8 text-white">
              <p className="text-lg lg:text-xl italic font-medium">
                {t('mission.signature.line1')}
                <br />
                {t('mission.signature.line2')}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="bg-white dark:bg-gray-900 py-16 lg:py-24">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              {t('features.title')}
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              {t('features.subtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              { icon: Globe, color: 'blue', key: 'universalTranslation' },
              { icon: Languages, color: 'violet', key: 'autoDetection' },
              { icon: Shield, color: 'green', key: 'privacy' },
              { icon: Zap, color: 'yellow', key: 'realtime' },
              { icon: Users, color: 'purple', key: 'groupChats' },
              { icon: Languages, color: 'indigo', key: 'multiLanguage' },
              { icon: MessageSquare, color: 'red', key: 'modernInterface' },
              { icon: Building2, color: 'orange', key: 'internationalColleagues' },
              { icon: GraduationCap, color: 'teal', key: 'multilingualClassrooms' },
            ].map(({ icon: Icon, color, key }) => (
              <Card key={key} className="border-0 shadow-lg dark:bg-gray-800 dark:shadow-gray-900/30">
                <CardHeader>
                  <Icon className={`h-12 w-12 text-${color}-600 dark:text-${color}-400 mb-4`} />
                  <CardTitle>{t(`features.${key}.title`)}</CardTitle>
                  <CardDescription>{t(`features.${key}.description`)}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-gradient-to-r from-blue-600 to-indigo-600 py-16">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl lg:text-4xl font-bold text-white mb-6">
            {t('cta.title')}
          </h2>
          <p className="text-xl text-blue-100 dark:text-blue-200 mb-8 max-w-2xl mx-auto">
            {t('cta.subtitle')}
          </p>

          <Link href="/signup">
            <Button size="lg" variant="secondary" className="flex items-center space-x-2">
              <UserPlus className="h-5 w-5" />
              <span>{t('cta.createAccount')}</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-8">
            <div className="text-center md:text-left">
              <div className="flex items-center justify-center md:justify-start space-x-2 mb-4">
                <div className="h-8 w-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded flex items-center justify-center">
                  <MessageSquare className="h-5 w-5 text-white" />
                </div>
                <span className="text-xl font-bold">Meeshy</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-2 space-y-1 sm:space-y-0">
                <p className="text-gray-300 text-lg">{t('footer.tagline')}</p>
                <span className="text-gray-400 hidden sm:inline">&bull;</span>
                <p className="text-gray-400">{t('footer.copyright')}</p>
              </div>
            </div>

            <div className="text-center md:text-right">
              <div className="mb-6">
                <div className="flex flex-wrap justify-center md:justify-end gap-x-6 gap-y-2">
                  {['about', 'terms', 'contact', 'privacy', 'partners'].map((key) => (
                    <Link key={key} href={`/${key}`} className="text-gray-300 hover:text-white transition-colors">
                      {t(`footer.links.${key === 'privacy' ? 'policy' : key}`)}
                    </Link>
                  ))}
                </div>
              </div>

              <div className="flex justify-center md:justify-end space-x-4">
                {[
                  { href: 'https://youtube.com/@meeshy', icon: Youtube, label: 'YouTube', hoverColor: 'hover:text-red-500' },
                  { href: 'https://x.com/meeshy', icon: Twitter, label: 'X', hoverColor: 'hover:text-white' },
                  { href: 'https://linkedin.com/company/meeshy', icon: Linkedin, label: 'LinkedIn', hoverColor: 'hover:text-blue-400' },
                  { href: 'https://instagram.com/meeshy', icon: Instagram, label: 'Instagram', hoverColor: 'hover:text-pink-500' },
                ].map(({ href, icon: SocialIcon, label, hoverColor }) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`text-gray-400 ${hoverColor} transition-colors`}
                    aria-label={label}
                  >
                    <SocialIcon className="h-6 w-6" />
                  </a>
                ))}
                <a
                  href="https://tiktok.com/@meeshy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-white transition-colors"
                  aria-label="TikTok"
                >
                  <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
