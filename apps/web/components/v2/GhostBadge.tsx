'use client';

import { theme } from './theme';

export interface GhostBadgeProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showBackground?: boolean;
}

export function GhostBadge({ size = 'sm', className = '', showBackground = true }: GhostBadgeProps) {
  const sizeConfig = {
    sm: { container: 'w-4 h-4', icon: 'w-3 h-3' },
    md: { container: 'w-5 h-5', icon: 'w-3.5 h-3.5' },
    lg: { container: 'w-6 h-6', icon: 'w-4 h-4' },
  };

  const config = sizeConfig[size];

  return (
    <div
      className={`
        ${config.container}
        rounded-full flex items-center justify-center
        ${className}
      `}
      style={{
        background: showBackground ? theme.colors.parchment : 'transparent',
        border: showBackground ? `1.5px solid ${theme.colors.textMuted}` : 'none',
      }}
      title="Utilisateur anonyme"
    >
      <GhostIcon className={config.icon} />
    </div>
  );
}

// Icône fantôme SVG réutilisable
export function GhostIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color: theme.colors.textMuted }}
    >
      {/* Corps du fantôme */}
      <path d="M12 2C7.58 2 4 5.58 4 10v9c0 .55.45 1 1 1h.5c.28 0 .5-.22.5-.5v-1c0-.28.22-.5.5-.5s.5.22.5.5v1c0 .28.22.5.5.5h1c.28 0 .5-.22.5-.5v-1c0-.28.22-.5.5-.5s.5.22.5.5v1c0 .28.22.5.5.5h1c.28 0 .5-.22.5-.5v-1c0-.28.22-.5.5-.5s.5.22.5.5v1c0 .28.22.5.5.5h1c.28 0 .5-.22.5-.5v-1c0-.28.22-.5.5-.5s.5.22.5.5v1c0 .28.22.5.5.5h.5c.55 0 1-.45 1-1v-9c0-4.42-3.58-8-8-8z" />
      {/* Yeux */}
      <circle cx="9" cy="10" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="15" cy="10" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}
