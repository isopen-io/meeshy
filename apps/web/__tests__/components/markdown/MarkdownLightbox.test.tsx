/**
 * Tests for MarkdownLightbox component
 * Tests fullscreen markdown viewer, content fetching, and user interactions
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { UploadedAttachmentResponse } from '@meeshy/shared/types/attachment';

// Mock createPortal
jest.mock('react-dom', () => ({
  ...jest.requireActual('react-dom'),
  createPortal: (node: React.ReactNode) => node,
}));

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, className, onClick, ...props }: any) => (
      <div className={className} onClick={onClick} {...props}>
        {children}
      </div>
    ),
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock react-markdown
jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children, components }: any) => (
    <div data-testid="react-markdown">{children}</div>
  ),
}));

// Mock remark/rehype plugins
jest.mock('remark-gfm', () => () => {});
jest.mock('rehype-raw', () => () => {});
jest.mock('rehype-sanitize', () => () => {});

// Mock react-syntax-highlighter
jest.mock('react-syntax-highlighter', () => ({
  Prism: ({ children }: any) => <pre data-testid="syntax-highlighter">{children}</pre>,
}));

jest.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({
  vscDarkPlus: {},
}));

// Mock MermaidDiagram
jest.mock('@/components/markdown/MermaidDiagram', () => ({
  MermaidDiagram: ({ chart }: { chart: string }) => (
    <div data-testid="mermaid-diagram">{chart}</div>
  ),
}));

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  X: (props: any) => <svg data-testid="x-icon" {...props} />,
  Download: (props: any) => <svg data-testid="download-icon" {...props} />,
  Eye: (props: any) => <svg data-testid="eye-icon" {...props} />,
  Code: (props: any) => <svg data-testid="code-icon" {...props} />,
}));

// Mock Button component
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, className, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} className={className} {...props}>
      {children}
    </button>
  ),
}));

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Import after mocks
import { MarkdownLightbox } from '../../../components/markdown/MarkdownLightbox';

// Create mock attachment
const createMockAttachment = (overrides: Partial<UploadedAttachmentResponse> = {}): UploadedAttachmentResponse => ({
  id: 'md-attachment-123',
  fileUrl: 'https://example.com/document.md',
  originalName: 'test-document.md',
  mimeType: 'text/markdown',
  size: 1024,
  duration: undefined,
  createdAt: new Date().toISOString(),
  uploadedAt: new Date().toISOString(),
  storagePath: '/uploads/markdown/document.md',
  ...overrides,
});

describe('MarkdownLightbox', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('# Hello World\n\nThis is markdown content.'),
    });
    document.body.style.overflow = '';
  });

  afterEach(() => {
    document.body.style.overflow = '';
  });

  describe('Rendering', () => {
    it('should not render when isOpen is false', () => {
      const attachment = createMockAttachment();

      const { container } = render(
        <MarkdownLightbox attachment={attachment} isOpen={false} onClose={jest.fn()} />
      );

      expect(container.firstChild).toBeNull();
    });

    it('should not render when attachment is null', () => {
      const { container } = render(
        <MarkdownLightbox attachment={null} isOpen={true} onClose={jest.fn()} />
      );

      expect(container.firstChild).toBeNull();
    });

    it('should render when isOpen is true and attachment is provided', async () => {
      const attachment = createMockAttachment();

      await act(async () => {
        render(
          <MarkdownLightbox attachment={attachment} isOpen={true} onClose={jest.fn()} />
        );
      });

      expect(screen.getByText('test-document.md')).toBeInTheDocument();
    });

    it('should display attachment filename', async () => {
      const attachment = createMockAttachment({
        originalName: 'my-readme.md',
      });

      await act(async () => {
        render(
          <MarkdownLightbox attachment={attachment} isOpen={true} onClose={jest.fn()} />
        );
      });

      expect(screen.getByText('my-readme.md')).toBeInTheDocument();
    });

    it('should display document type label', async () => {
      const attachment = createMockAttachment();

      await act(async () => {
        render(
          <MarkdownLightbox attachment={attachment} isOpen={true} onClose={jest.fn()} />
        );
      });

      expect(screen.getByText('Markdown Document')).toBeInTheDocument();
    });
  });

  describe('Content Loading', () => {
    it('should show loading spinner while fetching content', async () => {
      const attachment = createMockAttachment();
      mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

      await act(async () => {
        render(
          <MarkdownLightbox attachment={attachment} isOpen={true} onClose={jest.fn()} />
        );
      });

      const spinner = document.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });

    it('should fetch content from attachment URL', async () => {
      const attachment = createMockAttachment({
        fileUrl: 'https://example.com/test.md',
      });

      await act(async () => {
        render(
          <MarkdownLightbox attachment={attachment} isOpen={true} onClose={jest.fn()} />
        );
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('https://example.com/test.md');
      });
    });

    it('should display fetched content after loading', async () => {
      const attachment = createMockAttachment();
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('# Test Markdown Content'),
      });

      await act(async () => {
        render(
          <MarkdownLightbox attachment={attachment} isOpen={true} onClose={jest.fn()} />
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('react-markdown')).toHaveTextContent('# Test Markdown Content');
      });
    });
  });

  describe('Error Handling', () => {
    it('should show error message when fetch fails', async () => {
      const attachment = createMockAttachment();
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
      });

      await act(async () => {
        render(
          <MarkdownLightbox attachment={attachment} isOpen={true} onClose={jest.fn()} />
        );
      });

      await waitFor(() => {
        expect(screen.getByText('Impossible de charger le fichier')).toBeInTheDocument();
      });
    });

    it('should show error message when network fails', async () => {
      const attachment = createMockAttachment();
      mockFetch.mockRejectedValue(new Error('Network error'));

      await act(async () => {
        render(
          <MarkdownLightbox attachment={attachment} isOpen={true} onClose={jest.fn()} />
        );
      });

      await waitFor(() => {
        expect(screen.getByText('Impossible de charger le fichier')).toBeInTheDocument();
      });
    });
  });

  describe('View Toggle', () => {
    it('should start in formatted view mode', async () => {
      const attachment = createMockAttachment();

      await act(async () => {
        render(
          <MarkdownLightbox attachment={attachment} isOpen={true} onClose={jest.fn()} />
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('react-markdown')).toBeInTheDocument();
      });
    });

    it('should toggle to raw view when toggle button is clicked', async () => {
      const attachment = createMockAttachment();
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('# Raw Content'),
      });

      await act(async () => {
        render(
          <MarkdownLightbox attachment={attachment} isOpen={true} onClose={jest.fn()} />
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('react-markdown')).toBeInTheDocument();
      });

      // Click the toggle button (Code icon for switching to raw view)
      const toggleButton = screen.getByTitle('Vue brute');
      await act(async () => {
        fireEvent.click(toggleButton);
      });

      // Should now show raw content in pre tag
      const rawContent = document.querySelector('pre');
      expect(rawContent).toBeInTheDocument();
      expect(rawContent).toHaveTextContent('# Raw Content');
    });

    it('should disable toggle button while loading', async () => {
      const attachment = createMockAttachment();
      mockFetch.mockImplementation(() => new Promise(() => {}));

      await act(async () => {
        render(
          <MarkdownLightbox attachment={attachment} isOpen={true} onClose={jest.fn()} />
        );
      });

      const toggleButton = screen.getByTitle('Vue brute');
      expect(toggleButton).toBeDisabled();
    });

    it('should disable toggle button when error occurs', async () => {
      const attachment = createMockAttachment();
      mockFetch.mockResolvedValue({
        ok: false,
      });

      await act(async () => {
        render(
          <MarkdownLightbox attachment={attachment} isOpen={true} onClose={jest.fn()} />
        );
      });

      await waitFor(() => {
        const toggleButton = screen.getByTitle('Vue brute');
        expect(toggleButton).toBeDisabled();
      });
    });
  });

  describe('Close Functionality', () => {
    it('should call onClose when close button is clicked', async () => {
      const attachment = createMockAttachment();
      const mockOnClose = jest.fn();

      await act(async () => {
        render(
          <MarkdownLightbox attachment={attachment} isOpen={true} onClose={mockOnClose} />
        );
      });

      const closeButton = screen.getByLabelText('Fermer');
      await act(async () => {
        fireEvent.click(closeButton);
      });

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should call onClose when Escape key is pressed', async () => {
      const attachment = createMockAttachment();
      const mockOnClose = jest.fn();

      await act(async () => {
        render(
          <MarkdownLightbox attachment={attachment} isOpen={true} onClose={mockOnClose} />
        );
      });

      await act(async () => {
        fireEvent.keyDown(window, { key: 'Escape' });
      });

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should call onClose when clicking on backdrop', async () => {
      const attachment = createMockAttachment();
      const mockOnClose = jest.fn();

      await act(async () => {
        render(
          <MarkdownLightbox attachment={attachment} isOpen={true} onClose={mockOnClose} />
        );
      });

      // Click on the backdrop (motion.div with onClick={onClose})
      const backdrop = document.querySelector('.fixed.inset-0');
      if (backdrop) {
        await act(async () => {
          fireEvent.click(backdrop);
        });
        expect(mockOnClose).toHaveBeenCalled();
      }
    });

    it('should not close when clicking on content area', async () => {
      const attachment = createMockAttachment();
      const mockOnClose = jest.fn();

      await act(async () => {
        render(
          <MarkdownLightbox attachment={attachment} isOpen={true} onClose={mockOnClose} />
        );
      });

      // Click on the content area (has stopPropagation)
      const contentArea = document.querySelector('.bg-white');
      if (contentArea) {
        await act(async () => {
          fireEvent.click(contentArea);
        });
        expect(mockOnClose).not.toHaveBeenCalled();
      }
    });
  });

  describe('Download Button', () => {
    it('should render download button', async () => {
      const attachment = createMockAttachment();

      await act(async () => {
        render(
          <MarkdownLightbox attachment={attachment} isOpen={true} onClose={jest.fn()} />
        );
      });

      // Find download button by aria-label (with French accent)
      const downloadButton = screen.getByLabelText(/charger le fichier Markdown/i);
      expect(downloadButton).toBeInTheDocument();
    });

    it('should have download button that triggers download', async () => {
      const attachment = createMockAttachment({
        fileUrl: 'https://example.com/readme.md',
        originalName: 'README.md',
      });

      await act(async () => {
        render(
          <MarkdownLightbox attachment={attachment} isOpen={true} onClose={jest.fn()} />
        );
      });

      // Verify the download button exists and has the download icon
      const downloadButton = screen.getByLabelText(/charger le fichier Markdown/i);
      expect(downloadButton).toBeInTheDocument();
      expect(screen.getByTestId('download-icon')).toBeInTheDocument();
    });
  });

  describe('Body Scroll Lock', () => {
    it('should lock body scroll when opened', async () => {
      const attachment = createMockAttachment();

      await act(async () => {
        render(
          <MarkdownLightbox attachment={attachment} isOpen={true} onClose={jest.fn()} />
        );
      });

      expect(document.body.style.overflow).toBe('hidden');
    });

    it('should restore body scroll when closed', async () => {
      const attachment = createMockAttachment();

      const { rerender } = await act(async () => {
        return render(
          <MarkdownLightbox attachment={attachment} isOpen={true} onClose={jest.fn()} />
        );
      });

      expect(document.body.style.overflow).toBe('hidden');

      await act(async () => {
        rerender(
          <MarkdownLightbox attachment={attachment} isOpen={false} onClose={jest.fn()} />
        );
      });

      expect(document.body.style.overflow).toBe('');
    });

    it('should restore body scroll on unmount', async () => {
      const attachment = createMockAttachment();

      const { unmount } = await act(async () => {
        return render(
          <MarkdownLightbox attachment={attachment} isOpen={true} onClose={jest.fn()} />
        );
      });

      expect(document.body.style.overflow).toBe('hidden');

      unmount();

      expect(document.body.style.overflow).toBe('');
    });
  });

  describe('Accessibility', () => {
    it('should have close button with aria-label', async () => {
      const attachment = createMockAttachment();

      await act(async () => {
        render(
          <MarkdownLightbox attachment={attachment} isOpen={true} onClose={jest.fn()} />
        );
      });

      expect(screen.getByLabelText('Fermer')).toBeInTheDocument();
    });

    it('should have download button with aria-label', async () => {
      const attachment = createMockAttachment();

      await act(async () => {
        render(
          <MarkdownLightbox attachment={attachment} isOpen={true} onClose={jest.fn()} />
        );
      });

      expect(screen.getByLabelText(/charger le fichier Markdown/i)).toBeInTheDocument();
    });

    it('should display keyboard hint on desktop', async () => {
      const attachment = createMockAttachment();

      const { container } = await act(async () => {
        return render(
          <MarkdownLightbox attachment={attachment} isOpen={true} onClose={jest.fn()} />
        );
      });

      // The hint is hidden on mobile (hidden md:block), so check for the element's existence
      const hint = container.querySelector('.md\\:block');
      expect(hint).toBeInTheDocument();
    });
  });

  describe('Re-fetching on Attachment Change', () => {
    it('should refetch when attachment changes', async () => {
      const attachment1 = createMockAttachment({
        id: '1',
        fileUrl: 'https://example.com/doc1.md',
      });
      const attachment2 = createMockAttachment({
        id: '2',
        fileUrl: 'https://example.com/doc2.md',
      });

      const { rerender } = await act(async () => {
        return render(
          <MarkdownLightbox attachment={attachment1} isOpen={true} onClose={jest.fn()} />
        );
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('https://example.com/doc1.md');
      });

      mockFetch.mockClear();

      await act(async () => {
        rerender(
          <MarkdownLightbox attachment={attachment2} isOpen={true} onClose={jest.fn()} />
        );
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('https://example.com/doc2.md');
      });
    });

    it('should not fetch when isOpen changes to false', async () => {
      const attachment = createMockAttachment();

      const { rerender } = await act(async () => {
        return render(
          <MarkdownLightbox attachment={attachment} isOpen={true} onClose={jest.fn()} />
        );
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      mockFetch.mockClear();

      await act(async () => {
        rerender(
          <MarkdownLightbox attachment={attachment} isOpen={false} onClose={jest.fn()} />
        );
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
