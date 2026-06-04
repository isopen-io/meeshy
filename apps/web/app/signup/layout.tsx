import { Metadata } from 'next';
import { ReactNode } from 'react';
import { buildPageMetadata } from '@/lib/i18n/metadata';
import { getOgImageUrl } from '@/lib/og-images';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata('signup', {
    url: '/signup',
    image: getOgImageUrl('signin'),
    canonical: '/signup',
  });
}

export default function SignupLayout({ children }: { children: ReactNode }) {
  return children;
}
