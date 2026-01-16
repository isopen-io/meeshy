import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPin, Train, Bus, Car, Mail, Clock } from 'lucide-react';
import Link from 'next/link';
import { getContactTranslations } from '@/lib/i18n-server';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';

export default async function ContactPage() {
  const { t } = await getContactTranslations();

  return (
    <>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        {/* Header */}
        <Header mode="default" />

      {/* Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">{t('title')}</h1>
            <p className="text-xl text-gray-600">{t('subtitle')}</p>
          </div>

          <div className="grid lg:grid-cols-2 gap-8">
            {/* Colonne de gauche - Informations et Contact */}
            <div className="space-y-6">
              {/* Adresse */}
              <Card className="shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <MapPin className="h-6 w-6 text-blue-600" />
                    <span>{t('address.title')}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <p className="font-semibold text-lg">{t('address.company')}</p>
                    <p>{t('address.building')}</p>
                    <p>{t('address.street')}</p>
                    <p>{t('address.city')}</p>
                  </div>
                </CardContent>
              </Card>

              {/* Contact */}
              <Card className="shadow-lg">
                <CardHeader>
                  <CardTitle>{t('title')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center space-x-3">
                    <Mail className="h-5 w-5 text-blue-600" />
                    <div>
                      <p className="font-medium">{t('email.label')}</p>
                      <p className="text-gray-600">{t('email.value')}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Disponibilité */}
              <Card className="shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Clock className="h-6 w-6 text-blue-600" />
                    <span>{t('availability.title')}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-700">{t('availability.description')}</p>
                </CardContent>
              </Card>
            </div>

            {/* Colonne de droite - Comment Venir */}
            <div className="space-y-6">
              <Card className="shadow-lg">
                <CardHeader>
                  <CardTitle>{t('directions.title')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* En Train */}
                  <div>
                    <div className="flex items-center space-x-3 mb-3">
                      <Train className="h-6 w-6 text-green-600" />
                      <h3 className="text-lg font-semibold">{t('directions.train.title')}</h3>
                    </div>
                    <div className="pl-9 space-y-2">
                      <p className="text-gray-700">
                        <strong>{t('directions.train.rera')}</strong>
                      </p>
                      <p className="text-gray-700">
                        <strong>{t('directions.train.transilien')}</strong>
                      </p>
                      <p className="text-sm text-gray-600">
                        {t('directions.train.duration')}
                      </p>
                    </div>
                  </div>

                  {/* En Métro */}
                  <div>
                    <div className="flex items-center space-x-3 mb-3">
                      <Train className="h-6 w-6 text-blue-600" />
                      <h3 className="text-lg font-semibold">{t('directions.metro.title')}</h3>
                    </div>
                    <div className="pl-9 space-y-2">
                      <p className="text-gray-700">
                        <strong>{t('directions.metro.line1')}</strong>
                      </p>
                      <p className="text-sm text-gray-600">
                        {t('directions.metro.duration')}
                      </p>
                    </div>
                  </div>

                  {/* En Bus */}
                  <div>
                    <div className="flex items-center space-x-3 mb-3">
                      <Bus className="h-6 w-6 text-orange-600" />
                      <h3 className="text-lg font-semibold">{t('directions.bus.title')}</h3>
                    </div>
                    <div className="pl-9 space-y-2">
                      <p className="text-gray-700">
                        <strong>{t('directions.bus.lines')}</strong>
                      </p>
                      <p className="text-sm text-gray-600">
                        {t('directions.bus.stop')}
                      </p>
                    </div>
                  </div>

                  {/* Ligne U */}
                  <div>
                    <div className="flex items-center space-x-3 mb-3">
                      <Train className="h-6 w-6 text-purple-600" />
                      <h3 className="text-lg font-semibold">{t('directions.lineU.title')}</h3>
                    </div>
                    <div className="pl-9 space-y-2">
                      <p className="text-gray-700">
                        <strong>{t('directions.lineU.transilien')}</strong>
                      </p>
                      <p className="text-sm text-gray-600">
                        {t('directions.lineU.duration')}
                      </p>
                    </div>
                  </div>

                  {/* Ligne E277 */}
                  <div>
                    <div className="flex items-center space-x-3 mb-3">
                      <Bus className="h-6 w-6 text-indigo-600" />
                      <h3 className="text-lg font-semibold">{t('directions.express.title')}</h3>
                    </div>
                    <div className="pl-9 space-y-2">
                      <p className="text-gray-700">
                        <strong>{t('directions.express.bus')}</strong>
                      </p>
                      <p className="text-sm text-gray-600">
                        {t('directions.express.service')}
                      </p>
                    </div>
                  </div>

                  {/* En Voiture */}
                  <div>
                    <div className="flex items-center space-x-3 mb-3">
                      <Car className="h-6 w-6 text-red-600" />
                      <h3 className="text-lg font-semibold">{t('directions.car.title')}</h3>
                    </div>
                    <div className="pl-9 space-y-2">
                      <p className="text-gray-700">
                        <strong>{t('directions.car.highway')}</strong>
                      </p>
                      <p className="text-gray-700">
                        <strong>{t('directions.car.parking')}</strong>
                      </p>
                      <p className="text-sm text-gray-600">
                        {t('directions.car.rates')}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Contact CTA */}
          <div className="text-center mt-12">
            <p className="text-gray-600 dark:text-gray-400 mb-6">{t('cta.title')}</p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/about">
                <Button variant="outline" size="lg">
                  {t('cta.about')}
                </Button>
              </Link>
              <Link href="/partners">
                <Button variant="outline" size="lg">
                  {t('cta.partners')}
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
