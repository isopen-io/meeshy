'use client';

import React, { useCallback, useMemo } from 'react';
import { useResolvedTheme } from '@/hooks/use-resolved-theme';
import { cn } from '@/lib/utils';
import {
  parseMessageLinks,
  recordTrackingLinkClick,
  generateDeviceFingerprint,
} from '@/lib/utils/link-parser';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { MermaidDiagram } from '@/components/markdown/MermaidDiagram';
import { normalizeMarkdown } from './normalize-markdown';
import { preprocessContent } from './preprocess-content';

interface MarkdownMessageProps {
  content: string;
  className?: string;
  enableTracking?: boolean;
  onLinkClick?: (url: string, isTracking: boolean) => void;
  isOwnMessage?: boolean; // Pour adapter les couleurs en fonction de l'expéditeur
}

/**
 * Component to render message content with ReactMarkdown support
 * Features:
 * - GitHub Flavored Markdown (tables, task lists, strikethrough)
 * - Text formatting (bold, italic, code)
 * - Line breaks preservation
 * - Links and images with security
 * - Headings (H1-H6)
 * - Code blocks with syntax highlighting
 * - Blockquotes
 * - Lists (ordered and unordered)
 * - Tracking link support (including m+TOKEN format)
 * - Mentions colorées (/u/username)
 */
export const MarkdownMessage: React.FC<MarkdownMessageProps> = ({
  content,
  className = '',
  enableTracking = true,
  onLinkClick,
  _isOwnMessage = false
}) => {
  const isDark = useResolvedTheme() === 'dark';

  // Prétraiter le contenu pour transformer les liens m+TOKEN et normaliser le markdown
  const preprocessedContent = useMemo(() => {
    const withLinks = preprocessContent(content);
    return normalizeMarkdown(withLinks);
  }, [content]);

  // Handle link clicks with tracking support
  const handleClick = useCallback(
    async (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;

      // Vérifier si c'est un lien
      if (target.tagName === 'A') {
        const anchor = target as HTMLAnchorElement;
        const href = anchor.getAttribute('href');

        if (!href) return;

        // Si c'est une mention, laisser la navigation normale
        if (href.startsWith('/u/')) {
          return;
        }

        // Parse the link to check if it's a tracking link
        const parsedParts = parseMessageLinks(href);
        const linkPart = parsedParts.find(part => part.type !== 'text');

        if (!linkPart) {
          // Regular link, let default behavior handle it
          return;
        }

        const isTracking = linkPart.type === 'tracking-link' || linkPart.type === 'mshy-link';

        // If it's a tracking link and tracking is enabled
        if (isTracking && enableTracking && linkPart.token) {
          e.preventDefault();

          try {
            const deviceFingerprint = generateDeviceFingerprint();
            const result = await recordTrackingLinkClick(linkPart.token, {
              referrer: document.referrer,
              deviceFingerprint,
            });

            if (result.success && result.originalUrl) {
              const newWindow = window.open(result.originalUrl, '_blank', 'noopener,noreferrer');
              if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
                window.location.href = result.originalUrl;
              }
            } else {
              const fallbackUrl = linkPart.type === 'mshy-link' ? linkPart.trackingUrl! : href;
              const newWindow = window.open(fallbackUrl, '_blank', 'noopener,noreferrer');
              if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
                window.location.href = fallbackUrl;
              }
            }
          } catch (error) {
            console.error('Error handling tracking link click:', error);
            const fallbackUrl = linkPart.type === 'mshy-link' ? linkPart.trackingUrl! : href;
            const newWindow = window.open(fallbackUrl, '_blank', 'noopener,noreferrer');
            if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
              window.location.href = fallbackUrl;
            }
          }
        }

        // Call the callback if provided
        if (onLinkClick) {
          const url = linkPart.type === 'tracking-link' || linkPart.type === 'mshy-link' ? linkPart.trackingUrl! : href;
          onLinkClick(url, isTracking);
        }
      }
    },
    [enableTracking, onLinkClick]
  );

  return (
    <div
      className={cn('markdown-message leading-relaxed max-w-full overflow-hidden prose prose-sm dark:prose-invert max-w-none [&_li>p]:my-0', className)}
      onClick={handleClick}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeSanitize]}
        components={{
          // Code blocks avec coloration syntaxique
          code({ inline, className, children, ...props }: unknown) {
            const match = /language-(\w+)/.exec(className || '');
            const language = match ? match[1] : '';

            // Si c'est un diagramme Mermaid, utiliser le composant MermaidDiagram
            if (!inline && language === 'mermaid') {
              return (
                <MermaidDiagram
                  chart={String(children).replace(/\n$/, '')}
                  className="my-2"
                />
              );
            }

            return !inline && language ? (
              <SyntaxHighlighter
                style={isDark ? vscDarkPlus : vs}
                language={language}
                PreTag="div"
                className="rounded-md my-2 text-sm"
                showLineNumbers={false}
                customStyle={{
                  margin: '0.5rem 0',
                  borderRadius: '0.375rem',
                }}
                {...props}
              >
                {String(children).replace(/\n$/, '')}
              </SyntaxHighlighter>
            ) : (
              <code
                className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-sm font-mono"
                {...props}
              >
                {children}
              </code>
            );
          },

          // Liens avec support des mentions et tracking
          a({ href, children, ...props }: unknown) {
            const isMention = href?.startsWith('/u/');

            if (isMention) {
              return (
                <a
                  href={href}
                  className="text-purple-600 dark:text-purple-400 hover:underline font-medium no-underline"
                  {...props}
                >
                  {children}
                </a>
              );
            }

            // Tronquer les URLs longues (> 49 caractères)
            // Vérifier si le texte affiché est identique à l'URL (lien simple)
            const childText = typeof children === 'string' ? children :
                             (Array.isArray(children) && typeof children[0] === 'string' ? children[0] : null);
            const isPlainUrl = childText && href && (childText === href || childText.replace(/^https?:\/\//, '') === href.replace(/^https?:\/\//, ''));

            let displayText = children;
            let title = href;

            if (isPlainUrl && href && href.length > 49) {
              // Tronquer l'URL : garder les 46 premiers caractères + "..."
              displayText = href.substring(0, 46) + '...';
              title = href; // URL complète dans le title pour le survol
            }

            return (
              <a
                href={href}
                className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline"
                target="_blank"
                rel="noopener noreferrer"
                title={title}
                {...props}
              >
                {displayText}
              </a>
            );
          },

          // Paragraphes avec whitespace-pre-wrap
          p({ children, ...props }: unknown) {
            return (
              <p className="my-1 leading-normal whitespace-pre-wrap" {...props}>
                {children}
              </p>
            );
          },

          // Headings avec tailles adaptées aux messages
          h1({ children, ...props }: unknown) {
            return (
              <h1 className="text-xl sm:text-2xl font-bold my-1 first:mt-0" {...props}>
                {children}
              </h1>
            );
          },
          h2({ children, ...props }: unknown) {
            return (
              <h2 className="text-lg sm:text-xl font-bold my-1 first:mt-0" {...props}>
                {children}
              </h2>
            );
          },
          h3({ children, ...props }: unknown) {
            return (
              <h3 className="text-base sm:text-lg font-bold my-1 first:mt-0" {...props}>
                {children}
              </h3>
            );
          },
          h4({ children, ...props }: unknown) {
            return (
              <h4 className="text-base font-bold my-1 first:mt-0" {...props}>
                {children}
              </h4>
            );
          },
          h5({ children, ...props }: unknown) {
            return (
              <h5 className="text-sm font-bold my-1 first:mt-0" {...props}>
                {children}
              </h5>
            );
          },
          h6({ children, ...props }: unknown) {
            return (
              <h6 className="text-sm font-semibold my-1 first:mt-0" {...props}>
                {children}
              </h6>
            );
          },

          // Blockquotes
          blockquote({ children, ...props }: unknown) {
            return (
              <blockquote
                className="border-l-4 border-gray-300 dark:border-gray-600 pl-4 my-1 italic"
                {...props}
              >
                {children}
              </blockquote>
            );
          },

          // Séparateurs horizontaux (---, ***, ___)
          hr({ ...props }: unknown) {
            return (
              <hr
                className="my-4 border-0 border-t-2 border-gray-300 dark:border-gray-600"
                {...props}
              />
            );
          },

          // Listes
          ul({ children, ...props }: unknown) {
            return (
              <ul className="list-disc list-outside my-1 pl-5" {...props}>
                {children}
              </ul>
            );
          },
          ol({ children, ...props }: unknown) {
            return (
              <ol className="list-decimal list-outside my-1 pl-5" {...props}>
                {children}
              </ol>
            );
          },
          li({ children, ...props }: unknown) {
            return (
              <li className="leading-normal" {...props}>
                {children}
              </li>
            );
          },

          // Tables (GitHub Flavored Markdown)
          table({ children, ...props }: unknown) {
            return (
              <div className="overflow-x-auto my-2">
                <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-600" {...props}>
                  {children}
                </table>
              </div>
            );
          },
          th({ children, ...props }: unknown) {
            return (
              <th
                className="border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 px-3 py-2 text-left font-semibold"
                {...props}
              >
                {children}
              </th>
            );
          },
          td({ children, ...props }: unknown) {
            return (
              <td className="border border-gray-300 dark:border-gray-600 px-3 py-2" {...props}>
                {children}
              </td>
            );
          },
        }}
      >
        {preprocessedContent}
      </ReactMarkdown>
    </div>
  );
};
