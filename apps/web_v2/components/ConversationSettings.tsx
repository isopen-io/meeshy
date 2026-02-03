'use client';

import { useState } from 'react';
import { Button } from './Button';
import { Input } from './Input';
import { Badge } from './Badge';

export interface Participant {
  id: string;
  name: string;
  avatar?: string;
  role: 'admin' | 'moderator' | 'member';
  isOnline: boolean;
}

export interface ConversationStats {
  messageCount: number;
  languages: string[];
  mediaCount: number;
  linkCount: number;
}

export interface ConversationSettingsProps {
  // Navigation
  onBack: () => void;
  // Identité
  title: string;
  onTitleChange: (title: string) => void;
  description: string;
  onDescriptionChange: (description: string) => void;
  avatar?: string;
  onAvatarChange: (file: File) => void;
  banner?: string;
  onBannerChange: (file: File) => void;
  // Type
  conversationType: 'private' | 'general' | 'public' | 'broadcast';
  onTypeChange: (type: 'private' | 'general' | 'public' | 'broadcast') => void;
  // Options
  communityId?: string;
  onCommunityChange: (id: string | undefined) => void;
  allowAnonymous: boolean;
  onAllowAnonymousChange: (allow: boolean) => void;
  // Participants
  participants: Participant[];
  onInvite: () => void;
  onParticipantAction: (participantId: string, action: 'promote' | 'demote' | 'remove') => void;
  // Stats
  stats: ConversationStats;
  // Contenus
  onMediaClick: () => void;
  onLinksClick: () => void;
  // Actions
  onDelete: () => void;
  className?: string;
}

export function ConversationSettings({
  onBack,
  title,
  onTitleChange,
  description,
  onDescriptionChange,
  avatar,
  onAvatarChange,
  banner,
  onBannerChange,
  conversationType,
  onTypeChange,
  communityId,
  onCommunityChange,
  allowAnonymous,
  onAllowAnonymousChange,
  participants,
  onInvite,
  onParticipantAction,
  stats,
  onMediaClick,
  onLinksClick,
  onDelete,
  className = '',
}: ConversationSettingsProps) {
  const [localTitle, setLocalTitle] = useState(title);
  const [localDescription, setLocalDescription] = useState(description);

  const roleLabels = {
    admin: { label: 'Admin', icon: '👑', color: 'var(--gp-terracotta)' },
    moderator: { label: 'Modo', icon: '🛡️', color: 'var(--gp-deep-teal)' },
    member: { label: 'Membre', icon: '👤', color: 'var(--gp-text-muted)' },
  };

  const typeOptions = [
    { value: 'private', label: 'Privée', description: 'Sur invitation uniquement' },
    { value: 'general', label: 'Générale', description: 'Conversation standard' },
    { value: 'public', label: 'Publique', description: 'Visible par tous' },
    { value: 'broadcast', label: 'Broadcast', description: 'Lecture seule pour les membres' },
  ] as const;

  return (
    <div
      className={`h-full flex flex-col bg-[var(--gp-surface-elevated)] transition-colors duration-300 ${className}`}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 p-4 border-b border-[var(--gp-border)] transition-colors duration-300"
      >
        <button
          onClick={onBack}
          className="p-2 rounded-lg hover:bg-[var(--gp-hover)] transition-colors duration-300"
        >
          <svg
            className="w-5 h-5 text-[var(--gp-text-primary)]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2
          className="text-lg font-semibold text-[var(--gp-text-primary)] transition-colors duration-300"
          style={{ fontFamily: 'var(--font-display, inherit)' }}
        >
          Paramètres
        </h2>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Banner et Avatar */}
        <div className="relative">
          {/* Banner */}
          <div
            className="h-32 relative cursor-pointer group transition-colors duration-300"
            style={{ background: banner ? `url(${banner}) center/cover` : 'var(--gp-surface)' }}
            onClick={() => document.getElementById('banner-input')?.click()}
          >
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
              <svg
                className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <input
              id="banner-input"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onBannerChange(e.target.files[0])}
            />
          </div>

          {/* Avatar */}
          <div
            className="absolute -bottom-10 left-4 w-20 h-20 rounded-2xl border-4 border-[var(--gp-surface-elevated)] cursor-pointer group overflow-hidden transition-colors duration-300"
            style={{ background: avatar ? `url(${avatar}) center/cover` : 'var(--gp-deep-teal)' }}
            onClick={() => document.getElementById('avatar-input')?.click()}
          >
            {!avatar && (
              <div className="w-full h-full flex items-center justify-center text-white text-2xl font-bold">
                {title.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
              <svg
                className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <input
              id="avatar-input"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onAvatarChange(e.target.files[0])}
            />
          </div>
        </div>

        <div className="px-4 pt-14 pb-6 space-y-6">
          {/* Titre et Description */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-[var(--gp-text-muted)] transition-colors duration-300">
                Titre officiel
              </label>
              <Input
                value={localTitle}
                onChange={(e) => setLocalTitle(e.target.value)}
                onBlur={() => localTitle !== title && onTitleChange(localTitle)}
                placeholder="Nom de la conversation"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-[var(--gp-text-muted)] transition-colors duration-300">
                Description
              </label>
              <textarea
                value={localDescription}
                onChange={(e) => setLocalDescription(e.target.value)}
                onBlur={() => localDescription !== description && onDescriptionChange(localDescription)}
                placeholder="Description de la conversation..."
                className="w-full px-3 py-2 text-sm rounded-lg border outline-none resize-none h-20 bg-[var(--gp-surface)] border-[var(--gp-border)] text-[var(--gp-text-primary)] transition-colors duration-300"
              />
            </div>
          </div>

          {/* Type de conversation */}
          <div>
            <label className="block text-sm font-medium mb-3 text-[var(--gp-text-muted)] transition-colors duration-300">
              Type de conversation
            </label>
            <div className="space-y-2">
              {typeOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => onTypeChange(option.value)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors duration-300 ${
                    conversationType === option.value ? '' : 'hover:bg-[var(--gp-hover)]'
                  }`}
                  style={{
                    borderColor: conversationType === option.value ? 'var(--gp-terracotta)' : 'var(--gp-border)',
                    background: conversationType === option.value ? 'var(--gp-terracotta-light)' : 'transparent',
                  }}
                >
                  <div
                    className="w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors duration-300"
                    style={{
                      borderColor: conversationType === option.value ? 'var(--gp-terracotta)' : 'var(--gp-text-muted)',
                    }}
                  >
                    {conversationType === option.value && (
                      <div
                        className="w-2 h-2 rounded-full bg-[var(--gp-terracotta)]"
                      />
                    )}
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-[var(--gp-text-primary)] transition-colors duration-300">
                      {option.label}
                    </p>
                    <p className="text-xs text-[var(--gp-text-muted)] transition-colors duration-300">
                      {option.description}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Options */}
          <div>
            <label className="block text-sm font-medium mb-3 text-[var(--gp-text-muted)] transition-colors duration-300">
              Options
            </label>
            <div className="space-y-3">
              <button
                onClick={() => onCommunityChange(communityId ? undefined : 'select')}
                className="w-full flex items-center justify-between p-3 rounded-lg border border-[var(--gp-border)] hover:bg-[var(--gp-hover)] transition-colors duration-300"
              >
                <div className="flex items-center gap-3">
                  <span className="text-[var(--gp-text-muted)]">🏘️</span>
                  <span className="text-sm text-[var(--gp-text-primary)]">
                    Associer à une communauté
                  </span>
                </div>
                <svg className="w-5 h-5 text-[var(--gp-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>

              <button
                onClick={() => onAllowAnonymousChange(!allowAnonymous)}
                className="w-full flex items-center justify-between p-3 rounded-lg border border-[var(--gp-border)] hover:bg-[var(--gp-hover)] transition-colors duration-300"
              >
                <div className="flex items-center gap-3">
                  <span className="text-[var(--gp-text-muted)]">👻</span>
                  <span className="text-sm text-[var(--gp-text-primary)]">
                    Autoriser les anonymes
                  </span>
                </div>
                <div
                  className={`w-10 h-6 rounded-full p-1 transition-colors duration-300 ${allowAnonymous ? 'bg-[var(--gp-deep-teal)]' : 'bg-[var(--gp-border)]'}`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform duration-300 ${allowAnonymous ? 'translate-x-4' : ''}`}
                  />
                </div>
              </button>
            </div>
          </div>

          {/* Participants */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-[var(--gp-text-muted)] transition-colors duration-300">
                Participants ({participants.length})
              </label>
              <Button variant="ghost" size="sm" onClick={onInvite}>
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Inviter
              </Button>
            </div>
            <div className="space-y-2">
              {participants.map((participant) => {
                const roleInfo = roleLabels[participant.role];
                return (
                  <div
                    key={participant.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-[var(--gp-surface)] transition-colors duration-300"
                  >
                    <div className="relative">
                      {participant.avatar ? (
                        <img
                          src={participant.avatar}
                          alt={participant.name}
                          width={40}
                          height={40}
                          loading="lazy"
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center text-white font-medium bg-[var(--gp-deep-teal)]"
                        >
                          {participant.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      {participant.isOnline && (
                        <div
                          className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[var(--gp-surface-elevated)] bg-[var(--gp-deep-teal)]"
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate text-[var(--gp-text-primary)] transition-colors duration-300">
                        {participant.name}
                      </p>
                      <p className="text-xs" style={{ color: roleInfo.color }}>
                        {roleInfo.icon} {roleInfo.label}
                      </p>
                    </div>
                    <button className="p-2 rounded hover:bg-[var(--gp-hover)] text-[var(--gp-text-muted)] transition-colors duration-300">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Statistiques */}
          <div>
            <label className="block text-sm font-medium mb-3 text-[var(--gp-text-muted)] transition-colors duration-300">
              Statistiques
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-[var(--gp-surface)] transition-colors duration-300">
                <p className="text-lg font-bold text-[var(--gp-text-primary)]">
                  {stats.messageCount.toLocaleString()}
                </p>
                <p className="text-xs text-[var(--gp-text-muted)]">Messages</p>
              </div>
              <div className="p-3 rounded-lg bg-[var(--gp-surface)] transition-colors duration-300">
                <p className="text-lg font-bold text-[var(--gp-text-primary)]">
                  {stats.languages.length}
                </p>
                <p className="text-xs text-[var(--gp-text-muted)]">
                  Langues: {stats.languages.join(' ')}
                </p>
              </div>
            </div>
          </div>

          {/* Contenus */}
          <div>
            <label className="block text-sm font-medium mb-3 text-[var(--gp-text-muted)] transition-colors duration-300">
              Contenus
            </label>
            <div className="space-y-2">
              <button
                onClick={onMediaClick}
                className="w-full flex items-center justify-between p-3 rounded-lg border border-[var(--gp-border)] hover:bg-[var(--gp-hover)] transition-colors duration-300"
              >
                <div className="flex items-center gap-3">
                  <span className="text-[var(--gp-text-muted)]">🖼️</span>
                  <span className="text-sm text-[var(--gp-text-primary)]">
                    Médias partagés
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="default" size="sm">{stats.mediaCount}</Badge>
                  <svg className="w-5 h-5 text-[var(--gp-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
              <button
                onClick={onLinksClick}
                className="w-full flex items-center justify-between p-3 rounded-lg border border-[var(--gp-border)] hover:bg-[var(--gp-hover)] transition-colors duration-300"
              >
                <div className="flex items-center gap-3">
                  <span className="text-[var(--gp-text-muted)]">🔗</span>
                  <span className="text-sm text-[var(--gp-text-primary)]">
                    Liens partagés
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="default" size="sm">{stats.linkCount}</Badge>
                  <svg className="w-5 h-5 text-[var(--gp-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Danger zone */}
        <div className="px-4 py-6 border-t border-[var(--gp-border)] transition-colors duration-300">
          <Button
            variant="destructive"
            className="w-full"
            onClick={onDelete}
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Supprimer la conversation
          </Button>
        </div>
      </div>
    </div>
  );
}
