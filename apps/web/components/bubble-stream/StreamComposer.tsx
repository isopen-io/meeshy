/**
 * StreamComposer - Zone de composition optimisée pour BubbleStream
 *
 * Wrapper autour de MessageComposer avec optimisations pour le stream public.
 * Utilise React.memo pour éviter les re-renders inutiles.
 *
 * @module components/bubble-stream/StreamComposer
 */

'use client';

import { memo, forwardRef } from 'react';
import { MessageComposer } from '@/components/common/message-composer';
import type { LanguageChoice } from '@/lib/bubble-stream-modules';

interface StreamComposerProps {
  // Valeur et handlers
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onKeyPress: (e: React.KeyboardEvent) => void;

  // Langue
  selectedLanguage: string;
  onLanguageChange: (language: string) => void;
  choices: LanguageChoice[];

  // Attachments
  onAttachmentsChange: (ids: string[], mimeTypes: string[]) => void;

  // Données de contexte
  location: string;
  conversationId: string;
  token?: string;
  userRole?: string;

  // i18n
  placeholder: string;
}

/**
 * Composant StreamComposer avec optimisation React.memo
 */
export const StreamComposer = memo(forwardRef<any, StreamComposerProps>(
  function StreamComposer(props, ref) {
    const {
      value,
      onChange,
      onSend,
      onKeyPress,
      selectedLanguage,
      onLanguageChange,
      choices,
      onAttachmentsChange,
      location,
      conversationId,
      token,
      userRole,
      placeholder,
    } = props;

    return (
      <div className="z-30 row-start-3 border-t border-gray-200/70 bg-white/98 backdrop-blur-xl shadow-2xl dark:border-gray-700/70 dark:bg-gray-950/98">
        <div className="w-full px-4 sm:px-6 lg:px-8 py-4">
          <MessageComposer
            ref={ref}
            value={value}
            onChange={onChange}
            onSend={onSend}
            selectedLanguage={selectedLanguage}
            onLanguageChange={onLanguageChange}
            location={location}
            isComposingEnabled={true}
            placeholder={placeholder}
            onKeyPress={onKeyPress}
            choices={choices}
            onAttachmentsChange={onAttachmentsChange}
            token={token}
            userRole={userRole}
            conversationId={conversationId}
          />
        </div>
      </div>
    );
  }
));

StreamComposer.displayName = 'StreamComposer';
