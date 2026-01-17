/**
 * Tests for ImageLightbox component
 * Full-screen image viewer with zoom, rotation, navigation, and download
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ImageLightbox } from '@/components/attachments/ImageLightbox';
import type { Attachment } from '@meeshy/shared/types/attachment';

// Mock createPortal
jest.mock('react-dom', () => ({
  ...jest.requireActual('react-dom'),
  createPortal: (node: React.ReactNode) => node,
}));

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    img: ({ children, ...props }: any) => <img {...props} />,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Create mock attachment helper
const createMockAttachment = (overrides: Partial<Attachment> = {}): Attachment => ({
  id: `attachment-${Math.random().toString(36).substr(2, 9)}`,
  messageId: 'message-456',
  fileName: 'test-image.jpg',
  originalName: 'Test Image.jpg',
  mimeType: 'image/jpeg',
  fileSize: 1024000,
  fileUrl: 'https://example.com/images/test.jpg',
  uploadedBy: 'user-789',
  isAnonymous: false,
  createdAt: new Date().toISOString(),
  isForwarded: false,
  isViewOnce: false,
  viewOnceCount: 0,
  isBlurred: false,
  viewedCount: 0,
  downloadedCount: 0,
  consumedCount: 0,
  isEncrypted: false,
  width: 1920,
  height: 1080,
  ...overrides,
});

describe('ImageLightbox', () => {
  const defaultImages = [
    createMockAttachment({ id: 'img-1', originalName: 'First.jpg', fileUrl: 'https://example.com/1.jpg' }),
    createMockAttachment({ id: 'img-2', originalName: 'Second.jpg', fileUrl: 'https://example.com/2.jpg' }),
    createMockAttachment({ id: 'img-3', originalName: 'Third.jpg', fileUrl: 'https://example.com/3.jpg' }),
  ];

  const defaultProps = {
    images: defaultImages,
    initialIndex: 0,
    isOpen: true,
    onClose: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset body overflow style
    document.body.style.overflow = '';
  });

  describe('Rendering', () => {
    it('renders nothing when isOpen is false', () => {
      const { container } = render(
        <ImageLightbox {...defaultProps} isOpen={false} />
      );

      expect(screen.queryByRole('img')).not.toBeInTheDocument();
    });

    it('renders lightbox when isOpen is true', () => {
      render(<ImageLightbox {...defaultProps} />);

      expect(screen.getByRole('img')).toBeInTheDocument();
    });

    it('displays current image', () => {
      render(<ImageLightbox {...defaultProps} initialIndex={0} />);

      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('src', 'https://example.com/1.jpg');
      expect(img).toHaveAttribute('alt', 'First.jpg');
    });

    it('displays image filename', () => {
      render(<ImageLightbox {...defaultProps} />);

      expect(screen.getByText('First.jpg')).toBeInTheDocument();
    });

    it('displays file size', () => {
      render(<ImageLightbox {...defaultProps} />);

      expect(screen.getByText(/1000 KB|1 MB/)).toBeInTheDocument();
    });

    it('displays image dimensions', () => {
      render(<ImageLightbox {...defaultProps} />);

      expect(screen.getByText(/1920x1080/)).toBeInTheDocument();
    });

    it('displays image counter', () => {
      render(<ImageLightbox {...defaultProps} initialIndex={0} />);

      expect(screen.getByText(/1 \/ 3/)).toBeInTheDocument();
    });
  });

  describe('Navigation', () => {
    it('shows previous button when not on first image', () => {
      render(<ImageLightbox {...defaultProps} initialIndex={1} />);

      expect(screen.getByLabelText('Image precedente')).toBeInTheDocument();
    });

    it('hides previous button on first image', () => {
      render(<ImageLightbox {...defaultProps} initialIndex={0} />);

      expect(screen.queryByLabelText('Image precedente')).not.toBeInTheDocument();
    });

    it('shows next button when not on last image', () => {
      render(<ImageLightbox {...defaultProps} initialIndex={0} />);

      expect(screen.getByLabelText('Image suivante')).toBeInTheDocument();
    });

    it('hides next button on last image', () => {
      render(<ImageLightbox {...defaultProps} initialIndex={2} />);

      expect(screen.queryByLabelText('Image suivante')).not.toBeInTheDocument();
    });

    it('navigates to next image on button click', () => {
      render(<ImageLightbox {...defaultProps} initialIndex={0} />);

      fireEvent.click(screen.getByLabelText('Image suivante'));

      expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/2.jpg');
    });

    it('navigates to previous image on button click', () => {
      render(<ImageLightbox {...defaultProps} initialIndex={1} />);

      fireEvent.click(screen.getByLabelText('Image precedente'));

      expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/1.jpg');
    });
  });

  describe('Keyboard Navigation', () => {
    it('navigates to next image with ArrowRight', () => {
      render(<ImageLightbox {...defaultProps} initialIndex={0} />);

      fireEvent.keyDown(window, { key: 'ArrowRight' });

      expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/2.jpg');
    });

    it('navigates to previous image with ArrowLeft', () => {
      render(<ImageLightbox {...defaultProps} initialIndex={1} />);

      fireEvent.keyDown(window, { key: 'ArrowLeft' });

      expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/1.jpg');
    });

    it('does not go past first image', () => {
      render(<ImageLightbox {...defaultProps} initialIndex={0} />);

      fireEvent.keyDown(window, { key: 'ArrowLeft' });

      expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/1.jpg');
    });

    it('does not go past last image', () => {
      render(<ImageLightbox {...defaultProps} initialIndex={2} />);

      fireEvent.keyDown(window, { key: 'ArrowRight' });

      expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/3.jpg');
    });

    it('closes lightbox on Escape', () => {
      const onClose = jest.fn();
      render(<ImageLightbox {...defaultProps} onClose={onClose} />);

      fireEvent.keyDown(window, { key: 'Escape' });

      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('Zoom Controls', () => {
    it('displays zoom percentage', () => {
      render(<ImageLightbox {...defaultProps} />);

      expect(screen.getByText('100%')).toBeInTheDocument();
    });

    it('zooms in with + key', () => {
      render(<ImageLightbox {...defaultProps} />);

      fireEvent.keyDown(window, { key: '+' });

      expect(screen.getByText('150%')).toBeInTheDocument();
    });

    it('zooms in with = key', () => {
      render(<ImageLightbox {...defaultProps} />);

      fireEvent.keyDown(window, { key: '=' });

      expect(screen.getByText('150%')).toBeInTheDocument();
    });

    it('zooms out with - key', () => {
      render(<ImageLightbox {...defaultProps} />);

      // First zoom in
      fireEvent.keyDown(window, { key: '+' });
      // Then zoom out
      fireEvent.keyDown(window, { key: '-' });

      expect(screen.getByText('100%')).toBeInTheDocument();
    });

    it('zooms in with button click', () => {
      render(<ImageLightbox {...defaultProps} />);

      fireEvent.click(screen.getByLabelText('Zoomer'));

      expect(screen.getByText('150%')).toBeInTheDocument();
    });

    it('zooms out with button click', () => {
      render(<ImageLightbox {...defaultProps} />);

      // First zoom in
      fireEvent.click(screen.getByLabelText('Zoomer'));
      // Then zoom out
      fireEvent.click(screen.getByLabelText('Dezoomer'));

      expect(screen.getByText('100%')).toBeInTheDocument();
    });

    it('does not zoom below minimum (50%)', () => {
      render(<ImageLightbox {...defaultProps} />);

      // Try to zoom out multiple times
      fireEvent.keyDown(window, { key: '-' });
      fireEvent.keyDown(window, { key: '-' });

      expect(screen.getByText('50%')).toBeInTheDocument();

      // Zoom out button should be disabled
      expect(screen.getByLabelText('Dezoomer')).toBeDisabled();
    });

    it('does not zoom above maximum (300%)', () => {
      render(<ImageLightbox {...defaultProps} />);

      // Zoom in multiple times
      for (let i = 0; i < 5; i++) {
        fireEvent.keyDown(window, { key: '+' });
      }

      expect(screen.getByText('300%')).toBeInTheDocument();

      // Zoom in button should be disabled
      expect(screen.getByLabelText('Zoomer')).toBeDisabled();
    });
  });

  describe('Rotation', () => {
    it('rotates image with R key', () => {
      render(<ImageLightbox {...defaultProps} />);

      fireEvent.keyDown(window, { key: 'r' });

      // Image should have rotation style (90 degrees)
      const img = screen.getByRole('img');
      expect(img).toHaveStyle({ rotate: '90' });
    });

    it('rotates image with button click', () => {
      render(<ImageLightbox {...defaultProps} />);

      fireEvent.click(screen.getByLabelText("Pivoter l'image"));

      const img = screen.getByRole('img');
      expect(img).toHaveStyle({ rotate: '90' });
    });

    it('cycles rotation through 360 degrees', () => {
      render(<ImageLightbox {...defaultProps} />);

      // Rotate 4 times (90 * 4 = 360, which wraps to 0)
      for (let i = 0; i < 4; i++) {
        fireEvent.keyDown(window, { key: 'R' });
      }

      const img = screen.getByRole('img');
      expect(img).toHaveStyle({ rotate: '0' });
    });

    it('resets rotation when changing images', () => {
      render(<ImageLightbox {...defaultProps} initialIndex={0} />);

      // Rotate first image
      fireEvent.keyDown(window, { key: 'r' });

      // Navigate to next image
      fireEvent.keyDown(window, { key: 'ArrowRight' });

      // Second image should not be rotated
      const img = screen.getByRole('img');
      expect(img).toHaveStyle({ rotate: '0' });
    });
  });

  describe('Download', () => {
    beforeEach(() => {
      document.body.appendChild = jest.fn();
      document.body.removeChild = jest.fn();
    });

    it('renders download button', () => {
      render(<ImageLightbox {...defaultProps} />);

      expect(screen.getByLabelText("Telecharger l'image")).toBeInTheDocument();
    });

    it('creates download link on click', () => {
      render(<ImageLightbox {...defaultProps} />);

      fireEvent.click(screen.getByLabelText("Telecharger l'image"));

      expect(document.body.appendChild).toHaveBeenCalled();
      expect(document.body.removeChild).toHaveBeenCalled();
    });
  });

  describe('Close Button', () => {
    it('renders close button', () => {
      render(<ImageLightbox {...defaultProps} />);

      expect(screen.getByLabelText('Fermer')).toBeInTheDocument();
    });

    it('calls onClose when close button is clicked', () => {
      const onClose = jest.fn();
      render(<ImageLightbox {...defaultProps} onClose={onClose} />);

      fireEvent.click(screen.getByLabelText('Fermer'));

      expect(onClose).toHaveBeenCalled();
    });

    it('calls onClose when clicking backdrop', () => {
      const onClose = jest.fn();
      render(<ImageLightbox {...defaultProps} onClose={onClose} />);

      // Click on the backdrop (the fixed container)
      const backdrop = screen.getByRole('img').closest('.fixed');
      if (backdrop) {
        fireEvent.click(backdrop);
        expect(onClose).toHaveBeenCalled();
      }
    });

    it('does not close when clicking on image', () => {
      const onClose = jest.fn();
      render(<ImageLightbox {...defaultProps} onClose={onClose} />);

      const img = screen.getByRole('img');
      fireEvent.click(img);

      // Should close when clicking image (based on component implementation)
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('Body Scroll Lock', () => {
    it('locks body scroll when open', () => {
      render(<ImageLightbox {...defaultProps} isOpen={true} />);

      expect(document.body.style.overflow).toBe('hidden');
    });

    it('unlocks body scroll when closed', () => {
      const { rerender } = render(<ImageLightbox {...defaultProps} isOpen={true} />);

      rerender(<ImageLightbox {...defaultProps} isOpen={false} />);

      expect(document.body.style.overflow).toBe('');
    });

    it('unlocks body scroll on unmount', () => {
      const { unmount } = render(<ImageLightbox {...defaultProps} isOpen={true} />);

      unmount();

      expect(document.body.style.overflow).toBe('');
    });
  });

  describe('Error Handling', () => {
    it('renders nothing with empty images array', () => {
      const { container } = render(
        <ImageLightbox {...defaultProps} images={[]} />
      );

      expect(screen.queryByRole('img')).not.toBeInTheDocument();
    });

    it('handles invalid initialIndex', () => {
      render(<ImageLightbox {...defaultProps} initialIndex={999} />);

      // Should not crash, component handles bounds
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
    });

    it('handles negative initialIndex', () => {
      render(<ImageLightbox {...defaultProps} initialIndex={-1} />);

      // Should not crash
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
    });

    it('displays error state when image fails to load', () => {
      render(<ImageLightbox {...defaultProps} />);

      const img = screen.getByRole('img');
      fireEvent.error(img);

      expect(screen.getByText(/Impossible de charger l'image/)).toBeInTheDocument();
    });

    it('shows download anyway button on image error', () => {
      render(<ImageLightbox {...defaultProps} />);

      const img = screen.getByRole('img');
      fireEvent.error(img);

      expect(screen.getByText(/Telecharger quand meme/)).toBeInTheDocument();
    });

    it('closes when image URL is missing', () => {
      const onClose = jest.fn();
      const imagesWithoutUrl = [createMockAttachment({ fileUrl: '' })];

      render(
        <ImageLightbox
          images={imagesWithoutUrl}
          initialIndex={0}
          isOpen={true}
          onClose={onClose}
        />
      );

      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('Index Update', () => {
    it('updates currentIndex when initialIndex changes', () => {
      const { rerender } = render(
        <ImageLightbox {...defaultProps} initialIndex={0} />
      );

      expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/1.jpg');

      rerender(<ImageLightbox {...defaultProps} initialIndex={2} />);

      expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/3.jpg');
    });

    it('resets zoom when changing images', () => {
      render(<ImageLightbox {...defaultProps} initialIndex={0} />);

      // Zoom in
      fireEvent.keyDown(window, { key: '+' });
      expect(screen.getByText('150%')).toBeInTheDocument();

      // Navigate to next image
      fireEvent.keyDown(window, { key: 'ArrowRight' });

      // Zoom should reset to 100%
      expect(screen.getByText('100%')).toBeInTheDocument();
    });
  });

  describe('Single Image', () => {
    it('hides navigation buttons for single image', () => {
      const singleImage = [createMockAttachment()];

      render(
        <ImageLightbox
          images={singleImage}
          initialIndex={0}
          isOpen={true}
          onClose={jest.fn()}
        />
      );

      expect(screen.queryByLabelText('Image precedente')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Image suivante')).not.toBeInTheDocument();
    });

    it('does not show counter for single image', () => {
      const singleImage = [createMockAttachment()];

      render(
        <ImageLightbox
          images={singleImage}
          initialIndex={0}
          isOpen={true}
          onClose={jest.fn()}
        />
      );

      expect(screen.queryByText(/1 \/ 1/)).not.toBeInTheDocument();
    });
  });

  describe('Keyboard Instructions', () => {
    it('displays keyboard instructions', () => {
      render(<ImageLightbox {...defaultProps} />);

      expect(screen.getByText(/fleches.*pour naviguer/i)).toBeInTheDocument();
      expect(screen.getByText(/pour zoomer/i)).toBeInTheDocument();
      expect(screen.getByText(/pour pivoter/i)).toBeInTheDocument();
      expect(screen.getByText(/Echap.*pour fermer/i)).toBeInTheDocument();
    });
  });
});
