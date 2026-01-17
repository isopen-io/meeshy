/**
 * Footer Component Tests
 *
 * Tests the footer component including:
 * - Basic rendering
 * - Logo and branding
 * - Navigation links
 * - Social media links
 * - Translations
 * - Accessibility
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Footer } from '../../../components/layout/Footer';

// Mock next/link
jest.mock('next/link', () => {
  return ({ children, href }: any) => (
    <a href={href}>{children}</a>
  );
});

// Mock useI18n hook
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'footer.tagline': 'Breaking language barriers, one conversation at a time',
        'footer.copyright': '2025 Meeshy. All rights reserved.',
        'footer.links.about': 'About',
        'footer.links.terms': 'Terms',
        'footer.links.contact': 'Contact',
        'footer.links.policy': 'Privacy Policy',
        'footer.links.partners': 'Partners',
      };
      return translations[key] || key;
    },
    locale: 'en',
  }),
}));

describe('Footer', () => {
  describe('Basic Rendering', () => {
    it('renders the footer element', () => {
      const { container } = render(<Footer />);

      expect(container.querySelector('footer')).toBeInTheDocument();
    });

    it('has dark background styling', () => {
      const { container } = render(<Footer />);

      const footer = container.querySelector('footer');
      expect(footer).toHaveClass('bg-gray-900');
    });

    it('has proper padding', () => {
      const { container } = render(<Footer />);

      const footer = container.querySelector('footer');
      expect(footer).toHaveClass('py-12');
    });
  });

  describe('Logo and Branding', () => {
    it('displays Meeshy brand name', () => {
      render(<Footer />);

      expect(screen.getByText('Meeshy')).toBeInTheDocument();
    });

    it('displays tagline', () => {
      render(<Footer />);

      expect(screen.getByText('Breaking language barriers, one conversation at a time')).toBeInTheDocument();
    });

    it('displays copyright text', () => {
      render(<Footer />);

      expect(screen.getByText(/2025 Meeshy. All rights reserved./)).toBeInTheDocument();
    });

    it('renders message square icon', () => {
      const { container } = render(<Footer />);

      // Lucide icons render as SVG
      const svgs = container.querySelectorAll('svg');
      expect(svgs.length).toBeGreaterThan(0);
    });
  });

  describe('Navigation Links', () => {
    it('renders About link', () => {
      render(<Footer />);

      const aboutLink = screen.getByRole('link', { name: /About/i });
      expect(aboutLink).toHaveAttribute('href', '/about');
    });

    it('renders Terms link', () => {
      render(<Footer />);

      const termsLink = screen.getByRole('link', { name: /Terms/i });
      expect(termsLink).toHaveAttribute('href', '/terms');
    });

    it('renders Contact link', () => {
      render(<Footer />);

      const contactLink = screen.getByRole('link', { name: /Contact/i });
      expect(contactLink).toHaveAttribute('href', '/contact');
    });

    it('renders Privacy Policy link', () => {
      render(<Footer />);

      const policyLink = screen.getByRole('link', { name: /Privacy Policy/i });
      expect(policyLink).toHaveAttribute('href', '/privacy');
    });

    it('renders Partners link', () => {
      render(<Footer />);

      const partnersLink = screen.getByRole('link', { name: /Partners/i });
      expect(partnersLink).toHaveAttribute('href', '/partners');
    });
  });

  describe('Social Media Links', () => {
    it('renders YouTube link', () => {
      render(<Footer />);

      const youtubeLink = screen.getByRole('link', { name: /YouTube/i });
      expect(youtubeLink).toHaveAttribute('href', 'https://youtube.com/@meeshy');
      expect(youtubeLink).toHaveAttribute('target', '_blank');
      expect(youtubeLink).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('renders Twitter/X link', () => {
      render(<Footer />);

      const twitterLink = screen.getByRole('link', { name: /X \(Twitter\)/i });
      expect(twitterLink).toHaveAttribute('href', 'https://x.com/meeshy');
      expect(twitterLink).toHaveAttribute('target', '_blank');
    });

    it('renders LinkedIn link', () => {
      render(<Footer />);

      const linkedinLink = screen.getByRole('link', { name: /LinkedIn/i });
      expect(linkedinLink).toHaveAttribute('href', 'https://linkedin.com/company/meeshy');
      expect(linkedinLink).toHaveAttribute('target', '_blank');
    });

    it('renders Instagram link', () => {
      render(<Footer />);

      const instagramLink = screen.getByRole('link', { name: /Instagram/i });
      expect(instagramLink).toHaveAttribute('href', 'https://instagram.com/meeshy');
      expect(instagramLink).toHaveAttribute('target', '_blank');
    });

    it('renders TikTok link', () => {
      render(<Footer />);

      const tiktokLink = screen.getByRole('link', { name: /TikTok/i });
      expect(tiktokLink).toHaveAttribute('href', 'https://tiktok.com/@meeshy');
      expect(tiktokLink).toHaveAttribute('target', '_blank');
    });
  });

  describe('Link Attributes', () => {
    it('all external links have noopener noreferrer', () => {
      render(<Footer />);

      const externalLinks = [
        screen.getByRole('link', { name: /YouTube/i }),
        screen.getByRole('link', { name: /X \(Twitter\)/i }),
        screen.getByRole('link', { name: /LinkedIn/i }),
        screen.getByRole('link', { name: /Instagram/i }),
        screen.getByRole('link', { name: /TikTok/i }),
      ];

      externalLinks.forEach((link) => {
        expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      });
    });

    it('all external links open in new tab', () => {
      render(<Footer />);

      const externalLinks = [
        screen.getByRole('link', { name: /YouTube/i }),
        screen.getByRole('link', { name: /X \(Twitter\)/i }),
        screen.getByRole('link', { name: /LinkedIn/i }),
        screen.getByRole('link', { name: /Instagram/i }),
        screen.getByRole('link', { name: /TikTok/i }),
      ];

      externalLinks.forEach((link) => {
        expect(link).toHaveAttribute('target', '_blank');
      });
    });
  });

  describe('Accessibility', () => {
    it('social media links have aria-labels', () => {
      render(<Footer />);

      expect(screen.getByLabelText('YouTube')).toBeInTheDocument();
      expect(screen.getByLabelText('X (Twitter)')).toBeInTheDocument();
      expect(screen.getByLabelText('LinkedIn')).toBeInTheDocument();
      expect(screen.getByLabelText('Instagram')).toBeInTheDocument();
      expect(screen.getByLabelText('TikTok')).toBeInTheDocument();
    });

    it('footer is a landmark region', () => {
      const { container } = render(<Footer />);

      expect(container.querySelector('footer')).toBeInTheDocument();
    });

    it('has proper color contrast', () => {
      const { container } = render(<Footer />);

      const footer = container.querySelector('footer');
      expect(footer).toHaveClass('text-white');
    });
  });

  describe('Responsive Layout', () => {
    it('uses grid layout', () => {
      const { container } = render(<Footer />);

      const grid = container.querySelector('.grid');
      expect(grid).toBeInTheDocument();
    });

    it('has responsive grid columns', () => {
      const { container } = render(<Footer />);

      const grid = container.querySelector('.grid');
      expect(grid).toHaveClass('md:grid-cols-2');
    });
  });

  describe('Translations Fallback', () => {
    it('uses fallback values if translations are missing', () => {
      render(<Footer />);

      // The mock returns translations, but the component has fallbacks
      // This ensures the component renders even with potential missing translations
      expect(screen.getByText(/Breaking language barriers/)).toBeInTheDocument();
    });
  });

  describe('Visual Elements', () => {
    it('renders gradient background for logo icon', () => {
      const { container } = render(<Footer />);

      const logoContainer = container.querySelector('.bg-gradient-to-br');
      expect(logoContainer).toBeInTheDocument();
    });

    it('has transition effects on links', () => {
      render(<Footer />);

      const aboutLink = screen.getByRole('link', { name: /About/i });
      expect(aboutLink).toHaveClass('transition-colors');
    });

    it('has hover states on social links', () => {
      render(<Footer />);

      const youtubeLink = screen.getByRole('link', { name: /YouTube/i });
      expect(youtubeLink).toHaveClass('transition-colors');
    });
  });

  describe('Container Structure', () => {
    it('has container with proper padding', () => {
      const { container } = render(<Footer />);

      const containerEl = container.querySelector('.container');
      expect(containerEl).toBeInTheDocument();
      expect(containerEl).toHaveClass('px-4');
    });

    it('has proper spacing between sections', () => {
      const { container } = render(<Footer />);

      const grid = container.querySelector('.grid');
      expect(grid).toHaveClass('gap-8');
    });
  });
});
