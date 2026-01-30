'use client';

import { useState } from 'react';
import { theme } from './theme';

export interface CategoryHeaderProps {
  id: string;
  name: string;
  icon?: string;
  count: number;
  color?: string;
  isExpanded?: boolean;
  isDragOver?: boolean;
  onToggle?: () => void;
  onDrop?: (conversationId: string) => void;
  className?: string;
}

export function CategoryHeader({
  id,
  name,
  icon,
  count,
  color,
  isExpanded = true,
  isDragOver = false,
  onToggle,
  onDrop,
  className = '',
}: CategoryHeaderProps) {
  const [internalDragOver, setInternalDragOver] = useState(false);

  const isHighlighted = isDragOver || internalDragOver;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setInternalDragOver(true);
  };

  const handleDragLeave = () => {
    setInternalDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setInternalDragOver(false);
    const conversationId = e.dataTransfer.getData('conversationId');
    if (conversationId && onDrop) {
      onDrop(conversationId);
    }
  };

  return (
    <div
      className={`
        px-4 py-2 flex items-center justify-between cursor-pointer
        transition-all duration-200
        ${isHighlighted ? 'scale-[1.02] shadow-md rounded-lg' : ''}
        ${className}
      `}
      style={{
        background: isHighlighted
          ? (color || theme.colors.terracotta) + '20'
          : 'transparent',
        borderLeft: isHighlighted
          ? `3px solid ${color || theme.colors.terracotta}`
          : '3px solid transparent',
      }}
      onClick={onToggle}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex items-center gap-2">
        {/* Icône de catégorie */}
        {icon && <span className="text-sm">{icon}</span>}

        {/* Indicateur de couleur */}
        {color && !icon && (
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{ background: color }}
          />
        )}

        {/* Nom de la catégorie */}
        <span
          className="text-xs font-semibold uppercase tracking-wide"
          style={{ color: color || theme.colors.textMuted }}
        >
          {name}
        </span>

        {/* Compteur */}
        <span
          className="text-xs"
          style={{ color: theme.colors.textMuted }}
        >
          ({count})
        </span>
      </div>

      {/* Chevron */}
      {onToggle && (
        <svg
          className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-0' : '-rotate-90'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          style={{ color: theme.colors.textMuted }}
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      )}
    </div>
  );
}

// Icônes par défaut pour les catégories système
export const CategoryIcons = {
  pinned: '📌',
  uncategorized: '📁',
  archived: '📥',
  work: '💼',
  personal: '👤',
  family: '👨‍👩‍👧‍👦',
  friends: '👥',
};
