'use client';

import React, { useState, useEffect } from 'react';
import {
  Download,
  AlertTriangle,
  Maximize,
  FileText,
  Copy,
  Check,
  WrapText
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useTheme } from 'next-themes';
import type { UploadedAttachmentResponse } from '@meeshy/shared/types/attachment';
import { toast } from 'sonner';

interface TextViewerProps {
  attachment: UploadedAttachmentResponse;
  className?: string;
  onOpenLightbox?: () => void;
}

/**
 * Lecteur de fichiers TEXTE/ASCII avec affichage inline
 * - Affichage du contenu texte brut
 * - Copier dans le presse-papiers
 * - Bouton plein écran
 * - Bouton télécharger
 * - Gestion du word wrap
 * - Gestion d'erreurs
 */
export const TextViewer: React.FC<TextViewerProps> = ({
  attachment,
  className = '',
  onOpenLightbox
}) => {
  const [content, setContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [wordWrap, setWordWrap] = useState(true);
  const { theme, resolvedTheme } = useTheme();

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
        console.error('Erreur chargement fichier texte:', error);
        setHasError(true);
        setErrorMessage('Impossible de charger le fichier');
      } finally {
        setIsLoading(false);
      }
    };

    fetchContent();
  }, [attachmentFileUrl]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setIsCopied(true);
      toast.success('Copié dans le presse-papiers');
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      console.error('Erreur copie:', error);
      toast.error('Impossible de copier');
    }
  };

  const toggleWordWrap = () => {
    setWordWrap(!wordWrap);
  };

  // Map file extension to language for syntax highlighting
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

  return (
    <div
      className={`flex flex-col gap-2 p-2 sm:p-3 bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-gray-800 dark:to-gray-900 rounded-lg border ${
        hasError
          ? 'border-red-300 dark:border-red-700'
          : 'border-blue-200 dark:border-gray-700'
      } shadow-md hover:shadow-lg transition-all duration-200 w-full max-w-[80vw] sm:max-w-2xl min-w-0 overflow-hidden ${className}`}
    >
      {/* Content area - responsive height matching PDF/PPTX */}
      <div className="relative w-full h-[210px] sm:h-[280px] md:h-[350px] bg-gray-50 dark:bg-gray-900 rounded-lg overflow-auto border border-gray-200 dark:border-gray-700">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : hasError ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-gray-600 dark:text-gray-400">
            <AlertTriangle className="w-12 h-12" />
            <span className="text-sm">{errorMessage}</span>
          </div>
        ) : (
          <div className="relative overflow-hidden">
            {/* File type badge */}
            <div className="sticky top-0 left-0 right-0 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-3 py-1.5 flex items-center justify-between z-10">
              <div className="flex items-center gap-2">
                <FileText className="w-3 h-3 text-gray-500" />
                <span className="text-xs font-mono text-gray-600 dark:text-gray-400">
                  {extension.toUpperCase()}
                </span>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {content.split('\n').length} lignes
              </div>
            </div>

            {/* Content with syntax highlighting */}
            <div className="w-full max-w-full overflow-x-auto" style={{ maxWidth: '100%' }}>
              <SyntaxHighlighter
                language={language}
                style={isDark ? vscDarkPlus : vs}
                showLineNumbers={false}
                wrapLines={wordWrap}
                wrapLongLines={wordWrap}
                customStyle={{
                  margin: 0,
                  padding: '1rem',
                  fontSize: '0.75rem',
                  maxHeight: 'calc(100% - 40px)',
                  maxWidth: '100%',
                  width: '100%',
                  overflow: 'auto',
                  wordBreak: wordWrap ? 'break-word' : 'normal',
                }}
                codeTagProps={{
                  style: {
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                    maxWidth: '100%',
                    wordBreak: wordWrap ? 'break-word' : 'normal',
                    overflowWrap: wordWrap ? 'break-word' : 'normal',
                  }
                }}
              >
                {content}
              </SyntaxHighlighter>
            </div>
          </div>
        )}
      </div>

      {/* Contrôles */}
      <div className="flex items-center justify-between gap-2">
        {/* Info fichier à gauche */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="text-xs text-gray-600 dark:text-gray-300 truncate">
            <span className="font-medium">{attachment.originalName}</span>
          </div>
        </div>

        {/* Boutons d'action à droite */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Bouton word wrap */}
          <Button
            onClick={toggleWordWrap}
            size="sm"
            variant="ghost"
            className="w-8 h-8 p-0"
            title={wordWrap ? 'Désactiver le retour à la ligne' : 'Activer le retour à la ligne'}
            disabled={isLoading || hasError}
          >
            <WrapText className={`w-4 h-4 ${wordWrap ? 'text-blue-600' : 'text-gray-400'}`} />
          </Button>

          {/* Bouton copier */}
          <Button
            onClick={handleCopy}
            size="sm"
            variant="ghost"
            className="w-8 h-8 p-0"
            title="Copier le contenu"
            disabled={isLoading || hasError}
          >
            {isCopied ? (
              <Check className="w-4 h-4 text-green-600" />
            ) : (
              <Copy className="w-4 h-4" />
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
            href={attachment.fileUrl}
            download={attachment.originalName}
            className="flex-shrink-0 p-1.5 hover:bg-white/50 dark:hover:bg-gray-700/50 rounded-full transition-all duration-200"
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
