'use client';

import { type ReactNode } from 'react';
import { useSplitView } from './SplitViewContext';
import { theme } from '@/components/v2';

interface RightPanelHeaderProps {
  title: string;
  subtitle?: string;
  rightContent?: ReactNode;
  children?: ReactNode;
  sticky?: boolean;
}

/**
 * Header component for right panel pages in split view.
 * Includes back button on mobile to return to conversation list.
 */
export function RightPanelHeader({
  title,
  subtitle,
  rightContent,
  children,
  sticky = true,
}: RightPanelHeaderProps) {
  const { goBackToList, isMobile, showRightPanel } = useSplitView();

  return (
    <header
      className={`px-6 py-4 border-b border-[var(--gp-border)] bg-[var(--gp-surface)]/95 backdrop-blur-xl transition-colors duration-300 ${
        sticky ? 'sticky top-0 z-50' : ''
      }`}
    >
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Back button (mobile only) */}
            {isMobile && showRightPanel && (
              <button
                onClick={goBackToList}
                className="p-2 -ml-2 rounded-lg hover:bg-[var(--gp-hover)] text-[var(--gp-text-primary)] transition-colors"
                aria-label="Retour aux conversations"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <div>
              <h1
                className="text-xl font-semibold text-[var(--gp-text-primary)]"
                style={{ fontFamily: theme.fonts.display }}
              >
                {title}
              </h1>
              {subtitle && (
                <p className="text-sm text-[var(--gp-text-muted)]">{subtitle}</p>
              )}
            </div>
          </div>
          {rightContent && <div className="flex items-center gap-2">{rightContent}</div>}
        </div>
        {children}
      </div>
    </header>
  );
}
