'use client';

import { TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface TrendingSectionProps {
  hashtags: string[];
  maxVisible?: number;
  className?: string;
}

/**
 * Composant pour afficher les hashtags tendances
 * Affichage vertical pour les sidebars avec scroll après maxVisible
 */
export function TrendingSection({ 
  hashtags, 
  maxVisible = 6,
  className = "" 
}: TrendingSectionProps) {
  if (hashtags.length === 0) {
    return (
      <div className={`text-center text-gray-500 ${className}`}>
        <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Aucune tendance pour le moment</p>
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Affichage des premiers hashtags */}
      {hashtags.slice(0, maxVisible).map((hashtag) => (
        <div
          key={hashtag}
          className="trending-hashtag flex items-center justify-between p-2 rounded hover:bg-gray-50/80 cursor-pointer transition-colors"
        >
          <span className="text-blue-600 hover:underline">{hashtag}</span>
          <Badge variant="outline" className="text-xs bg-white/50">
            {Math.floor(Math.random() * 100) + 10}
          </Badge>
        </div>
      ))}
      
      {/* Section scrollable pour les hashtags restants */}
      {hashtags.length > maxVisible && (
        <div 
          className="max-h-32 overflow-y-auto space-y-2 pr-1 border-t border-gray-100 pt-2 mt-2 scroll-hidden"
        >
          {hashtags.slice(maxVisible).map((hashtag) => (
            <div
              key={hashtag}
              className="trending-hashtag flex items-center justify-between p-2 rounded hover:bg-gray-50/80 cursor-pointer transition-colors"
            >
              <span className="text-blue-600 hover:underline">{hashtag}</span>
              <Badge variant="outline" className="text-xs bg-white/50">
                {Math.floor(Math.random() * 100) + 10}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
