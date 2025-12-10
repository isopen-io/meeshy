'use client';

import { useI18n } from '@/hooks/useI18n';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Printer, Shield, Mail } from '@/lib/icons';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';

export default function PrivacyPage() {
  const { t, tArray, isLoading } = useI18n('privacy');

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <Header mode="default" />

      {/* Print Button */}
      <div className="bg-white dark:bg-gray-800 border-b dark:border-gray-700">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-end">
            <Button onClick={handlePrint} variant="outline" className="flex items-center space-x-2">
              <Printer className="h-4 w-4" />
              <span>{t('print')}</span>
            </Button>
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
                  {tArray('dataCollection.personal.items').map((item: string, index: number) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
                
                <h3 className="text-lg font-medium mb-2">{t('dataCollection.translation.title')}</h3>
                <ul className="list-disc pl-6 space-y-1 mb-4">
                  {tArray('dataCollection.translation.items').map((item: string, index: number) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
                
                <h3 className="text-lg font-medium mb-2">{t('dataCollection.technical.title')}</h3>
                <ul className="list-disc pl-6 space-y-1">
                  {tArray('dataCollection.technical.items').map((item: string, index: number) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4 text-gray-900">{t('usage.title')}</h2>
              <div className="text-gray-700 dark:text-gray-300 leading-relaxed">
                <ul className="list-disc pl-6 space-y-2">
                  {tArray('usage.items').map((item: any, index: number) => (
                    <li key={index}><strong>{item.title}</strong> {item.description}</li>
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
                {tArray('sharing.cases').map((case_: string, index: number) => (
                  <li key={index}>{case_}</li>
                ))}
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4 text-gray-900">{t('rights.title')}</h2>
              <div className="text-gray-700 dark:text-gray-300 leading-relaxed">
                <p className="mb-4">{t('rights.intro')}</p>
                <ul className="list-disc pl-6 space-y-1">
                  {tArray('rights.list').map((right: string, index: number) => (
                    <li key={index}>{right}</li>
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
                <p className="text-gray-700">{t('contact.address')}</p>
                <p className="text-gray-700">{t('contact.email')}</p>
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

      {/* Print Styles */}
      <style jsx global>{`
        @media print {
          .no-print {
            display: none !important;
          }
          body {
            background: white !important;
          }
          .container {
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
          }
        }
      `}</style>

      {/* Footer */}
      <Footer />
    </div>
  );
}
