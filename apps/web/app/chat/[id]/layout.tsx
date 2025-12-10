import { Metadata } from 'next';
import { ReactNode } from 'react';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || 'https://meeshy.me';
  const { id } = await params; // Next.js 15: params est une Promise

  return {
    title: 'Discussion - Meeshy',
    description: 'Discutez en temps réel avec traduction automatique. Échangez des messages dans votre langue maternelle sans barrière linguistique.',
    openGraph: {
      type: 'website',
      locale: 'fr_FR',
      url: `${frontendUrl}/chat/${id}`,
      siteName: 'Meeshy',
      title: 'Discussion en temps réel - Meeshy',
      description: 'Discutez en temps réel avec traduction automatique. Échangez des messages dans votre langue maternelle sans barrière linguistique.',
      images: [
        {
          url: `${frontendUrl}/images/meeshy-og-exchange.jpg`,
          width: 1200,
          height: 630,
          alt: 'Discussion Meeshy',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Discussion en temps réel - Meeshy',
      description: 'Discutez en temps réel avec traduction automatique.',
      images: [`${frontendUrl}/images/meeshy-og-exchange.jpg`],
      creator: '@meeshy_app',
    },
    alternates: {
      canonical: `${frontendUrl}/chat/${id}`,
    },
  };
}

export default function ChatLayout({ children }: { children: ReactNode }) {
  return children;
}
