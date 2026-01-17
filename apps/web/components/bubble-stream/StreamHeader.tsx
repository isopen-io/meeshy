/**
 * StreamHeader - En-tête optimisé pour BubbleStream
 *
 * Affiche l'indicateur de connexion et les utilisateurs en train de taper.
 * Utilise React.memo pour éviter les re-renders inutiles.
 *
 * @module components/bubble-stream/StreamHeader
 */

'use client';

import { memo } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface StreamHeaderProps {
  // État de connexion
  connectionStatus: {
    isConnected: boolean;
    hasSocket: boolean;
  };

  // Utilisateurs en train de taper
  typingUsers: Array<{
    id: string;
    displayName: string;
  }>;

  // Actions
  onReconnect: () => void;

  // i18n
  t: (key: string, params?: Record<string, string | number>) => string;
}

/**
 * Composant StreamHeader avec optimisation React.memo
 */
export const StreamHeader = memo(function StreamHeader({
  connectionStatus,
  typingUsers,
  onReconnect,
  t,
}: StreamHeaderProps) {

  const isConnected = connectionStatus.isConnected && connectionStatus.hasSocket;

  return (
    <div className="row-start-1 px-4 pt-4 pb-2 sm:px-6 lg:px-8 bg-gradient-to-b from-blue-50 to-transparent dark:from-gray-900/80 dark:to-transparent pointer-events-none hidden md:block">
      <div className="pointer-events-auto">
        {typingUsers.length > 0 && isConnected ? (
          <div className="inline-flex items-center space-x-2 px-4 py-2 rounded-full text-sm backdrop-blur-sm bg-blue-100/90 text-blue-800 dark:bg-blue-900/90 dark:text-blue-200 border border-blue-200/80 dark:border-blue-700/80 transition-all">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>
              {typingUsers.length === 1
                ? t('bubbleStream.typing.single', { name: typingUsers[0].displayName })
                : typingUsers.length === 2
                ? t('bubbleStream.typing.double', { name1: typingUsers[0].displayName, name2: typingUsers[1].displayName })
                : t('bubbleStream.typing.multiple', { name: typingUsers[0].displayName, count: typingUsers.length - 1 })
              }
            </span>
          </div>
        ) : (
          <div className={`inline-flex items-center space-x-2 px-3 py-1 rounded-full text-sm backdrop-blur-sm transition-all ${
            isConnected
              ? 'bg-green-100/80 text-green-800 dark:bg-green-900/80 dark:text-green-200 border border-green-200/60 dark:border-green-700/60'
              : 'bg-orange-100/80 text-orange-800 dark:bg-orange-900/80 dark:text-orange-200 border border-orange-200/60 dark:border-orange-700/60'
          }`}>
            <div className={`w-2 h-2 rounded-full animate-pulse ${
              isConnected ? 'bg-green-600 dark:bg-green-400' : 'bg-orange-600 dark:bg-orange-400'
            }`} />
            <span className="font-medium">
              {t('bubbleStream.realTimeMessages')}
            </span>
            {!isConnected && (
              <>
                <span className="text-xs opacity-75">• {t('bubbleStream.connectionInProgress')}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onReconnect}
                  className="ml-2 text-xs px-2 py-1 h-auto hover:bg-orange-200/50 dark:hover:bg-orange-800/50"
                >
                  {t('bubbleStream.reconnect')}
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

StreamHeader.displayName = 'StreamHeader';
