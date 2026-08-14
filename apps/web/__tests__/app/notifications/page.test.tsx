/**
 * L'onglet de la cloche filtre côté SERVEUR : en changer ouvre une requête, et
 * la première fois qu'un onglet est ouvert son cache est vide. Le squelette doit
 * donc remplacer la LISTE, jamais la page — sans quoi il emporte avec lui les
 * onglets que le lecteur vient de toucher et la recherche qu'il est en train de
 * taper, à chaque premier passage sur chaque onglet.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('framer-motion', () => ({
  motion: {
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key, locale: 'fr' }),
}));

jest.mock('@/components/auth/AuthGuard', () => ({
  AuthGuard: ({ children }: any) => <>{children}</>,
}));

jest.mock('@/components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/notifications/NotificationList', () => ({
  NotificationList: () => <div data-testid="notification-list" />,
}));

jest.mock('@/components/notifications/NotificationSkeleton', () => ({
  NotificationSkeleton: () => <div data-testid="notification-skeleton" />,
}));

jest.mock('@/components/notifications/PushPermissionBanner', () => ({
  PushPermissionBanner: () => null,
}));

const managerState = {
  notifications: [] as unknown[],
  unreadCount: 0,
  isLoading: true,
  isLoadingMore: false,
  hasMore: false,
  markAsRead: jest.fn(),
  markAllAsRead: jest.fn(),
  deleteNotification: jest.fn(),
  fetchMore: jest.fn(),
};

jest.mock('@/hooks/queries/use-notifications-manager-rq', () => ({
  useNotificationsManagerRQ: () => managerState,
}));

jest.mock('@/hooks/queries/use-notifications-query', () => ({
  useNotificationCountsQuery: () => ({ data: { total: 0, unread: 0, byType: {} } }),
}));

import NotificationsPage from '@/app/notifications/page';

describe('/notifications — chargement d’un onglet au cache vide', () => {
  beforeEach(() => {
    managerState.notifications = [];
    managerState.isLoading = true;
  });

  it('garde les onglets et la recherche à l’écran pendant que la liste charge', () => {
    render(<NotificationsPage />);

    expect(screen.getByTestId('notification-skeleton')).toBeInTheDocument();
    // Les onglets : ce sont eux que le lecteur vient de toucher.
    expect(screen.getByText('filters.mentions')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('search')).toBeInTheDocument();
  });

  it('rend la liste, et plus le squelette, une fois la page servie', () => {
    managerState.isLoading = false;
    managerState.notifications = [{ id: 'n1' }];

    render(<NotificationsPage />);

    expect(screen.getByTestId('notification-list')).toBeInTheDocument();
    expect(screen.queryByTestId('notification-skeleton')).not.toBeInTheDocument();
  });
});
