/**
 * CAROUSEL NAVIGATION
 * Left/Right scroll buttons for effect carousel
 */

'use client';

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface CarouselNavigationProps {
  containerId: string;
  scrollAmount?: number;
}

export const CarouselNavigation = React.memo<CarouselNavigationProps>(({
  containerId,
  scrollAmount = 200,
}) => {
  const scrollLeft = () => {
    const container = document.getElementById(containerId);
    if (container) {
      container.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
    }
  };

  const scrollRight = () => {
    const container = document.getElementById(containerId);
    if (container) {
      container.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  return (
    <>
      <button
        onClick={scrollLeft}
        className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 bg-black/80 hover:bg-black rounded-full flex items-center justify-center text-white shadow-lg"
        aria-label="Scroll left"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      <button
        onClick={scrollRight}
        className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 bg-black/80 hover:bg-black rounded-full flex items-center justify-center text-white shadow-lg"
        aria-label="Scroll right"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </>
  );
});

CarouselNavigation.displayName = 'CarouselNavigation';
