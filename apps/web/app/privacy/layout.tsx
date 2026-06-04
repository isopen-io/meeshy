import { Metadata } from 'next';
import { ReactNode } from 'react';
import { buildPageMetadata } from '@/lib/i18n/metadata';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata('privacy', {
    url: 'https://meeshy.me/privacy',
    image: 'https://meeshy.me/images/meeshy-og-default.jpg',
    canonical: 'https://meeshy.me/privacy',
  });
}

export default function PrivacyLayout({ children }: { children: ReactNode }) {
  return children;
}
