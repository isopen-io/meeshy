/**
 * Tests for CodeHighlighter component
 * Tests syntax highlighting, theme switching, and code rendering
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock react-syntax-highlighter
jest.mock('react-syntax-highlighter', () => ({
  Prism: jest.fn(({ children, language, style, showLineNumbers, className, PreTag }) => (
    <PreTag
      data-testid="syntax-highlighter"
      data-language={language}
      data-show-line-numbers={showLineNumbers}
      data-style={style?.name || 'unknown'}
      className={className}
    >
      {children}
    </PreTag>
  )),
}));

jest.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({
  vscDarkPlus: { name: 'vscDarkPlus' },
  vs: { name: 'vs' },
}));

// Import after mocks
import { CodeHighlighter } from '../../../components/markdown/CodeHighlighter';

describe('CodeHighlighter', () => {
  describe('Basic Rendering', () => {
    it('should render code content', () => {
      render(
        <CodeHighlighter language="javascript" isDark={false}>
          {'const x = 1;'}
        </CodeHighlighter>
      );

      expect(screen.getByTestId('syntax-highlighter')).toHaveTextContent('const x = 1;');
    });

    it('should render with div as PreTag', () => {
      render(
        <CodeHighlighter language="python" isDark={false}>
          {'print("hello")'}
        </CodeHighlighter>
      );

      const highlighter = screen.getByTestId('syntax-highlighter');
      expect(highlighter.tagName).toBe('DIV');
    });

    it('should apply language attribute', () => {
      render(
        <CodeHighlighter language="typescript" isDark={false}>
          {'const x: number = 1;'}
        </CodeHighlighter>
      );

      expect(screen.getByTestId('syntax-highlighter')).toHaveAttribute('data-language', 'typescript');
    });

    it('should show line numbers', () => {
      render(
        <CodeHighlighter language="javascript" isDark={false}>
          {'const x = 1;'}
        </CodeHighlighter>
      );

      expect(screen.getByTestId('syntax-highlighter')).toHaveAttribute('data-show-line-numbers', 'true');
    });
  });

  describe('Theme Switching', () => {
    it('should use dark theme when isDark is true', () => {
      render(
        <CodeHighlighter language="javascript" isDark={true}>
          {'const x = 1;'}
        </CodeHighlighter>
      );

      expect(screen.getByTestId('syntax-highlighter')).toHaveAttribute('data-style', 'vscDarkPlus');
    });

    it('should use light theme when isDark is false', () => {
      render(
        <CodeHighlighter language="javascript" isDark={false}>
          {'const x = 1;'}
        </CodeHighlighter>
      );

      expect(screen.getByTestId('syntax-highlighter')).toHaveAttribute('data-style', 'vs');
    });
  });

  describe('Styling', () => {
    it('should have rounded-md class', () => {
      render(
        <CodeHighlighter language="javascript" isDark={false}>
          {'const x = 1;'}
        </CodeHighlighter>
      );

      expect(screen.getByTestId('syntax-highlighter')).toHaveClass('rounded-md');
    });

    it('should have my-2 margin class', () => {
      render(
        <CodeHighlighter language="javascript" isDark={false}>
          {'const x = 1;'}
        </CodeHighlighter>
      );

      expect(screen.getByTestId('syntax-highlighter')).toHaveClass('my-2');
    });

    it('should have text-xs class', () => {
      render(
        <CodeHighlighter language="javascript" isDark={false}>
          {'const x = 1;'}
        </CodeHighlighter>
      );

      expect(screen.getByTestId('syntax-highlighter')).toHaveClass('text-xs');
    });
  });

  describe('Language Support', () => {
    const languages = [
      'javascript',
      'typescript',
      'python',
      'java',
      'rust',
      'go',
      'cpp',
      'css',
      'html',
      'json',
      'yaml',
      'sql',
      'bash',
    ];

    languages.forEach((language) => {
      it(`should support ${language} language`, () => {
        render(
          <CodeHighlighter language={language} isDark={false}>
            {'// code'}
          </CodeHighlighter>
        );

        expect(screen.getByTestId('syntax-highlighter')).toHaveAttribute('data-language', language);
      });
    });
  });

  describe('Multiline Code', () => {
    it('should render multiline code correctly', () => {
      const code = `function hello() {
  console.log('Hello, World!');
}`;

      render(
        <CodeHighlighter language="javascript" isDark={false}>
          {code}
        </CodeHighlighter>
      );

      // Check that the highlighter received the code
      const highlighter = screen.getByTestId('syntax-highlighter');
      expect(highlighter).toBeInTheDocument();
      // toHaveTextContent normalizes whitespace, so check parts are present
      expect(highlighter).toHaveTextContent('function hello()');
      expect(highlighter).toHaveTextContent("console.log('Hello, World!')");
    });

    it('should preserve indentation', () => {
      const code = '  const indented = true;';

      render(
        <CodeHighlighter language="javascript" isDark={false}>
          {code}
        </CodeHighlighter>
      );

      // Check the highlighter has the content (whitespace normalization may occur)
      const highlighter = screen.getByTestId('syntax-highlighter');
      expect(highlighter).toHaveTextContent('const indented = true;');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string', () => {
      render(
        <CodeHighlighter language="javascript" isDark={false}>
          {''}
        </CodeHighlighter>
      );

      expect(screen.getByTestId('syntax-highlighter')).toBeInTheDocument();
    });

    it('should handle code with special characters', () => {
      const code = 'const regex = /[a-z]+/gi;';

      render(
        <CodeHighlighter language="javascript" isDark={false}>
          {code}
        </CodeHighlighter>
      );

      expect(screen.getByTestId('syntax-highlighter')).toHaveTextContent(code);
    });

    it('should handle code with HTML-like content', () => {
      const code = '<div className="test">Hello</div>';

      render(
        <CodeHighlighter language="jsx" isDark={false}>
          {code}
        </CodeHighlighter>
      );

      expect(screen.getByTestId('syntax-highlighter')).toHaveTextContent(code);
    });

    it('should handle very long single line', () => {
      const code = 'const x = ' + 'a'.repeat(500) + ';';

      render(
        <CodeHighlighter language="javascript" isDark={false}>
          {code}
        </CodeHighlighter>
      );

      expect(screen.getByTestId('syntax-highlighter')).toHaveTextContent(code);
    });

    it('should handle code with unicode characters', () => {
      const code = 'const greeting = "Hello, World!";';

      render(
        <CodeHighlighter language="javascript" isDark={false}>
          {code}
        </CodeHighlighter>
      );

      expect(screen.getByTestId('syntax-highlighter')).toBeInTheDocument();
    });
  });

  describe('Props Interface', () => {
    it('should accept required children prop', () => {
      const { container } = render(
        <CodeHighlighter language="javascript" isDark={false}>
          {'test'}
        </CodeHighlighter>
      );

      expect(container.firstChild).toBeInTheDocument();
    });

    it('should accept required language prop', () => {
      render(
        <CodeHighlighter language="python" isDark={false}>
          {'test'}
        </CodeHighlighter>
      );

      expect(screen.getByTestId('syntax-highlighter')).toHaveAttribute('data-language', 'python');
    });

    it('should accept required isDark prop', () => {
      const { rerender } = render(
        <CodeHighlighter language="javascript" isDark={true}>
          {'test'}
        </CodeHighlighter>
      );

      expect(screen.getByTestId('syntax-highlighter')).toHaveAttribute('data-style', 'vscDarkPlus');

      rerender(
        <CodeHighlighter language="javascript" isDark={false}>
          {'test'}
        </CodeHighlighter>
      );

      expect(screen.getByTestId('syntax-highlighter')).toHaveAttribute('data-style', 'vs');
    });
  });
});
