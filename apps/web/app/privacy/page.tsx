import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, Mail } from 'lucide-react';
import Link from 'next/link';
import { getPrivacyTranslations } from '@/lib/i18n-server';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { PrintButton } from '@/components/common/PrintButton';

export default async function PrivacyPage() {
  const { t, tArray } = await getPrivacyTranslations();

  // Pre-load arrays for server rendering
  const personalItems = tArray('dataCollection.personal.items');
  const translationItems = tArray('dataCollection.translation.items');
  const technicalItems = tArray('dataCollection.technical.items');
  const usageItems = tArray('usage.items') as unknown as Array<{ title: string; description: string }>;
  const sharingCases = tArray('sharing.cases');
  const rightsList = tArray('rights.list');

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <Header mode="default" />

      {/* Print Button */}
      <div className="bg-white dark:bg-gray-800 border-b dark:border-gray-700">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-end">
            <PrintButton label={t('print')} />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Card className="shadow-lg">
          <CardHeader className="text-center border-b">
            <div className="flex items-center justify-center space-x-2 mb-4">
              <Shield className="h-8 w-8 text-blue-600" />
              <CardTitle className="text-3xl font-bold">{t('title')}</CardTitle>
            </div>
            <p className="text-gray-600">{t('lastUpdated')}</p>
          </CardHeader>

          <CardContent className="prose prose-lg max-w-none p-8">
            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4 text-gray-900">{t('introduction.title')}</h2>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                {t('introduction.content')}
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4 text-gray-900">{t('dataCollection.title')}</h2>
              <div className="text-gray-700 dark:text-gray-300 leading-relaxed">
                <h3 className="text-lg font-medium mb-2">{t('dataCollection.personal.title')}</h3>
                <ul className="list-disc pl-6 space-y-1 mb-4">
                  {personalItems.map((item, index) => (
                    <li key={`personal-${index}`}>{item}</li>
                  ))}
                </ul>

                <h3 className="text-lg font-medium mb-2">{t('dataCollection.translation.title')}</h3>
                <ul className="list-disc pl-6 space-y-1 mb-4">
                  {translationItems.map((item, index) => (
                    <li key={`translation-${index}`}>{item}</li>
                  ))}
                </ul>

                <h3 className="text-lg font-medium mb-2">{t('dataCollection.technical.title')}</h3>
                <ul className="list-disc pl-6 space-y-1">
                  {technicalItems.map((item, index) => (
                    <li key={`technical-${index}`}>{item}</li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4 text-gray-900">{t('usage.title')}</h2>
              <div className="text-gray-700 dark:text-gray-300 leading-relaxed">
                <ul className="list-disc pl-6 space-y-2">
                  {usageItems.map((item, index) => (
                    <li key={`usage-${index}`}><strong>{item.title}</strong> {item.description}</li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4 text-gray-900">{t('protection.title')}</h2>
              <div className="text-gray-700 dark:text-gray-300 leading-relaxed">
                <h3 className="text-lg font-medium mb-2">{t('protection.local.title')}</h3>
                <p className="mb-4">
                  {t('protection.local.content')}
                </p>

                <h3 className="text-lg font-medium mb-2">{t('protection.encryption.title')}</h3>
                <p className="mb-4">
                  {t('protection.encryption.content')}
                </p>

                <h3 className="text-lg font-medium mb-2">{t('protection.storage.title')}</h3>
                <p>
                  {t('protection.storage.content')}
                </p>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4 text-gray-900">{t('sharing.title')}</h2>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                {t('sharing.intro')}
              </p>
              <ul className="list-disc pl-6 space-y-1 mt-4">
                {sharingCases.map((case_, index) => (
                  <li key={`sharing-${index}`}>{case_}</li>
                ))}
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4 text-gray-900">{t('rights.title')}</h2>
              <div className="text-gray-700 dark:text-gray-300 leading-relaxed">
                <p className="mb-4">{t('rights.intro')}</p>
                <ul className="list-disc pl-6 space-y-1">
                  {rightsList.map((right, index) => (
                    <li key={`right-${index}`}>{right}</li>
                  ))}
                </ul>
                <p className="mt-4">
                  {t('rights.contact')}
                </p>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4 text-gray-900">{t('cookies.title')}</h2>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                {t('cookies.content')}
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4 text-gray-900">{t('updates.title')}</h2>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                {t('updates.content')}
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4 text-gray-900">{t('contact.title')}</h2>
              <div className="mt-4 p-4 bg-gray-100 dark:bg-gray-700 rounded-lg space-y-2">
                <p className="text-gray-700 dark:text-gray-300">{t('contact.address')}</p>
                <p className="text-gray-700 dark:text-gray-300">{t('contact.email')}</p>
              </div>
            </section>
          </CardContent>
        </Card>

        {/* Navigation Links */}
        <div className="text-center mt-8">
          <p className="text-gray-600 dark:text-gray-400 mb-6">{t('footer.title')}</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/about">
              <Button variant="outline" size="lg">
                {t('footer.about')}
              </Button>
            </Link>
            <Link href="/contact">
              <Button size="lg" className="flex items-center space-x-2">
                <Mail className="h-5 w-5" />
                <span>{t('footer.contact')}</span>
              </Button>
            </Link>
            <Link href="/partners">
              <Button variant="outline" size="lg">
                {t('footer.partners')}
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Footer */}
      <Footer />
    </div>
  );
}
