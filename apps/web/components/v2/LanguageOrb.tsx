'use client';

import { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { getLanguageColor } from './theme';

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

const FLAG_MAP: Record<string, string> = {
  fr: '\u{1F1EB}\u{1F1F7}',
  en: '\u{1F1EC}\u{1F1E7}',
  es: '\u{1F1EA}\u{1F1F8}',
  zh: '\u{1F1E8}\u{1F1F3}',
  ja: '\u{1F1EF}\u{1F1F5}',
  ar: '\u{1F1F8}\u{1F1E6}',
  de: '\u{1F1E9}\u{1F1EA}',
  pt: '\u{1F1E7}\u{1F1F7}',
  ru: '\u{1F1F7}\u{1F1FA}',
  ko: '\u{1F1F0}\u{1F1F7}',
  it: '\u{1F1EE}\u{1F1F9}',
  nl: '\u{1F1F3}\u{1F1F1}',
  tr: '\u{1F1F9}\u{1F1F7}',
  hi: '\u{1F1EE}\u{1F1F3}',
  vi: '\u{1F1FB}\u{1F1F3}',
  th: '\u{1F1F9}\u{1F1ED}',
  pl: '\u{1F1F5}\u{1F1F1}',
  uk: '\u{1F1FA}\u{1F1E6}',
  sv: '\u{1F1F8}\u{1F1EA}',
  no: '\u{1F1F3}\u{1F1F4}',
};

export function LanguageOrb({
  code,
  flag,
  name,
  size = 'md',
  pulse = true,
  animationDelay = 0,
  className,
  ...props
}: LanguageOrbProps) {
  const normalizedCode = code.toLowerCase().slice(0, 2);
  const displayFlag = flag || FLAG_MAP[normalizedCode] || '\u{1F310}';
  const color = getLanguageColor(code);

  return (
    <div
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
