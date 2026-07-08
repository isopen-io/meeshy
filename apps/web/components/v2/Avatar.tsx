'use client';

import { forwardRef, useEffect, useState } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { buildAttachmentUrl } from '@/utils/attachment-url';

export type AvatarPresence = 'online' | 'away' | 'offline';

export interface AvatarProps {
  src?: string | null;
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  isOnline?: boolean;
  presence?: AvatarPresence;
  languageOrb?: React.ReactNode;
  className?: string;
}

const presenceDotColors: Record<Exclude<AvatarPresence, 'offline'>, string> = {
  online: 'bg-[var(--gp-jade-green)]',
  away: 'bg-[var(--gp-warning)]',
};

const sizeMap = {
  sm: { container: 'w-8 h-8', text: 'text-sm', dot: 'w-2.5 h-2.5 border-[1.5px]', dotPos: '-bottom-0.5 -right-0.5' },
  md: { container: 'w-10 h-10', text: 'text-lg', dot: 'w-3 h-3 border-2', dotPos: '-bottom-0.5 -right-0.5' },
  lg: { container: 'w-12 h-12', text: 'text-xl', dot: 'w-3 h-3 border-2', dotPos: 'top-0 right-0' },
  xl: { container: 'w-32 h-32', text: 'text-5xl', dot: 'w-6 h-6 border-4', dotPos: 'bottom-2 right-2' },
};

const pixelSizeMap: Record<keyof typeof sizeMap, number> = {
  sm: 32,
  md: 40,
  lg: 48,
  xl: 128,
};

const Avatar = forwardRef<HTMLDivElement, AvatarProps>(
  ({ src, name, size = 'md', isOnline, presence, languageOrb, className }, ref) => {
    const s = sizeMap[size];
    const px = pixelSizeMap[size];
    const initial = name.charAt(0).toUpperCase();
    const effectivePresence: AvatarPresence = presence ?? (isOnline ? 'online' : 'offline');

    // Attachment avatars arrive as relative paths (`/api/v1/attachments/file/…`).
    // Resolve them to the gateway origin so next/image fetches from the API host
    // instead of the frontend origin (which does not serve `/api`). `data:` URLs
    // and already-absolute URLs pass through unchanged.
    const resolvedSrc = src && !src.startsWith('data:') ? buildAttachmentUrl(src) : src;

    // A missing/deleted avatar file must degrade to the initials placeholder, not
    // a broken image (next/image surfaces a 404 upstream as a console 400). Reset
    // the error flag whenever the resolved source changes (list recycling).
    const [errored, setErrored] = useState(false);
    useEffect(() => setErrored(false), [resolvedSrc]);

    return (
      <div ref={ref} className={cn('relative inline-flex flex-shrink-0', className)}>
        {resolvedSrc && !errored ? (
          <Image
            src={resolvedSrc}
            alt={name}
            width={px}
            height={px}
            className={cn(s.container, 'rounded-full object-cover')}
            unoptimized={resolvedSrc.startsWith('data:')}
            onError={() => setErrored(true)}
          />
        ) : (
          <div
            className={cn(
              s.container,
              'rounded-full flex items-center justify-center font-semibold',
              'bg-[var(--gp-parchment)] text-[var(--gp-terracotta)]',
              s.text
            )}
          >
            {initial}
          </div>
        )}
        {effectivePresence !== 'offline' && (
          <div
            className={cn(
              'absolute rounded-full border-[var(--gp-surface)]',
              presenceDotColors[effectivePresence],
              s.dot,
              s.dotPos
            )}
          />
        )}
        {languageOrb && (
          <div className="absolute -bottom-1 -right-1">
            {languageOrb}
          </div>
        )}
      </div>
    );
  }
);

Avatar.displayName = 'Avatar';

export { Avatar };
