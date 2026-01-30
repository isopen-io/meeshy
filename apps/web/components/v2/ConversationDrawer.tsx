'use client';

import { useState, useEffect } from 'react';
import { theme } from './theme';
import { Button } from './Button';
import { Input } from './Input';
import { TagInput, TagItem } from './TagInput';

export interface ConversationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  // Données de la conversation
  conversationName: string;
  onNameChange: (name: string) => void;
  // Notifications
  notificationLevel: 'all' | 'mentions' | 'none';
  onNotificationChange: (level: 'all' | 'mentions' | 'none') => void;
  // Thème
  themeColor: string;
  availableColors: string[];
  onThemeChange: (color: string) => void;
  // Catégories
  categories: TagItem[];
  selectedCategoryId?: string;
  onCategorySelect: (id: string | undefined) => void;
  onCategoryCreate: (name: string) => void;
  onCategoryDelete: (id: string) => void;
  // Tags
  tags: TagItem[];
  selectedTagIds: string[];
  onTagSelect: (id: string) => void;
  onTagDeselect: (id: string) => void;
  onTagCreate: (name: string) => void;
  onTagDelete: (id: string) => void;
  // Navigation
  onSettingsClick: () => void;
  onProfileClick?: () => void;
  onSearchClick: () => void;
  // Actions
  onBlockClick: () => void;
  onReportClick: () => void;
  // Afficher profil (uniquement pour conversations directes)
  showProfile?: boolean;
  className?: string;
}

export function ConversationDrawer({
  isOpen,
  onClose,
  conversationName,
  onNameChange,
  notificationLevel,
  onNotificationChange,
  themeColor,
  availableColors,
  onThemeChange,
  categories,
  selectedCategoryId,
  onCategorySelect,
  onCategoryCreate,
  onCategoryDelete,
  tags,
  selectedTagIds,
  onTagSelect,
  onTagDeselect,
  onTagCreate,
  onTagDelete,
  onSettingsClick,
  onProfileClick,
  onSearchClick,
  onBlockClick,
  onReportClick,
  showProfile = true,
  className = '',
}: ConversationDrawerProps) {
  const [localName, setLocalName] = useState(conversationName);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      setLocalName(conversationName);
    } else {
      const timer = setTimeout(() => setMounted(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen, conversationName]);

  if (!mounted) return null;

  const handleNameBlur = () => {
    if (localName !== conversationName) {
      onNameChange(localName);
    }
  };

  return (
    <>
      {/* Overlay */}
      <div
        className={`
          fixed inset-0 bg-black/30 z-40 transition-opacity duration-300
          ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}
        `}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={`
          fixed top-0 left-0 bottom-0 w-80 max-w-[85vw] z-50
          flex flex-col overflow-hidden
          transition-transform duration-300 ease-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          ${className}
        `}
        style={{ background: 'white' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between p-4 border-b"
          style={{ borderColor: theme.colors.parchment }}
        >
          <h2
            className="text-lg font-semibold"
            style={{ fontFamily: theme.fonts.display, color: theme.colors.charcoal }}
          >
            Options
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              style={{ color: theme.colors.textMuted }}
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Nom personnalisé */}
          <div>
            <label
              className="block text-sm font-medium mb-2"
              style={{ color: theme.colors.textMuted }}
            >
              Nom affiché (pour vous)
            </label>
            <Input
              value={localName}
              onChange={(e) => setLocalName(e.target.value)}
              onBlur={handleNameBlur}
              placeholder="Nom de la conversation"
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              }
            />
          </div>

          {/* Notifications */}
          <div>
            <label
              className="block text-sm font-medium mb-2"
              style={{ color: theme.colors.textMuted }}
            >
              Notifications
            </label>
            <div className="flex gap-2">
              {(['all', 'mentions', 'none'] as const).map((level) => (
                <button
                  key={level}
                  onClick={() => onNotificationChange(level)}
                  className={`
                    flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors
                    ${notificationLevel === level ? 'text-white' : 'hover:bg-gray-100'}
                  `}
                  style={{
                    background: notificationLevel === level ? theme.colors.terracotta : 'transparent',
                    border: `1px solid ${notificationLevel === level ? theme.colors.terracotta : theme.colors.parchment}`,
                    color: notificationLevel === level ? 'white' : theme.colors.textSecondary,
                  }}
                >
                  {level === 'all' && 'Tous'}
                  {level === 'mentions' && 'Mentions'}
                  {level === 'none' && 'Aucune'}
                </button>
              ))}
            </div>
          </div>

          {/* Thème */}
          <div>
            <label
              className="block text-sm font-medium mb-2"
              style={{ color: theme.colors.textMuted }}
            >
              Thème
            </label>
            <div className="flex gap-3">
              {availableColors.map((color) => (
                <button
                  key={color}
                  onClick={() => onThemeChange(color)}
                  className={`
                    w-8 h-8 rounded-full transition-transform
                    ${themeColor === color ? 'ring-2 ring-offset-2 scale-110' : 'hover:scale-105'}
                  `}
                  style={{
                    background: color,
                    ringColor: color,
                  }}
                >
                  {themeColor === color && (
                    <svg className="w-4 h-4 mx-auto text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Séparateur */}
          <div className="border-t" style={{ borderColor: theme.colors.parchment }} />

          {/* Actions rapides */}
          <div className="space-y-1">
            <DrawerMenuItem
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              }
              label="Paramètres"
              onClick={onSettingsClick}
            />
            {showProfile && onProfileClick && (
              <DrawerMenuItem
                icon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                }
                label="Voir le profil"
                onClick={onProfileClick}
              />
            )}
            <DrawerMenuItem
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              }
              label="Rechercher"
              onClick={onSearchClick}
            />
          </div>

          {/* Séparateur */}
          <div className="border-t" style={{ borderColor: theme.colors.parchment }} />

          {/* Catégorie */}
          <TagInput
            label="Catégorie"
            items={categories}
            selectedIds={selectedCategoryId ? [selectedCategoryId] : []}
            onSelect={(id) => onCategorySelect(id)}
            onDeselect={() => onCategorySelect(undefined)}
            onCreate={onCategoryCreate}
            onDelete={onCategoryDelete}
            placeholder="Rechercher ou créer..."
          />

          {/* Tags */}
          <TagInput
            label="Tags"
            items={tags}
            selectedIds={selectedTagIds}
            onSelect={onTagSelect}
            onDeselect={onTagDeselect}
            onCreate={onTagCreate}
            onDelete={onTagDelete}
            placeholder="Rechercher ou créer..."
          />
        </div>

        {/* Footer */}
        <div
          className="p-4 border-t space-y-2"
          style={{ borderColor: theme.colors.parchment }}
        >
          <button
            onClick={onBlockClick}
            className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-red-50 transition-colors"
            style={{ color: '#EF4444' }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
            <span className="text-sm font-medium">Bloquer</span>
          </button>
          <button
            onClick={onReportClick}
            className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-orange-50 transition-colors"
            style={{ color: theme.colors.terracotta }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="text-sm font-medium">Signaler</span>
          </button>
        </div>
      </div>
    </>
  );
}

// Composant pour les items du menu
function DrawerMenuItem({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors"
    >
      <div className="flex items-center gap-3">
        <span style={{ color: theme.colors.textMuted }}>{icon}</span>
        <span className="text-sm font-medium" style={{ color: theme.colors.charcoal }}>
          {label}
        </span>
      </div>
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        style={{ color: theme.colors.textMuted }}
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}
