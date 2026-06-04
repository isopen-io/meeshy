import { Metadata } from 'next';
import { AuthGuard } from '@/components/auth';
import { ReactNode } from 'react';
import { buildPageMetadata } from '@/lib/i18n/metadata';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata('conversations', {
    url: 'https://meeshy.me/conversations',
    image: 'https://meeshy.me/images/meeshy-og-conversation.jpg',
    canonical: 'https://meeshy.me/conversations',
  });
}

interface ConversationsLayoutProps {
  children: ReactNode;
}

export default function ConversationsLayout({
  children
}: ConversationsLayoutProps) {
  return (
    <AuthGuard>
      {children}
    </AuthGuard>
  );
}
