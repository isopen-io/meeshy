import { Metadata } from 'next';
import { ReactNode } from 'react';
import { buildPageMetadata } from '@/lib/i18n/metadata';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata('settings', {
    url: 'https://meeshy.me/settings',
    image: 'https://meeshy.me/images/meeshy-og-settings.jpg',
    canonical: 'https://meeshy.me/settings',
  });
}

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return children;
}
