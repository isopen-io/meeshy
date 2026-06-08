'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, ArrowLeft, Home } from 'lucide-react';
import { useI18n } from '@/hooks/use-i18n';

interface NotFoundPageProps {
  title?: string;
  description?: string;
  suggestions?: string[];
}

export function NotFoundPage({
  title,
  description,
  suggestions
}: NotFoundPageProps) {
  const router = useRouter();
  const { t } = useI18n('common');

  const resolvedTitle = title ?? t('errors.notFound.title');
  const resolvedDescription = description ?? t('errors.notFound.description');
  const resolvedSuggestions = suggestions ?? [
    t('errors.notFound.suggestions.dashboard'),
    t('errors.notFound.suggestions.conversations'),
    t('errors.notFound.suggestions.groups'),
  ];

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
            <AlertTriangle className="w-6 h-6 text-destructive" />
          </div>
          <CardTitle className="text-xl font-bold text-foreground">
            {resolvedTitle}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-center">
            {resolvedDescription}
          </p>

          <div className="space-y-2">
            <Button
              onClick={() => router.push('/dashboard')}
              className="w-full"
            >
              <Home className="w-4 h-4 mr-2" />
              {t('errors.notFound.backToDashboard')}
            </Button>

            <Button
              onClick={() => router.back()}
              variant="outline"
              className="w-full"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              {t('errors.notFound.previousPage')}
            </Button>
          </div>

          <div className="pt-4 border-t">
            <p className="text-sm text-muted-foreground mb-2">{t('errors.notFound.suggestions.label')}</p>
            <ul className="text-sm space-y-1">
              {resolvedSuggestions.map((suggestion, index) => (
                <li key={index} className="text-muted-foreground">
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
