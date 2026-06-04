import { Metadata } from 'next';
import { ReactNode } from 'react';
import { buildPageMetadata } from '@/lib/i18n/metadata';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata('groups', {
    url: 'https://meeshy.me/groups',
    image: 'https://meeshy.me/images/meeshy-og-community.jpg',
    canonical: 'https://meeshy.me/groups',
  });
}

export default function GroupsLayout({ children }: { children: ReactNode }) {
  return children;
}
