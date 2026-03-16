'use client';

import { memo, useState } from 'react';
import Link from 'next/link';
import { Ghost } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getUserDisplayName } from '@/utils/user-display-name';
import { formatRelativeDate } from '@/utils/date-format';
import { getMessageInitials } from '@/lib/avatar-utils';
import { cn } from '@/lib/utils';
import { ImageLightbox } from '@/components/attachments/ImageLightbox';
import type { Attachment } from '@meeshy/shared/types/attachment';
import type { MessageSender } from './types';

interface MessageHeaderProps {
  message: {
    id: string;
    createdAt: Date | string;
    sender?: MessageSender;
  };
  isOwnMessage: boolean;
  t: (key: string) => string;
}

export const MessageHeader = memo(function MessageHeader({
  message,
  isOwnMessage,
  t,
}: MessageHeaderProps) {
  const [showAvatarLightbox, setShowAvatarLightbox] = useState(false);

  const user = message.sender;
  const username = message.sender?.username;
  const displayName = getUserDisplayName(user, t('anonymous'));
  const isAnonymous = false;
  const avatarUrl = (message.sender as MessageSender)?.avatar;

  return (
    <>
      {/* Avatar cliquable */}
      <div className="flex-shrink-0 mt-1">
        <Avatar
          className={cn(
            "h-8 w-8 sm:h-9 sm:w-9",
            avatarUrl && "cursor-pointer hover:ring-2 hover:ring-indigo-500 transition-shadow"
          )}
          onClick={(e) => {
            e.stopPropagation();
            if (avatarUrl) {
              setShowAvatarLightbox(true);
            }
          }}
        >
          <AvatarImage src={avatarUrl} alt={message.sender?.firstName} />
          <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-indigo-700 text-white text-xs sm:text-sm font-semibold">
            {getMessageInitials(message)}
          </AvatarFallback>
        </Avatar>
      </div>

      {/* Lightbox pour l'avatar */}
      {showAvatarLightbox && avatarUrl && (
        <ImageLightbox
          images={[{
            id: `avatar-${message.sender?.id}`,
            messageId: message.id,
            fileName: 'avatar.jpg',
            fileUrl: avatarUrl,
            originalName: `Avatar de ${message.sender?.firstName || message.sender?.username || 'Utilisateur'}`,
            mimeType: 'image/jpeg',
            fileSize: 0
          } as Attachment]}
          initialIndex={0}
          isOpen={showAvatarLightbox}
          onClose={() => setShowAvatarLightbox(false)}
        />
      )}
    </>
  );
});
