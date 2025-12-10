'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, Copy, Check, WrapText, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { UploadedAttachmentResponse } from '@meeshy/shared/types/attachment';
import { toast } from 'sonner';

interface TextLightboxProps {
  attachment: UploadedAttachmentResponse | null;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * TextLightbox - Fullscreen text/code file viewer
 * Supports: syntax highlighting hints, copy to clipboard, word wrap, download
 */
export const TextLightbox: React.FC<TextLightboxProps> = ({
  attachment,
  isOpen,
  onClose
}) => {
  const [content, setContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [wordWrap, setWordWrap] = useState(true);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent body scroll when lightbox is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Load text content
  useEffect(() => {
    if (!isOpen || !attachment) return;

    const fetchContent = async () => {
      try {
        setIsLoading(true);
        setHasError(false);

        const response = await fetch(attachment.fileUrl);
        if (!response.ok) {
          throw new Error('Failed to load file');
        }

        const text = await response.text();
        setContent(text);
      } catch (error) {
        console.error('Error loading text file:', error);
        setHasError(true);
      } finally {
        setIsLoading(false);
      }
    };

    fetchContent();
  }, [isOpen, attachment]);

  if (!isOpen || !attachment) return null;

  // Get file extension and map to language for syntax highlighting
  const getFileExtension = () => {
    const parts = attachment.originalName.split('.');
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : 'txt';
  };

  const getLanguageFromExtension = (ext: string): string => {
    // Map complète d'extensions vers langages Prism
    // Supporte tous les types de fichiers code courants
    const languageMap: { [key: string]: string } = {
      // Web
      'js': 'javascript', 'mjs': 'javascript', 'cjs': 'javascript',
      'jsx': 'jsx', 'ts': 'typescript', 'tsx': 'tsx',
      'html': 'html', 'htm': 'html',
      'css': 'css', 'scss': 'scss', 'sass': 'sass', 'less': 'less',

      // Scripts shell
      'sh': 'bash', 'bash': 'bash', 'zsh': 'bash', 'fish': 'bash', 'ksh': 'bash',

      // Langages compilés
      'c': 'c', 'h': 'c',
      'cpp': 'cpp', 'cc': 'cpp', 'cxx': 'cpp', 'hpp': 'cpp', 'hxx': 'cpp',
      'java': 'java', 'class': 'java',
      'kt': 'kotlin', 'kts': 'kotlin',
      'cs': 'csharp', 'vb': 'vbnet',
      'go': 'go',
      'rs': 'rust',
      'swift': 'swift',

      // Langages dynamiques
      'py': 'python', 'pyw': 'python', 'pyc': 'python', 'pyo': 'python',
      'rb': 'ruby', 'erb': 'ruby',
      'php': 'php', 'phtml': 'php',
      'pl': 'perl', 'pm': 'perl',
      'lua': 'lua',

      // Fonctionnel
      'hs': 'haskell', 'lhs': 'haskell',
      'ml': 'ocaml', 'mli': 'ocaml',
      'fs': 'fsharp', 'fsi': 'fsharp', 'fsx': 'fsharp',
      'clj': 'clojure', 'cljs': 'clojure', 'cljc': 'clojure',
      'scala': 'scala', 'sc': 'scala',
      'el': 'lisp', 'lisp': 'lisp',

      // Query languages
      'sql': 'sql', 'mysql': 'sql', 'pgsql': 'sql',
      'graphql': 'graphql', 'gql': 'graphql',

      // Markup & Data
      'xml': 'xml', 'xsl': 'xml', 'xslt': 'xml',
      'json': 'json', 'jsonc': 'json', 'json5': 'json',
      'yaml': 'yaml', 'yml': 'yaml',
      'toml': 'toml',
      'ini': 'ini', 'cfg': 'ini', 'conf': 'ini',

      // Documentation
      'md': 'markdown', 'markdown': 'markdown', 'mdown': 'markdown', 'mkd': 'markdown',
      'rst': 'rest',
      'tex': 'latex',

      // Autres
      'r': 'r',
      'm': 'objectivec', 'mm': 'objectivec',
      'dart': 'dart',
      'vim': 'vim',
      'asm': 'nasm', 's': 'nasm',
      'dockerfile': 'docker',
      'makefile': 'makefile', 'mk': 'makefile',
      'gradle': 'gradle',
      'cmake': 'cmake',

      // Fichiers de configuration communs
      'gitignore': 'bash',
      'dockerignore': 'bash',
      'env': 'bash',
      'eslintrc': 'json',
      'prettierrc': 'json',
      'babelrc': 'json',
      'editorconfig': 'editorconfig',
      'npmrc': 'ini',
      'yarnrc': 'ini',

      // Texte par défaut
      'txt': 'text',
      'text': 'text',
      'log': 'text',
      'csv': 'csv',
      'tsv': 'csv',
    };

    return languageMap[ext] || 'text';
  };

  const extension = getFileExtension();
  const language = getLanguageFromExtension(extension);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setIsCopied(true);
      toast.success('Copié dans le presse-papiers');
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      console.error('Error copying:', error);
      toast.error('Impossible de copier');
    }
  };

  const toggleWordWrap = () => {
    setWordWrap(!wordWrap);
  };

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[10001] bg-black/95 dark:bg-black/98 backdrop-blur-sm"
        onClick={onClose}
      >
        {/* Header bar */}
        <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-3 sm:p-4 bg-gradient-to-b from-black/50 to-transparent">
          <div className="flex flex-col text-white min-w-0 flex-1 mr-4">
            <span className="font-medium text-xs sm:text-sm md:text-base truncate">
              {attachment.originalName}
            </span>
            <span className="text-[10px] sm:text-xs text-gray-300">
              {extension.toUpperCase()} • {content.split('\n').length} lignes
            </span>
          </div>

          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            {/* Word Wrap Toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                toggleWordWrap();
              }}
              className={`text-white hover:bg-white/10 w-8 h-8 sm:w-10 sm:h-10 ${wordWrap ? 'bg-white/20' : ''}`}
              aria-label={wordWrap ? 'Désactiver le retour à la ligne' : 'Activer le retour à la ligne'}
              disabled={isLoading || hasError}
            >
              <WrapText className="w-4 h-4 sm:w-5 sm:h-5" />
            </Button>

            {/* Copy Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                handleCopy();
              }}
              className="text-white hover:bg-white/10 w-8 h-8 sm:w-10 sm:h-10"
              aria-label="Copier le contenu"
              disabled={isLoading || hasError}
            >
              {isCopied ? (
                <Check className="w-4 h-4 sm:w-5 sm:h-5 text-green-400" />
              ) : (
                <Copy className="w-4 h-4 sm:w-5 sm:h-5" />
              )}
            </Button>

            {/* Download Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                const link = document.createElement('a');
                link.href = attachment.fileUrl;
                link.download = attachment.originalName;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }}
              className="text-white hover:bg-white/10 w-8 h-8 sm:w-10 sm:h-10"
              aria-label="Télécharger le fichier"
            >
              <Download className="w-4 h-4 sm:w-5 sm:h-5" />
            </Button>

            {/* Close Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="text-white hover:bg-white/10 w-8 h-8 sm:w-10 sm:h-10"
              aria-label="Fermer"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </Button>
          </div>
        </div>

        {/* Text Content Viewer */}
        <div
          className="absolute inset-0 flex items-start justify-center pt-14 sm:pt-16 pb-2 sm:pb-4 px-2 sm:px-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-full h-full bg-[#1e1e1e] overflow-auto shadow-2xl">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : hasError ? (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-400">
                <FileText className="w-16 h-16" />
                <span className="text-lg">Impossible de charger le fichier</span>
              </div>
            ) : (
              <SyntaxHighlighter
                language={language}
                style={vscDarkPlus}
                showLineNumbers={true}
                wrapLines={wordWrap}
                wrapLongLines={wordWrap}
                customStyle={{
                  margin: 0,
                  padding: '1.5rem',
                  background: '#1e1e1e',
                  fontSize: '0.875rem',
                  height: '100%',
                }}
                codeTagProps={{
                  style: {
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                  }
                }}
              >
                {content}
              </SyntaxHighlighter>
            )}
          </div>
        </div>

        {/* Instructions (desktop only) */}
        <div className="hidden md:block absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-xs text-center">
          <p>Appuyez sur Échap pour fermer</p>
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
};
