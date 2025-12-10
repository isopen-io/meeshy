'use client';

import { useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

/**
 * Composant réutilisable pour des sections pliables/dépliables
 * Utilisé dans les sidebars et autres interfaces modulaires
 */
interface FoldableSectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultExpanded?: boolean;
  className?: string;
}

export function FoldableSection({ 
  title, 
  icon, 
  children, 
  defaultExpanded = true,
  className = "" 
}: FoldableSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <Card className={`mb-6 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-gray-200/50 dark:border-gray-700/50 shadow-lg dark:shadow-gray-900/30 ${className}`}>
      <CardContent className="p-0">
        {/* Header cliquable */}
        <div 
          className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50/50 dark:hover:bg-gray-700/50 transition-colors"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center">
            {icon}
            {title}
          </h3>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-gray-400 dark:text-gray-500" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-400 dark:text-gray-500" />
          )}
        </div>
        
        {/* Contenu */}
        {isExpanded && (
          <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700">
            <div className="mt-3">
              {children}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
