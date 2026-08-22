'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Pin, X } from 'lucide-react';
import { resolveLastMessagePreview } from '@meeshy/shared/utils/conversation-helpers';
import { cn } from '@/lib/utils';
import { apiService } from '@/services/api.service';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { useI18n } from '@/hooks/useI18n';
import { useUser } from '@/stores/auth-store';
import { getUserLanguagePreferences } from '@/utils/user-language-preferences';

type PinnedMessageTranslation = {
  targetLanguage: string;
  translatedContent: string;
  isEncrypted?: boolean;
};

interface PinnedMessage {
  id: string;
  content: string;
  originalLanguage?: string | null;
  pinnedAt: string;
  pinnedBy: string;
  translations?: PinnedMessageTranslation[] | null;
  sender: {
    id: string;
    username?: string | null;
    displayName?: string | null;
  } | null;
}

interface PinnedMessageBannerProps {
  conversationId: string;
  onNavigateToMessage: (id: string) => void;
}

/**
 * Aplati le tableau de traductions au format API en carte `langue → texte`,
 * la seule forme que consomme `resolveLastMessagePreview` (source de vérité
 * partagée du Prisme, jumelle de `MeeshyConversation.resolvedLastMessagePreview`
 * côté iOS).
 *
 * Une traduction CHIFFRÉE est écartée : son `translatedContent` est un
 * cryptogramme, la clé de déchiffrement ne transite pas par ce chemin, et
 * l'afficher mettrait du base64 dans la bannière. Même exclusion que le helper
 * d'aperçu REST (`buildLastMessagePreviewTranslations`) et que le résolveur
 * socket iOS — un client ne rend jamais un cryptogramme, quelle que soit la
 * générosité du serveur. Sans traduction lisible, `resolveLastMessagePreview`
 * rend l'original, ce que la règle #1 du Prisme prescrit.
 */
function translationsByLanguage(
  translations: PinnedMessage['translations']
): Record<string, string> | null {
  if (!Array.isArray(translations) || translations.length === 0) return null;

  return translations.reduce<Record<string, string>>((acc, translation) => {
    if (
      typeof translation?.targetLanguage === 'string'
      && typeof translation.translatedContent === 'string'
      && translation.isEncrypted !== true
    ) {
      acc[translation.targetLanguage] = translation.translatedContent;
    }
    return acc;
  }, {});
}

export function PinnedMessageBanner({ conversationId, onNavigateToMessage }: PinnedMessageBannerProps) {
  const { t } = useI18n('conversations');
  // Le rejet retient l'IDENTITÉ de l'épingle masquée, jamais un booléen : un
  // booléen ne se réarme sur rien, et `ConversationView` monte cette bannière
  // SANS `key` — changer de conversation réutilise l'instance ET son état, donc
  // un rejet masquait l'épingle de toutes les autres conversations jusqu'au
  // prochain rechargement de page. Les `messageId` sont des ObjectId, donc
  // globalement uniques : ce seul champ réarme aussi bien sur une NOUVELLE
  // épingle que sur un changement de conversation.
  const [dismissedMessageId, setDismissedMessageId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const currentUser = useUser();

  const { data } = useQuery({
    queryKey: ['pinned-messages', conversationId],
    queryFn: async () => {
      // `sendSuccess` répond `{ success, data: [...] }` : la liste EST `data`.
      // Le composant lisait `data.messages[0]`, une clé qui n'existe sur aucune
      // route de ce dépôt — la bannière ne s'affichait donc jamais, même sur un
      // 200 parfaitement valide.
      const response = await apiService.get<PinnedMessage[]>(
        `/conversations/${conversationId}/pinned-messages`,
        { limit: 1 }
      );
      return response.data ?? null;
    },
    staleTime: 30000,
  });

  useEffect(() => {
    // La passerelle diffuse l'épingle dans la room de SA conversation
    // (`ROOMS.conversation`) et le web est joint à toutes les rooms de ses
    // conversations : sans ce filtre, un épinglage n'importe où refetchait la
    // liste de la conversation OUVERTE, dont le résultat est par construction
    // inchangé.
    //
    // Lecture par la NÉGATIVE, comme le tri-état `membershipRestored` : on ne
    // saute que sur une conversation NOMMÉE et DIFFÉRENTE. Une charge utile
    // sans `conversationId` ne prouve pas que l'épingle est ailleurs — elle
    // rafraîchit, comme avant.
    const invalidateIfMine = (payload: unknown) => {
      const named = (payload as { conversationId?: string } | null)?.conversationId;
      if (typeof named === 'string' && named !== conversationId) return;
      queryClient.invalidateQueries({ queryKey: ['pinned-messages', conversationId] });
    };

    const socket = meeshySocketIOService.getSocket();
    if (!socket) return;

    socket.on('message:pinned' as never, invalidateIfMine);
    socket.on('message:unpinned' as never, invalidateIfMine);

    return () => {
      socket.off('message:pinned' as never, invalidateIfMine);
      socket.off('message:unpinned' as never, invalidateIfMine);
    };
  }, [conversationId, queryClient]);

  // Prisme Linguistique — `getUserLanguagePreferences` est le seul point
  // d'entrée autorisé côté web (il délègue à `resolveUserLanguagesOrdered` ET
  // injecte la `deviceLocale` en 4e priorité, cf. apps/web/CLAUDE.md).
  const preferredLanguages = useMemo(
    () => (currentUser ? getUserLanguagePreferences(currentUser) : []),
    [currentUser]
  );

  const pinnedMessage = Array.isArray(data) ? data[0] : undefined;

  const displayContent = useMemo(
    () =>
      resolveLastMessagePreview({
        preview: pinnedMessage?.content,
        translations: translationsByLanguage(pinnedMessage?.translations),
        originalLanguage: pinnedMessage?.originalLanguage,
        preferredLanguages,
      }),
    [pinnedMessage?.content, pinnedMessage?.translations, pinnedMessage?.originalLanguage, preferredLanguages]
  );

  if (!pinnedMessage || dismissedMessageId === pinnedMessage.id) return null;

  const senderLabel = pinnedMessage.sender?.username ?? pinnedMessage.sender?.displayName ?? '';

  return (
    <AnimatePresence>
      <motion.div
        key="pinned-banner"
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
        className="overflow-hidden"
      >
        <div
          className={cn(
            'flex items-center gap-2 px-4 py-2',
            'bg-amber-50 dark:bg-amber-900/20',
            'border-b border-amber-200 dark:border-amber-800',
            'rounded-none w-full'
          )}
        >
          <Pin
            className="h-3.5 w-3.5 flex-shrink-0 text-amber-600 dark:text-amber-400"
            aria-hidden
          />

          <button
            type="button"
            onClick={() => onNavigateToMessage(pinnedMessage.id)}
            className={cn(
              'flex-1 text-left text-sm truncate min-w-0',
              'text-amber-700 dark:text-amber-300',
              'hover:underline focus:outline-none focus-visible:underline'
            )}
          >
            {senderLabel && <span className="font-medium">{senderLabel}: </span>}
            <span>{displayContent}</span>
          </button>

          <button
            type="button"
            onClick={() => setDismissedMessageId(pinnedMessage.id)}
            aria-label={t('pinnedBanner.close')}
            className={cn(
              'flex-shrink-0 p-0.5 rounded',
              'text-amber-600 dark:text-amber-400',
              'hover:bg-amber-100 dark:hover:bg-amber-800/40',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500'
            )}
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
