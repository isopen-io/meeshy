'use client';

import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface AvatarProps {
  src?: string | null;
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  isOnline?: boolean;
  languageOrb?: React.ReactNode;
  className?: string;
}

const sizeMap = {
  sm: { container: 'w-8 h-8', text: 'text-sm', dot: 'w-2.5 h-2.5 border-[1.5px]', dotPos: '-bottom-0.5 -right-0.5' },
  md: { container: 'w-10 h-10', text: 'text-lg', dot: 'w-3 h-3 border-2', dotPos: '-bottom-0.5 -right-0.5' },
  lg: { container: 'w-12 h-12', text: 'text-xl', dot: 'w-3 h-3 border-2', dotPos: 'top-0 right-0' },
  xl: { container: 'w-32 h-32', text: 'text-5xl', dot: 'w-6 h-6 border-4', dotPos: 'bottom-2 right-2' },
};

const Avatar = forwardRef<HTMLDivElement, AvatarProps>(
  ({ src, name, size = 'md', isOnline, languageOrb, className }, ref) => {
    const s = sizeMap[size];
    const initial = name.charAt(0).toUpperCase();

    return (
      <div ref={ref} className={cn('relative inline-flex flex-shrink-0', className)}>
        {src ? (
          <img
            src={src}
            alt={name}
            className={cn(s.container, 'rounded-full object-cover')}
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
        {isOnline && (
          <div
            className={cn(
              'absolute rounded-full border-[var(--gp-surface)] bg-[var(--gp-jade-green)]',
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
