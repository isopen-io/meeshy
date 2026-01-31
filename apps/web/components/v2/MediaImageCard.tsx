'use client';

import { HTMLAttributes, useState, useCallback, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { getLanguageColor } from './theme';

// ----- Types -----

export interface ImageTranslation {
  languageCode: string;
  languageName: string;
  caption: string;
  isOriginal?: boolean;
}

export interface MediaImageCardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onClick'> {
  /** Array of images to display */
  images: Array<{ src: string; alt?: string }>;
  /** Available caption translations */
  translations: ImageTranslation[];
  /** Default language code to display */
  defaultLanguage?: string;
  /** Name of the sender */
  senderName?: string;
  /** Timestamp string */
  timestamp: string;
  /** Whether this card is from the current user */
  isSent?: boolean;
  /** Maximum number of visible images in grid (default: 4) */
  maxVisible?: number;
}

// ----- Flag Mapping -----

const FLAG_MAP: Record<string, string> = {
  fr: '\u{1F1EB}\u{1F1F7}',
  en: '\u{1F1EC}\u{1F1E7}',
  es: '\u{1F1EA}\u{1F1F8}',
  zh: '\u{1F1E8}\u{1F1F3}',
  ja: '\u{1F1EF}\u{1F1F5}',
  ar: '\u{1F1F8}\u{1F1E6}',
  de: '\u{1F1E9}\u{1F1EA}',
  pt: '\u{1F1E7}\u{1F1F7}',
  ko: '\u{1F1F0}\u{1F1F7}',
  it: '\u{1F1EE}\u{1F1F9}',
  ru: '\u{1F1F7}\u{1F1FA}',
  hi: '\u{1F1EE}\u{1F1F3}',
  nl: '\u{1F1F3}\u{1F1F1}',
  pl: '\u{1F1F5}\u{1F1F1}',
  tr: '\u{1F1F9}\u{1F1F7}',
  vi: '\u{1F1FB}\u{1F1F3}',
  th: '\u{1F1F9}\u{1F1ED}',
  id: '\u{1F1EE}\u{1F1E9}',
  sv: '\u{1F1F8}\u{1F1EA}',
  uk: '\u{1F1FA}\u{1F1E6}',
};

function getFlag(code: string): string {
  const normalized = code.toLowerCase().slice(0, 2);
  return FLAG_MAP[normalized] || '\u{1F310}';
}

// ----- Icons -----

function CloseIcon({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

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

function ChevronDownIcon({ className = 'w-3 h-3', isOpen = false }: { className?: string; isOpen?: boolean }) {
  return (
    <svg
      className={cn(className, 'transition-transform duration-200', isOpen && 'rotate-180')}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function GlobeIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" strokeWidth={1.5} />
      <path
        strokeWidth={1.5}
        d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"
      />
    </svg>
  );
}

// ----- Component -----

export function MediaImageCard({
  images,
  translations,
  defaultLanguage,
  senderName,
  timestamp,
  isSent = false,
  maxVisible = 4,
  className,
  ...props
}: MediaImageCardProps) {
  // Find initial translation
  const initialTranslation = useMemo(() => {
    if (defaultLanguage) {
      const found = translations.find(
        (t) => t.languageCode.toLowerCase() === defaultLanguage.toLowerCase()
      );
      if (found) return found;
    }
    // Fall back to original or first translation
    return translations.find((t) => t.isOriginal) || translations[0];
  }, [translations, defaultLanguage]);

  const [selectedTranslation, setSelectedTranslation] = useState<ImageTranslation>(
    initialTranslation || { languageCode: 'en', languageName: 'English', caption: '' }
  );
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const isLightboxOpen = lightboxIndex !== null;
  const visibleImages = images.slice(0, maxVisible);
  const remainingCount = images.length - maxVisible;
  const hasMore = remainingCount > 0;

  const langColor = getLanguageColor(selectedTranslation.languageCode);

  // Get other available translations (excluding current)
  const otherTranslations = useMemo(() => {
    return translations.filter(
      (t) => t.languageCode.toLowerCase() !== selectedTranslation.languageCode.toLowerCase()
    );
  }, [translations, selectedTranslation.languageCode]);

  // Handlers
  const handleSelectTranslation = useCallback((translation: ImageTranslation) => {
    setSelectedTranslation(translation);
    setShowLanguageMenu(false);
  }, []);

  const handleImageClick = useCallback((index: number) => {
    setLightboxIndex(index);
  }, []);

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

  // ----- Grid Layouts -----

  const renderSingleImage = () => (
    <button
      type="button"
      onClick={() => handleImageClick(0)}
      className="w-full overflow-hidden focus:outline-none focus:ring-2 focus:ring-[var(--gp-terracotta)] focus:ring-offset-2 transition-transform duration-300 hover:scale-[1.01] rounded-lg"
    >
      <img
        src={images[0].src}
        alt={images[0].alt || 'Image'}
        className="w-full h-auto object-cover rounded-lg max-h-[400px]"
        loading="lazy"
      />
    </button>
  );

  const renderTwoImages = () => (
    <div className="grid grid-cols-2 gap-1 rounded-lg overflow-hidden">
      {visibleImages.map((image, index) => (
        <button
          key={`${image.src}-${index}`}
          type="button"
          onClick={() => handleImageClick(index)}
          className="aspect-square overflow-hidden focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--gp-terracotta)] transition-transform duration-300 hover:scale-[1.02]"
        >
          <img
            src={image.src}
            alt={image.alt || `Image ${index + 1}`}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </button>
      ))}
    </div>
  );

  const renderThreeImages = () => (
    <div className="grid grid-cols-2 gap-1 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => handleImageClick(0)}
        className="row-span-2 overflow-hidden focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--gp-terracotta)] transition-transform duration-300 hover:scale-[1.02]"
      >
        <img
          src={visibleImages[0].src}
          alt={visibleImages[0].alt || 'Image 1'}
          className="w-full h-full object-cover min-h-[200px]"
          loading="lazy"
        />
      </button>
      {visibleImages.slice(1, 3).map((image, index) => (
        <button
          key={`${image.src}-${index + 1}`}
          type="button"
          onClick={() => handleImageClick(index + 1)}
          className="aspect-square overflow-hidden focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--gp-terracotta)] transition-transform duration-300 hover:scale-[1.02]"
        >
          <img
            src={image.src}
            alt={image.alt || `Image ${index + 2}`}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </button>
      ))}
    </div>
  );

  const renderGridImages = () => (
    <div className="grid grid-cols-2 gap-1 rounded-lg overflow-hidden">
      {visibleImages.map((image, index) => {
        const isLastVisible = index === maxVisible - 1;
        const showCounter = isLastVisible && hasMore;

        return (
          <button
            key={`${image.src}-${index}`}
            type="button"
            onClick={() => handleImageClick(index)}
            className="aspect-square overflow-hidden relative focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--gp-terracotta)] transition-transform duration-300 hover:scale-[1.02]"
          >
            <img
              src={image.src}
              alt={image.alt || `Image ${index + 1}`}
              className="w-full h-full object-cover"
              loading="lazy"
            />
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

  const renderGallery = () => {
    const count = images.length;
    if (count === 1) return renderSingleImage();
    if (count === 2) return renderTwoImages();
    if (count === 3) return renderThreeImages();
    return renderGridImages();
  };

  // ----- Main Render -----

  return (
    <>
      <div
        className={cn(
          'w-full max-w-md mx-auto',
          isSent ? 'ml-auto mr-0' : 'mr-auto ml-0',
          className
        )}
        {...props}
      >
        {/* Card Container */}
        <div
          className="rounded-xl overflow-hidden bg-[var(--gp-surface)] shadow-[var(--gp-shadow-sm)] transition-colors duration-300"
        >
          {/* Header: Sender info + Language selector */}
          <div className="flex items-center justify-between px-4 py-3">
            {/* Left: Sender info */}
            <div className="flex items-center gap-2">
              {senderName && (
                <>
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium text-white flex-shrink-0"
                    style={{ background: langColor }}
                  >
                    {senderName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-[var(--gp-text-primary)] transition-colors duration-300">
                      {senderName}
                    </span>
                    <span className="text-xs text-[var(--gp-text-muted)] transition-colors duration-300">
                      {timestamp}
                    </span>
                  </div>
                </>
              )}
              {!senderName && (
                <span className="text-xs text-[var(--gp-text-muted)] transition-colors duration-300">
                  {timestamp}
                </span>
              )}
            </div>

            {/* Right: Language selector */}
            {translations.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowLanguageMenu(!showLanguageMenu)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all',
                    'hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-offset-1'
                  )}
                  style={{
                    backgroundColor: `${langColor}15`,
                    color: langColor,
                  }}
                  aria-expanded={showLanguageMenu}
                  aria-haspopup="true"
                >
                  <span className="text-base">{getFlag(selectedTranslation.languageCode)}</span>
                  <span className="hidden sm:inline">{selectedTranslation.languageName}</span>
                  {selectedTranslation.isOriginal && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full hidden sm:inline bg-[var(--gp-parchment)] text-[var(--gp-text-muted)] transition-colors duration-300">
                      Original
                    </span>
                  )}
                  {otherTranslations.length > 0 && (
                    <ChevronDownIcon className="w-3.5 h-3.5" isOpen={showLanguageMenu} />
                  )}
                </button>

                {/* Language dropdown menu - positioned on RIGHT */}
                {showLanguageMenu && otherTranslations.length > 0 && (
                  <div className="absolute top-full right-0 mt-2 z-30 rounded-lg shadow-[var(--gp-shadow-lg)] overflow-hidden min-w-[200px] max-h-[200px] overflow-y-auto bg-[var(--gp-surface)] border border-[var(--gp-border)] transition-colors duration-300">
                    {/* Current selection indicator */}
                    <div className="px-3 py-2 text-xs font-medium border-b border-[var(--gp-border)] text-[var(--gp-text-muted)] bg-[var(--gp-parchment)] transition-colors duration-300">
                      <GlobeIcon className="w-3.5 h-3.5 inline mr-1.5" />
                      Caption Language
                    </div>

                    {/* All translation options */}
                    {translations.map((translation, index) => {
                      const isSelected =
                        translation.languageCode.toLowerCase() ===
                        selectedTranslation.languageCode.toLowerCase();

                      return (
                        <button
                          key={`${translation.languageCode}-${index}`}
                          type="button"
                          onClick={() => handleSelectTranslation(translation)}
                          className={cn(
                            'w-full px-3 py-2.5 text-left text-sm flex items-center gap-2.5 transition-colors duration-300 text-[var(--gp-text-primary)]',
                            isSelected ? 'bg-[var(--gp-hover)]' : 'hover:bg-[var(--gp-hover)]'
                          )}
                        >
                          <span className="text-base">{getFlag(translation.languageCode)}</span>
                          <span className="flex-1 font-medium">{translation.languageName}</span>
                          {translation.isOriginal && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--gp-parchment)] text-[var(--gp-text-muted)] transition-colors duration-300">
                              Original
                            </span>
                          )}
                          {isSelected && (
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke={langColor}
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Image Gallery */}
          <div className="px-2 pb-2">{renderGallery()}</div>

          {/* Caption */}
          {selectedTranslation.caption && (
            <div className="px-4 py-3 border-t border-[var(--gp-border)] transition-colors duration-300">
              <p className="text-sm leading-relaxed text-[var(--gp-text-primary)] transition-colors duration-300">
                {selectedTranslation.caption}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Click outside to close language menu */}
      {showLanguageMenu && (
        <div
          className="fixed inset-0 z-20"
          onClick={() => setShowLanguageMenu(false)}
          aria-hidden="true"
        />
      )}

      {/* Lightbox Modal */}
      {isLightboxOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
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
            src={images[lightboxIndex].src}
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

          {/* Caption in lightbox */}
          {selectedTranslation.caption && (
            <div className="absolute bottom-20 left-1/2 -translate-x-1/2 max-w-lg px-4 py-3 rounded-lg text-center bg-black/70">
              <div className="flex items-center justify-center gap-2 mb-1">
                <span className="text-base">{getFlag(selectedTranslation.languageCode)}</span>
                <span className="text-white/70 text-xs">{selectedTranslation.languageName}</span>
              </div>
              <p className="text-white text-sm leading-relaxed">{selectedTranslation.caption}</p>
            </div>
          )}

          {/* Thumbnail strip */}
          {images.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 px-4 py-2 rounded-full bg-white/10">
              {images.map((image, index) => (
                <button
                  key={`thumb-${image.src}-${index}`}
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
                    src={image.src}
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
