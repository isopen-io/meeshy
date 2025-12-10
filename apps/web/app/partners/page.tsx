'use client';

import { useI18n } from '@/hooks/useI18n';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Handshake, Mail, ExternalLink, Building2, GraduationCap, Users, Shield, Zap, HeartHandshake, Globe, BookOpen, Briefcase } from 'lucide-react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';

export default function PartnersPage() {
  const { t } = useI18n('partners');

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <Header mode="default" />

      {/* Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          {/* Hero Section */}
          <div className="text-center mb-12">
            <div className="flex items-center justify-center space-x-2 mb-4">
              <Handshake className="h-12 w-12 text-blue-600" />
            </div>
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">{t('title')}</h1>
            <p className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
              {t('subtitle')}
            </p>
          </div>

          {/* Partnership Types */}
          <div className="grid lg:grid-cols-3 gap-8 mb-12">
            {/* Enterprise Teams */}
            <Card className="shadow-lg border-l-4 border-l-blue-600 dark:border-l-blue-400">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Building2 className="h-6 w-6 text-blue-600" />
                  <span>{t('enterprise.title')}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 dark:text-gray-300 mb-4">
                  {t('enterprise.description')}
                </p>
                <ul className="space-y-2 text-gray-600">
                  <li>• {t('enterprise.features.deployment')}</li>
                  <li>• {t('enterprise.features.sso')}</li>
                  <li>• {t('enterprise.features.analytics')}</li>
                  <li>• {t('enterprise.features.support')}</li>
                  <li>• {t('enterprise.features.customization')}</li>
                </ul>
                <div className="mt-4 pt-4 border-t">
                  <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">{t('enterprise.pricing')}</p>
                </div>
              </CardContent>
            </Card>

            {/* Educational Institutions */}
            <Card className="shadow-lg border-l-4 border-l-green-600 dark:border-l-green-400">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <GraduationCap className="h-6 w-6 text-green-600" />
                  <span>{t('education.title')}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 dark:text-gray-300 mb-4">
                  {t('education.description')}
                </p>
                <ul className="space-y-2 text-gray-600">
                  <li>• {t('education.features.classrooms')}</li>
                  <li>• {t('education.features.exchange')}</li>
                  <li>• {t('education.features.learning')}</li>
                  <li>• {t('education.features.admin')}</li>
                  <li>• {t('education.features.curriculum')}</li>
                </ul>
                <div className="mt-4 pt-4 border-t">
                  <p className="text-sm text-green-600 font-medium">{t('education.pricing')}</p>
                </div>
              </CardContent>
            </Card>

            {/* Technology Partners */}
            <Card className="shadow-lg border-l-4 border-l-purple-600 dark:border-l-purple-400">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <ExternalLink className="h-6 w-6 text-purple-600" />
                  <span>{t('types.tech.title')}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 dark:text-gray-300 mb-4">
                  {t('types.tech.description')}
                </p>
                <ul className="space-y-2 text-gray-600">
                  <li>• {t('types.tech.features.0')}</li>
                  <li>• {t('types.tech.features.1')}</li>
                  <li>• {t('types.tech.features.2')}</li>
                  <li>• {t('types.tech.features.3')}</li>
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Deployment Solutions */}
          <div className="mb-12">
            <h2 className="text-3xl font-bold text-center mb-8">{t('deployment.title')}</h2>
            <div className="grid md:grid-cols-2 gap-8">
              <Card className="shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Shield className="h-6 w-6 text-blue-600" />
                    <span>{t('deployment.onPremise.title')}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-700 dark:text-gray-300 mb-4">{t('deployment.onPremise.description')}</p>
                  <ul className="space-y-2 text-gray-600">
                    <li>• {t('deployment.onPremise.features.security')}</li>
                    <li>• {t('deployment.onPremise.features.compliance')}</li>
                    <li>• {t('deployment.onPremise.features.customization')}</li>
                    <li>• {t('deployment.onPremise.features.performance')}</li>
                  </ul>
                </CardContent>
              </Card>

              <Card className="shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Globe className="h-6 w-6 text-green-600" />
                    <span>{t('deployment.cloud.title')}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-700 dark:text-gray-300 mb-4">{t('deployment.cloud.description')}</p>
                  <ul className="space-y-2 text-gray-600">
                    <li>• {t('deployment.cloud.features.quick')}</li>
                    <li>• {t('deployment.cloud.features.scalable')}</li>
                    <li>• {t('deployment.cloud.features.maintenance')}</li>
                    <li>• {t('deployment.cloud.features.updates')}</li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Use Cases */}
          <div className="mb-12">
            <h2 className="text-3xl font-bold text-center mb-8">{t('useCases.title')}</h2>
            <div className="grid md:grid-cols-3 gap-6">
              <Card className="shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Briefcase className="h-6 w-6 text-blue-600" />
                    <span>{t('useCases.business.title')}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-gray-600">
                    <li>• {t('useCases.business.items.meetings')}</li>
                    <li>• {t('useCases.business.items.support')}</li>
                    <li>• {t('useCases.business.items.collaboration')}</li>
                    <li>• {t('useCases.business.items.training')}</li>
                  </ul>
                </CardContent>
              </Card>

              <Card className="shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <BookOpen className="h-6 w-6 text-green-600" />
                    <span>{t('useCases.education.title')}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-gray-600">
                    <li>• {t('useCases.education.items.language')}</li>
                    <li>• {t('useCases.education.items.international')}</li>
                    <li>• {t('useCases.education.items.research')}</li>
                    <li>• {t('useCases.education.items.cultural')}</li>
                  </ul>
                </CardContent>
              </Card>

              <Card className="shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Users className="h-6 w-6 text-purple-600" />
                    <span>{t('useCases.community.title')}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-gray-600">
                    <li>• {t('useCases.community.items.nonprofits')}</li>
                    <li>• {t('useCases.community.items.events')}</li>
                    <li>• {t('useCases.community.items.volunteer')}</li>
                    <li>• {t('useCases.community.items.healthcare')}</li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Benefits */}
          <Card className="mb-8 shadow-lg">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">{t('benefits.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="bg-blue-100 dark:bg-blue-800/30 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                    <Zap className="h-8 w-8 text-blue-600" />
                  </div>
                  <h3 className="font-semibold mb-2">{t('benefits.priority.title')}</h3>
                  <p className="text-gray-600 dark:text-gray-400 text-sm">
                    {t('benefits.priority.description')}
                  </p>
                </div>
                <div className="text-center">
                  <div className="bg-blue-100 dark:bg-blue-800/30 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                    <HeartHandshake className="h-8 w-8 text-blue-600" />
                  </div>
                  <h3 className="font-semibold mb-2">{t('benefits.support.title')}</h3>
                  <p className="text-gray-600 dark:text-gray-400 text-sm">
                    {t('benefits.support.description')}
                  </p>
                </div>
                <div className="text-center">
                  <div className="bg-blue-100 dark:bg-blue-800/30 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                    <Globe className="h-8 w-8 text-blue-600" />
                  </div>
                  <h3 className="font-semibold mb-2">{t('benefits.visibility.title')}</h3>
                  <p className="text-gray-600 dark:text-gray-400 text-sm">
                    {t('benefits.visibility.description')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Contact */}
          <Card className="shadow-lg">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">{t('become.title')}</CardTitle>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-gray-700 dark:text-gray-300 mb-6">
                {t('become.description')}
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/contact">
                  <Button size="lg" className="flex items-center space-x-2">
                    <Mail className="h-5 w-5" />
                    <span>{t('become.contact')}</span>
                  </Button>
                </Link>
                <Link href="/about">
                  <Button variant="outline" size="lg">
                    {t('become.about')}
                  </Button>
                </Link>
                <Button variant="outline" size="lg" className="flex items-center space-x-2">
                  <ExternalLink className="h-5 w-5" />
                  <span>{t('become.api')}</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Footer */}
      <Footer />
    </div>
  );
}
