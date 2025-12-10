'use client';

import React, { useCallback, useMemo } from 'react';
import { useTheme } from 'next-themes';
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

interface MarkdownMessageProps {
  content: string;
  className?: string;
  enableTracking?: boolean;
  onLinkClick?: (url: string, isTracking: boolean) => void;
  isOwnMessage?: boolean; // Pour adapter les couleurs en fonction de l'expéditeur
}

/**
 * Prétraite le contenu du message pour transformer les liens spéciaux m+TOKEN
 * en liens markdown avant le rendu par ReactMarkdown
 */
const preprocessContent = (content: string): string => {
  const parts = parseMessageLinks(content);

  return parts.map(part => {
    // Transformer les liens m+TOKEN en liens markdown
    if (part.type === 'mshy-link' && part.trackingUrl) {
      return `[${part.content}](${part.trackingUrl})`;
    }
    // Transformer les liens de tracking complets en markdown s'ils ne sont pas déjà formatés
    if (part.type === 'tracking-link' && part.trackingUrl && !content.includes(`[`) && !content.includes(`](${part.trackingUrl})`)) {
      // Ne transformer que si le lien n'est pas déjà dans un format markdown
      return part.content;
    }
    // Garder le reste tel quel (texte brut et URLs qui seront gérées par ReactMarkdown)
    return part.content;
  }).join('');
};

/**
 * Normalise le markdown en corrigeant les espaces incorrects introduits par la traduction
 * et en préservant les retours chariot (Windows \r\n et Linux \n)
 *
 * Stratégie:
 * 1. Normaliser les retours chariot Windows (\r\n) vers Linux (\n)
 * 2. Préserver les retours chariot multiples en les convertissant en <br> HTML
 * 3. Normaliser les headers Markdown (# à ######)
 * 4. Remplacer les espaces mal placés par des espaces insécables (U+00A0)
 *
 * Corrige :
 * - `\r\n` → `\n` (normalisation Windows → Linux)
 * - `\n\n` → `<br/><br/>` (préservation des lignes vides)
 * - `#texte` → `# texte` (headers mal formatés)
 * - `# texte #` → `# texte` (headers avec # de fermeture)
 * - `** texte **` → `**\u00A0texte\u00A0**` (espaces insécables)
 * - `* texte *` → `*\u00A0texte\u00A0*` (espaces insécables)
 *
 * Protège :
 * - Blocs de code (```) : pas de conversion <br/>
 * - Séparateurs horizontaux (---, ***, ___) : garde \n\n autour pour ReactMarkdown
 * - Diagrammes Mermaid dans les code blocks
 *
 * Préserve :
 * - Le nombre exact de retours à la ligne
 * - Les espaces entre les mots dans le contenu
 */
const normalizeMarkdown = (content: string): string => {
  let normalized = content;

  // ÉTAPE 1: Normaliser les retours chariot Windows → Linux
  // \r\n → \n (Windows vers Unix)
  normalized = normalized.replace(/\r\n/g, '\n');
  // \r → \n (anciens Mac vers Unix)
  normalized = normalized.replace(/\r/g, '\n');

  // ÉTAPE 2: Préserver les retours chariot multiples
  // Convertir les lignes vides (2+ \n consécutifs) en <br> HTML
  // Cela préserve le nombre exact de lignes vides
  // Exception: Ne pas toucher aux blocs de code (```)
  const codeBlockRegex = /```[\s\S]*?```/g;
  const codeBlocks: string[] = [];

  // Sauvegarder les blocs de code
  normalized = normalized.replace(codeBlockRegex, (match) => {
    codeBlocks.push(match);
    return `___CODE_BLOCK_${codeBlocks.length - 1}___`;
  });

  // ÉTAPE 2.5: Normaliser les headers Markdown AVANT la conversion des \n
  // Cela permet à ReactMarkdown de les détecter correctement

  // Corriger les headers sans espace après # : #texte → # texte
  normalized = normalized.replace(/^(#{1,6})([^\s#])/gm, '$1 $2');

  // Corriger les headers avec espaces avant le # de fermeture : # texte # → # texte
  normalized = normalized.replace(/^(#{1,6}\s+.+?)\s+#{1,6}\s*$/gm, '$1');

  // Corriger les headers avec espaces excessifs : #  texte → # texte
  normalized = normalized.replace(/^(#{1,6})\s{2,}/gm, '$1 ');

  // Convertir les retours chariot multiples en <br/>
  // MAIS : Préserver les retours autour des séparateurs horizontaux (---, ***, ___)
  // pour que ReactMarkdown puisse les détecter

  // Détecter les lignes avec séparateurs horizontaux
  const lines = normalized.split('\n');
  const processedLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const currentLine = lines[i];
    const isHorizontalRule = /^[-*_]{3,}\s*$/.test(currentLine.trim());

    if (isHorizontalRule) {
      // C'est un séparateur : garder les retours de ligne autour
      processedLines.push(currentLine);
    } else {
      processedLines.push(currentLine);
    }
  }

  // Reconstruire et convertir les \n multiples (sauf autour des séparateurs)
  normalized = processedLines.join('\n');

  // Conversion des \n multiples en <br/>, mais pas autour des éléments Markdown
  // (séparateurs horizontaux et headers)
  normalized = normalized.replace(/\n{2,}/g, (match, offset) => {
    // Vérifier si on est près d'un séparateur horizontal ou d'un header
    const before = normalized.substring(Math.max(0, offset - 30), offset);
    const after = normalized.substring(offset + match.length, offset + match.length + 30);

    // Détecter séparateurs horizontaux
    const hasHrBefore = /[-*_]{3,}\s*$/.test(before);
    const hasHrAfter = /^[-*_]{3,}/.test(after);

    // Détecter headers (lignes commençant par #)
    const hasHeaderBefore = /#{1,6}\s+.+$/.test(before.split('\n').pop() || '');
    const hasHeaderAfter = /^#{1,6}\s+/.test(after);

    // Si on est autour d'un HR ou d'un header, garder 2 \n (un seul saut de ligne vide)
    if (hasHrBefore || hasHrAfter || hasHeaderBefore || hasHeaderAfter) {
      return '\n\n'; // Garder pour que ReactMarkdown détecte les éléments
    }

    // Sinon, convertir normalement en <br/>
    const count = match.length;
    return '<br/>'.repeat(count);
  });

  // Restaurer les blocs de code
  normalized = normalized.replace(/___CODE_BLOCK_(\d+)___/g, (_, index) => {
    return codeBlocks[parseInt(index)];
  });

  // ÉTAPE 3: Corriger les espaces incorrects autour du formatage Markdown

  // Gras ** : remplacer espaces par insécables
  // ** texte ** → **\u00A0texte\u00A0**
  normalized = normalized.replace(/\*\*([ \t]+)(?![\n\r])/g, '**\u00A0');
  normalized = normalized.replace(/(?<![\n\r])([ \t]+)\*\*/g, '\u00A0**');

  // Italique * : remplacer espaces par insécables (éviter les listes)
  // * texte * → *\u00A0texte\u00A0*
  normalized = normalized.replace(/(?<![\n\r\*])\*([ \t]+)(?![\n\r])/g, '*\u00A0');
  normalized = normalized.replace(/(?<![\n\r])([ \t]+)\*(?!\*)/g, '\u00A0*');

  // Gras alternatif __ : remplacer espaces par insécables
  // __ texte __ → __\u00A0texte\u00A0__
  normalized = normalized.replace(/__([ \t]+)(?![\n\r])/g, '__\u00A0');
  normalized = normalized.replace(/(?<![\n\r])([ \t]+)__/g, '\u00A0__');

  // Italique alternatif _ : remplacer espaces par insécables
  // _ texte _ → _\u00A0texte\u00A0_
  normalized = normalized.replace(/(?<![\w\n\r])_([ \t]+)(?![\n\r])/g, '_\u00A0');
  normalized = normalized.replace(/(?<![\n\r])([ \t]+)_(?!\w)/g, '\u00A0_');

  // Corriger les liens: [ texte ]( url ) → [texte](url)
  // Supprimer les espaces dans les crochets/parenthèses
  normalized = normalized.replace(/\[[ \t]+/g, '[');
  normalized = normalized.replace(/[ \t]+\]/g, ']');
  normalized = normalized.replace(/\([ \t]+/g, '(');
  normalized = normalized.replace(/[ \t]+\)/g, ')');

  // Corriger les codes inline: ` code ` → `code`
  normalized = normalized.replace(/`[ \t]+/g, '`');
  normalized = normalized.replace(/[ \t]+`/g, '`');

  return normalized;
};

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
  isOwnMessage = false
}) => {
  const { theme, resolvedTheme } = useTheme();
  const isDark = theme === 'dark' || resolvedTheme === 'dark';

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
          code({ node, inline, className, children, ...props }: any) {
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
          a({ node, href, children, ...props }: any) {
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
          p({ node, children, ...props }: any) {
            return (
              <p className="my-1 leading-normal whitespace-pre-wrap" {...props}>
                {children}
              </p>
            );
          },

          // Headings avec tailles adaptées aux messages
          h1({ node, children, ...props }: any) {
            return (
              <h1 className="text-xl sm:text-2xl font-bold my-1 first:mt-0" {...props}>
                {children}
              </h1>
            );
          },
          h2({ node, children, ...props }: any) {
            return (
              <h2 className="text-lg sm:text-xl font-bold my-1 first:mt-0" {...props}>
                {children}
              </h2>
            );
          },
          h3({ node, children, ...props }: any) {
            return (
              <h3 className="text-base sm:text-lg font-bold my-1 first:mt-0" {...props}>
                {children}
              </h3>
            );
          },
          h4({ node, children, ...props }: any) {
            return (
              <h4 className="text-base font-bold my-1 first:mt-0" {...props}>
                {children}
              </h4>
            );
          },
          h5({ node, children, ...props }: any) {
            return (
              <h5 className="text-sm font-bold my-1 first:mt-0" {...props}>
                {children}
              </h5>
            );
          },
          h6({ node, children, ...props }: any) {
            return (
              <h6 className="text-sm font-semibold my-1 first:mt-0" {...props}>
                {children}
              </h6>
            );
          },

          // Blockquotes
          blockquote({ node, children, ...props }: any) {
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
          hr({ node, ...props }: any) {
            return (
              <hr
                className="my-4 border-0 border-t-2 border-gray-300 dark:border-gray-600"
                {...props}
              />
            );
          },

          // Listes
          ul({ node, children, ...props }: any) {
            return (
              <ul className="list-disc list-outside my-1 pl-5" {...props}>
                {children}
              </ul>
            );
          },
          ol({ node, children, ...props }: any) {
            return (
              <ol className="list-decimal list-outside my-1 pl-5" {...props}>
                {children}
              </ol>
            );
          },
          li({ node, children, ...props }: any) {
            return (
              <li className="leading-normal" {...props}>
                {children}
              </li>
            );
          },

          // Tables (GitHub Flavored Markdown)
          table({ node, children, ...props }: any) {
            return (
              <div className="overflow-x-auto my-2">
                <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-600" {...props}>
                  {children}
                </table>
              </div>
            );
          },
          th({ node, children, ...props }: any) {
            return (
              <th
                className="border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 px-3 py-2 text-left font-semibold"
                {...props}
              >
                {children}
              </th>
            );
          },
          td({ node, children, ...props }: any) {
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
