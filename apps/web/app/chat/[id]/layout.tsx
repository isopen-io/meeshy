import { Metadata } from 'next';
import { ReactNode } from 'react';
import { buildPageMetadata } from '@/lib/i18n/metadata';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || 'https://meeshy.me';
  const { id } = await params; // Next.js 15: params est une Promise

  return buildPageMetadata('chat', {
    url: `${frontendUrl}/chat/${id}`,
    image: `${frontendUrl}/images/meeshy-og-exchange.jpg`,
    canonical: `${frontendUrl}/chat/${id}`,
  });
}

export default function ChatLayout({ children }: { children: ReactNode }) {
  return children;
}
