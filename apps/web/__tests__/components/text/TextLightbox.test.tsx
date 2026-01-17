/**
 * Tests for TextLightbox component
 * Tests fullscreen text/code viewer, syntax highlighting, copy, word wrap, and user interactions
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

// Mock react-syntax-highlighter
jest.mock('react-syntax-highlighter', () => ({
  Prism: ({ children, language, showLineNumbers, wrapLines, wrapLongLines, style }: any) => (
    <pre
      data-testid="syntax-highlighter"
      data-language={language}
      data-show-line-numbers={showLineNumbers}
      data-wrap-lines={wrapLines}
      data-wrap-long-lines={wrapLongLines}
    >
      {children}
    </pre>
  ),
}));

jest.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({
  vscDarkPlus: { name: 'vscDarkPlus' },
}));

// Mock sonner toast - declare mock object inline in the mock factory
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

// Get reference to the mocked toast for assertions
const mockToast = jest.requireMock('sonner').toast;

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  X: (props: any) => <svg data-testid="x-icon" {...props} />,
  Download: (props: any) => <svg data-testid="download-icon" {...props} />,
  Copy: (props: any) => <svg data-testid="copy-icon" {...props} />,
  Check: (props: any) => <svg data-testid="check-icon" {...props} />,
  WrapText: (props: any) => <svg data-testid="wraptext-icon" {...props} />,
  FileText: (props: any) => <svg data-testid="filetext-icon" {...props} />,
}));

// Mock Button component
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, className, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} className={className} {...props}>
      {children}
    </button>
  ),
}));

// Mock clipboard API
const mockWriteText = jest.fn();
Object.assign(navigator, {
  clipboard: {
    writeText: mockWriteText,
  },
});

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Import after mocks
import { TextLightbox } from '../../../components/text/TextLightbox';

// Create mock attachment
const createMockAttachment = (overrides: Partial<UploadedAttachmentResponse> = {}): UploadedAttachmentResponse => ({
  id: 'text-attachment-123',
  fileUrl: 'https://example.com/file.txt',
  originalName: 'test-file.txt',
  mimeType: 'text/plain',
  size: 1024,
  duration: undefined,
  createdAt: new Date().toISOString(),
  uploadedAt: new Date().toISOString(),
  storagePath: '/uploads/text/file.txt',
  ...overrides,
});

describe('TextLightbox', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('Hello, this is text content.\nLine 2\nLine 3'),
    });
    mockWriteText.mockResolvedValue(undefined);
    document.body.style.overflow = '';
  });

  afterEach(() => {
    document.body.style.overflow = '';
  });

  describe('Rendering', () => {
    it('should not render when isOpen is false', () => {
      const attachment = createMockAttachment();

      const { container } = render(
        <TextLightbox attachment={attachment} isOpen={false} onClose={jest.fn()} />
      );

      expect(container.firstChild).toBeNull();
    });

    it('should not render when attachment is null', () => {
      const { container } = render(
        <TextLightbox attachment={null} isOpen={true} onClose={jest.fn()} />
      );

      expect(container.firstChild).toBeNull();
    });

    it('should render when isOpen is true and attachment is provided', async () => {
      const attachment = createMockAttachment();

      await act(async () => {
        render(
          <TextLightbox attachment={attachment} isOpen={true} onClose={jest.fn()} />
        );
      });

      expect(screen.getByText('test-file.txt')).toBeInTheDocument();
    });

    it('should display attachment filename', async () => {
      const attachment = createMockAttachment({
        originalName: 'my-script.js',
      });

      await act(async () => {
        render(
          <TextLightbox attachment={attachment} isOpen={true} onClose={jest.fn()} />
        );
      });

      expect(screen.getByText('my-script.js')).toBeInTheDocument();
    });

    it('should display file extension and line count', async () => {
      const attachment = createMockAttachment({
        originalName: 'code.py',
      });
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('line1\nline2\nline3\nline4\nline5'),
      });

      await act(async () => {
        render(
          <TextLightbox attachment={attachment} isOpen={true} onClose={jest.fn()} />
        );
      });

      await waitFor(() => {
        expect(screen.getByText(/PY/)).toBeInTheDocument();
        expect(screen.getByText(/5 lignes/)).toBeInTheDocument();
      });
    });
  });

  describe('Content Loading', () => {
    it('should show loading spinner while fetching', async () => {
      const attachment = createMockAttachment();
      mockFetch.mockImplementation(() => new Promise(() => {}));

      await act(async () => {
        render(
          <TextLightbox attachment={attachment} isOpen={true} onClose={jest.fn()} />
        );
      });

      const spinner = document.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });

    it('should fetch content from attachment URL', async () => {
      const attachment = createMockAttachment({
        fileUrl: 'https://example.com/data.json',
      });

      await act(async () => {
        render(
          <TextLightbox attachment={attachment} isOpen={true} onClose={jest.fn()} />
        );
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('https://example.com/data.json');
      });
    });

    it('should display content with syntax highlighting', async () => {
      const attachment = createMockAttachment();
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('const x = 1;'),
      });

      await act(async () => {
        render(
          <TextLightbox attachment={attachment} isOpen={true} onClose={jest.fn()} />
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('syntax-highlighter')).toHaveTextContent('const x = 1;');
      });
    });
  });

  describe('Error Handling', () => {
    it('should show error message when fetch fails', async () => {
      const attachment = createMockAttachment();
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
      });

      await act(async () => {
        render(
          <TextLightbox attachment={attachment} isOpen={true} onClose={jest.fn()} />
        );
      });

      await waitFor(() => {
        expect(screen.getByText('Impossible de charger le fichier')).toBeInTheDocument();
      });
    });

    it('should show FileText icon on error', async () => {
      const attachment = createMockAttachment();
      mockFetch.mockRejectedValue(new Error('Network error'));

      await act(async () => {
        render(
          <TextLightbox attachment={attachment} isOpen={true} onClose={jest.fn()} />
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('filetext-icon')).toBeInTheDocument();
      });
    });
  });

  describe('Language Detection', () => {
    const extensionLanguageMap = [
      { extension: 'js', language: 'javascript' },
      { extension: 'ts', language: 'typescript' },
      { extension: 'tsx', language: 'tsx' },
      { extension: 'jsx', language: 'jsx' },
      { extension: 'py', language: 'python' },
      { extension: 'java', language: 'java' },
      { extension: 'go', language: 'go' },
      { extension: 'rs', language: 'rust' },
      { extension: 'rb', language: 'ruby' },
      { extension: 'php', language: 'php' },
      { extension: 'css', language: 'css' },
      { extension: 'html', language: 'html' },
      { extension: 'json', language: 'json' },
      { extension: 'yaml', language: 'yaml' },
      { extension: 'yml', language: 'yaml' },
      { extension: 'sql', language: 'sql' },
      { extension: 'sh', language: 'bash' },
      { extension: 'md', language: 'markdown' },
      { extension: 'txt', language: 'text' },
    ];

    extensionLanguageMap.forEach(({ extension, language }) => {
      it(`should detect ${language} from .${extension} extension`, async () => {
        const attachment = createMockAttachment({
          originalName: `file.${extension}`,
        });

        await act(async () => {
          render(
            <TextLightbox attachment={attachment} isOpen={true} onClose={jest.fn()} />
          );
        });

        await waitFor(() => {
          expect(screen.getByTestId('syntax-highlighter')).toHaveAttribute('data-language', language);
        });
      });
    });

    it('should default to text for unknown extensions', async () => {
      const attachment = createMockAttachment({
        originalName: 'file.xyz',
      });

      await act(async () => {
        render(
          <TextLightbox attachment={attachment} isOpen={true} onClose={jest.fn()} />
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('syntax-highlighter')).toHaveAttribute('data-language', 'text');
      });
    });

    it('should handle files without extension', async () => {
      const attachment = createMockAttachment({
        originalName: 'Makefile',
      });

      await act(async () => {
        render(
          <TextLightbox attachment={attachment} isOpen={true} onClose={jest.fn()} />
        );
      });

      await waitFor(() => {
        // Files without extension should default to 'txt' then 'text'
        expect(screen.getByTestId('syntax-highlighter')).toBeInTheDocument();
      });
    });
  });

  describe('Word Wrap Toggle', () => {
    it('should start with word wrap enabled', async () => {
      const attachment = createMockAttachment();

      await act(async () => {
        render(
          <TextLightbox attachment={attachment} isOpen={true} onClose={jest.fn()} />
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('syntax-highlighter')).toHaveAttribute('data-wrap-lines', 'true');
      });
    });

    it('should toggle word wrap when button is clicked', async () => {
      const attachment = createMockAttachment();

      await act(async () => {
        render(
          <TextLightbox attachment={attachment} isOpen={true} onClose={jest.fn()} />
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('syntax-highlighter')).toBeInTheDocument();
      });

      const wrapButton = screen.getByLabelText(/retour.*ligne/i);
      await act(async () => {
        fireEvent.click(wrapButton);
      });

      expect(screen.getByTestId('syntax-highlighter')).toHaveAttribute('data-wrap-lines', 'false');
    });

    it('should disable word wrap button while loading', async () => {
      const attachment = createMockAttachment();
      mockFetch.mockImplementation(() => new Promise(() => {}));

      await act(async () => {
        render(
          <TextLightbox attachment={attachment} isOpen={true} onClose={jest.fn()} />
        );
      });

      const wrapButton = screen.getByLabelText(/retour.*ligne/i);
      expect(wrapButton).toBeDisabled();
    });

    it('should disable word wrap button on error', async () => {
      const attachment = createMockAttachment();
      mockFetch.mockResolvedValue({ ok: false });

      await act(async () => {
        render(
          <TextLightbox attachment={attachment} isOpen={true} onClose={jest.fn()} />
        );
      });

      await waitFor(() => {
        const wrapButton = screen.getByLabelText(/retour.*ligne/i);
        expect(wrapButton).toBeDisabled();
      });
    });
  });

  describe('Copy Functionality', () => {
    it('should copy content to clipboard when copy button is clicked', async () => {
      const attachment = createMockAttachment();
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('content to copy'),
      });

      await act(async () => {
        render(
          <TextLightbox attachment={attachment} isOpen={true} onClose={jest.fn()} />
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('syntax-highlighter')).toBeInTheDocument();
      });

      const copyButton = screen.getByLabelText(/copier/i);
      await act(async () => {
        fireEvent.click(copyButton);
      });

      expect(mockWriteText).toHaveBeenCalledWith('content to copy');
    });

    it('should show success toast after copying', async () => {
      const attachment = createMockAttachment();

      await act(async () => {
        render(
          <TextLightbox attachment={attachment} isOpen={true} onClose={jest.fn()} />
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('syntax-highlighter')).toBeInTheDocument();
      });

      const copyButton = screen.getByLabelText(/copier/i);
      await act(async () => {
        fireEvent.click(copyButton);
      });

      expect(mockToast.success).toHaveBeenCalledWith(expect.stringMatching(/presse-papiers/i));
    });

    it('should show check icon temporarily after copying', async () => {
      jest.useFakeTimers();
      const attachment = createMockAttachment();

      await act(async () => {
        render(
          <TextLightbox attachment={attachment} isOpen={true} onClose={jest.fn()} />
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('syntax-highlighter')).toBeInTheDocument();
      });

      const copyButton = screen.getByLabelText(/copier/i);
      await act(async () => {
        fireEvent.click(copyButton);
      });

      expect(screen.getByTestId('check-icon')).toBeInTheDocument();

      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      expect(screen.getByTestId('copy-icon')).toBeInTheDocument();

      jest.useRealTimers();
    });

    it('should show error toast when copy fails', async () => {
      mockWriteText.mockRejectedValue(new Error('Copy failed'));
      const attachment = createMockAttachment();

      await act(async () => {
        render(
          <TextLightbox attachment={attachment} isOpen={true} onClose={jest.fn()} />
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('syntax-highlighter')).toBeInTheDocument();
      });

      const copyButton = screen.getByLabelText(/copier/i);
      await act(async () => {
        fireEvent.click(copyButton);
      });

      expect(mockToast.error).toHaveBeenCalledWith('Impossible de copier');
    });

    it('should disable copy button while loading', async () => {
      const attachment = createMockAttachment();
      mockFetch.mockImplementation(() => new Promise(() => {}));

      await act(async () => {
        render(
          <TextLightbox attachment={attachment} isOpen={true} onClose={jest.fn()} />
        );
      });

      const copyButton = screen.getByLabelText(/copier/i);
      expect(copyButton).toBeDisabled();
    });
  });

  describe('Close Functionality', () => {
    it('should call onClose when close button is clicked', async () => {
      const attachment = createMockAttachment();
      const mockOnClose = jest.fn();

      await act(async () => {
        render(
          <TextLightbox attachment={attachment} isOpen={true} onClose={mockOnClose} />
        );
      });

      const closeButton = screen.getByLabelText(/fermer/i);
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
          <TextLightbox attachment={attachment} isOpen={true} onClose={mockOnClose} />
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
          <TextLightbox attachment={attachment} isOpen={true} onClose={mockOnClose} />
        );
      });

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
          <TextLightbox attachment={attachment} isOpen={true} onClose={mockOnClose} />
        );
      });

      const contentArea = document.querySelector('.bg-\\[\\#1e1e1e\\]');
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
          <TextLightbox attachment={attachment} isOpen={true} onClose={jest.fn()} />
        );
      });

      expect(screen.getByLabelText(/charger le fichier/i)).toBeInTheDocument();
    });

    it('should have download button with download icon', async () => {
      const attachment = createMockAttachment({
        fileUrl: 'https://example.com/download.txt',
        originalName: 'download.txt',
      });

      await act(async () => {
        render(
          <TextLightbox attachment={attachment} isOpen={true} onClose={jest.fn()} />
        );
      });

      const downloadButton = screen.getByLabelText(/charger le fichier/i);
      expect(downloadButton).toBeInTheDocument();
      expect(screen.getByTestId('download-icon')).toBeInTheDocument();
    });
  });

  describe('Body Scroll Lock', () => {
    it('should lock body scroll when opened', async () => {
      const attachment = createMockAttachment();

      await act(async () => {
        render(
          <TextLightbox attachment={attachment} isOpen={true} onClose={jest.fn()} />
        );
      });

      expect(document.body.style.overflow).toBe('hidden');
    });

    it('should restore body scroll when closed', async () => {
      const attachment = createMockAttachment();

      const { rerender } = await act(async () => {
        return render(
          <TextLightbox attachment={attachment} isOpen={true} onClose={jest.fn()} />
        );
      });

      expect(document.body.style.overflow).toBe('hidden');

      await act(async () => {
        rerender(
          <TextLightbox attachment={attachment} isOpen={false} onClose={jest.fn()} />
        );
      });

      expect(document.body.style.overflow).toBe('');
    });

    it('should restore body scroll on unmount', async () => {
      const attachment = createMockAttachment();

      const { unmount } = await act(async () => {
        return render(
          <TextLightbox attachment={attachment} isOpen={true} onClose={jest.fn()} />
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
          <TextLightbox attachment={attachment} isOpen={true} onClose={jest.fn()} />
        );
      });

      expect(screen.getByLabelText(/fermer/i)).toBeInTheDocument();
    });

    it('should have copy button with aria-label', async () => {
      const attachment = createMockAttachment();

      await act(async () => {
        render(
          <TextLightbox attachment={attachment} isOpen={true} onClose={jest.fn()} />
        );
      });

      expect(screen.getByLabelText(/copier/i)).toBeInTheDocument();
    });

    it('should display keyboard hint on desktop', async () => {
      const attachment = createMockAttachment();

      const { container } = await act(async () => {
        return render(
          <TextLightbox attachment={attachment} isOpen={true} onClose={jest.fn()} />
        );
      });

      // The hint is hidden on mobile (hidden md:block), so check for the element's existence
      const hint = container.querySelector('.md\\:block');
      expect(hint).toBeInTheDocument();
    });
  });

  describe('Syntax Highlighting', () => {
    it('should show line numbers', async () => {
      const attachment = createMockAttachment();

      await act(async () => {
        render(
          <TextLightbox attachment={attachment} isOpen={true} onClose={jest.fn()} />
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('syntax-highlighter')).toHaveAttribute('data-show-line-numbers', 'true');
      });
    });
  });
});
