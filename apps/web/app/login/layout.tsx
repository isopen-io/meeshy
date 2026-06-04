import { Metadata } from 'next';
import { ReactNode } from 'react';
import { buildPageMetadata } from '@/lib/i18n/metadata';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata('login', {
    url: 'https://meeshy.me/login',
    image: 'https://meeshy.me/images/meeshy-og-login.jpg',
    canonical: 'https://meeshy.me/login',
  });
}

export default function LoginLayout({ children }: { children: ReactNode }) {
  return children;
}
