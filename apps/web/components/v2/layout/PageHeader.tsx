'use client';

import { type ReactNode } from 'react';
import Link from 'next/link';
import { Button } from '@/components/v2/Button';
import { theme } from '@/components/v2/theme';
import { useSplitView } from './SplitViewContext';

interface PageHeaderProps {
  title: string;
  titleBadge?: ReactNode;
  actionButtons?: ReactNode;
  hideNotificationButton?: boolean;
  hideProfileButton?: boolean;
  children?: ReactNode;
}

export function PageHeader({
  title,
  titleBadge,
  actionButtons,
  hideNotificationButton,
  hideProfileButton,
  children,
}: PageHeaderProps) {
  const { goBackToList, isMobile, showRightPanel } = useSplitView();

  return (
    <header className="sticky top-0 z-50 px-6 py-4 border-b border-[var(--gp-border)] bg-[var(--gp-surface)]/95 backdrop-blur-xl transition-colors duration-300">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isMobile && showRightPanel && (
              <button
                onClick={goBackToList}
                className="p-2 -ml-2 rounded-lg hover:bg-[var(--gp-hover)] text-[var(--gp-text-primary)] transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <h1
              className="text-xl font-semibold text-[var(--gp-text-primary)]"
              style={{ fontFamily: theme.fonts.display }}
            >
              {title}
            </h1>
            {titleBadge}
          </div>
          <div className="flex items-center gap-2">
            {actionButtons}
            {!hideNotificationButton && (
              <Link href="/v2/notifications">
                <Button variant="ghost" size="sm">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                </Button>
              </Link>
            )}
            {!hideProfileButton && (
              <Link href="/v2/me">
                <Button variant="ghost" size="sm">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </Button>
              </Link>
            )}
          </div>
        </div>
        {children}
      </div>
    </header>
  );
}
