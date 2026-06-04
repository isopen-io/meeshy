import { Metadata } from 'next';
import { ReactNode } from 'react';
import { buildPageMetadata } from '@/lib/i18n/metadata';

export async function generateMetadata({ params }: { params: Promise<{ identifier: string }> }): Promise<Metadata> {
  const frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || 'https://meeshy.me';
  const { identifier } = await params; // Next.js 15: params est une Promise

  // TODO: récupérer les infos du groupe via l'API pour personnaliser les meta tags.
  return buildPageMetadata('groupDetail', {
    url: `${frontendUrl}/groups/${identifier}`,
    image: `${frontendUrl}/images/meeshy-og-group.jpg`,
    canonical: `${frontendUrl}/groups/${identifier}`,
  });
}

export default function GroupLayout({ children }: { children: ReactNode }) {
  return children;
}
