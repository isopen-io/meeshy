'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiService } from '@/services/api.service';
import { useI18n } from '@/hooks/use-i18n';

interface SearchMessage {
  id: string;
  content: string;
  originalContent: string;
  createdAt: string;
  sender: {
    id: string;
    username: string;
    avatar?: string;
  };
}

interface SearchResponse {
  messages: SearchMessage[];
  total: number;
}

interface MessageSearchProps {
  conversationId: string;
  onNavigateToMessage: (id: string) => void;
  onClose: () => void;
  isOpen: boolean;
}

export function MessageSearch({ conversationId, onNavigateToMessage, onClose, isOpen }: MessageSearchProps) {
  const { t } = useI18n('conversations');
  const [inputValue, setInputValue] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setInputValue('');
      setDebouncedQuery('');
      return;
    }
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(inputValue);
    }, 400);
    return () => clearTimeout(timer);
  }, [inputValue]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['message-search', conversationId, debouncedQuery],
    queryFn: async () => {
      const response = await apiService.get<SearchResponse>(
        `/conversations/${conversationId}/messages/search`,
        { q: debouncedQuery, limit: 20 }
      );
      return response.data ?? null;
    },
    enabled: debouncedQuery.length >= 2,
    staleTime: 30000,
  });

  const handleResultClick = useCallback(
    (messageId: string) => {
      onNavigateToMessage(messageId);
      onClose();
    },
    [onNavigateToMessage, onClose]
  );

  const formatDate = (iso: string) => {
    const date = new Date(iso);
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const showResults = debouncedQuery.length >= 2;
  const messages = data?.messages ?? [];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="message-search"
          initial={{ y: '-100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '-100%', opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
          className={cn(
            'absolute inset-x-0 top-0 z-50',
            'bg-white dark:bg-gray-950',
            'border-b border-gray-200 dark:border-gray-700',
            'shadow-lg'
          )}
        >
          {/* Search input row */}
          <div className="flex items-center gap-2 px-4 py-3">
            <Search className="h-4 w-4 flex-shrink-0 text-gray-400 dark:text-gray-500" aria-hidden />
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={t('conversations.messageSearch.placeholder')}
              className={cn(
                'flex-1 bg-transparent text-sm outline-none',
                'text-gray-900 dark:text-gray-100',
                'placeholder:text-gray-400 dark:placeholder:text-gray-600'
              )}
            />
            {isLoading && (
              <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-gray-400" aria-hidden />
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label={t('conversations.messageSearch.close')}
              className={cn(
                'flex-shrink-0 p-1 rounded',
                'text-gray-500 dark:text-gray-400',
                'hover:bg-gray-100 dark:hover:bg-gray-800',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400'
              )}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>

          {/* Results */}
          {showResults && (
            <div className="max-h-80 overflow-y-auto border-t border-gray-100 dark:border-gray-800">
              {isError && (
                <p className="px-4 py-3 text-sm text-red-500 dark:text-red-400">
                  {t('conversations.messageSearch.error')}
                </p>
              )}

              {!isError && !isLoading && messages.length === 0 && (
                <p className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                  {t('conversations.messageSearch.noResults')}
                </p>
              )}

              {messages.map((msg) => (
                <button
                  key={msg.id}
                  type="button"
                  onClick={() => handleResultClick(msg.id)}
                  className={cn(
                    'w-full text-left px-4 py-3',
                    'hover:bg-gray-50 dark:hover:bg-gray-900',
                    'focus:outline-none focus-visible:bg-gray-50 dark:focus-visible:bg-gray-900',
                    'border-b border-gray-100 dark:border-gray-800 last:border-b-0'
                  )}
                >
                  <div className="flex items-baseline justify-between gap-2 mb-0.5">
                    <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">
                      {msg.sender.username}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                      {formatDate(msg.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                    {msg.content || msg.originalContent}
                  </p>
                </button>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
