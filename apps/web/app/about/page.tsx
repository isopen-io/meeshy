import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Users, Globe, Heart, Target, Lightbulb, Mail,
  Zap, BookOpen, Briefcase, Languages, Award, Rocket, CheckCircle2
} from 'lucide-react';
import Link from 'next/link';
import { getAboutTranslations } from '@/lib/i18n-server';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';

export default async function AboutPage() {
  const { t, tArray } = await getAboutTranslations();

  // Pre-load arrays for server rendering
  const keyPoints = tArray('whatIsMeeshy.keyPoints');
  const serverSideReasons = tArray('whyServerSide.reasons') as unknown as Array<{ title: string; description: string }>;
  const learningBenefits = tArray('languageLearning.benefits') as unknown as Array<{ title: string; description: string }>;
  const businessUseCases = tArray('businessWithoutBorders.useCases') as unknown as Array<{ title: string; description: string }>;
  const diversityCommitment = tArray('linguisticDiversity.commitment') as unknown as Array<{ title: string; description: string }>;

  return (
    <>
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
        {/* Header */}
        <Header mode="default" />

        {/* Content */}
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-5xl mx-auto">
            {/* Hero Section */}
            <div className="text-center mb-16">
              <h1 className="text-5xl font-bold text-gray-900 dark:text-white mb-6">
                {t('title')}
              </h1>
              <p className="text-2xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto leading-relaxed">
                {t('subtitle')}
              </p>
            </div>

            {/* What is Meeshy */}
            <Card className="mb-12 shadow-xl border-2 border-blue-100 dark:border-blue-900">
              <CardHeader className="text-center bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950">
                <div className="flex items-center justify-center space-x-2 mb-4">
                  <Globe className="h-10 w-10 text-blue-600" />
                  <CardTitle className="text-3xl">{t('whatIsMeeshy.title')}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-8">
                <p className="text-lg text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
                  {t('whatIsMeeshy.intro')}
                </p>
                <p className="text-lg text-gray-700 dark:text-gray-300 leading-relaxed mb-6">
                  {t('whatIsMeeshy.description')}
                </p>
                <div className="grid md:grid-cols-2 gap-4">
                  {keyPoints.map((point, index) => (
                    <div key={`keypoint-${index}`} className="flex items-start space-x-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      <CheckCircle2 className="h-6 w-6 text-blue-600 flex-shrink-0 mt-1" />
                      <span className="text-gray-700 dark:text-gray-300">{point}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Mission */}
            <Card className="mb-12 shadow-lg">
              <CardHeader className="text-center">
                <div className="flex items-center justify-center space-x-2 mb-4">
                  <Target className="h-8 w-8 text-blue-600" />
                  <CardTitle className="text-2xl">{t('mission.title')}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="text-center">
                <p className="text-xl text-gray-700 dark:text-gray-300 leading-relaxed">
                  {t('mission.description')}
                </p>
              </CardContent>
            </Card>

            {/* Why Server-Side Translation */}
            <Card className="mb-12 shadow-lg">
              <CardHeader className="text-center bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950 dark:to-pink-950">
                <div className="flex items-center justify-center space-x-2 mb-4">
                  <Zap className="h-8 w-8 text-purple-600" />
                  <CardTitle className="text-2xl">{t('whyServerSide.title')}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-8">
                <p className="text-lg text-gray-700 dark:text-gray-300 leading-relaxed mb-8">
                  {t('whyServerSide.intro')}
                </p>
                <div className="space-y-6">
                  {serverSideReasons.map((reason, index) => (
                    <div key={`reason-${index}`} className="border-l-4 border-purple-600 pl-6 py-4 bg-purple-50 dark:bg-purple-900/20 rounded-r-lg">
                      <h4 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">{reason.title}</h4>
                      <p className="text-gray-700 dark:text-gray-300 leading-relaxed">{reason.description}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Language Learning */}
            <Card className="mb-12 shadow-lg">
              <CardHeader className="text-center bg-gradient-to-r from-green-50 to-teal-50 dark:from-green-950 dark:to-teal-950">
                <div className="flex items-center justify-center space-x-2 mb-4">
                  <BookOpen className="h-8 w-8 text-green-600" />
                  <CardTitle className="text-2xl">{t('languageLearning.title')}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-8">
                <p className="text-lg text-gray-700 dark:text-gray-300 leading-relaxed mb-8">
                  {t('languageLearning.intro')}
                </p>
                <div className="grid md:grid-cols-2 gap-6">
                  {learningBenefits.map((benefit, index) => (
                    <Card key={`benefit-${index}`} className="border-2 border-green-200 dark:border-green-800">
                      <CardContent className="p-6">
                        <h4 className="text-lg font-semibold mb-3 text-green-700 dark:text-green-400">{benefit.title}</h4>
                        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">{benefit.description}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Business Without Borders */}
            <Card className="mb-12 shadow-lg">
              <CardHeader className="text-center bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-950 dark:to-red-950">
                <div className="flex items-center justify-center space-x-2 mb-4">
                  <Briefcase className="h-8 w-8 text-orange-600" />
                  <CardTitle className="text-2xl">{t('businessWithoutBorders.title')}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-8">
                <p className="text-lg text-gray-700 dark:text-gray-300 leading-relaxed mb-8">
                  {t('businessWithoutBorders.intro')}
                </p>
                <div className="grid md:grid-cols-2 gap-6">
                  {businessUseCases.map((useCase, index) => (
                    <div key={`usecase-${index}`} className="p-6 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                      <h4 className="text-lg font-semibold mb-3 text-orange-700 dark:text-orange-400">{useCase.title}</h4>
                      <p className="text-gray-700 dark:text-gray-300 leading-relaxed">{useCase.description}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Linguistic Diversity */}
            <Card className="mb-12 shadow-lg">
              <CardHeader className="text-center bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-950 dark:to-blue-950">
                <div className="flex items-center justify-center space-x-2 mb-4">
                  <Languages className="h-8 w-8 text-indigo-600" />
                  <CardTitle className="text-2xl">{t('linguisticDiversity.title')}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-8">
                <p className="text-lg text-gray-700 dark:text-gray-300 leading-relaxed mb-8">
                  {t('linguisticDiversity.intro')}
                </p>
                <div className="space-y-6 mb-8">
                  {diversityCommitment.map((commitment, index) => (
                    <div key={`diversity-${index}`} className="border-l-4 border-indigo-600 pl-6 py-4">
                      <h4 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">{commitment.title}</h4>
                      <p className="text-gray-700 dark:text-gray-300 leading-relaxed">{commitment.description}</p>
                    </div>
                  ))}
                </div>
                <div className="p-6 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border-2 border-indigo-200 dark:border-indigo-800">
                  <p className="text-lg text-gray-700 dark:text-gray-300 leading-relaxed italic">
                    {t('linguisticDiversity.why')}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Values */}
            <div className="mb-12">
              <h2 className="text-3xl font-bold text-center mb-8 text-gray-900 dark:text-white">
                {t('values.title')}
              </h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card className="text-center shadow-lg hover:shadow-xl transition-shadow">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-center mb-4">
                      <Globe className="h-12 w-12 text-blue-600" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{t('values.globalAccess.title')}</h3>
                    <p className="text-gray-600 dark:text-gray-400">
                      {t('values.globalAccess.description')}
                    </p>
                  </CardContent>
                </Card>

                <Card className="text-center shadow-lg hover:shadow-xl transition-shadow">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-center mb-4">
                      <Lightbulb className="h-12 w-12 text-yellow-600" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{t('values.innovation.title')}</h3>
                    <p className="text-gray-600 dark:text-gray-400">
                      {t('values.innovation.description')}
                    </p>
                  </CardContent>
                </Card>

                <Card className="text-center shadow-lg hover:shadow-xl transition-shadow">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-center mb-4">
                      <Heart className="h-12 w-12 text-red-600" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{t('values.privacy.title')}</h3>
                    <p className="text-gray-600 dark:text-gray-400">
                      {t('values.privacy.description')}
                    </p>
                  </CardContent>
                </Card>

                <Card className="text-center shadow-lg hover:shadow-xl transition-shadow">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-center mb-4">
                      <Award className="h-12 w-12 text-purple-600" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{t('values.openness.title')}</h3>
                    <p className="text-gray-600 dark:text-gray-400">
                      {t('values.openness.description')}
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Team */}
            <Card className="mb-12 shadow-lg">
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
                  <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                    {t('team.details')}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Join Movement */}
            <Card className="mb-12 shadow-xl bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950 border-2 border-blue-200 dark:border-blue-800">
              <CardContent className="p-8 text-center">
                <Rocket className="h-16 w-16 text-blue-600 mx-auto mb-6" />
                <h2 className="text-3xl font-bold mb-4 text-gray-900 dark:text-white">
                  {t('joinMovement.title')}
                </h2>
                <p className="text-xl text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
                  {t('joinMovement.description')}
                </p>
                <p className="text-lg text-gray-600 dark:text-gray-400">
                  {t('joinMovement.cta')}
                </p>
              </CardContent>
            </Card>

            {/* Contact CTA */}
            <div className="text-center mt-8">
              <p className="text-gray-600 dark:text-gray-400 mb-6 text-xl">{t('cta.title')}</p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/contact">
                  <Button size="lg" className="flex items-center space-x-2 px-8 py-6 text-lg">
                    <Mail className="h-6 w-6" />
                    <span>{t('cta.contact')}</span>
                  </Button>
                </Link>
                <Link href="/terms">
                  <Button variant="outline" size="lg" className="px-8 py-6 text-lg">
                    {t('cta.terms')}
                  </Button>
                </Link>
                <Link href="/privacy">
                  <Button variant="outline" size="lg" className="px-8 py-6 text-lg">
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
