'use client';

import { MessageSquare, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CreateLinkButton } from './create-link-button';

interface ConversationEmptyStateProps {
  conversationsCount: number;
  onCreateConversation: () => void;
  onLinkCreated: () => void;
  t: (key: string) => string;
}

export function ConversationEmptyState({
  conversationsCount,
  onCreateConversation,
  onLinkCreated,
  t
}: ConversationEmptyStateProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white/50 dark:bg-gray-950/50 backdrop-blur-sm rounded-r-2xl">
      <div className="max-w-md">
        <div className="w-24 h-24 mx-auto mb-6 bg-primary/10 dark:bg-primary/20 rounded-full flex items-center justify-center">
          <MessageSquare className="h-12 w-12 text-primary dark:text-primary" />
        </div>

        {conversationsCount > 0 ? (
          <>
            <h3 className="text-xl font-bold text-foreground mb-2 text-center">{t('chooseConversation')}</h3>
            <p className="text-muted-foreground text-base mb-6 text-center">
              {t('chooseConversationDescription')}
            </p>
          </>
        ) : (
          <>
            <h3 className="text-xl font-bold text-foreground mb-2 text-center">{t('welcome')}</h3>
            <p className="text-muted-foreground text-base mb-6 text-center">
              {t('welcomeDescription')}
            </p>
          </>
        )}
      </div>

      {/* Boutons d'action dans l'état vide */}
      <div className="flex gap-4 justify-center">
        <Button
          onClick={onCreateConversation}
          className="rounded-2xl px-6 py-3 bg-primary hover:bg-primary/90 text-white font-semibold shadow-md hover:shadow-lg dark:shadow-primary/20 transition-all"
        >
          <MessageSquare className="h-5 w-5 mr-2" />
          {t('createConversation')}
        </Button>
        <CreateLinkButton
          variant="outline"
          className="rounded-2xl px-6 py-3 border-2 border-primary/20 dark:border-primary/30 hover:border-primary/40 dark:hover:border-primary/50 font-semibold shadow-md hover:shadow-lg dark:shadow-primary/10 transition-all text-primary hover:text-primary-foreground hover:bg-primary dark:hover:bg-primary/90"
          onLinkCreated={onLinkCreated}
        >
          <Link2 className="h-5 w-5 mr-2" />
          {t('createLink')}
        </CreateLinkButton>
      </div>
    </div>
  );
}