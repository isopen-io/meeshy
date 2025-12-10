import { Metadata } from 'next';
import { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Notifications - Meeshy',
  description: 'Consultez vos notifications Meeshy. Restez informé des nouveaux messages, mentions et activités dans vos conversations multilingues.',
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    url: 'https://meeshy.me/notifications',
    siteName: 'Meeshy',
    title: 'Notifications - Meeshy',
    description: 'Consultez vos notifications Meeshy. Restez informé des nouveaux messages, mentions et activités dans vos conversations multilingues.',
    images: [
      {
        url: 'https://meeshy.me/images/meeshy-og-notification.jpg',
        width: 1200,
        height: 630,
        alt: 'Notifications Meeshy',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Notifications - Meeshy',
    description: 'Consultez vos notifications Meeshy.',
    images: ['https://meeshy.me/images/meeshy-og-notification.jpg'],
    creator: '@meeshy_app',
  },
  alternates: {
    canonical: 'https://meeshy.me/notifications',
  },
};

export default function NotificationsLayout({ children }: { children: ReactNode }) {
  return children;
}
