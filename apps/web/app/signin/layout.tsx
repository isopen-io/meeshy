import { Metadata } from 'next';
import { ReactNode } from 'react';

// Redirection vers /signup - ce layout est gardé pour la rétrocompatibilité
export const metadata: Metadata = {
  title: 'Inscription - Meeshy',
  description: 'Créez votre compte Meeshy et rejoignez la communauté mondiale de messagerie multilingue en temps réel.',
  robots: {
    index: false, // Ne pas indexer - redirection vers /signup
    follow: true,
  },
  alternates: {
    canonical: '/signup',
  },
};

export default function SigninLayout({ children }: { children: ReactNode }) {
  return children;
}
