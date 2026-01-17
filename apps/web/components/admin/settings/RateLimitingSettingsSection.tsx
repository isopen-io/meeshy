'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Zap } from 'lucide-react';
import { SettingField } from './SettingField';
import { ConfigSetting } from '@/types/admin-settings';

interface RateLimitingSettingsSectionProps {
  settings: ConfigSetting[];
  onUpdate: (key: string, value: string | number | boolean) => void;
}

export function RateLimitingSettingsSection({
  settings,
  onUpdate,
}: RateLimitingSettingsSectionProps) {
  const implementedCount = settings.filter(s => s.implemented).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center space-x-3">
          <Zap className="h-6 w-6 text-slate-600 dark:text-slate-400" />
          <div className="flex-1">
            <CardTitle>Rate Limiting</CardTitle>
            <CardDescription>Protection contre les abus et surcharge</CardDescription>
          </div>
          <Badge variant="outline">
            {implementedCount}/{settings.length} implémentés
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {settings.map(setting => (
            <SettingField
              key={setting.key}
              setting={setting}
              onUpdate={onUpdate}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
