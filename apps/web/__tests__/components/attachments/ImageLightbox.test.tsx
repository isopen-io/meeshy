/**
 * Tests for ImageLightbox — fullscreen image viewer used across
 * conversations (MessageAttachments, AttachmentCarousel, MessageHeader,
 * AttachmentPreviewReply).
 *
 * #3878 focus: the plein écran opens on the SHARP full-resolution image —
 * resident (already loaded this session) shows immediately with no
 * backdrop/spinner; otherwise the thumbnail is shown ONLY as a blurred
 * backdrop while the full image loads, never as the displayed sharp image
 * itself. The pure decision (`resolveFullscreenImageSource`) has its own
 * unit suite (`__tests__/lib/images/fullscreen-source.test.ts`) — this file
 * covers the component's WIRING of that decision.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ImageLightbox } from '@/components/attachments/ImageLightbox';
import type { Attachment } from '@meeshy/shared/types/attachment';
import { fullscreenImageResidency } from '@/lib/images/residency-cache';

jest.mock('react-dom', () => ({
  ...jest.requireActual('react-dom'),
  createPortal: (children: React.ReactNode) => children,
}));

jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, className, onClick, ...props }: any) => (
      <div className={className} onClick={onClick} {...props}>
        {children}
      </div>
    ),
    img: ({ onLoad, onError, onClick, className, src, alt, ...props }: any) => (
      // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/no-noninteractive-element-interactions
      <img
        src={src}
        alt={alt}
        className={className}
        onLoad={onLoad}
        onError={onError}
        onClick={onClick}
        {...props}
      />
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('lucide-react', () => ({
  X: () => <span data-testid="x-icon">X</span>,
  Download: () => <span data-testid="download-icon">DL</span>,
  ChevronLeft: () => <span data-testid="chevron-left-icon">&lt;</span>,
  ChevronRight: () => <span data-testid="chevron-right-icon">&gt;</span>,
  ZoomIn: () => <span data-testid="zoom-in-icon">+</span>,
  ZoomOut: () => <span data-testid="zoom-out-icon">-</span>,
  RotateCw: () => <span data-testid="rotate-icon">R</span>,
}));

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

const createMockImage = (overrides: Partial<Attachment> = {}): Attachment =>
  ({
    id: `img-${Math.random().toString(36).slice(2, 9)}`,
    fileUrl: 'https://cdn.example/full.jpg',
    originalName: 'photo.jpg',
    mimeType: 'image/jpeg',
    fileSize: 204800,
    width: 1920,
    height: 1080,
    createdAt: new Date().toISOString(),
    ...overrides,
  }) as Attachment;

describe('ImageLightbox', () => {
  const defaultProps = {
    images: [createMockImage()],
    initialIndex: 0,
    isOpen: true,
    onClose: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    fullscreenImageResidency.reset();
    document.body.style.overflow = '';
  });

  it('renders when open', () => {
    render(<ImageLightbox {...defaultProps} />);
    expect(screen.getByText('photo.jpg')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<ImageLightbox {...defaultProps} isOpen={false} />);
    expect(screen.queryByText('photo.jpg')).not.toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = jest.fn();
    render(<ImageLightbox {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('common.close'));
    expect(onClose).toHaveBeenCalled();
  });

  describe('Sharp fullscreen source (#3878)', () => {
    it('renders the full-resolution URL as the displayed image, never the thumbnail', () => {
      const images = [
        createMockImage({ fileUrl: 'https://cdn.example/full.jpg', thumbnailUrl: 'https://cdn.example/thumb.jpg' }),
      ];
      const { container } = render(<ImageLightbox {...defaultProps} images={images} />);

      const displayed = container.querySelector('img[alt="photo.jpg"]') as HTMLImageElement;
      expect(displayed.src).toBe('https://cdn.example/full.jpg');
    });

    it('shows the thumbnail as a blurred backdrop only while the full image has not loaded yet', () => {
      const images = [
        createMockImage({ fileUrl: 'https://cdn.example/full.jpg', thumbnailUrl: 'https://cdn.example/thumb.jpg' }),
      ];
      const { container } = render(<ImageLightbox {...defaultProps} images={images} />);

      const backdrop = container.querySelector('img[aria-hidden="true"]') as HTMLImageElement;
      expect(backdrop).toBeInTheDocument();
      expect(backdrop.src).toBe('https://cdn.example/thumb.jpg');
      expect(backdrop.className).toEqual(expect.stringContaining('blur'));
    });

    it('drops the blurred backdrop once the full image finishes loading — no spinner-equivalent lingers', () => {
      const images = [
        createMockImage({ fileUrl: 'https://cdn.example/full.jpg', thumbnailUrl: 'https://cdn.example/thumb.jpg' }),
      ];
      const { container } = render(<ImageLightbox {...defaultProps} images={images} />);

      const displayed = container.querySelector('img[alt="photo.jpg"]') as HTMLImageElement;
      fireEvent.load(displayed);

      expect(container.querySelector('img[aria-hidden="true"]')).not.toBeInTheDocument();
    });

    it('renders no backdrop at all when there is no thumbnail — never fabricates one', () => {
      const images = [createMockImage({ fileUrl: 'https://cdn.example/full.jpg', thumbnailUrl: undefined })];
      const { container } = render(<ImageLightbox {...defaultProps} images={images} />);

      expect(container.querySelector('img[aria-hidden="true"]')).not.toBeInTheDocument();
    });

    it('Cache-First: a resident full image renders with no backdrop from the very first paint — jamais de spinner sur un cache non vide', () => {
      const fileUrl = 'https://cdn.example/already-resident.jpg';
      fullscreenImageResidency.mark(fileUrl);
      const images = [createMockImage({ fileUrl, thumbnailUrl: 'https://cdn.example/thumb.jpg' })];

      const { container } = render(<ImageLightbox {...defaultProps} images={images} />);

      expect(container.querySelector('img[aria-hidden="true"]')).not.toBeInTheDocument();
      const displayed = container.querySelector('img[alt="photo.jpg"]') as HTMLImageElement;
      expect(displayed.src).toBe(fileUrl);
    });

    it('marks the image resident once loaded, so reopening the same image shows no backdrop', () => {
      const images = [
        createMockImage({ fileUrl: 'https://cdn.example/full.jpg', thumbnailUrl: 'https://cdn.example/thumb.jpg' }),
      ];
      const { container, rerender } = render(<ImageLightbox {...defaultProps} images={images} />);

      const displayed = container.querySelector('img[alt="photo.jpg"]') as HTMLImageElement;
      fireEvent.load(displayed);

      // Close then reopen the same image (fresh mount, same URL) — residency persists in the module cache.
      rerender(<ImageLightbox {...defaultProps} images={images} isOpen={false} />);
      rerender(<ImageLightbox {...defaultProps} images={images} isOpen={true} />);

      expect(container.querySelector('img[aria-hidden="true"]')).not.toBeInTheDocument();
    });

    it('resets residency-derived state for a different image when navigating', () => {
      const images = [
        createMockImage({ id: 'a', originalName: 'a.jpg', fileUrl: 'https://cdn.example/a.jpg', thumbnailUrl: 'https://cdn.example/a-thumb.jpg' }),
        createMockImage({ id: 'b', originalName: 'b.jpg', fileUrl: 'https://cdn.example/b.jpg', thumbnailUrl: 'https://cdn.example/b-thumb.jpg' }),
      ];
      const { container } = render(<ImageLightbox {...defaultProps} images={images} initialIndex={0} />);

      const first = container.querySelector('img[alt="a.jpg"]') as HTMLImageElement;
      fireEvent.load(first);
      expect(container.querySelector('img[aria-hidden="true"]')).not.toBeInTheDocument();

      fireEvent.keyDown(window, { key: 'ArrowRight' });

      // 'b.jpg' has never loaded — its backdrop (from its own thumbnail) shows again.
      const backdrop = container.querySelector('img[aria-hidden="true"]') as HTMLImageElement;
      expect(backdrop).toBeInTheDocument();
      expect(backdrop.src).toBe('https://cdn.example/b-thumb.jpg');
    });
  });
});
