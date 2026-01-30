'use client';

import { theme } from './theme';

export interface GhostBadgeProps {
  size?: 'sm' | 'md';
  className?: string;
}

export function GhostBadge({ size = 'sm', className = '' }: GhostBadgeProps) {
  const sizeClasses = {
    sm: 'w-4 h-4 text-[10px]',
    md: 'w-5 h-5 text-xs',
  };

  return (
    <div
      className={`
        ${sizeClasses[size]}
        rounded-full flex items-center justify-center
        ${className}
      `}
      style={{
        background: theme.colors.parchment,
        border: `1.5px solid ${theme.colors.textMuted}`,
      }}
      title="Utilisateur anonyme"
    >
      <span role="img" aria-label="anonyme">👻</span>
    </div>
  );
}
