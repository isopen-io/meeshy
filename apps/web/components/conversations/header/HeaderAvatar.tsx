'use client';

import { memo } from 'react';
import { Ghost, Image, Lock, LockOpen, Key } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { OnlineIndicator } from '@/components/ui/online-indicator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { ParticipantInfo, EncryptionInfo } from './types';

interface HeaderAvatarProps {
  isDirect: boolean;
  isAnonymous: boolean;
  canModifyImage: boolean;
  avatarUrl?: string;
  avatar: string;
  name: string;
  status: string;
  encryptionInfo: EncryptionInfo | null;
  onImageUploadClick?: () => void;
  t: (key: string) => string;
}

export const HeaderAvatar = memo(function HeaderAvatar({
  isDirect,
  isAnonymous,
  canModifyImage,
  avatarUrl,
  avatar,
  name,
  status,
  encryptionInfo,
  onImageUploadClick,
  t
}: HeaderAvatarProps) {
  if (isDirect) {
    if (isAnonymous) {
      return (
        <div className="relative flex-shrink-0">
          <div
            className="h-10 w-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center"
            role="img"
            aria-label={t('conversationHeader.anonymousUser') || 'Utilisateur anonyme'}
          >
            <Ghost className="h-5 w-5 text-purple-600 dark:text-purple-400" aria-hidden="true" />
          </div>
          {encryptionInfo && <EncryptionBadge encryptionInfo={encryptionInfo} />}
        </div>
      );
    }

    return (
      <div className="relative flex-shrink-0">
        <Avatar className="h-10 w-10" aria-label={`${name} avatar`}>
          <AvatarImage src={avatarUrl} alt={`${name} avatar`} />
          <AvatarFallback className="bg-primary/10 text-primary font-semibold">
            {avatar}
          </AvatarFallback>
        </Avatar>
        <OnlineIndicator
          isOnline={status === 'online'}
          status={status as any}
          size="md"
          className="absolute -bottom-0.5 -right-0.5 ring-2 ring-card"
        />
        {encryptionInfo && <EncryptionBadge encryptionInfo={encryptionInfo} />}
      </div>
    );
  }

  if (canModifyImage && onImageUploadClick) {
    return (
      <div className="relative flex-shrink-0">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="cursor-pointer group relative rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                onClick={onImageUploadClick}
                aria-label={t('conversationHeader.changeImage') || 'Changer l\'image de la conversation'}
              >
                <Avatar className="h-9 w-9 sm:h-10 sm:w-10 ring-2 ring-transparent group-hover:ring-primary/50 transition-[box-shadow]">
                  <AvatarImage src={avatarUrl} alt={name} />
                  <AvatarFallback className="bg-primary/10 text-primary font-semibold text-xs sm:text-sm">
                    {avatar}
                  </AvatarFallback>
                </Avatar>
                <div className="absolute inset-0 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Image className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-white" aria-hidden="true" />
                </div>
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t('conversationHeader.changeImage') || 'Changer l\'image'}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {encryptionInfo && <EncryptionBadge encryptionInfo={encryptionInfo} />}
      </div>
    );
  }

  return (
    <div className="relative flex-shrink-0">
      <Avatar className="h-9 w-9 sm:h-10 sm:w-10">
        <AvatarImage src={avatarUrl} alt={name} />
        <AvatarFallback className="bg-primary/10 text-primary font-semibold text-xs sm:text-sm">
          {avatar}
        </AvatarFallback>
      </Avatar>
      {encryptionInfo && <EncryptionBadge encryptionInfo={encryptionInfo} />}
    </div>
  );
});

const EncryptionBadge = memo(function EncryptionBadge({
  encryptionInfo
}: {
  encryptionInfo: EncryptionInfo;
}) {
  const IconComponent = encryptionInfo.icon;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "absolute -bottom-0.5 -left-0.5 w-5 h-5 rounded-full flex items-center justify-center ring-2 ring-card",
              encryptionInfo.bgColor
            )}
            aria-label={encryptionInfo.label}
          >
            <IconComponent className={cn("h-3 w-3", encryptionInfo.color)} aria-hidden="true" />
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="text-xs font-medium">{encryptionInfo.label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});
