'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, ArrowLeft, Home } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';

interface NotFoundPageProps {
  title?: string;
  description?: string;
  suggestions?: string[];
}

export function NotFoundPage({
  title,
  description,
  suggestions,
}: NotFoundPageProps) {
  const router = useRouter();
  const { t } = useI18n('pages');

  const resolvedTitle = title ?? t('pages.notFound.title');
  const resolvedDescription = description ?? t('pages.notFound.description');
  const resolvedSuggestions = suggestions ?? [
    t('pages.notFound.actions.backDashboard'),
    t('pages.notFound.actions.viewCommunities'),
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md dark:bg-gray-800 dark:border-gray-700">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-orange-100 dark:bg-orange-950 rounded-full flex items-center justify-center mb-4">
            <AlertTriangle className="w-6 h-6 text-orange-600 dark:text-orange-400" />
          </div>
          <CardTitle className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {resolvedTitle}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-gray-600 dark:text-gray-400 text-center">
            {resolvedDescription}
          </p>

          <div className="space-y-2">
            <Button
              onClick={() => router.push('/dashboard')}
              className="w-full"
            >
              <Home className="w-4 h-4 mr-2" />
              {t('pages.notFound.actions.backDashboard')}
            </Button>

            <Button
              onClick={() => router.back()}
              variant="outline"
              className="w-full dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              {t('pages.notFound.backPrevious')}
            </Button>
          </div>

          <div className="pt-4 border-t dark:border-gray-700">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
              {t('pages.notFound.suggestions')}
            </p>
            <ul className="text-sm space-y-1">
              {resolvedSuggestions.map((suggestion, index) => (
                <li key={index} className="text-gray-600 dark:text-gray-400">
                  • {suggestion}
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
