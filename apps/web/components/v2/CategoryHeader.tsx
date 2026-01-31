'use client';

import { useState } from 'react';

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
}: CategoryHeaderProps): JSX.Element {
  const [internalDragOver, setInternalDragOver] = useState(false);

  const isHighlighted = isDragOver || internalDragOver;

  function handleDragOver(e: React.DragEvent): void {
    e.preventDefault();
    setInternalDragOver(true);
  }

  function handleDragLeave(): void {
    setInternalDragOver(false);
  }

  function handleDrop(e: React.DragEvent): void {
    e.preventDefault();
    setInternalDragOver(false);
    const conversationId = e.dataTransfer.getData('conversationId');
    if (conversationId && onDrop) {
      onDrop(conversationId);
    }
  }

  // Use CSS variable with fallback to color prop, or default terracotta
  const accentColor = color || 'var(--gp-terracotta)';

  return (
    <div
      className={`
        px-4 py-2 flex items-center justify-between cursor-pointer
        transition-all duration-300
        ${isHighlighted ? 'scale-[1.02] rounded-lg' : ''}
        ${className}
      `}
      style={{
        background: isHighlighted
          ? `color-mix(in srgb, ${accentColor} 12%, transparent)`
          : 'transparent',
        borderLeft: isHighlighted
          ? `3px solid ${accentColor}`
          : '3px solid transparent',
        boxShadow: isHighlighted ? 'var(--gp-shadow-md)' : undefined,
      }}
      onClick={onToggle}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex items-center gap-2">
        {/* Icone de categorie */}
        {icon && <span className="text-sm">{icon}</span>}

        {/* Indicateur de couleur */}
        {color && !icon && (
          <div
            className="w-2.5 h-2.5 rounded-full transition-colors duration-300"
            style={{ background: color }}
          />
        )}

        {/* Nom de la categorie */}
        <span
          className="text-xs font-semibold uppercase tracking-wide transition-colors duration-300"
          style={{ color: color || 'var(--gp-text-muted)' }}
        >
          {name}
        </span>

        {/* Compteur */}
        <span
          className="text-xs transition-colors duration-300"
          style={{ color: 'var(--gp-text-muted)' }}
        >
          ({count})
        </span>
      </div>

      {/* Chevron */}
      {onToggle && (
        <svg
          className={`w-4 h-4 transition-transform duration-300 ${isExpanded ? 'rotate-0' : '-rotate-90'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          style={{ color: 'var(--gp-text-muted)' }}
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      )}
    </div>
  );
}

// Icones par defaut pour les categories systeme
export const CategoryIcons = {
  pinned: '\u{1F4CC}',
  uncategorized: '\u{1F4C1}',
  archived: '\u{1F4E5}',
  work: '\u{1F4BC}',
  personal: '\u{1F464}',
  family: '\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}\u{200D}\u{1F466}',
  friends: '\u{1F465}',
};
