'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Lock } from 'lucide-react';
import { ConfigSection } from '@/types/admin-settings';

interface SettingsStatsProps {
  configSections: ConfigSection[];
}

export function SettingsStats({ configSections }: SettingsStatsProps) {
  const implementedCount = configSections.reduce(
    (acc, section) => acc + section.settings.filter(s => s.implemented).length,
    0
  );

  const toImplementCount = configSections.reduce(
    (acc, section) =>
      acc + section.settings.filter(s => !s.implemented).length,
    0
  );

  const securityCount = configSections.reduce(
    (acc, section) =>
      acc + section.settings.filter(s => s.category === 'security').length,
    0
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Lock className="h-5 w-5 text-slate-600" />
          <span>Statut de la configuration</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-green-600 dark:text-green-400 mb-1">
              {implementedCount}
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Paramètres implémentés
            </p>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-orange-600 dark:text-orange-400 mb-1">
              {toImplementCount}
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              À implémenter
            </p>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-600 dark:text-blue-400 mb-1">
              {securityCount}
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Paramètres sécurité
            </p>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-purple-600 dark:text-purple-400 mb-1">
              {configSections.length}
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Catégories
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
