import { useCallback } from 'react';

/**
 * Props for the useClipboardPaste hook
 */
interface UseClipboardPasteProps {
  /**
   * Callback invoked when images are pasted from clipboard
   */
  onImagesPasted: (files: File[]) => void;

  /**
   * Optional callback for text paste events
   */
  onTextPasted?: (text: string) => void;

  /**
   * Whether the paste handler is enabled
   * @default true
   */
  enabled?: boolean;
}

/**
 * Return value from useClipboardPaste hook
 */
interface UseClipboardPasteReturn {
  /**
   * Paste event handler to attach to an element
   */
  handlePaste: (e: ClipboardEvent) => Promise<void>;
}

/**
 * Supported image MIME types
 */
const SUPPORTED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
];

/**
 * Hook to handle clipboard paste events for images and text
 *
 * Detects images pasted from clipboard and invokes the appropriate callback.
 * Prevents default browser behavior when images are detected.
 *
 * @param props - Configuration options
 * @returns Handler for paste events
 *
 * @example
 * ```tsx
 * const { handlePaste } = useClipboardPaste({
 *   onImagesPasted: (files) => console.log('Images:', files),
 *   onTextPasted: (text) => console.log('Text:', text),
 * });
 *
 * useEffect(() => {
 *   const element = textareaRef.current;
 *   if (!element) return;
 *
 *   element.addEventListener('paste', handlePaste);
 *   return () => element.removeEventListener('paste', handlePaste);
 * }, [handlePaste]);
 * ```
 */
export function useClipboardPaste(
  props: UseClipboardPasteProps
): UseClipboardPasteReturn {
  const { onImagesPasted, onTextPasted, enabled = true } = props;

  const handlePaste = useCallback(
    async (e: ClipboardEvent): Promise<void> => {
      if (!enabled) return;

      const clipboardData = e.clipboardData;
      if (!clipboardData) return;

      const imageFiles: File[] = [];

      // Priority 1: Use clipboardData.items (better browser support)
      if (clipboardData.items && clipboardData.items.length > 0) {
        for (let i = 0; i < clipboardData.items.length; i++) {
          const item = clipboardData.items[i];

          if (
            item.kind === 'file' &&
            SUPPORTED_IMAGE_TYPES.includes(item.type)
          ) {
            const file = item.getAsFile();
            if (file) {
              imageFiles.push(file);
            }
          }
        }
      }

      // Fallback: Use clipboardData.files if no items found
      if (imageFiles.length === 0 && clipboardData.files.length > 0) {
        for (let i = 0; i < clipboardData.files.length; i++) {
          const file = clipboardData.files[i];
          if (SUPPORTED_IMAGE_TYPES.includes(file.type)) {
            imageFiles.push(file);
          }
        }
      }

      // If images found, prevent default and invoke callback
      if (imageFiles.length > 0) {
        e.preventDefault();
        onImagesPasted(imageFiles);
        return;
      }

      // Handle text paste if callback provided
      if (onTextPasted) {
        const text = clipboardData.getData('text/plain');
        if (text) {
          onTextPasted(text);
        }
      }
    },
    [enabled, onImagesPasted, onTextPasted]
  );

  return {
    handlePaste,
  };
}
