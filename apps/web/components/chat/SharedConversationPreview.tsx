'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Lock, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MessagesDisplay } from '@/components/common/messages-display';
import { LensSwitcher } from '@/components/conversations/reading/LensSwitcher';
import { useConversationAccent } from '@/hooks/conversations/use-conversation-accent';
import { useReadingMode, useReadingModeStore } from '@/stores/reading-mode-store';
import { useI18n } from '@/hooks/useI18n';
import { cn } from '@/lib/utils';
import type { LinkConversationData } from '@/services/link-conversation.service';
import type { Message, User } from '@meeshy/shared/types';

/**
 * L'aperçu que voit un visiteur qui n'a pas encore rejoint.
 *
 * C'est la MÊME surface de lecture que la conversation vivante — mêmes rangées,
 * même Lentille, même Prisme — simplement sans composer et sans socket. Le
 * visiteur voit donc exactement ce qu'il obtiendra, ce qui est tout l'intérêt
 * d'ouvrir le lien dans la vue courante plutôt que sur un écran d'accueil.
 *
 * Responsive par construction : une seule colonne qui remplit son parent, avec
 * une largeur de lecture bornée au-delà de la tablette.
 */
interface SharedConversationPreviewProps {
  data: LinkConversationData;
  onRequestJoin: () => void;
}

const GUEST_USER = {
  id: '',
  username: 'guest',
  firstName: '',
  lastName: '',
  displayName: '',
  role: 'USER',
  systemLanguage: 'fr',
  regionalLanguage: 'fr',
  autoTranslateEnabled: true,
} as unknown as User;

export function SharedConversationPreview({
  data,
  onRequestJoin,
}: SharedConversationPreviewProps) {
  const { t } = useI18n('chat');
  const scrollRef = useRef<HTMLDivElement>(null);

  const accentStyle = useConversationAccent({
    id: data.conversation.id,
    title: data.conversation.title,
    type: data.conversation.type,
  } as never);

  const readingMode = useReadingMode(data.conversation.id);
  const setReadingMode = useReadingModeStore((state) => state.setMode);
  const toggleDensity = useReadingModeStore((state) => state.toggleDensity);

  const messages = useMemo(
    () => (data.messages ?? []) as unknown as Message[],
    [data.messages]
  );

  const participantCount =
    (data.stats?.totalMembers ?? 0) + (data.stats?.totalAnonymousParticipants ?? 0);

  // L'aperçu s'ouvre sur le DERNIER message (le gateway sert l'historique en
  // ordre croissant : le récent est en bas). Deux passes — une immédiate, une
  // après la mesure du virtualiseur — pour atterrir au vrai bas.
  const messageCount = messages.length;
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || messageCount === 0) return;

    const scrollToEnd = () => {
      container.scrollTop = container.scrollHeight;
    };
    const frame = requestAnimationFrame(scrollToEnd);
    const settle = setTimeout(scrollToEnd, 150);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(settle);
    };
  }, [messageCount]);

  return (
    <div
      style={accentStyle as React.CSSProperties | undefined}
      className="flex h-full min-h-0 w-full flex-col bg-white dark:bg-gray-950"
    >
      <header className="flex-shrink-0 border-b-2 border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100 dark:border-gray-700 dark:from-gray-900 dark:to-gray-800">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3">
          <span
            className="flex h-10 w-10 flex-none items-center justify-center rounded-full text-sm font-bold text-white"
            style={{ background: 'var(--conv-accent)' }}
            aria-hidden="true"
          >
            {(data.conversation.title || '?').slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold text-gray-900 dark:text-gray-100">
              {data.conversation.title || data.link.name}
            </h1>
            <p className="flex items-center gap-1.5 truncate text-xs text-gray-500 dark:text-gray-400">
              <Users className="h-3 w-3" />
              {participantCount}
              <span aria-hidden="true">·</span>
              {t('preview.readOnly', 'Aperçu — rejoignez pour participer')}
            </p>
          </div>
          <LensSwitcher
            mode={readingMode}
            onModeChange={(mode) => setReadingMode(data.conversation.id, mode)}
            onToggleDensity={() => toggleDensity(data.conversation.id)}
          />
        </div>
      </header>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-gray-50/50 to-white dark:from-gray-900/50 dark:to-gray-950"
        role="region"
        aria-label={t('preview.messages', 'Aperçu des messages')}
      >
        <div className="mx-auto w-full max-w-3xl">
          {data.link.allowViewHistory ? (
            <MessagesDisplay
              messages={messages}
              translatedMessages={messages as never}
              isLoadingMessages={false}
              currentUser={GUEST_USER}
              userLanguage={GUEST_USER.systemLanguage}
              usedLanguages={[]}
              conversationId={data.conversation.id}
              conversationType="group"
              containerRef={scrollRef}
              readingMode={readingMode}
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-20 text-center">
              <Lock className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {t('preview.historyHidden', 'L’historique de cette conversation est privé.')}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Le composer est remplacé par l'appel à rejoindre : la porte d'entrée
          reste visible même si la modale a été fermée. */}
      <div
        className={cn(
          'flex-shrink-0 border-t-2 border-gray-200 bg-white/98 p-4 backdrop-blur-xl',
          'dark:border-gray-700 dark:bg-gray-950/98'
        )}
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <div className="mx-auto w-full max-w-3xl">
          <Button size="lg" className="w-full" onClick={onRequestJoin}>
            {t('preview.joinToReply', 'Rejoindre pour répondre')}
          </Button>
        </div>
      </div>
    </div>
  );
}
