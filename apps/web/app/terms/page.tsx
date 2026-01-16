import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Mail } from 'lucide-react';
import Link from 'next/link';
import { getTermsTranslations } from '@/lib/i18n-server';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { PrintButton } from '@/components/common/PrintButton';

export default async function TermsPage() {
  const { t, tArray } = await getTermsTranslations();

  // Pre-load arrays for server rendering
  const accountResponsibilities = tArray('account.responsibilities');
  const usageProhibited = tArray('usage.prohibited');

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
              <FileText className="h-8 w-8 text-blue-600" />
              <CardTitle className="text-3xl font-bold">{t('title')}</CardTitle>
            </div>
            <p className="text-gray-600 dark:text-gray-400">{t('lastUpdated')}</p>
          </CardHeader>

          <CardContent className="prose prose-lg max-w-none p-8">
            {/* 1. Acceptance */}
            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">{t('acceptance.title')}</h2>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                {t('acceptance.content')}
              </p>
            </section>

            {/* 2. Service Description */}
            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">{t('service.title')}</h2>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                {t('service.content')}
              </p>
            </section>

            {/* 3. User Account */}
            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">{t('account.title')}</h2>
              <div className="text-gray-700 dark:text-gray-300 leading-relaxed">
                <p className="mb-4">{t('account.intro')}</p>
                <ul className="list-disc pl-6 space-y-2">
                  {accountResponsibilities.map((item, index) => (
                    <li key={`account-${index}`}>{item}</li>
                  ))}
                </ul>
              </div>
            </section>

            {/* 4. Acceptable Use */}
            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">{t('usage.title')}</h2>
              <div className="text-gray-700 dark:text-gray-300 leading-relaxed">
                <p className="mb-4">{t('usage.intro')}</p>
                <ul className="list-disc pl-6 space-y-2">
                  {usageProhibited.map((item, index) => (
                    <li key={`usage-${index}`}>{item}</li>
                  ))}
                </ul>
              </div>
            </section>

            {/* 5. User Content */}
            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">{t('content.title')}</h2>
              <div className="text-gray-700 dark:text-gray-300 leading-relaxed space-y-4">
                <p>{t('content.ownership')}</p>
                <p>{t('content.license')}</p>
                <p>{t('content.responsibility')}</p>
              </div>
            </section>

            {/* 6. Limitation of Liability */}
            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">{t('limitation.title')}</h2>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                {t('limitation.content')}
              </p>
            </section>

            {/* 7. Termination */}
            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">{t('termination.title')}</h2>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                {t('termination.content')}
              </p>
            </section>

            {/* 8. Changes to Terms */}
            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">{t('changes.title')}</h2>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                {t('changes.content')}
              </p>
            </section>

            {/* 9. Governing Law */}
            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">{t('governing.title')}</h2>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                {t('governing.content')}
              </p>
            </section>

            {/* 10. Contact */}
            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">{t('contact.title')}</h2>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
                {t('contact.intro')}
              </p>
              <div className="bg-gray-50 dark:bg-gray-800 p-6 rounded-lg">
                <p className="text-gray-700 dark:text-gray-300 mb-2">
                  <strong>{t('contact.email')}</strong>
                </p>
                <p className="text-gray-700 dark:text-gray-300">
                  <strong>{t('contact.address')}</strong>
                </p>
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
            <Link href="/privacy">
              <Button variant="outline" size="lg">
                {t('footer.privacy')}
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
