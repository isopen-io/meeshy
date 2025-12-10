'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Share2 } from 'lucide-react';
import { ShareAffiliateModal } from './share-affiliate-modal';
import { useAuth } from '@/hooks/use-auth';
import { useI18n } from '@/hooks/useI18n';

interface ShareAffiliateButtonProps {
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg';
  className?: string;
  showText?: boolean;
  legend?: string;
}

export function ShareAffiliateButton({ 
  variant = 'default', 
  size = 'default', 
  className = '',
  showText = true,
  legend
}: ShareAffiliateButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { user } = useAuth();
  const { t } = useI18n('affiliate');

  if (!user) return null;

  const displayText = legend || t('shareApp');

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={() => setIsModalOpen(true)}
        className={`flex items-center space-x-2 ${className}`}
      >
        <Share2 className="h-4 w-4" />
        {showText && <span>{displayText}</span>}
      </Button>

      <ShareAffiliateModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        userLanguage={user.systemLanguage || 'fr'}
      />
    </>
  );
}
