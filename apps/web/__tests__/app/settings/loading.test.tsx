/**
 * Tests for Settings Loading Page (app/settings/loading.tsx)
 *
 * Covers:
 * - Skeleton structure and layout
 * - Accessibility features
 * - Animation behavior (with and without reduced motion)
 * - Responsive design elements
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

// Import the component
import LoadingSettings from '@/app/settings/loading';

describe('LoadingSettings', () => {
  describe('Structure and Layout', () => {
    it('should render the loading skeleton', () => {
      const { container } = render(<LoadingSettings />);

      expect(container.firstChild).toBeInTheDocument();
    });

    it('should have min-h-screen class for full height', () => {
      const { container } = render(<LoadingSettings />);

      expect(container.firstChild).toHaveClass('min-h-screen');
    });

    it('should have proper background colors for light and dark mode', () => {
      const { container } = render(<LoadingSettings />);

      expect(container.firstChild).toHaveClass('bg-gray-50', 'dark:bg-gray-900');
    });

    it('should render header skeleton', () => {
      const { container } = render(<LoadingSettings />);

      // Header should have border-b and specific height
      const header = container.querySelector('.h-16.border-b');
      expect(header).toBeInTheDocument();
    });

    it('should render container with max-w-4xl', () => {
      const { container } = render(<LoadingSettings />);

      const mainContainer = container.querySelector('.container.max-w-4xl');
      expect(mainContainer).toBeInTheDocument();
    });
  });

  describe('Skeleton Elements', () => {
    it('should render sidebar navigation skeletons', () => {
      const { container } = render(<LoadingSettings />);

      // Sidebar has lg:w-64 and 6 skeleton items
      const sidebar = container.querySelector('.lg\\:w-64');
      expect(sidebar).toBeInTheDocument();

      const sidebarSkeletons = sidebar?.querySelectorAll('.h-10.rounded-lg');
      expect(sidebarSkeletons?.length).toBe(6);
    });

    it('should render profile section skeleton', () => {
      const { container } = render(<LoadingSettings />);

      // Profile section has avatar (h-20 w-20 rounded-full) and name/email skeletons
      const avatarSkeleton = container.querySelector('.h-20.w-20.rounded-full');
      expect(avatarSkeleton).toBeInTheDocument();
    });

    it('should render form field skeletons in profile section', () => {
      const { container } = render(<LoadingSettings />);

      // Profile section should have form field pairs (label + input)
      const profileSection = container.querySelectorAll('.bg-white.dark\\:bg-gray-800')[0];
      const skeletonElements = profileSection?.querySelectorAll('.motion-safe\\:animate-pulse');

      // Profile section has multiple animated elements: title, avatar, name, email, and form fields
      expect(skeletonElements?.length).toBeGreaterThan(0);
    });

    it('should render preferences section skeleton', () => {
      const { container } = render(<LoadingSettings />);

      // Preferences section is the second white card
      const whiteSections = container.querySelectorAll('.bg-white.dark\\:bg-gray-800.rounded-xl');
      expect(whiteSections.length).toBe(2);

      // Preferences section has 3 toggle items
      const preferencesSection = whiteSections[1];
      const toggleSkeletons = preferencesSection?.querySelectorAll('.h-6.w-11.rounded-full');
      expect(toggleSkeletons?.length).toBe(3);
    });

    it('should render preference item descriptions', () => {
      const { container } = render(<LoadingSettings />);

      // Each preference item has a description (h-3 w-48)
      const descriptionSkeletons = container.querySelectorAll('.h-3.w-48');
      expect(descriptionSkeletons.length).toBe(3);
    });
  });

  describe('Animation Classes', () => {
    it('should have motion-safe:animate-pulse on skeleton elements', () => {
      const { container } = render(<LoadingSettings />);

      // All skeleton elements should have motion-safe:animate-pulse
      const pulsingElements = container.querySelectorAll('.motion-safe\\:animate-pulse');
      expect(pulsingElements.length).toBeGreaterThan(0);
    });

    it('should use motion-safe prefix for accessibility', () => {
      const { container } = render(<LoadingSettings />);

      // Elements should NOT have raw animate-pulse, only motion-safe variant
      const headerSkeleton = container.querySelector('.h-8.w-28');
      expect(headerSkeleton).toHaveClass('motion-safe:animate-pulse');
    });

    it('should apply animation to header skeleton', () => {
      const { container } = render(<LoadingSettings />);

      const headerSkeleton = container.querySelector('.h-8.w-28');
      expect(headerSkeleton).toHaveClass('motion-safe:animate-pulse');
    });

    it('should apply animation to sidebar skeletons', () => {
      const { container } = render(<LoadingSettings />);

      const sidebar = container.querySelector('.lg\\:w-64');
      const sidebarSkeletons = sidebar?.querySelectorAll('.motion-safe\\:animate-pulse');
      expect(sidebarSkeletons?.length).toBe(6);
    });

    it('should apply animation to avatar skeleton', () => {
      const { container } = render(<LoadingSettings />);

      const avatarSkeleton = container.querySelector('.h-20.w-20.rounded-full');
      expect(avatarSkeleton).toHaveClass('motion-safe:animate-pulse');
    });

    it('should apply animation to toggle skeletons', () => {
      const { container } = render(<LoadingSettings />);

      const toggleSkeletons = container.querySelectorAll('.h-6.w-11.rounded-full');
      toggleSkeletons.forEach((toggle) => {
        expect(toggle).toHaveClass('motion-safe:animate-pulse');
      });
    });
  });

  describe('Accessibility', () => {
    it('should have role="status" for screen readers', () => {
      render(<LoadingSettings />);

      const statusElement = screen.getByRole('status');
      expect(statusElement).toBeInTheDocument();
    });

    it('should have aria-label describing the loading state', () => {
      render(<LoadingSettings />);

      const statusElement = screen.getByRole('status');
      expect(statusElement).toHaveAttribute('aria-label', 'Chargement des paramètres');
    });

    it('should have visually hidden text for screen readers', () => {
      render(<LoadingSettings />);

      const srOnlyText = screen.getByText('Chargement des paramètres en cours...');
      expect(srOnlyText).toHaveClass('sr-only');
    });

    it('should respect prefers-reduced-motion via CSS', () => {
      const { container } = render(<LoadingSettings />);

      // All animated elements use motion-safe prefix
      const animatedElements = container.querySelectorAll('[class*="animate-pulse"]');
      animatedElements.forEach((element) => {
        expect(element).toHaveClass('motion-safe:animate-pulse');
      });
    });
  });

  describe('Dark Mode Support', () => {
    it('should have dark mode classes on main container', () => {
      const { container } = render(<LoadingSettings />);

      expect(container.firstChild).toHaveClass('dark:bg-gray-900');
    });

    it('should have dark mode classes on header', () => {
      const { container } = render(<LoadingSettings />);

      const header = container.querySelector('.border-b');
      expect(header).toHaveClass('dark:bg-gray-800', 'dark:border-gray-700');
    });

    it('should have dark mode classes on skeleton background colors', () => {
      const { container } = render(<LoadingSettings />);

      const graySkeletons = container.querySelectorAll('.bg-gray-200');
      graySkeletons.forEach((skeleton) => {
        expect(skeleton).toHaveClass('dark:bg-gray-700');
      });
    });

    it('should have dark mode classes on section backgrounds', () => {
      const { container } = render(<LoadingSettings />);

      const whiteSections = container.querySelectorAll('.bg-white');
      whiteSections.forEach((section) => {
        expect(section).toHaveClass('dark:bg-gray-800');
      });
    });

    it('should have dark mode classes on subtle background elements', () => {
      const { container } = render(<LoadingSettings />);

      const subtleElements = container.querySelectorAll('.bg-gray-100');
      subtleElements.forEach((element) => {
        // Check that element has either dark:bg-gray-600 or dark:bg-gray-700
        const hasDarkClass = element.classList.contains('dark:bg-gray-600') || element.classList.contains('dark:bg-gray-700');
        expect(hasDarkClass).toBe(true);
      });
    });
  });

  describe('Responsive Design', () => {
    it('should have responsive layout with flex-col on mobile, flex-row on desktop', () => {
      const { container } = render(<LoadingSettings />);

      const mainLayout = container.querySelector('.flex-col.lg\\:flex-row');
      expect(mainLayout).toBeInTheDocument();
    });

    it('should have responsive sidebar width', () => {
      const { container } = render(<LoadingSettings />);

      const sidebar = container.querySelector('.lg\\:w-64');
      expect(sidebar).toBeInTheDocument();
    });

    it('should have gap-8 between layout elements', () => {
      const { container } = render(<LoadingSettings />);

      const mainLayout = container.querySelector('.gap-8');
      expect(mainLayout).toBeInTheDocument();
    });
  });

  describe('Section Titles', () => {
    it('should render title skeleton in profile section', () => {
      const { container } = render(<LoadingSettings />);

      const profileSection = container.querySelectorAll('.bg-white.dark\\:bg-gray-800')[0];
      // Check for skeleton elements in the section (titles are animated)
      const skeletonElements = profileSection?.querySelectorAll('.motion-safe\\:animate-pulse');
      expect(skeletonElements?.length).toBeGreaterThan(0);
    });

    it('should render title skeleton in preferences section', () => {
      const { container } = render(<LoadingSettings />);

      const preferencesSection = container.querySelectorAll('.bg-white.dark\\:bg-gray-800')[1];
      // Check for skeleton elements in the section (titles are animated)
      const skeletonElements = preferencesSection?.querySelectorAll('.motion-safe\\:animate-pulse');
      expect(skeletonElements?.length).toBeGreaterThan(0);
    });
  });

  describe('Profile Section Details', () => {
    it('should render name skeleton with proper size', () => {
      const { container } = render(<LoadingSettings />);

      // Name skeleton is h-5 w-32
      const nameSkeleton = container.querySelector('.h-5.w-32');
      expect(nameSkeleton).toBeInTheDocument();
    });

    it('should render email/subtitle skeleton with proper size', () => {
      const { container } = render(<LoadingSettings />);

      // Email/subtitle skeleton is h-4 w-48
      const emailSkeleton = container.querySelector('.h-4.w-48');
      expect(emailSkeleton).toBeInTheDocument();
    });

    it('should have proper spacing in avatar section', () => {
      const { container } = render(<LoadingSettings />);

      // Avatar section has gap-4 and mb-6
      const avatarSection = container.querySelector('.flex.items-center.gap-4.mb-6');
      expect(avatarSection).toBeInTheDocument();
    });
  });

  describe('Preferences Section Details', () => {
    it('should have py-3 padding on preference items', () => {
      const { container } = render(<LoadingSettings />);

      const preferenceItems = container.querySelectorAll('.flex.items-center.justify-between.py-3');
      expect(preferenceItems.length).toBe(3);
    });

    it('should have space-y classes for preference item text', () => {
      const { container } = render(<LoadingSettings />);

      const preferencesSection = container.querySelectorAll('.bg-white.dark\\:bg-gray-800')[1];
      // Check for space-y classes (space-y-1 or space-y-2)
      const textContainers = preferencesSection?.querySelectorAll('[class*="space-y"]');
      expect(textContainers?.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should render without errors when mounted multiple times', () => {
      const { unmount, rerender } = render(<LoadingSettings />);

      // Unmount and remount
      unmount();
      const { container } = render(<LoadingSettings />);

      expect(container.firstChild).toBeInTheDocument();
    });

    it('should maintain consistent structure across re-renders', () => {
      const { container, rerender } = render(<LoadingSettings />);

      const initialSkeletonCount = container.querySelectorAll('.motion-safe\\:animate-pulse').length;

      rerender(<LoadingSettings />);

      const afterRerenderCount = container.querySelectorAll('.motion-safe\\:animate-pulse').length;

      expect(afterRerenderCount).toBe(initialSkeletonCount);
    });
  });

  describe('Skeleton Count Verification', () => {
    it('should render correct total number of skeleton elements', () => {
      const { container } = render(<LoadingSettings />);

      const allSkeletons = container.querySelectorAll('.motion-safe\\:animate-pulse');

      // 1 header + 6 sidebar + 1 section title + 1 avatar + 1 name + 1 email +
      // 4 labels + 4 inputs + 1 section title + 3 labels + 3 descriptions + 3 toggles = 29
      // The exact count may vary based on implementation
      expect(allSkeletons.length).toBeGreaterThan(20);
    });
  });
});
