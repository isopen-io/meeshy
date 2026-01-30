'use client';

import { useRef, useEffect, useState } from 'react';
import { theme } from './theme';

export interface CommunityItem {
  id: string;
  name: string;
  avatar?: string;
  memberCount: number;
  color?: string;
}

export interface CommunityCarouselProps {
  communities: CommunityItem[];
  isVisible: boolean;
  onCommunityClick: (communityId: string) => void;
  className?: string;
}

export function CommunityCarousel({
  communities,
  isVisible,
  onCommunityClick,
  className = '',
}: CommunityCarouselProps) {
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
        overflow-hidden transition-all duration-200 ease-out
        ${isVisible ? 'max-h-24 opacity-100' : 'max-h-0 opacity-0'}
        ${className}
      `}
    >
      <div className="py-3 px-4 border-b" style={{ borderColor: theme.colors.parchment }}>
        <div className="flex items-center gap-2 mb-2">
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            style={{ color: theme.colors.textMuted }}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
          <span className="text-xs font-medium" style={{ color: theme.colors.textMuted }}>
            Communautés
          </span>
        </div>

        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto scrollbar-hide pb-1"
          style={{
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          {communities.map((community) => (
            <button
              key={community.id}
              onClick={() => onCommunityClick(community.id)}
              className="flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-full transition-colors hover:bg-gray-100"
              style={{
                background: (community.color || theme.colors.deepTeal) + '10',
                border: `1px solid ${(community.color || theme.colors.deepTeal) + '30'}`,
              }}
            >
              {/* Avatar ou initiale */}
              {community.avatar ? (
                <img
                  src={community.avatar}
                  alt={community.name}
                  className="w-6 h-6 rounded-full object-cover"
                />
              ) : (
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold text-white"
                  style={{ background: community.color || theme.colors.deepTeal }}
                >
                  {community.name.charAt(0).toUpperCase()}
                </div>
              )}

              {/* Nom */}
              <span
                className="text-sm font-medium whitespace-nowrap"
                style={{ color: theme.colors.charcoal }}
              >
                {community.name}
              </span>

              {/* Membres */}
              <span
                className="text-xs whitespace-nowrap"
                style={{ color: theme.colors.textMuted }}
              >
                {community.memberCount > 999
                  ? `${(community.memberCount / 1000).toFixed(1)}k`
                  : community.memberCount}
              </span>
            </button>
          ))}
        </div>
      </div>

      <style jsx>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
}
