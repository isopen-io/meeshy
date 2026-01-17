'use client';

import { XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/hooks/useI18n';

interface JoinErrorProps {
  error: string;
}

export function JoinError({ error }: JoinErrorProps) {
  const router = useRouter();
  const { t } = useI18n('joinPage');

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-100 flex items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <XCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <CardTitle className="text-xl text-red-700">{t('invalidLink')}</CardTitle>
          <CardDescription className="text-red-600">
            {error}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={() => router.push('/')}
            className="w-full"
          >
            {t('returnToHome')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
