import { Metadata } from 'next';
import { ReactNode } from 'react';
import { buildPageMetadata } from '@/lib/i18n/metadata';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata('terms', {
    url: 'https://meeshy.me/terms',
    image: 'https://meeshy.me/images/meeshy-og-default.jpg',
    canonical: 'https://meeshy.me/terms',
  });
}

export default function TermsLayout({ children }: { children: ReactNode }) {
  return children;
}
