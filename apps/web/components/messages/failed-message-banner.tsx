/**
 * Composant pour afficher et gérer les messages en échec d'envoi
 */

'use client';

import { useState, useCallback } from 'react';
import { RefreshCw, X, AlertCircle, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFailedMessagesStore, type FailedMessage } from '@/stores/failed-messages-store';
import { useI18n } from '@/hooks/useI18n';
import { toast } from 'sonner';

interface FailedMessageBannerProps {
  conversationId: string;
  onRetry: (message: FailedMessage) => Promise<boolean>;
  onRestore: (message: FailedMessage) => void;
}

export function FailedMessageBanner({ 
  conversationId, 
  onRetry, 
  onRestore 
}: FailedMessageBannerProps) {
  const { t } = useI18n('conversations');
  const [retryingId, setRetryingId] = useState<string | null>(null);
  
  const {
    getFailedMessagesForConversation,
    removeFailedMessage,
    clearFailedMessages,
    incrementRetryCount,
  } = useFailedMessagesStore();

  const failedMessages = getFailedMessagesForConversation(conversationId);

  const handleRetry = useCallback(async (message: FailedMessage) => {
    setRetryingId(message.id);
    
    try {
      incrementRetryCount(message.id);
      const success = await onRetry(message);
      
      if (success) {
        removeFailedMessage(message.id);
        toast.success(t('bubbleStream.messageSentSuccessfully') || 'Message envoyé avec succès');
      } else {
        toast.error(t('bubbleStream.retryFailed') || 'Échec du renvoi. Cliquez pour restaurer le message.');
      }
    } catch (error) {
      console.error('Erreur lors du renvoi:', error);
      toast.error(t('bubbleStream.retryError') || 'Erreur lors du renvoi');
    } finally {
      setRetryingId(null);
    }
  }, [onRetry, removeFailedMessage, incrementRetryCount, t]);

  const handleRestore = useCallback((message: FailedMessage) => {
    onRestore(message);
    removeFailedMessage(message.id);
    toast.info(t('bubbleStream.messageRestored') || 'Message restauré dans le compositeur');
  }, [onRestore, removeFailedMessage, t]);

  const handleDismiss = useCallback((messageId: string) => {
    removeFailedMessage(messageId);
    toast.info(t('bubbleStream.messageDismissed') || 'Message ignoré');
  }, [removeFailedMessage, t]);

  const handleClearAll = useCallback(() => {
    clearFailedMessages(conversationId);
    toast.info(t('bubbleStream.allMessagesDismissed') || 'Tous les messages en échec ont été ignorés');
  }, [conversationId, clearFailedMessages, t]);

  if (failedMessages.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2 mb-4">
      {failedMessages.map((message) => (
        <div
          key={message.id}
          className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 p-3 rounded-lg"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2 flex-1 min-w-0">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-red-800 dark:text-red-200">
                    {t('bubbleStream.messageSendFailed') || 'Échec d\'envoi du message'}
                  </span>
                  {message.retryCount > 0 && (
                    <span className="text-xs text-red-600 dark:text-red-400">
                      ({message.retryCount} {t('bubbleStream.retries') || 'tentative(s)'})
                    </span>
                  )}
                </div>
                
                <p className="text-sm text-red-700 dark:text-red-300 line-clamp-2 mb-2">
                  {message.content || (message.attachmentIds.length > 0 
                    ? `${message.attachmentIds.length} ${t('bubbleStream.attachments') || 'pièce(s) jointe(s)'}`
                    : t('bubbleStream.emptyMessage') || 'Message vide')}
                </p>
                
                <div className="flex flex-wrap gap-2">
                  {/* Bouton de restauration */}
                  <Button
                    onClick={() => handleRestore(message)}
                    disabled={retryingId === message.id}
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs border-red-300 hover:bg-red-100 dark:border-red-700 dark:hover:bg-red-900/40"
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    {t('restoreMessage') || 'Restaurer'}
                  </Button>
                  
                  {/* Bouton de renvoi automatique */}
                  <Button
                    onClick={() => handleRetry(message)}
                    disabled={retryingId === message.id}
                    size="sm"
                    className="h-7 text-xs bg-red-600 hover:bg-red-700 text-white"
                  >
                    {retryingId === message.id ? (
                      <>
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        {t('retrying') || 'Renvoi...'}
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-3 w-3 mr-1" />
                        {t('retryNow') || 'Renvoyer'}
                      </>
                    )}
                  </Button>
                  
                  {/* Bouton d'ignorance */}
                  <Button
                    onClick={() => handleDismiss(message.id)}
                    disabled={retryingId === message.id}
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                  >
                    <X className="h-3 w-3 mr-1" />
                    {t('dismiss') || 'Ignorer'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}
      
      {failedMessages.length > 1 && (
        <div className="flex justify-end">
          <Button
            onClick={handleClearAll}
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
          >
            <Trash2 className="h-3 w-3 mr-1" />
            {t('dismissAll') || 'Ignorer tout'}
          </Button>
        </div>
      )}
    </div>
  );
}
