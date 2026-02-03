'use client';

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';

interface SplitViewContextType {
  // Panel visibility (mobile)
  showRightPanel: boolean;
  setShowRightPanel: (show: boolean) => void;

  // Sidebar width (desktop)
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;

  // Active right panel route
  activeRoute: string | null;

  // Navigation helpers
  navigateToPanel: (route: string) => void;
  goBackToList: () => void;

  // Mobile detection
  isMobile: boolean;
}

const SplitViewContext = createContext<SplitViewContextType | null>(null);

export function useSplitView() {
  const context = useContext(SplitViewContext);
  if (!context) {
    throw new Error('useSplitView must be used within a SplitViewProvider');
  }
  return context;
}

interface SplitViewProviderProps {
  children: ReactNode;
  defaultSidebarWidth?: number;
}

export function SplitViewProvider({
  children,
  defaultSidebarWidth = 30
}: SplitViewProviderProps) {
  const pathname = usePathname();

  // Sidebar width (percentage)
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('meeshy_sidebar_width');
      if (saved) {
        const parsed = parseFloat(saved);
        if (!isNaN(parsed) && parsed >= 15 && parsed <= 50) {
          return parsed;
        }
      }
    }
    return defaultSidebarWidth;
  });

  // Mobile detection
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Show right panel on mobile (when navigating to a specific page)
  const [showRightPanel, setShowRightPanel] = useState(false);

  // Determine if we're on a route that should show the right panel
  const activeRoute = pathname;

  // Auto-show right panel on mobile when navigating to specific routes
  useEffect(() => {
    // Routes that should show right panel on mobile
    const rightPanelRoutes = [
      '/v2/chats/',      // Chat with specific conversation
      '/v2/communities',
      '/v2/contacts',
      '/v2/notifications',
      '/v2/settings',
      '/v2/me',
      '/v2/links',
      '/v2/u/',          // User profile
      '/v2/feeds',
    ];

    const shouldShowRight = rightPanelRoutes.some(route =>
      pathname.startsWith(route) || pathname === route.replace(/\/$/, '')
    );

    // On mobile, show right panel for these routes
    if (isMobile && shouldShowRight && pathname !== '/v2/chats') {
      setShowRightPanel(true);
    }
  }, [pathname, isMobile]);

  // Persist sidebar width
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('meeshy_sidebar_width', sidebarWidth.toString());
    }
  }, [sidebarWidth]);

  const navigateToPanel = useCallback((route: string) => {
    setShowRightPanel(true);
    // Navigation is handled by Next.js router, we just manage the panel visibility
  }, []);

  const goBackToList = useCallback(() => {
    setShowRightPanel(false);
  }, []);

  return (
    <SplitViewContext.Provider
      value={{
        showRightPanel,
        setShowRightPanel,
        sidebarWidth,
        setSidebarWidth,
        activeRoute,
        navigateToPanel,
        goBackToList,
        isMobile,
      }}
    >
      {children}
    </SplitViewContext.Provider>
  );
}
