import { Metadata } from 'next';
import { ReactNode } from 'react';
import { buildPageMetadata } from '@/lib/i18n/metadata';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata('partners', {
    url: 'https://meeshy.me/partners',
    image: 'https://meeshy.me/images/meeshy-og-affiliate.jpg',
    canonical: 'https://meeshy.me/partners',
  });
}

export default function PartnersLayout({ children }: { children: ReactNode }) {
  return children;
}
