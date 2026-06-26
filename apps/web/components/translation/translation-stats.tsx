'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Zap, Globe } from 'lucide-react';
import { useI18n } from '@/hooks/use-i18n';
import { logger } from '@/utils/logger';

interface SimpleStats {
  totalTranslations: number;
  lastUsed: Date | null;
}

export function TranslationStats() {
  const { t, locale } = useI18n('settings');
  const [stats, setStats] = useState<SimpleStats>({
    totalTranslations: 0,
    lastUsed: null
  });

  useEffect(() => {
    const loadStats = () => {
      try {
        const statsData = localStorage.getItem('translation_stats');
        if (statsData) {
          const parsedStats = JSON.parse(statsData);
          setStats({
            totalTranslations: parsedStats.totalTranslations || 0,
            lastUsed: parsedStats.lastUsed ? new Date(parsedStats.lastUsed) : null
          });
        }
      } catch (error) {
        logger.error('[TranslationStats]', 'Erreur lors du chargement des statistiques:', { error });
      }
    };

    loadStats();
  }, []);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            {t('translationStats.title')}
          </CardTitle>
          <CardDescription>
            {t('translationStats.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{t('translationStats.total')}</span>
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Zap className="h-3 w-3" />
                  {stats.totalTranslations}
                </Badge>
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{t('translationStats.lastUsed')}</span>
                <span className="text-sm text-muted-foreground">
                  {stats.lastUsed
                    ? stats.lastUsed.toLocaleDateString(locale)
                    : t('translationStats.never')
                  }
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <div className="text-center text-sm text-muted-foreground">
              <p>{t('translationStats.serviceActive')}</p>
              <p className="text-xs mt-1">{t('translationStats.serverSide')}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
