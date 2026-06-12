'use client';

import { HelpCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useI18n } from '@/hooks/useI18n';

export function InfoIcon({ content }: { content: string }) {
  const { t } = useI18n('common');
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <HelpCircle role="img" aria-label={t('navigation.help')} className="h-3.5 w-3.5 text-gray-400 cursor-help hover:text-indigo-500 transition-colors inline ml-1.5" />
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
