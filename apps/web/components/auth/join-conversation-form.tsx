'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { buildApiUrl } from '@/lib/config';
import { useI18n } from '@/hooks/useI18n';

interface JoinConversationFormProps {
  onSuccess: (linkId: string) => void;
}

export function JoinConversationForm({ onSuccess }: JoinConversationFormProps) {
  const [linkId, setLinkId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { t } = useI18n('auth');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!linkId.trim()) {
      toast.error(t('joinConversation.enterLink'));
      return;
    }

    setIsLoading(true);
    try {
      // Extraire l'ID du lien s'il s'agit d'une URL complète
      let extractedLinkId = linkId.includes('/') 
        ? linkId.split('/').pop() || linkId
        : linkId.trim();

      // Ajouter le préfixe "mshy_" si nécessaire
      if (!extractedLinkId.startsWith('mshy_')) {
        extractedLinkId = `mshy_${extractedLinkId}`;
      }

      // Vérifier si le lien existe en utilisant l'endpoint public
      const response = await fetch(buildApiUrl(`/anonymous/link/${extractedLinkId}`));
      
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          toast.success(t('joinConversation.validLink'));
          onSuccess(extractedLinkId);
        } else {
          toast.error(t('joinConversation.invalidLink'));
        }
      } else {
        toast.error(t('joinConversation.expiredLink'));
      }
    } catch (error) {
      console.error('Erreur vérification lien:', error);
      toast.error(t('joinConversation.verificationError'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="linkId">{t('joinConversation.linkLabel')}</Label>
        <Input
          id="linkId"
          type="text"
          placeholder={t('joinConversation.linkPlaceholder')}
          value={linkId}
          onChange={(e) => setLinkId(e.target.value)}
          disabled={isLoading}
          required
        />
      </div>

      <Button 
        type="submit" 
        className="w-full" 
        disabled={isLoading || !linkId.trim()}
      >
        {isLoading ? t('joinConversation.verifying') : t('joinConversation.joinButton')}
      </Button>
    </form>
  );
}
