import { Metadata } from 'next';
import { ReactNode } from 'react';
import { buildPageMetadata } from '@/lib/i18n/metadata';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata('about', {
    url: 'https://meeshy.me/about',
    image: 'https://meeshy.me/images/meeshy-og-default.jpg',
    canonical: 'https://meeshy.me/about',
  });
}

export default function AboutLayout({ children }: { children: ReactNode }) {
  return children;
}
