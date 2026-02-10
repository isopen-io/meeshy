'use client';

import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import dynamic from 'next/dynamic';
import { useTheme } from 'next-themes';
import {
  Download,
  AlertTriangle,
  Maximize,
  FileText,
  Code,
  Eye,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { UploadedAttachmentResponse } from '@meeshy/shared/types/attachment';
import { MermaidDiagram } from '@/components/markdown/MermaidDiagram';

// ======================
// Dynamic Import for Syntax Highlighter (~150KB saved)
// ======================

const CodeHighlighter = dynamic(
  () => import('./CodeHighlighter').then((mod) => mod.CodeHighlighter),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-md my-2 p-4 bg-gray-100 dark:bg-gray-800 animate-pulse">
        <div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
        <div className="h-4 w-1/2 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
        <div className="h-4 w-2/3 bg-gray-200 dark:bg-gray-700 rounded" />
      </div>
    )
  }
);

interface MarkdownViewerProps {
  attachment: UploadedAttachmentResponse;
  className?: string;
  onOpenLightbox?: () => void;
  onDelete?: () => void;
  canDelete?: boolean;
}

/**
 * Lecteur MARKDOWN avec affichage formaté et mode raw
 * - Affichage du contenu markdown
 * - Basculer entre vue formatée et raw
 * - Bouton plein écran
 * - Bouton télécharger
 * - Gestion d'erreurs
 */
export const MarkdownViewer: React.FC<MarkdownViewerProps> = ({
  attachment,
  className = '',
  onOpenLightbox,
  onDelete,
  canDelete = false
}) => {
  const [content, setContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showRaw, setShowRaw] = useState(false);
  const { theme, resolvedTheme } = useTheme();

  // Utiliser directement l'URL depuis l'attachement qui contient déjà le bon chemin
  const attachmentFileUrl = attachment.fileUrl;
  const isDark = theme === 'dark' || resolvedTheme === 'dark';

  useEffect(() => {
    const fetchContent = async () => {
      try {
        setIsLoading(true);
        setHasError(false);

        const response = await fetch(attachmentFileUrl);
        if (!response.ok) {
          throw new Error('Erreur de chargement');
        }

        const text = await response.text();
        setContent(text);
      } catch (error) {
        console.error('Erreur chargement markdown:', error);
        setHasError(true);
        setErrorMessage('Impossible de charger le fichier');
      } finally {
        setIsLoading(false);
      }
    };

    fetchContent();
  }, [attachmentFileUrl]);

  const toggleRawMode = () => {
    setShowRaw(!showRaw);
  };

  // URL de téléchargement - utiliser directement fileUrl
  const downloadUrl = attachment.fileUrl;

  // Tronquer le nom de fichier sur mobile (32 caractères max)
  const truncateFilename = (filename: string, maxLength: number = 32): string => {
    if (filename.length <= maxLength) return filename;
    const ext = filename.split('.').pop() || '';
    const nameWithoutExt = filename.substring(0, filename.lastIndexOf('.'));
    const truncatedName = nameWithoutExt.substring(0, maxLength - ext.length - 4) + '...';
    return `${truncatedName}.${ext}`;
  };

  return (
    <div
      className={`flex flex-col gap-2 p-3 bg-gradient-to-br from-green-50 to-teal-50 dark:from-gray-800 dark:to-gray-900 rounded-lg border ${
        hasError
          ? 'border-red-300 dark:border-red-700'
          : 'border-green-200 dark:border-gray-700'
      } shadow-md hover:shadow-lg transition-shadow duration-200 w-full max-w-[90vw] sm:max-w-2xl min-w-0 overflow-hidden ${className}`}
    >
      {/* Content area - responsive height matching PDF/PPTX */}
      <div className="relative w-full h-[210px] sm:h-[280px] md:h-[350px] bg-white dark:bg-gray-900 rounded-lg overflow-auto p-4 border border-gray-200 dark:border-gray-700">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : hasError ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-gray-600 dark:text-gray-400">
            <AlertTriangle className="w-12 h-12" />
            <span className="text-sm">{errorMessage}</span>
          </div>
        ) : showRaw ? (
          <pre className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-mono">
            {content}
          </pre>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none text-gray-800 dark:text-gray-200">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeRaw, rehypeSanitize]}
              components={{
                code({ node, inline, className, children, ...props }: any) {
                  const match = /language-(\w+)/.exec(className || '');
                  const language = match ? match[1] : '';

                  // Mermaid diagrams
                  if (!inline && language === 'mermaid') {
                    return (
                      <MermaidDiagram
                        chart={String(children).replace(/\n$/, '')}
                        className="my-4"
                      />
                    );
                  }

                  return !inline && language ? (
                    <CodeHighlighter
                      language={language}
                      isDark={isDark}
                    >
                      {String(children).replace(/\n$/, '')}
                    </CodeHighlighter>
                  ) : (
                    <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
                      {children}
                    </code>
                  );
                }
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        )}

        {/* Delete button */}
        {canDelete && onDelete && (
          <Button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            size="sm"
            variant="destructive"
            className="absolute top-2 right-2 w-8 h-8 p-0 opacity-0 hover:opacity-100 focus-visible:opacity-100 transition-opacity"
            title="Supprimer ce fichier Markdown"
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Contrôles */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {/* Info fichier */}
          <div className="text-xs text-gray-600 dark:text-gray-300 flex items-center gap-1 truncate">
            <FileText className="w-3 h-3 flex-shrink-0" />
            <span className="font-medium truncate">
              <span className="hidden sm:inline">{attachment.originalName}</span>
              <span className="inline sm:hidden">{truncateFilename(attachment.originalName)}</span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Bouton toggle raw/formatted */}
          <Button
            onClick={toggleRawMode}
            size="sm"
            variant="ghost"
            className="w-8 h-8 p-0 flex-shrink-0"
            title={showRaw ? 'Vue formatée' : 'Vue brute'}
            disabled={isLoading || hasError}
          >
            {showRaw ? (
              <Eye className="w-4 h-4" />
            ) : (
              <Code className="w-4 h-4" />
            )}
          </Button>

          {/* Bouton plein écran / lightbox */}
          {onOpenLightbox && (
            <Button
              onClick={onOpenLightbox}
              size="sm"
              variant="ghost"
              className="w-8 h-8 p-0"
              title="Ouvrir en plein écran"
            >
              <Maximize className="w-4 h-4" />
            </Button>
          )}

          {/* Bouton télécharger */}
          <a
            href={downloadUrl}
            download={attachment.originalName}
            className="flex-shrink-0 p-1.5 hover:bg-white/50 dark:hover:bg-gray-700/50 rounded-full transition-colors duration-200"
            title="Télécharger"
            onClick={(e) => e.stopPropagation()}
          >
            <Download className="w-4 h-4 text-gray-600 dark:text-gray-300" />
          </a>
        </div>
      </div>
    </div>
  );
};
