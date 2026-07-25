'use client';

import { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { getLanguageColor } from './theme';
import { getFlag } from './flags';

export interface LanguageOrbProps extends HTMLAttributes<HTMLDivElement> {
  /** Language code (e.g., 'fr', 'en', 'zh') */
  code: string;
  /** Flag emoji or custom content */
  flag?: string;
  /** Language name for tooltip */
  name?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Show pulse animation */
  pulse?: boolean;
  /** Animation delay in seconds */
  animationDelay?: number;
}

export function LanguageOrb({
  code,
  flag,
  name,
  size = 'md',
  pulse = true,
  animationDelay = 0,
  className,
  onClick,
  ...props
}: LanguageOrbProps) {
  const displayFlag = flag || getFlag(code);
  const color = getLanguageColor(code);
  const isInteractive = Boolean(onClick);

  return (
    <div
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      aria-label={isInteractive ? name || code : undefined}
      onClick={onClick}
      onKeyDown={
        isInteractive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.currentTarget.click();
              }
            }
          : undefined
      }
      className={cn(
        'relative rounded-full flex items-center justify-center cursor-pointer transition-transform duration-300',
        'hover:scale-110',
        {
          'w-10 h-10 text-lg': size === 'sm',
          'w-14 h-14 text-xl': size === 'md',
          'w-20 h-20 text-3xl': size === 'lg',
        },
        pulse && 'animate-pulse-gentle',
        className
      )}
      style={{
        background: `linear-gradient(135deg, ${color}, ${color}dd)`,
        animationDelay: `${animationDelay}s`,
        boxShadow: `0 4px 20px ${color}40`,
      }}
      title={name}
      {...props}
    >
      <span className="drop-shadow-sm">{displayFlag}</span>

      {/* Language label on hover */}
      {name && (
        <span
          className={cn(
            'absolute -bottom-6 left-1/2 -translate-x-1/2',
            'text-xs font-semibold text-[var(--gp-text-muted)] opacity-0 transition-opacity duration-300',
            'group-hover:opacity-100 whitespace-nowrap'
          )}
        >
          {name}
        </span>
      )}

      <style jsx>{`
        @keyframes pulse-gentle {
          0%, 100% {
            transform: scale(1);
            box-shadow: 0 4px 20px ${color}40;
          }
          50% {
            transform: scale(1.05);
            box-shadow: 0 6px 30px ${color}60;
          }
        }
        .animate-pulse-gentle {
          animation: pulse-gentle 3s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-pulse-gentle {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
