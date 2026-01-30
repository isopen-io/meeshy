import { Metadata } from 'next';
import { AuthGuard } from '@/components/auth';
import { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Conversations - Meeshy',
  description: 'Accédez à vos conversations multilingues en temps réel. Discutez avec vos contacts dans leur langue maternelle grâce à la traduction automatique.',
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    url: 'https://meeshy.me/conversations',
    siteName: 'Meeshy',
    title: 'Conversations - Meeshy',
    description: 'Accédez à vos conversations multilingues en temps réel. Discutez avec vos contacts dans leur langue maternelle grâce à la traduction automatique.',
    images: [
      {
        url: 'https://meeshy.me/images/meeshy-og-conversation.jpg',
        width: 1200,
        height: 630,
        alt: 'Conversations Meeshy',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Conversations - Meeshy',
    description: 'Accédez à vos conversations multilingues en temps réel.',
    images: ['https://meeshy.me/images/meeshy-og-conversation.jpg'],
    creator: '@meeshy_app',
  },
  alternates: {
    canonical: 'https://meeshy.me/conversations',
  },
};

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
