'use client';

import { HTMLAttributes, useState, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';

export interface ImageItem {
  /** Image URL */
  url: string;
  /** Alt text for accessibility */
  alt?: string;
  /** Original width of the image */
  width?: number;
  /** Original height of the image */
  height?: number;
}

export interface ImageGalleryProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onClick'> {
  /** Array of images to display */
  images: ImageItem[];
  /** Maximum number of visible images (default: 4) */
  maxVisible?: number;
  /** Callback when an image is clicked */
  onImageClick?: (image: ImageItem, index: number) => void;
}

// Close icon for lightbox
function CloseIcon({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

// Chevron icons for navigation
function ChevronLeftIcon({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function ChevronRightIcon({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

export function ImageGallery({
  images,
  maxVisible = 4,
  onImageClick,
  className,
  ...props
}: ImageGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const isLightboxOpen = lightboxIndex !== null;

  const visibleImages = images.slice(0, maxVisible);
  const remainingCount = images.length - maxVisible;
  const hasMore = remainingCount > 0;

  // Handle image click
  const handleImageClick = useCallback((index: number) => {
    const image = images[index];
    if (onImageClick) {
      onImageClick(image, index);
    }
    setLightboxIndex(index);
  }, [images, onImageClick]);

  // Lightbox navigation
  const goToPrevious = useCallback(() => {
    if (lightboxIndex === null) return;
    setLightboxIndex(lightboxIndex === 0 ? images.length - 1 : lightboxIndex - 1);
  }, [lightboxIndex, images.length]);

  const goToNext = useCallback(() => {
    if (lightboxIndex === null) return;
    setLightboxIndex(lightboxIndex === images.length - 1 ? 0 : lightboxIndex + 1);
  }, [lightboxIndex, images.length]);

  const closeLightbox = useCallback(() => {
    setLightboxIndex(null);
  }, []);

  // Keyboard navigation for lightbox
  useEffect(() => {
    if (!isLightboxOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          closeLightbox();
          break;
        case 'ArrowLeft':
          goToPrevious();
          break;
        case 'ArrowRight':
          goToNext();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    // Prevent body scroll when lightbox is open
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isLightboxOpen, closeLightbox, goToPrevious, goToNext]);

  // Return null if no images
  if (!images || images.length === 0) {
    return null;
  }

  // Single image layout
  const renderSingleImage = () => (
    <button
      type="button"
      onClick={() => handleImageClick(0)}
      className="w-full overflow-hidden focus:outline-none focus:ring-2 focus:ring-[var(--gp-terracotta)] focus:ring-offset-2 transition-transform duration-300 hover:scale-[1.02] rounded-lg"
    >
      <img
        src={images[0].url}
        alt={images[0].alt || 'Image'}
        className="w-full h-auto object-cover rounded-lg max-h-[400px]"
        loading="lazy"
      />
    </button>
  );

  // Two images layout (side by side)
  const renderTwoImages = () => (
    <div className="grid grid-cols-2 gap-1 rounded-lg overflow-hidden">
      {visibleImages.map((image, index) => (
        <button
          key={`${image.url}-${index}`}
          type="button"
          onClick={() => handleImageClick(index)}
          className="aspect-square overflow-hidden focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--gp-terracotta)] transition-transform duration-300 hover:scale-[1.02]"
        >
          <img
            src={image.url}
            alt={image.alt || `Image ${index + 1}`}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </button>
      ))}
    </div>
  );

  // Three images layout (1 large + 2 small)
  const renderThreeImages = () => (
    <div className="grid grid-cols-2 gap-1 rounded-lg overflow-hidden">
      {/* Large image on the left */}
      <button
        type="button"
        onClick={() => handleImageClick(0)}
        className="row-span-2 overflow-hidden focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--gp-terracotta)] transition-transform duration-300 hover:scale-[1.02]"
      >
        <img
          src={visibleImages[0].url}
          alt={visibleImages[0].alt || 'Image 1'}
          className="w-full h-full object-cover min-h-[200px]"
          loading="lazy"
        />
      </button>
      {/* Two smaller images on the right */}
      {visibleImages.slice(1, 3).map((image, index) => (
        <button
          key={`${image.url}-${index + 1}`}
          type="button"
          onClick={() => handleImageClick(index + 1)}
          className="aspect-square overflow-hidden focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--gp-terracotta)] transition-transform duration-300 hover:scale-[1.02]"
        >
          <img
            src={image.url}
            alt={image.alt || `Image ${index + 2}`}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </button>
      ))}
    </div>
  );

  // Four or more images layout (2x2 grid with counter)
  const renderGridImages = () => (
    <div className="grid grid-cols-2 gap-1 rounded-lg overflow-hidden">
      {visibleImages.map((image, index) => {
        const isLastVisible = index === maxVisible - 1;
        const showCounter = isLastVisible && hasMore;

        return (
          <button
            key={`${image.url}-${index}`}
            type="button"
            onClick={() => handleImageClick(index)}
            className="aspect-square overflow-hidden relative focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--gp-terracotta)] transition-transform duration-300 hover:scale-[1.02]"
          >
            <img
              src={image.url}
              alt={image.alt || `Image ${index + 1}`}
              className="w-full h-full object-cover"
              loading="lazy"
            />
            {/* Counter overlay for remaining images */}
            {showCounter && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <span className="text-2xl font-semibold text-white font-[var(--gp-font-display)]">
                  +{remainingCount}
                </span>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );

  // Determine which layout to render
  const renderGallery = () => {
    const count = images.length;
    if (count === 1) return renderSingleImage();
    if (count === 2) return renderTwoImages();
    if (count === 3) return renderThreeImages();
    return renderGridImages();
  };

  return (
    <>
      <div className={cn('w-full', className)} {...props}>
        {renderGallery()}
      </div>

      {/* Lightbox Modal */}
      {isLightboxOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.9)' }}
          onClick={closeLightbox}
          role="dialog"
          aria-modal="true"
          aria-label="Image lightbox"
        >
          {/* Close button */}
          <button
            type="button"
            onClick={closeLightbox}
            className="absolute top-4 right-4 p-2 text-white/80 hover:text-white transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-white rounded-full"
            aria-label="Close lightbox"
          >
            <CloseIcon className="w-8 h-8" />
          </button>

          {/* Image counter */}
          <div className="absolute top-4 left-4 px-3 py-1 rounded-full text-white/80 text-sm bg-white/10">
            {lightboxIndex + 1} / {images.length}
          </div>

          {/* Previous button */}
          {images.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                goToPrevious();
              }}
              className="absolute left-4 p-2 text-white/80 hover:text-white transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-white rounded-full bg-white/10"
              aria-label="Previous image"
            >
              <ChevronLeftIcon />
            </button>
          )}

          {/* Current image */}
          <img
            src={images[lightboxIndex].url}
            alt={images[lightboxIndex].alt || `Image ${lightboxIndex + 1}`}
            className="max-w-[90vw] max-h-[85vh] object-contain rounded-md"
            onClick={(e) => e.stopPropagation()}
          />

          {/* Next button */}
          {images.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                goToNext();
              }}
              className="absolute right-4 p-2 text-white/80 hover:text-white transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-white rounded-full bg-white/10"
              aria-label="Next image"
            >
              <ChevronRightIcon />
            </button>
          )}

          {/* Thumbnail strip at bottom */}
          {images.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 px-4 py-2 rounded-full bg-white/10">
              {images.map((image, index) => (
                <button
                  key={`thumb-${image.url}-${index}`}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setLightboxIndex(index);
                  }}
                  className={cn(
                    'w-12 h-12 rounded-md overflow-hidden transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-white',
                    index === lightboxIndex
                      ? 'ring-2 ring-white scale-110'
                      : 'opacity-60 hover:opacity-100'
                  )}
                  aria-label={`View image ${index + 1}`}
                >
                  <img
                    src={image.url}
                    alt={image.alt || `Thumbnail ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
