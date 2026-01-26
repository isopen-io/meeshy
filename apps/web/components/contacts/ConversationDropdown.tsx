'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MessageSquare, ChevronDown, Plus, Clock } from 'lucide-react';
import { conversationsService } from '@/services';
import { Conversation } from '@meeshy/shared/types';
import { useI18n } from '@/hooks/useI18n';

interface ConversationDropdownProps {
  userId: string;
  onCreateNew: () => void;
  className?: string;
  variant?: 'default' | 'outline';
}

/**
 * Formatte une date au format court (ex: "Il y a 2h", "Hier", "12/01/2024")
 */
function formatShortDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "À l'instant";
  if (diffMins < 60) return `Il y a ${diffMins}min`;
  if (diffHours < 24) return `Il y a ${diffHours}h`;
  if (diffDays === 1) return 'Hier';
  if (diffDays < 7) return `Il y a ${diffDays}j`;

  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Tronque un texte à une longueur maximale
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

export function ConversationDropdown({
  userId,
  onCreateNew,
  className = '',
  variant = 'default'
}: ConversationDropdownProps) {
  const router = useRouter();
  const { t } = useI18n('contacts');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    loadConversations();
  }, [userId]);

  const loadConversations = async () => {
    try {
      setLoading(true);
      const convs = await conversationsService.getConversationsWithUser(userId);
      setConversations(convs);
    } catch (error) {
      console.error('Erreur lors du chargement des conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConversationClick = (conversationId: string) => {
    router.push(`/conversations/${conversationId}`);
    setIsOpen(false);
  };

  const handleCreateNew = () => {
    setIsOpen(false);
    onCreateNew();
  };

  // S'il n'y a aucune conversation, afficher un bouton simple
  if (!loading && conversations.length === 0) {
    const buttonClasses = variant === 'outline'
      ? "flex items-center gap-2 h-9 px-4 border-2 hover:bg-accent shadow-md hover:shadow-lg transition-all"
      : "flex items-center gap-2 h-9 px-4 bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 shadow-md hover:shadow-lg transition-all";

    return (
      <Button
        size="sm"
        variant={variant}
        onClick={onCreateNew}
        className={`${buttonClasses} ${className}`}
      >
        <MessageSquare className="h-4 w-4" />
        <span className="text-sm">{t('actions.message')}</span>
      </Button>
    );
  }

  // S'il y a des conversations, afficher le dropdown
  const latestConversation = conversations[0];

  // Définir les classes en fonction de la variante
  const mainButtonClasses = variant === 'outline'
    ? "flex items-center gap-2 h-9 px-3 rounded-r-none border-2 hover:bg-accent shadow-md hover:shadow-lg transition-all"
    : "flex items-center gap-2 h-9 px-3 rounded-r-none bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 shadow-md hover:shadow-lg transition-all";

  const dropdownButtonClasses = variant === 'outline'
    ? "h-9 px-2 rounded-l-none border-l-0 border-2 hover:bg-accent shadow-md hover:shadow-lg transition-all"
    : "h-9 px-2 rounded-l-none border-l border-blue-500 bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 shadow-md hover:shadow-lg transition-all";

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <div className={`flex items-center gap-0 ${className}`}>
        {/* Bouton principal : dernière conversation */}
        <Button
          size="sm"
          variant={variant}
          onClick={() => latestConversation && handleConversationClick(latestConversation.id)}
          className={mainButtonClasses}
          disabled={loading || !latestConversation}
        >
          <MessageSquare className="h-4 w-4" />
          <div className="flex flex-col items-start text-xs">
            <span className="font-medium">{t('actions.continueConversation')}</span>
            {latestConversation?.lastMessage && (
              <span className="text-xs opacity-80 max-w-[150px] truncate">
                {truncateText(latestConversation.lastMessage.content, 30)}
              </span>
            )}
          </div>
        </Button>

        {/* Bouton dropdown */}
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant={variant}
            className={dropdownButtonClasses}
            disabled={loading}
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
      </div>

      <DropdownMenuContent align="end" className="w-80 max-h-96 overflow-y-auto dark:bg-gray-900 dark:border-gray-700">
        {/* Option pour créer une nouvelle conversation */}
        <DropdownMenuItem
          onClick={handleCreateNew}
          className="py-3 cursor-pointer dark:hover:bg-gray-800 border-b dark:border-gray-700"
        >
          <div className="flex items-center gap-3 w-full">
            <div className="flex-shrink-0 p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <Plus className="h-4 w-4 text-green-600 dark:text-green-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-foreground dark:text-gray-100">
                {t('actions.newConversation')}
              </p>
              <p className="text-xs text-muted-foreground dark:text-gray-400">
                {t('actions.newConversationDescription')}
              </p>
            </div>
          </div>
        </DropdownMenuItem>

        <DropdownMenuSeparator className="dark:bg-gray-700" />

        {/* Liste des conversations existantes */}
        {conversations.length > 0 && (
          <div className="py-2">
            <p className="px-3 py-2 text-xs font-semibold text-muted-foreground dark:text-gray-400 uppercase tracking-wide">
              {t('conversations.existing')} ({conversations.length})
            </p>
            {conversations.map((conv, index) => (
              <DropdownMenuItem
                key={conv.id}
                onClick={() => handleConversationClick(conv.id)}
                className={`py-3 cursor-pointer dark:hover:bg-gray-800 ${
                  index === 0 ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                }`}
              >
                <div className="flex items-start gap-3 w-full">
                  <div className="flex-shrink-0 p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                    <MessageSquare className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="font-medium text-sm text-foreground dark:text-gray-100 truncate">
                        {conv.title || t('conversations.untitled')}
                      </p>
                      {index === 0 && (
                        <span className="text-xs px-2 py-0.5 bg-blue-600 text-white rounded-full flex-shrink-0">
                          {t('conversations.latest')}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground dark:text-gray-400">
                      <Clock className="h-3 w-3 flex-shrink-0" />
                      <span className="flex-shrink-0">
                        {formatShortDate(new Date(conv.createdAt))}
                      </span>
                    </div>
                    {conv.lastMessage && (
                      <p className="text-xs text-muted-foreground dark:text-gray-400 mt-1 truncate">
                        {truncateText(conv.lastMessage.content, 50)}
                      </p>
                    )}
                    {conv.lastActivityAt && (
                      <p className="text-xs text-muted-foreground dark:text-gray-500 mt-1">
                        Dernière activité: {formatShortDate(new Date(conv.lastActivityAt))}
                      </p>
                    )}
                  </div>
                </div>
              </DropdownMenuItem>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Export par défaut pour le lazy loading
export default ConversationDropdown;
