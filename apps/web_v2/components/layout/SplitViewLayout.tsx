'use client';

import { type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { SplitViewProvider, useSplitView } from './SplitViewContext';
import { ConversationSidebar } from './ConversationSidebar';
import { Button } from '@/components';

interface SplitViewLayoutProps {
  children: ReactNode;
}

function BackButton() {
  const { goBackToList, isMobile, showRightPanel } = useSplitView();

  // Only show on mobile when right panel is visible
  if (!isMobile || !showRightPanel) return null;

  return (
    <button
      onClick={goBackToList}
      className="p-2 -ml-2 rounded-lg hover:bg-[var(--gp-hover)] text-[var(--gp-text-primary)] transition-colors"
      aria-label="Retour"
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
    </button>
  );
}

function SplitViewContent({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { showRightPanel, isMobile, sidebarWidth } = useSplitView();

  // Check if we're on a page that should use the split view
  const splitViewRoutes = [
    '/v2/chats',
    '/v2/communities',
    '/v2/contacts',
    '/v2/notifications',
    '/v2/settings',
    '/v2/me',
    '/v2/links',
    '/v2/u/',
    '/v2/feeds',
  ];

  const useSplitViewLayout = splitViewRoutes.some(
    (route) => pathname === route || pathname.startsWith(route + '/')
  );

  // For routes that don't use split view, render children directly
  if (!useSplitViewLayout) {
    return <>{children}</>;
  }

  return (
    <div className="h-screen flex bg-[var(--gp-background)] text-[var(--gp-text-primary)] transition-colors duration-300 overflow-hidden">
      {/* Left Panel - Conversation Sidebar */}
      <div
        className={`relative flex-shrink-0 ${
          isMobile && showRightPanel ? 'hidden' : 'block'
        }`}
        style={{
          width: isMobile ? '100%' : `${sidebarWidth}%`,
          minWidth: isMobile ? '100%' : '280px',
          maxWidth: isMobile ? '100%' : '50%',
        }}
      >
        <ConversationSidebar />
      </div>

      {/* Right Panel - Page Content */}
      <div
        className={`flex-1 flex flex-col min-w-0 ${
          isMobile && !showRightPanel ? 'hidden' : 'block'
        }`}
      >
        {children}
      </div>
    </div>
  );
}

export function SplitViewLayout({ children }: SplitViewLayoutProps) {
  return (
    <SplitViewProvider>
      <SplitViewContent>{children}</SplitViewContent>
    </SplitViewProvider>
  );
}

// Export BackButton for use in page headers
export { BackButton };
