'use client';

import Link from 'next/link';
import { 
  MessageSquare,
  Youtube,
  Twitter,
  Linkedin,
  Instagram
} from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';

export function Footer() {
  const { t } = useI18n('landing');

  // Fallback values in case translations are not loaded
  const tagline = t('footer.tagline') || 'Breaking language barriers, one conversation at a time';
  const copyright = t('footer.copyright') || '© 2025 Meeshy. All rights reserved.';
  const aboutText = t('footer.links.about') || 'About';
  const termsText = t('footer.links.terms') || 'Terms';
  const contactText = t('footer.links.contact') || 'Contact';
  const policyText = t('footer.links.policy') || 'Privacy Policy';
  const partnersText = t('footer.links.partners') || 'Partners';

  return (
    <footer className="bg-gray-900 text-white py-12">
      <div className="container mx-auto px-4">
        <div className="grid md:grid-cols-2 gap-8">
          {/* Logo, Tagline et Copyright */}
          <div className="text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start space-x-2 mb-4">
              <div className="h-8 w-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded flex items-center justify-center">
                <MessageSquare className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-bold">Meeshy</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-2 space-y-1 sm:space-y-0">
              <p className="text-gray-300 text-lg">
                {tagline}
              </p>
              <span className="text-gray-400 hidden sm:inline">•</span>
              <p className="text-gray-400">
                {copyright}
              </p>
            </div>
          </div>

          {/* Liens et Réseaux Sociaux */}
          <div className="text-center md:text-right">
            {/* Liens Utiles */}
            <div className="mb-6">
                <div className="flex flex-wrap justify-center md:justify-end gap-x-6 gap-y-2">
                  <Link href="/about" className="text-gray-300 hover:text-white transition-colors">
                    {aboutText}
                  </Link>
                  <Link href="/terms" className="text-gray-300 hover:text-white transition-colors">
                    {termsText}
                  </Link>
                  <Link href="/contact" className="text-gray-300 hover:text-white transition-colors">
                    {contactText}
                  </Link>
                  <Link href="/privacy" className="text-gray-300 hover:text-white transition-colors">
                    {policyText}
                  </Link>
                  <Link href="/partners" className="text-gray-300 hover:text-white transition-colors">
                    {partnersText}
                  </Link>
                </div>
            </div>

            {/* Réseaux Sociaux */}
            <div>
              <div className="flex justify-center md:justify-end space-x-4">
                <a 
                  href="https://youtube.com/@meeshy" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-red-500 transition-colors"
                  aria-label="YouTube"
                >
                  <Youtube className="h-6 w-6" />
                </a>
                <a 
                  href="https://x.com/meeshy" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-white transition-colors"
                  aria-label="X (Twitter)"
                >
                  <Twitter className="h-6 w-6" />
                </a>
                <a 
                  href="https://linkedin.com/company/meeshy" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-blue-400 transition-colors"
                  aria-label="LinkedIn"
                >
                  <Linkedin className="h-6 w-6" />
                </a>
                <a 
                  href="https://instagram.com/meeshy" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-pink-500 transition-colors"
                  aria-label="Instagram"
                >
                  <Instagram className="h-6 w-6" />
                </a>
                <a 
                  href="https://tiktok.com/@meeshy" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-white transition-colors"
                  aria-label="TikTok"
                >
                  <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
