/**
 * Tests for TextViewer component
 * Tests text/code rendering, syntax highlighting, copy, word wrap, and action controls
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { UploadedAttachmentResponse } from '@meeshy/shared/types/attachment';

// Mock next-themes
jest.mock('next-themes', () => ({
  useTheme: jest.fn(() => ({
    theme: 'light',
    resolvedTheme: 'light',
  })),
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
      data-style={style?.name || 'unknown'}
    >
      {children}
    </pre>
  ),
}));

jest.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({
  vscDarkPlus: { name: 'vscDarkPlus' },
  vs: { name: 'vs' },
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
  Download: (props: any) => <svg data-testid="download-icon" {...props} />,
  AlertTriangle: (props: any) => <svg data-testid="alert-triangle-icon" {...props} />,
  Maximize: (props: any) => <svg data-testid="maximize-icon" {...props} />,
  FileText: (props: any) => <svg data-testid="filetext-icon" {...props} />,
  Copy: (props: any) => <svg data-testid="copy-icon" {...props} />,
  Check: (props: any) => <svg data-testid="check-icon" {...props} />,
  WrapText: (props: any) => <svg data-testid="wraptext-icon" {...props} />,
}));

// Mock Button component
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, className, title, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} className={className} title={title} {...props}>
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
import { TextViewer } from '../../../components/text/TextViewer';
import { useTheme } from 'next-themes';

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

describe('TextViewer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('Hello, this is text content.\nLine 2\nLine 3'),
    });
    mockWriteText.mockResolvedValue(undefined);
    (useTheme as jest.Mock).mockReturnValue({
      theme: 'light',
      resolvedTheme: 'light',
    });
  });

  describe('Basic Rendering', () => {
    it('should render component with attachment', async () => {
      const attachment = createMockAttachment();

      await act(async () => {
        render(<TextViewer attachment={attachment} />);
      });

      await waitFor(() => {
        expect(screen.getByTestId('syntax-highlighter')).toBeInTheDocument();
      });
    });

    it('should display filename', async () => {
      const attachment = createMockAttachment({
        originalName: 'my-script.py',
      });

      await act(async () => {
        render(<TextViewer attachment={attachment} />);
      });

      await waitFor(() => {
        expect(screen.getByText('my-script.py')).toBeInTheDocument();
      });
    });

    it('should display file extension badge', async () => {
      const attachment = createMockAttachment({
        originalName: 'code.js',
      });

      await act(async () => {
        render(<TextViewer attachment={attachment} />);
      });

      await waitFor(() => {
        expect(screen.getByText('JS')).toBeInTheDocument();
      });
    });

    it('should display line count', async () => {
      const attachment = createMockAttachment();
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('line1\nline2\nline3\nline4'),
      });

      await act(async () => {
        render(<TextViewer attachment={attachment} />);
      });

      await waitFor(() => {
        expect(screen.getByText('4 lignes')).toBeInTheDocument();
      });
    });

    it('should apply custom className', async () => {
      const attachment = createMockAttachment();

      const { container } = await act(async () => {
        return render(<TextViewer attachment={attachment} className="custom-class" />);
      });

      expect(container.firstChild).toHaveClass('custom-class');
    });
  });

  describe('Content Loading', () => {
    it('should show loading spinner while fetching', async () => {
      const attachment = createMockAttachment();
      mockFetch.mockImplementation(() => new Promise(() => {}));

      await act(async () => {
        render(<TextViewer attachment={attachment} />);
      });

      const spinner = document.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });

    it('should fetch content from attachment URL', async () => {
      const attachment = createMockAttachment({
        fileUrl: 'https://example.com/data.json',
      });

      await act(async () => {
        render(<TextViewer attachment={attachment} />);
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
        render(<TextViewer attachment={attachment} />);
      });

      await waitFor(() => {
        expect(screen.getByTestId('syntax-highlighter')).toHaveTextContent('const x = 1;');
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
        render(<TextViewer attachment={attachment} />);
      });

      await waitFor(() => {
        expect(screen.getByText('Impossible de charger le fichier')).toBeInTheDocument();
      });
    });

    it('should show alert icon on error', async () => {
      const attachment = createMockAttachment();
      mockFetch.mockResolvedValue({ ok: false });

      await act(async () => {
        render(<TextViewer attachment={attachment} />);
      });

      await waitFor(() => {
        expect(screen.getByTestId('alert-triangle-icon')).toBeInTheDocument();
      });
    });

    it('should show error border on error', async () => {
      const attachment = createMockAttachment();
      mockFetch.mockResolvedValue({ ok: false });

      const { container } = await act(async () => {
        return render(<TextViewer attachment={attachment} />);
      });

      await waitFor(() => {
        expect(container.firstChild).toHaveClass('border-red-300');
      });
    });

    it('should handle network error', async () => {
      const attachment = createMockAttachment();
      mockFetch.mockRejectedValue(new Error('Network error'));

      await act(async () => {
        render(<TextViewer attachment={attachment} />);
      });

      await waitFor(() => {
        expect(screen.getByText('Impossible de charger le fichier')).toBeInTheDocument();
      });
    });
  });

  describe('Language Detection', () => {
    const extensionLanguageMap = [
      { extension: 'js', language: 'javascript' },
      { extension: 'mjs', language: 'javascript' },
      { extension: 'cjs', language: 'javascript' },
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
      { extension: 'scss', language: 'scss' },
      { extension: 'html', language: 'html' },
      { extension: 'json', language: 'json' },
      { extension: 'yaml', language: 'yaml' },
      { extension: 'yml', language: 'yaml' },
      { extension: 'sql', language: 'sql' },
      { extension: 'sh', language: 'bash' },
      { extension: 'bash', language: 'bash' },
      { extension: 'md', language: 'markdown' },
      { extension: 'txt', language: 'text' },
      { extension: 'c', language: 'c' },
      { extension: 'cpp', language: 'cpp' },
      { extension: 'h', language: 'c' },
      { extension: 'swift', language: 'swift' },
      { extension: 'kt', language: 'kotlin' },
      { extension: 'dart', language: 'dart' },
      { extension: 'lua', language: 'lua' },
      { extension: 'xml', language: 'xml' },
      { extension: 'toml', language: 'toml' },
      { extension: 'ini', language: 'ini' },
      { extension: 'graphql', language: 'graphql' },
    ];

    extensionLanguageMap.forEach(({ extension, language }) => {
      it(`should detect ${language} from .${extension} extension`, async () => {
        const attachment = createMockAttachment({
          originalName: `file.${extension}`,
        });

        await act(async () => {
          render(<TextViewer attachment={attachment} />);
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
        render(<TextViewer attachment={attachment} />);
      });

      await waitFor(() => {
        expect(screen.getByTestId('syntax-highlighter')).toHaveAttribute('data-language', 'text');
      });
    });
  });

  describe('Theme Support', () => {
    it('should use light theme when theme is light', async () => {
      (useTheme as jest.Mock).mockReturnValue({
        theme: 'light',
        resolvedTheme: 'light',
      });

      const attachment = createMockAttachment();

      await act(async () => {
        render(<TextViewer attachment={attachment} />);
      });

      await waitFor(() => {
        expect(screen.getByTestId('syntax-highlighter')).toHaveAttribute('data-style', 'vs');
      });
    });

    it('should use dark theme when theme is dark', async () => {
      (useTheme as jest.Mock).mockReturnValue({
        theme: 'dark',
        resolvedTheme: 'dark',
      });

      const attachment = createMockAttachment();

      await act(async () => {
        render(<TextViewer attachment={attachment} />);
      });

      await waitFor(() => {
        expect(screen.getByTestId('syntax-highlighter')).toHaveAttribute('data-style', 'vscDarkPlus');
      });
    });

    it('should use resolvedTheme when theme is system', async () => {
      (useTheme as jest.Mock).mockReturnValue({
        theme: 'system',
        resolvedTheme: 'dark',
      });

      const attachment = createMockAttachment();

      await act(async () => {
        render(<TextViewer attachment={attachment} />);
      });

      await waitFor(() => {
        expect(screen.getByTestId('syntax-highlighter')).toHaveAttribute('data-style', 'vscDarkPlus');
      });
    });
  });

  describe('Word Wrap Toggle', () => {
    it('should start with word wrap enabled', async () => {
      const attachment = createMockAttachment();

      await act(async () => {
        render(<TextViewer attachment={attachment} />);
      });

      await waitFor(() => {
        expect(screen.getByTestId('syntax-highlighter')).toHaveAttribute('data-wrap-lines', 'true');
      });
    });

    it('should toggle word wrap when button is clicked', async () => {
      const attachment = createMockAttachment();

      await act(async () => {
        render(<TextViewer attachment={attachment} />);
      });

      await waitFor(() => {
        expect(screen.getByTestId('syntax-highlighter')).toBeInTheDocument();
      });

      const wrapButton = screen.getByTitle(/retour.*ligne/i);
      await act(async () => {
        fireEvent.click(wrapButton);
      });

      expect(screen.getByTestId('syntax-highlighter')).toHaveAttribute('data-wrap-lines', 'false');
    });

    it('should disable word wrap button while loading', async () => {
      const attachment = createMockAttachment();
      mockFetch.mockImplementation(() => new Promise(() => {}));

      await act(async () => {
        render(<TextViewer attachment={attachment} />);
      });

      const wrapButton = screen.getByTitle(/retour.*ligne/i);
      expect(wrapButton).toBeDisabled();
    });

    it('should disable word wrap button on error', async () => {
      const attachment = createMockAttachment();
      mockFetch.mockResolvedValue({ ok: false });

      await act(async () => {
        render(<TextViewer attachment={attachment} />);
      });

      await waitFor(() => {
        const wrapButton = screen.getByTitle(/retour.*ligne/i);
        expect(wrapButton).toBeDisabled();
      });
    });

    it('should highlight wrap button when enabled', async () => {
      const attachment = createMockAttachment();

      const { container } = await act(async () => {
        return render(<TextViewer attachment={attachment} />);
      });

      await waitFor(() => {
        const wrapIcon = container.querySelector('.text-blue-600');
        expect(wrapIcon).toBeInTheDocument();
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
        render(<TextViewer attachment={attachment} />);
      });

      await waitFor(() => {
        expect(screen.getByTestId('syntax-highlighter')).toBeInTheDocument();
      });

      const copyButton = screen.getByTitle(/copier/i);
      await act(async () => {
        fireEvent.click(copyButton);
      });

      expect(mockWriteText).toHaveBeenCalledWith('content to copy');
    });

    it('should show success toast after copying', async () => {
      const attachment = createMockAttachment();

      await act(async () => {
        render(<TextViewer attachment={attachment} />);
      });

      await waitFor(() => {
        expect(screen.getByTestId('syntax-highlighter')).toBeInTheDocument();
      });

      const copyButton = screen.getByTitle(/copier/i);
      await act(async () => {
        fireEvent.click(copyButton);
      });

      expect(mockToast.success).toHaveBeenCalledWith(expect.stringMatching(/presse-papiers/i));
    });

    it('should show check icon temporarily after copying', async () => {
      jest.useFakeTimers();
      const attachment = createMockAttachment();

      await act(async () => {
        render(<TextViewer attachment={attachment} />);
      });

      await waitFor(() => {
        expect(screen.getByTestId('syntax-highlighter')).toBeInTheDocument();
      });

      const copyButton = screen.getByTitle(/copier/i);
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
        render(<TextViewer attachment={attachment} />);
      });

      await waitFor(() => {
        expect(screen.getByTestId('syntax-highlighter')).toBeInTheDocument();
      });

      const copyButton = screen.getByTitle(/copier/i);
      await act(async () => {
        fireEvent.click(copyButton);
      });

      expect(mockToast.error).toHaveBeenCalledWith('Impossible de copier');
    });

    it('should disable copy button while loading', async () => {
      const attachment = createMockAttachment();
      mockFetch.mockImplementation(() => new Promise(() => {}));

      await act(async () => {
        render(<TextViewer attachment={attachment} />);
      });

      const copyButton = screen.getByTitle(/copier/i);
      expect(copyButton).toBeDisabled();
    });
  });

  describe('Fullscreen/Lightbox Button', () => {
    it('should render fullscreen button when onOpenLightbox is provided', async () => {
      const attachment = createMockAttachment();
      const mockOpenLightbox = jest.fn();

      await act(async () => {
        render(<TextViewer attachment={attachment} onOpenLightbox={mockOpenLightbox} />);
      });

      expect(screen.getByTitle(/plein.*cran/i)).toBeInTheDocument();
    });

    it('should not render fullscreen button when onOpenLightbox is not provided', async () => {
      const attachment = createMockAttachment();

      await act(async () => {
        render(<TextViewer attachment={attachment} />);
      });

      expect(screen.queryByTitle(/plein.*cran/i)).toBeNull();
    });

    it('should call onOpenLightbox when fullscreen button is clicked', async () => {
      const attachment = createMockAttachment();
      const mockOpenLightbox = jest.fn();

      await act(async () => {
        render(<TextViewer attachment={attachment} onOpenLightbox={mockOpenLightbox} />);
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
        fileUrl: 'https://example.com/download.txt',
        originalName: 'download.txt',
      });

      await act(async () => {
        render(<TextViewer attachment={attachment} />);
      });

      const downloadLink = screen.getByTitle(/charger/i);
      expect(downloadLink).toBeInTheDocument();
      expect(downloadLink).toHaveAttribute('href', 'https://example.com/download.txt');
      expect(downloadLink).toHaveAttribute('download', 'download.txt');
    });

    it('should render download icon', async () => {
      const attachment = createMockAttachment();

      await act(async () => {
        render(<TextViewer attachment={attachment} />);
      });

      expect(screen.getByTestId('download-icon')).toBeInTheDocument();
    });

    it('should stop event propagation when clicking download', async () => {
      const attachment = createMockAttachment();
      const mockParentClick = jest.fn();

      await act(async () => {
        render(
          <div onClick={mockParentClick}>
            <TextViewer attachment={attachment} />
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

  describe('Responsive Design', () => {
    it('should have responsive height classes', async () => {
      const attachment = createMockAttachment();

      const { container } = await act(async () => {
        return render(<TextViewer attachment={attachment} />);
      });

      const contentArea = container.querySelector('.h-\\[210px\\]');
      expect(contentArea).toBeInTheDocument();
    });

    it('should have max-width constraint', async () => {
      const attachment = createMockAttachment();

      const { container } = await act(async () => {
        return render(<TextViewer attachment={attachment} />);
      });

      expect(container.firstChild).toHaveClass('sm:max-w-2xl');
    });
  });

  describe('Styling', () => {
    it('should have gradient background', async () => {
      const attachment = createMockAttachment();

      const { container } = await act(async () => {
        return render(<TextViewer attachment={attachment} />);
      });

      expect(container.firstChild).toHaveClass('bg-gradient-to-br');
    });

    it('should have normal border when no error', async () => {
      const attachment = createMockAttachment();

      const { container } = await act(async () => {
        return render(<TextViewer attachment={attachment} />);
      });

      await waitFor(() => {
        expect(container.firstChild).toHaveClass('border-blue-200');
      });
    });

    it('should have shadow and hover effects', async () => {
      const attachment = createMockAttachment();

      const { container } = await act(async () => {
        return render(<TextViewer attachment={attachment} />);
      });

      expect(container.firstChild).toHaveClass('shadow-md');
      expect(container.firstChild).toHaveClass('hover:shadow-lg');
    });
  });

  describe('Syntax Highlighting Options', () => {
    it('should not show line numbers by default', async () => {
      const attachment = createMockAttachment();

      await act(async () => {
        render(<TextViewer attachment={attachment} />);
      });

      await waitFor(() => {
        expect(screen.getByTestId('syntax-highlighter')).toHaveAttribute('data-show-line-numbers', 'false');
      });
    });
  });

  describe('FileText Icon', () => {
    it('should display FileText icon in header', async () => {
      const attachment = createMockAttachment();

      await act(async () => {
        render(<TextViewer attachment={attachment} />);
      });

      await waitFor(() => {
        // There may be multiple FileText icons - one in header, one possibly in error state
        const icons = screen.getAllByTestId('filetext-icon');
        expect(icons.length).toBeGreaterThan(0);
      });
    });
  });
});
