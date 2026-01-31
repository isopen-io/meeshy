'use client';

import { useRef, useEffect, useState } from 'react';

export interface CommunityItem {
  id: string;
  name: string;
  /** URL de la banniere de fond */
  banner?: string;
  /** URL de l'avatar (fallback si pas de banniere) */
  avatar?: string;
  /** Nombre total de membres */
  memberCount: number;
  /** Nombre de conversations actives */
  conversationCount: number;
  /** Couleur theme de la communaute */
  color?: string;
}

export interface CommunityCarouselProps {
  communities: CommunityItem[];
  isVisible: boolean;
  onCommunityClick: (communityId: string) => void;
  /** Nombre total de conversations (pour "Toutes") */
  totalConversations?: number;
  /** Nombre de conversations archivees */
  archivedConversations?: number;
  /** ID de la communaute/filtre selectionne */
  selectedId?: string | null;
  className?: string;
}

// Icone pour "Toutes les conversations"
function AllIcon({ className = 'w-6 h-6' }: { className?: string }): JSX.Element {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
      <path d="M8 9h8M8 13h6" />
    </svg>
  );
}

// Icone pour "Archives"
function ArchiveIcon({ className = 'w-6 h-6' }: { className?: string }): JSX.Element {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 8v13H3V8" />
      <path d="M1 3h22v5H1z" />
      <path d="M10 12h4" />
    </svg>
  );
}

// Icone membres
function MembersIcon({ className = 'w-3 h-3' }: { className?: string }): JSX.Element {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
    </svg>
  );
}

// Icone conversations
function ChatsIcon({ className = 'w-3 h-3' }: { className?: string }): JSX.Element {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
    </svg>
  );
}

function formatCount(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return count.toString();
}

interface CommunityCardProps {
  id: string;
  name: string;
  banner?: string;
  memberCount?: number;
  conversationCount: number;
  color?: string;
  icon?: React.ReactNode;
  isSpecial?: boolean;
  isSelected?: boolean;
  onClick: () => void;
}

function CommunityCard({
  name,
  banner,
  memberCount,
  conversationCount,
  color = 'var(--gp-deep-teal)',
  icon,
  isSpecial = false,
  isSelected = false,
  onClick,
}: CommunityCardProps): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`
        flex-shrink-0 relative overflow-hidden rounded-xl
        transition-all duration-300 ease-out
        hover:scale-[1.02]
        active:scale-[0.98]
        ${isSelected ? 'ring-2 ring-offset-2' : ''}
      `}
      style={{
        width: isSpecial ? '100px' : '140px',
        height: isSpecial ? '80px' : '100px',
        ringColor: isSelected ? color : undefined,
        boxShadow: 'var(--gp-shadow-sm)',
      }}
    >
      {/* Fond */}
      {banner ? (
        <img
          src={banner}
          alt={name}
          width={400}
          height={300}
          loading="eager"
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div
          className="absolute inset-0 transition-colors duration-300"
          style={{
            background: isSpecial
              ? `linear-gradient(135deg, color-mix(in srgb, ${color} 12%, transparent) 0%, color-mix(in srgb, ${color} 25%, transparent) 100%)`
              : `linear-gradient(135deg, ${color} 0%, color-mix(in srgb, ${color} 80%, black) 100%)`,
          }}
        />
      )}

      {/* Overlay gradient pour lisibilite */}
      <div
        className="absolute inset-0"
        style={{
          background: banner
            ? 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.1) 100%)'
            : isSpecial
              ? 'transparent'
              : 'linear-gradient(to top, rgba(0,0,0,0.4) 0%, transparent 60%)',
        }}
      />

      {/* Contenu */}
      <div className="absolute inset-0 flex flex-col justify-between p-2.5">
        {/* Icone speciale en haut */}
        {isSpecial && icon && (
          <div
            className="self-center mt-1 transition-colors duration-300"
            style={{ color: color }}
          >
            {icon}
          </div>
        )}

        {/* Spacer pour cartes normales */}
        {!isSpecial && <div />}

        {/* Info en bas */}
        <div className={isSpecial ? 'text-center' : ''}>
          {/* Titre */}
          <h4
            className={`
              font-semibold truncate leading-tight transition-colors duration-300
              ${isSpecial ? 'text-xs' : 'text-sm'}
            `}
            style={{
              color: isSpecial ? color : 'var(--gp-text-inverse)',
              textShadow: !isSpecial ? '0 1px 2px rgba(0,0,0,0.3)' : undefined,
            }}
          >
            {name}
          </h4>

          {/* Stats */}
          <div
            className={`
              flex items-center gap-2 mt-0.5
              ${isSpecial ? 'justify-center' : ''}
            `}
          >
            {/* Membres (seulement pour les communautes) */}
            {memberCount !== undefined && !isSpecial && (
              <div
                className="flex items-center gap-0.5 text-[10px]"
                style={{
                  color: 'rgba(255,255,255,0.85)',
                }}
              >
                <MembersIcon className="w-2.5 h-2.5" />
                <span>{formatCount(memberCount)}</span>
              </div>
            )}

            {/* Conversations */}
            <div
              className="flex items-center gap-0.5 text-[10px] transition-colors duration-300"
              style={{
                color: isSpecial ? 'var(--gp-text-muted)' : 'rgba(255,255,255,0.85)',
              }}
            >
              <ChatsIcon className="w-2.5 h-2.5" />
              <span>{formatCount(conversationCount)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Badge selection */}
      {isSelected && (
        <div
          className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center transition-colors duration-300"
          style={{ background: color }}
        >
          <svg
            className="w-2.5 h-2.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            viewBox="0 0 24 24"
            style={{ color: 'var(--gp-text-inverse)' }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      )}
    </button>
  );
}

export function CommunityCarousel({
  communities,
  isVisible,
  onCommunityClick,
  totalConversations = 0,
  archivedConversations = 0,
  selectedId = null,
  className = '',
}: CommunityCarouselProps): JSX.Element | null {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (isVisible) {
      setMounted(true);
    } else {
      const timer = setTimeout(() => setMounted(false), 200);
      return () => clearTimeout(timer);
    }
  }, [isVisible]);

  if (!mounted && !isVisible) return null;

  return (
    <div
      className={`
        overflow-hidden transition-all duration-300 ease-out
        ${isVisible ? 'max-h-36 opacity-100' : 'max-h-0 opacity-0'}
        ${className}
      `}
    >
      <div
        className="py-3 px-4 border-b transition-colors duration-300"
        style={{ borderColor: 'var(--gp-border-subtle)' }}
      >
        {/* En-tete */}
        <div className="flex items-center gap-2 mb-3">
          <svg
            className="w-4 h-4 transition-colors duration-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            style={{ color: 'var(--gp-text-muted)' }}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
          <span className="text-xs font-medium transition-colors duration-300" style={{ color: 'var(--gp-text-muted)' }}>
            Filtrer par communaute
          </span>
        </div>

        {/* Carousel */}
        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto pb-1"
          style={{
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          {/* Case "Toutes" */}
          <CommunityCard
            id="__all__"
            name="Toutes"
            conversationCount={totalConversations}
            color="var(--gp-deep-teal)"
            icon={<AllIcon className="w-7 h-7" />}
            isSpecial={true}
            isSelected={selectedId === null || selectedId === '__all__'}
            onClick={() => onCommunityClick('__all__')}
          />

          {/* Communautes */}
          {communities.map((community) => (
            <CommunityCard
              key={community.id}
              id={community.id}
              name={community.name}
              banner={community.banner}
              memberCount={community.memberCount}
              conversationCount={community.conversationCount}
              color={community.color || 'var(--gp-terracotta-light)'}
              isSelected={selectedId === community.id}
              onClick={() => onCommunityClick(community.id)}
            />
          ))}

          {/* Case "Archives" */}
          <CommunityCard
            id="__archives__"
            name="Archives"
            conversationCount={archivedConversations}
            color="var(--gp-text-muted)"
            icon={<ArchiveIcon className="w-7 h-7" />}
            isSpecial={true}
            isSelected={selectedId === '__archives__'}
            onClick={() => onCommunityClick('__archives__')}
          />
        </div>
      </div>

      <style jsx>{`
        div::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
}
