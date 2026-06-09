'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, Info } from 'lucide-react';
import { useI18n } from '@/hooks/use-i18n';

export function SettingsAlerts() {
  const { t } = useI18n('admin');
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card className="border-orange-200 bg-orange-50 dark:bg-orange-900/10">
        <CardContent className="p-4">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-semibold text-orange-900 dark:text-orange-100 text-sm">
                {t('adminSettings.alerts.sensitive.title')}
              </h4>
              <p className="text-xs text-orange-700 dark:text-orange-300 mt-1">
                {t('adminSettings.alerts.sensitive.description')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-blue-200 bg-blue-50 dark:bg-blue-900/10">
        <CardContent className="p-4">
          <div className="flex items-start space-x-3">
            <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-semibold text-blue-900 dark:text-blue-100 text-sm">
                {t('adminSettings.alerts.env.title')}
              </h4>
              <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                {t('adminSettings.alerts.env.description')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
