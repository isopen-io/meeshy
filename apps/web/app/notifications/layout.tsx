import { Metadata } from 'next';
import { ReactNode } from 'react';
import { buildPageMetadata } from '@/lib/i18n/metadata';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata('notifications', {
    url: 'https://meeshy.me/notifications',
    image: 'https://meeshy.me/images/meeshy-og-notification.jpg',
    canonical: 'https://meeshy.me/notifications',
  });
}

export default function NotificationsLayout({ children }: { children: ReactNode }) {
  return children;
}
