'use client';

import { Badge } from '@/components/ui/badge';
import { getLanguageInfo } from '@meeshy/shared/types';
import type { LanguageStats } from '@meeshy/shared/types';

/**
 * Composant pour afficher les indicateurs de langues
 * Affichage vertical pour les sidebars avec scroll après les 7 premiers
 */
interface LanguageIndicatorsProps {
  languageStats: LanguageStats[];
  maxVisible?: number;
  className?: string;
}

export function LanguageIndicators({ 
  languageStats, 
  maxVisible = 7,
  className = "" 
}: LanguageIndicatorsProps) {
  const sortedStats = [...languageStats].sort((a, b) => b.count - a.count);
  
  return (
    <div className={`space-y-2 ${className}`}>
      {/* Affichage des premiers langages */}
      {sortedStats.slice(0, maxVisible).map((stat) => {
        const langInfo = getLanguageInfo(stat.language);
        return (
          <div 
            key={stat.language} 
            className="flex items-center justify-between p-2 rounded hover:bg-gray-50/80 dark:hover:bg-gray-700/50 cursor-pointer transition-colors"
          >
            <div className="flex items-center space-x-2">
              <span className="text-lg">{stat.flag}</span>
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {langInfo?.name || stat.language}
              </span>
            </div>
            <Badge variant="outline" className="text-xs bg-white/50 dark:bg-gray-700/50 dark:text-gray-300">
              {stat.count}
            </Badge>
          </div>
        );
      })}
      
      {/* Section scrollable pour les langages restants */}
      {sortedStats.length > maxVisible && (
        <div className="max-h-32 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent space-y-2 pr-1">
          {sortedStats.slice(maxVisible).map((stat) => {
            const langInfo = getLanguageInfo(stat.language);
            return (
              <div 
                key={stat.language} 
                className="flex items-center justify-between p-2 rounded hover:bg-gray-50/80 dark:hover:bg-gray-700/50 cursor-pointer transition-colors"
              >
                <div className="flex items-center space-x-2">
                  <span className="text-lg">{stat.flag}</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {langInfo?.name || stat.language}
                  </span>
                </div>
                <Badge variant="outline" className="text-xs bg-white/50 dark:bg-gray-700/50 dark:text-gray-300">
                  {stat.count}
                </Badge>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
