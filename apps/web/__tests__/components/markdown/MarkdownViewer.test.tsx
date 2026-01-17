/**
 * Tests for MarkdownViewer component
 * Tests markdown rendering, view toggle, error handling, and action controls
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { UploadedAttachmentResponse } from '@meeshy/shared/types/attachment';

// Mock next/dynamic
jest.mock('next/dynamic', () => {
  return (importFn: () => Promise<any>, options: any) => {
    const MockCodeHighlighter = ({ children, language, isDark }: any) => (
      <pre data-testid="code-highlighter" data-language={language} data-is-dark={isDark}>
        {children}
      </pre>
    );
    MockCodeHighlighter.displayName = 'CodeHighlighter';
    return MockCodeHighlighter;
  };
});

// Mock next-themes
jest.mock('next-themes', () => ({
  useTheme: jest.fn(() => ({
    theme: 'light',
    resolvedTheme: 'light',
  })),
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

// Mock MermaidDiagram
jest.mock('@/components/markdown/MermaidDiagram', () => ({
  MermaidDiagram: ({ chart, className }: { chart: string; className?: string }) => (
    <div data-testid="mermaid-diagram" className={className}>
      {chart}
    </div>
  ),
}));

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  Download: (props: any) => <svg data-testid="download-icon" {...props} />,
  AlertTriangle: (props: any) => <svg data-testid="alert-triangle-icon" {...props} />,
  Maximize: (props: any) => <svg data-testid="maximize-icon" {...props} />,
  FileText: (props: any) => <svg data-testid="filetext-icon" {...props} />,
  Code: (props: any) => <svg data-testid="code-icon" {...props} />,
  Eye: (props: any) => <svg data-testid="eye-icon" {...props} />,
  X: (props: any) => <svg data-testid="x-icon" {...props} />,
}));

// Mock Button component
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, className, title, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} className={className} title={title} {...props}>
      {children}
    </button>
  ),
}));

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Import after mocks
import { MarkdownViewer } from '../../../components/markdown/MarkdownViewer';
import { useTheme } from 'next-themes';

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

describe('MarkdownViewer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('# Hello World\n\nThis is markdown content.'),
    });
    (useTheme as jest.Mock).mockReturnValue({
      theme: 'light',
      resolvedTheme: 'light',
    });
  });

  describe('Basic Rendering', () => {
    it('should render component with attachment', async () => {
      const attachment = createMockAttachment();

      await act(async () => {
        render(<MarkdownViewer attachment={attachment} />);
      });

      await waitFor(() => {
        expect(screen.getByTestId('react-markdown')).toBeInTheDocument();
      });
    });

    it('should display filename in desktop view', async () => {
      const attachment = createMockAttachment({
        originalName: 'my-readme.md',
      });

      const { container } = await act(async () => {
        return render(<MarkdownViewer attachment={attachment} />);
      });

      await waitFor(() => {
        const desktopSpan = container.querySelector('.hidden.sm\\:inline');
        expect(desktopSpan).toHaveTextContent('my-readme.md');
      });
    });

    it('should apply custom className', async () => {
      const attachment = createMockAttachment();

      const { container } = await act(async () => {
        return render(<MarkdownViewer attachment={attachment} className="custom-class" />);
      });

      expect(container.firstChild).toHaveClass('custom-class');
    });
  });

  describe('Content Loading', () => {
    it('should show loading spinner while fetching', async () => {
      const attachment = createMockAttachment();
      mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

      await act(async () => {
        render(<MarkdownViewer attachment={attachment} />);
      });

      const spinner = document.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });

    it('should fetch content from attachment URL', async () => {
      const attachment = createMockAttachment({
        fileUrl: 'https://example.com/readme.md',
      });

      await act(async () => {
        render(<MarkdownViewer attachment={attachment} />);
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('https://example.com/readme.md');
      });
    });

    it('should display markdown content after loading', async () => {
      const attachment = createMockAttachment();
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('# Test Content'),
      });

      await act(async () => {
        render(<MarkdownViewer attachment={attachment} />);
      });

      await waitFor(() => {
        expect(screen.getByTestId('react-markdown')).toHaveTextContent('# Test Content');
      });
    });
  });

  describe('Error Handling', () => {
    it('should show error state when fetch fails', async () => {
      const attachment = createMockAttachment();
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
      });

      await act(async () => {
        render(<MarkdownViewer attachment={attachment} />);
      });

      await waitFor(() => {
        expect(screen.getByText('Impossible de charger le fichier')).toBeInTheDocument();
      });
    });

    it('should show alert icon on error', async () => {
      const attachment = createMockAttachment();
      mockFetch.mockResolvedValue({
        ok: false,
      });

      await act(async () => {
        render(<MarkdownViewer attachment={attachment} />);
      });

      await waitFor(() => {
        expect(screen.getByTestId('alert-triangle-icon')).toBeInTheDocument();
      });
    });

    it('should show error border on error', async () => {
      const attachment = createMockAttachment();
      mockFetch.mockResolvedValue({
        ok: false,
      });

      const { container } = await act(async () => {
        return render(<MarkdownViewer attachment={attachment} />);
      });

      await waitFor(() => {
        expect(container.firstChild).toHaveClass('border-red-300');
      });
    });

    it('should handle network error', async () => {
      const attachment = createMockAttachment();
      mockFetch.mockRejectedValue(new Error('Network error'));

      await act(async () => {
        render(<MarkdownViewer attachment={attachment} />);
      });

      await waitFor(() => {
        expect(screen.getByText('Impossible de charger le fichier')).toBeInTheDocument();
      });
    });
  });

  describe('View Toggle', () => {
    it('should start in formatted view', async () => {
      const attachment = createMockAttachment();

      await act(async () => {
        render(<MarkdownViewer attachment={attachment} />);
      });

      await waitFor(() => {
        expect(screen.getByTestId('react-markdown')).toBeInTheDocument();
      });
    });

    it('should toggle to raw view when button is clicked', async () => {
      const attachment = createMockAttachment();
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('# Raw Markdown'),
      });

      await act(async () => {
        render(<MarkdownViewer attachment={attachment} />);
      });

      await waitFor(() => {
        expect(screen.getByTestId('react-markdown')).toBeInTheDocument();
      });

      const toggleButton = screen.getByTitle(/brute/i);
      await act(async () => {
        fireEvent.click(toggleButton);
      });

      const rawContent = document.querySelector('pre');
      expect(rawContent).toBeInTheDocument();
      expect(rawContent).toHaveTextContent('# Raw Markdown');
    });

    it('should toggle back to formatted view', async () => {
      const attachment = createMockAttachment();

      await act(async () => {
        render(<MarkdownViewer attachment={attachment} />);
      });

      await waitFor(() => {
        expect(screen.getByTestId('react-markdown')).toBeInTheDocument();
      });

      // Toggle to raw
      const toggleButton = screen.getByTitle(/brute/i);
      await act(async () => {
        fireEvent.click(toggleButton);
      });

      // Toggle back to formatted
      const formattedButton = screen.getByTitle(/format/i);
      await act(async () => {
        fireEvent.click(formattedButton);
      });

      expect(screen.getByTestId('react-markdown')).toBeInTheDocument();
    });

    it('should disable toggle button while loading', async () => {
      const attachment = createMockAttachment();
      mockFetch.mockImplementation(() => new Promise(() => {}));

      await act(async () => {
        render(<MarkdownViewer attachment={attachment} />);
      });

      const toggleButton = screen.getByTitle(/brute/i);
      expect(toggleButton).toBeDisabled();
    });

    it('should disable toggle button on error', async () => {
      const attachment = createMockAttachment();
      mockFetch.mockResolvedValue({
        ok: false,
      });

      await act(async () => {
        render(<MarkdownViewer attachment={attachment} />);
      });

      await waitFor(() => {
        const toggleButton = screen.getByTitle(/brute/i);
        expect(toggleButton).toBeDisabled();
      });
    });
  });

  describe('Fullscreen/Lightbox Button', () => {
    it('should render fullscreen button when onOpenLightbox is provided', async () => {
      const attachment = createMockAttachment();
      const mockOpenLightbox = jest.fn();

      await act(async () => {
        render(<MarkdownViewer attachment={attachment} onOpenLightbox={mockOpenLightbox} />);
      });

      expect(screen.getByTitle(/plein.*cran/i)).toBeInTheDocument();
    });

    it('should not render fullscreen button when onOpenLightbox is not provided', async () => {
      const attachment = createMockAttachment();

      await act(async () => {
        render(<MarkdownViewer attachment={attachment} />);
      });

      expect(screen.queryByTitle(/plein.*cran/i)).toBeNull();
    });

    it('should call onOpenLightbox when fullscreen button is clicked', async () => {
      const attachment = createMockAttachment();
      const mockOpenLightbox = jest.fn();

      await act(async () => {
        render(<MarkdownViewer attachment={attachment} onOpenLightbox={mockOpenLightbox} />);
      });

      const fullscreenButton = screen.getByTitle(/plein.*cran/i);
      await act(async () => {
        fireEvent.click(fullscreenButton);
      });

      expect(mockOpenLightbox).toHaveBeenCalled();
    });
  });

  describe('Download Link', () => {
    it('should render download link', async () => {
      const attachment = createMockAttachment({
        fileUrl: 'https://example.com/download.md',
        originalName: 'download-me.md',
      });

      await act(async () => {
        render(<MarkdownViewer attachment={attachment} />);
      });

      const downloadLink = screen.getByTitle(/charger/i);
      expect(downloadLink).toBeInTheDocument();
      expect(downloadLink).toHaveAttribute('href', 'https://example.com/download.md');
      expect(downloadLink).toHaveAttribute('download', 'download-me.md');
    });

    it('should render download icon', async () => {
      const attachment = createMockAttachment();

      await act(async () => {
        render(<MarkdownViewer attachment={attachment} />);
      });

      expect(screen.getByTestId('download-icon')).toBeInTheDocument();
    });

    it('should stop event propagation when clicking download', async () => {
      const attachment = createMockAttachment();
      const mockParentClick = jest.fn();

      await act(async () => {
        render(
          <div onClick={mockParentClick}>
            <MarkdownViewer attachment={attachment} />
          </div>
        );
      });

      const downloadLink = screen.getByTitle(/charger/i);
      await act(async () => {
        fireEvent.click(downloadLink);
      });

      expect(mockParentClick).not.toHaveBeenCalled();
    });
  });

  describe('Delete Button', () => {
    it('should render delete button when canDelete is true and onDelete is provided', async () => {
      const attachment = createMockAttachment();
      const mockOnDelete = jest.fn();

      await act(async () => {
        render(<MarkdownViewer attachment={attachment} canDelete={true} onDelete={mockOnDelete} />);
      });

      expect(screen.getByTitle(/Supprimer/i)).toBeInTheDocument();
    });

    it('should not render delete button when canDelete is false', async () => {
      const attachment = createMockAttachment();
      const mockOnDelete = jest.fn();

      await act(async () => {
        render(<MarkdownViewer attachment={attachment} canDelete={false} onDelete={mockOnDelete} />);
      });

      expect(screen.queryByTitle(/Supprimer/i)).toBeNull();
    });

    it('should not render delete button when onDelete is not provided', async () => {
      const attachment = createMockAttachment();

      await act(async () => {
        render(<MarkdownViewer attachment={attachment} canDelete={true} />);
      });

      expect(screen.queryByTitle(/Supprimer/i)).toBeNull();
    });

    it('should call onDelete when delete button is clicked', async () => {
      const attachment = createMockAttachment();
      const mockOnDelete = jest.fn();

      await act(async () => {
        render(<MarkdownViewer attachment={attachment} canDelete={true} onDelete={mockOnDelete} />);
      });

      const deleteButton = screen.getByTitle(/Supprimer/i);
      await act(async () => {
        fireEvent.click(deleteButton);
      });

      expect(mockOnDelete).toHaveBeenCalled();
    });

    it('should stop event propagation when clicking delete', async () => {
      const attachment = createMockAttachment();
      const mockOnDelete = jest.fn();
      const mockParentClick = jest.fn();

      await act(async () => {
        render(
          <div onClick={mockParentClick}>
            <MarkdownViewer attachment={attachment} canDelete={true} onDelete={mockOnDelete} />
          </div>
        );
      });

      const deleteButton = screen.getByTitle(/Supprimer/i);
      await act(async () => {
        fireEvent.click(deleteButton);
      });

      expect(mockParentClick).not.toHaveBeenCalled();
    });
  });

  describe('Theme Support', () => {
    it('should pass dark theme to CodeHighlighter when theme is dark', async () => {
      (useTheme as jest.Mock).mockReturnValue({
        theme: 'dark',
        resolvedTheme: 'dark',
      });

      const attachment = createMockAttachment();

      await act(async () => {
        render(<MarkdownViewer attachment={attachment} />);
      });

      await waitFor(() => {
        expect(screen.getByTestId('react-markdown')).toBeInTheDocument();
      });
    });

    it('should pass light theme to CodeHighlighter when theme is light', async () => {
      (useTheme as jest.Mock).mockReturnValue({
        theme: 'light',
        resolvedTheme: 'light',
      });

      const attachment = createMockAttachment();

      await act(async () => {
        render(<MarkdownViewer attachment={attachment} />);
      });

      await waitFor(() => {
        expect(screen.getByTestId('react-markdown')).toBeInTheDocument();
      });
    });
  });

  describe('Filename Truncation', () => {
    it('should truncate long filenames on mobile', async () => {
      const attachment = createMockAttachment({
        originalName: 'this-is-a-very-long-filename-that-should-be-truncated.md',
      });

      const { container } = await act(async () => {
        return render(<MarkdownViewer attachment={attachment} />);
      });

      const desktopSpan = container.querySelector('.hidden.sm\\:inline');
      const mobileSpan = container.querySelector('.inline.sm\\:hidden');

      expect(desktopSpan).toHaveTextContent('this-is-a-very-long-filename-that-should-be-truncated.md');
      // Mobile should have truncated version
      expect(mobileSpan).toBeInTheDocument();
    });

    it('should not truncate short filenames', async () => {
      const attachment = createMockAttachment({
        originalName: 'short.md',
      });

      const { container } = await act(async () => {
        return render(<MarkdownViewer attachment={attachment} />);
      });

      const desktopSpan = container.querySelector('.hidden.sm\\:inline');
      const mobileSpan = container.querySelector('.inline.sm\\:hidden');

      expect(desktopSpan).toHaveTextContent('short.md');
      expect(mobileSpan).toHaveTextContent('short.md');
    });
  });

  describe('Responsive Design', () => {
    it('should have responsive height classes', async () => {
      const attachment = createMockAttachment();

      const { container } = await act(async () => {
        return render(<MarkdownViewer attachment={attachment} />);
      });

      const contentArea = container.querySelector('.h-\\[210px\\]');
      expect(contentArea).toBeInTheDocument();
    });

    it('should have max-width constraint', async () => {
      const attachment = createMockAttachment();

      const { container } = await act(async () => {
        return render(<MarkdownViewer attachment={attachment} />);
      });

      expect(container.firstChild).toHaveClass('sm:max-w-2xl');
    });
  });

  describe('Styling', () => {
    it('should have gradient background', async () => {
      const attachment = createMockAttachment();

      const { container } = await act(async () => {
        return render(<MarkdownViewer attachment={attachment} />);
      });

      expect(container.firstChild).toHaveClass('bg-gradient-to-br');
    });

    it('should have normal border when no error', async () => {
      const attachment = createMockAttachment();

      const { container } = await act(async () => {
        return render(<MarkdownViewer attachment={attachment} />);
      });

      await waitFor(() => {
        expect(container.firstChild).toHaveClass('border-green-200');
      });
    });

    it('should have shadow and hover effects', async () => {
      const attachment = createMockAttachment();

      const { container } = await act(async () => {
        return render(<MarkdownViewer attachment={attachment} />);
      });

      expect(container.firstChild).toHaveClass('shadow-md');
      expect(container.firstChild).toHaveClass('hover:shadow-lg');
    });
  });
});
