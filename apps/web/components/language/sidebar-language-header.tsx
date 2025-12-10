'use client';

import { Globe2 } from 'lucide-react';
import type { LanguageStats } from '@meeshy/shared/types';
import { useI18n } from '@/hooks/useI18n';

/**
 * Composant pour l'en-tête des langues dans la sidebar
 * Affiche un résumé de la communication globale avec les top langues
 */
interface SidebarLanguageHeaderProps {
  languageStats: LanguageStats[];
  userLanguage: string;
  className?: string;
}

export function SidebarLanguageHeader({ 
  languageStats, 
  userLanguage,
  className = "" 
}: SidebarLanguageHeaderProps) {
  const { t } = useI18n('common');
  
  const topLanguages = [...languageStats]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const totalMessages = languageStats.reduce((sum, stat) => sum + stat.count, 0);
  const totalLanguages = languageStats.length;

  return (
    <div className={`mb-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg border border-blue-200/50 dark:border-blue-800/30 ${className}`}>
      <h2 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center">
        <Globe2 className="h-4 w-4 mr-2" />
        {t('sidebar.globalCommunication')}
      </h2>
      <div className="flex flex-wrap gap-2 mb-3">
        {topLanguages.map((stat) => (
          <div 
            key={stat.language}
            className={`flex items-center space-x-1 px-2 py-1 rounded-full text-xs transition-colors ${
              stat.language === userLanguage 
                ? 'bg-blue-500 text-white' 
                : 'bg-white/80 dark:bg-gray-700/80 text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700'
            }`}
          >
            <span>{stat.flag}</span>
            <span className="font-medium">{stat.count}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-600 dark:text-gray-400">
        <span className="font-medium">{totalMessages}</span> {t('sidebar.messagesIn')} <span className="font-medium">{totalLanguages}</span> {t('sidebar.activeLanguages')}
      </p>
    </div>
  );
}
