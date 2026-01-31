'use client';

import { useState, useRef, useEffect } from 'react';
import { Badge } from './Badge';

export interface TagItem {
  id: string;
  name: string;
  color: string;
}

export interface TagInputProps {
  label: string;
  items: TagItem[];
  selectedIds: string[];
  onSelect: (id: string) => void;
  onDeselect: (id: string) => void;
  onCreate: (name: string) => void;
  onDelete: (id: string) => void;
  placeholder?: string;
  className?: string;
}

export function TagInput({
  label,
  items,
  selectedIds,
  onSelect,
  onDeselect,
  onCreate,
  onDelete,
  placeholder = 'Rechercher ou créer...',
  className = '',
}: TagInputProps) {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const filteredItems = items.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase())
  );

  const showCreateButton =
    search.trim() !== '' &&
    !items.some((item) => item.name.toLowerCase() === search.toLowerCase());

  const selectedItems = items.filter((item) => selectedIds.includes(item.id));

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={className} ref={containerRef}>
      <label
        className="block text-sm font-medium mb-2 text-[var(--gp-text-muted)] transition-colors duration-300"
      >
        {label}
      </label>

      {/* Selected tags */}
      {selectedItems.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {selectedItems.map((item) => (
            <Badge
              key={item.id}
              variant="default"
              size="sm"
              style={{ background: item.color + '20', color: item.color, borderColor: item.color }}
              className="border cursor-pointer"
              onClick={() => onDeselect(item.id)}
            >
              {item.name}
              <span className="ml-1 opacity-60">×</span>
            </Badge>
          ))}
        </div>
      )}

      {/* Search input */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className="w-full px-3 py-2 text-sm rounded-lg border outline-none transition-colors duration-300 bg-[var(--gp-surface)] text-[var(--gp-text-primary)]"
          style={{
            borderColor: isOpen ? 'var(--gp-terracotta)' : 'var(--gp-border)',
          }}
        />

        {/* Dropdown */}
        {isOpen && (
          <div
            className="absolute top-full left-0 right-0 mt-1 rounded-lg border z-10 max-h-48 overflow-y-auto bg-[var(--gp-surface-elevated)] border-[var(--gp-border)] transition-colors duration-300"
            style={{
              boxShadow: 'var(--gp-shadow-lg)',
            }}
          >
            {filteredItems.map((item) => {
              const isSelected = selectedIds.includes(item.id);
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between px-3 py-2 hover:bg-[var(--gp-hover)] cursor-pointer transition-colors duration-300"
                  onClick={() => (isSelected ? onDeselect(item.id) : onSelect(item.id))}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ background: item.color }}
                    />
                    <span className="text-sm text-[var(--gp-text-primary)] transition-colors duration-300">
                      {item.name}
                    </span>
                    {isSelected && (
                      <span className="text-[var(--gp-deep-teal)]">✓</span>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(item.id);
                    }}
                    className="p-1 rounded hover:bg-[var(--gp-hover)] opacity-50 hover:opacity-100 transition-colors duration-300"
                  >
                    <svg
                      className="w-4 h-4 text-[var(--gp-text-muted)]"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>
              );
            })}

            {showCreateButton && (
              <button
                onClick={() => {
                  onCreate(search.trim());
                  setSearch('');
                }}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--gp-hover)] text-left text-[var(--gp-terracotta)] transition-colors duration-300"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="text-sm font-medium">Créer "{search.trim()}"</span>
              </button>
            )}

            {filteredItems.length === 0 && !showCreateButton && (
              <div className="px-3 py-2 text-sm text-[var(--gp-text-muted)] transition-colors duration-300">
                Aucun résultat
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
