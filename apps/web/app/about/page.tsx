'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Globe, Heart, Target, Lightbulb, Mail } from 'lucide-react';
import Link from 'next/link';
import { useI18n } from '@/hooks/useI18n';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';

export default function AboutPage() {
  const { t } = useI18n('about');

  return (
    <>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        {/* Header */}
        <Header mode="default" />

      {/* Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Hero Section */}
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">{t('title')}</h1>
            <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              {t('subtitle')}
            </p>
          </div>

          {/* Mission */}
          <Card className="mb-8 shadow-lg">
            <CardHeader className="text-center">
              <div className="flex items-center justify-center space-x-2 mb-4">
                <Target className="h-8 w-8 text-blue-600" />
                <CardTitle className="text-2xl">{t('mission.title')}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-lg text-gray-700 dark:text-gray-300 leading-relaxed">
                {t('mission.description')}
              </p>
            </CardContent>
          </Card>

          {/* Values */}
          <div className="grid md:grid-cols-3 gap-6 mb-8">
            <Card className="text-center shadow-lg">
              <CardContent className="pt-6">
                <div className="flex items-center justify-center mb-4">
                  <Globe className="h-12 w-12 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{t('values.globalAccess.title')}</h3>
                <p className="text-gray-600">
                  {t('values.globalAccess.description')}
                </p>
              </CardContent>
            </Card>

            <Card className="text-center shadow-lg">
              <CardContent className="pt-6">
                <div className="flex items-center justify-center mb-4">
                  <Lightbulb className="h-12 w-12 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{t('values.innovation.title')}</h3>
                <p className="text-gray-600">
                  {t('values.innovation.description')}
                </p>
              </CardContent>
            </Card>

            <Card className="text-center shadow-lg">
              <CardContent className="pt-6">
                <div className="flex items-center justify-center mb-4">
                  <Heart className="h-12 w-12 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{t('values.privacy.title')}</h3>
                <p className="text-gray-600">
                  {t('values.privacy.description')}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Team */}
          <Card className="shadow-lg">
            <CardHeader className="text-center">
              <div className="flex items-center justify-center space-x-2 mb-4">
                <Users className="h-8 w-8 text-blue-600" />
                <CardTitle className="text-2xl">{t('team.title')}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-lg text-gray-700 dark:text-gray-300 leading-relaxed mb-6">
                {t('team.description')}
              </p>
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-6">
                <p className="text-gray-700">
                  {t('team.details')}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Contact CTA */}
          <div className="text-center mt-8">
            <p className="text-gray-600 dark:text-gray-400 mb-4">{t('cta.title')}</p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/contact">
                <Button size="lg" className="flex items-center space-x-2">
                  <Mail className="h-5 w-5" />
                  <span>{t('cta.contact')}</span>
                </Button>
              </Link>
              <Link href="/terms">
                <Button variant="outline" size="lg">
                  {t('cta.terms')}
                </Button>
              </Link>
              <Link href="/privacy">
                <Button variant="outline" size="lg">
                  {t('cta.privacy')}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <Footer />
    </div>
    </>
  );
}
