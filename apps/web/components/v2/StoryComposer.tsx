'use client';

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Dialog, DialogHeader, DialogBody } from './Dialog';
import { Button } from './Button';

// ============================================================================
// Types
// ============================================================================

type TextStyle = 'bold' | 'neon' | 'typewriter' | 'handwriting';

interface StoryComposerProps {
  open: boolean;
  onClose: () => void;
  onPublish: (story: {
    content?: string;
    storyEffects: Record<string, unknown>;
    visibility: string;
  }) => void;
}

// ============================================================================
// Constants
// ============================================================================

const BACKGROUND_COLORS = [
  { id: 'terracotta', value: '#C4704B', label: 'Terracotta' },
  { id: 'teal', value: '#1A6B5A', label: 'Teal' },
  { id: 'charcoal', value: '#2D3748', label: 'Charcoal' },
  { id: 'gold', value: '#E8C547', label: 'Gold' },
  { id: 'pink', value: '#E74C9B', label: 'Pink' },
  {
    id: 'gradient',
    value: 'linear-gradient(135deg, #C4704B, #1A6B5A)',
    label: 'Gradient',
  },
] as const;

const TEXT_STYLES: { id: TextStyle; label: string }[] = [
  { id: 'bold', label: 'Aa' },
  { id: 'neon', label: 'Ne' },
  { id: 'typewriter', label: 'Tt' },
  { id: 'handwriting', label: 'Hh' },
];

// ============================================================================
// Helpers
// ============================================================================

function getTextStyleClasses(style: TextStyle): string {
  switch (style) {
    case 'bold':
      return 'font-bold';
    case 'neon':
      return 'font-bold [text-shadow:0_0_8px_rgba(255,255,255,0.8),0_0_20px_rgba(255,255,255,0.4)]';
    case 'typewriter':
      return 'font-mono tracking-wider';
    case 'handwriting':
      return 'italic font-light tracking-wide';
    default:
      return 'font-bold';
  }
}

function isGradient(bg: string): boolean {
  return bg.startsWith('linear-gradient');
}

// ============================================================================
// StoryComposer
// ============================================================================

function StoryComposer({ open, onClose, onPublish }: StoryComposerProps) {
  const [selectedBg, setSelectedBg] = useState<string>(BACKGROUND_COLORS[0].value);
  const [selectedTextStyle, setSelectedTextStyle] = useState<TextStyle>('bold');
  const [content, setContent] = useState<string>('');

  const handlePublish = useCallback(() => {
    onPublish({
      content: content || undefined,
      storyEffects: {
        backgroundColor: selectedBg,
        textStyle: selectedTextStyle,
      },
      visibility: 'public',
    });
    setContent('');
    setSelectedBg(BACKGROUND_COLORS[0].value);
    setSelectedTextStyle('bold');
  }, [content, selectedBg, selectedTextStyle, onPublish]);

  const handleClose = useCallback(() => {
    onClose();
    setContent('');
    setSelectedBg(BACKGROUND_COLORS[0].value);
    setSelectedTextStyle('bold');
  }, [onClose]);

  return (
    <Dialog open={open} onClose={handleClose} className="max-w-lg">
      {/* Header */}
      <DialogHeader className="flex items-center justify-between p-4 pb-3">
        <button
          type="button"
          onClick={handleClose}
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-full',
            'text-[var(--gp-text-secondary)] hover:bg-[var(--gp-hover)]',
            'transition-colors duration-300'
          )}
          aria-label="Fermer"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <h2 className="text-base font-semibold text-[var(--gp-text-primary)] transition-colors duration-300">
          Nouvelle Story
        </h2>

        <Button
          size="sm"
          variant="primary"
          onClick={handlePublish}
          disabled={!content.trim()}
        >
          Publier
        </Button>
      </DialogHeader>

      {/* Body */}
      <DialogBody className="p-4 pt-0">
        {/* Preview Zone */}
        <div
          className="relative flex min-h-[320px] items-center justify-center overflow-hidden rounded-xl"
          style={{
            background: selectedBg,
          }}
        >
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Tapez votre story..."
            maxLength={500}
            className={cn(
              'z-10 w-full resize-none bg-transparent px-6 py-4 text-center text-xl text-white',
              'placeholder:text-white/50 focus:outline-none',
              'min-h-[200px]',
              getTextStyleClasses(selectedTextStyle)
            )}
          />
        </div>

        {/* Bottom Toolbar */}
        <div className="mt-4 space-y-3">
          {/* Color Palette */}
          <div className="flex items-center justify-center gap-3">
            {BACKGROUND_COLORS.map((color) => (
              <button
                key={color.id}
                type="button"
                onClick={() => setSelectedBg(color.value)}
                aria-label={color.label}
                className={cn(
                  'h-8 w-8 shrink-0 rounded-full transition-all duration-300',
                  selectedBg === color.value
                    ? 'ring-2 ring-white ring-offset-2 ring-offset-[var(--gp-surface)] scale-110'
                    : 'hover:scale-105'
                )}
                style={{
                  background: isGradient(color.value)
                    ? color.value
                    : color.value,
                }}
              />
            ))}
          </div>

          {/* Text Style Buttons */}
          <div className="flex items-center justify-center gap-2">
            {TEXT_STYLES.map((style) => (
              <button
                key={style.id}
                type="button"
                onClick={() => setSelectedTextStyle(style.id)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium transition-colors duration-300',
                  selectedTextStyle === style.id
                    ? 'bg-[var(--gp-terracotta)] text-white'
                    : 'bg-[var(--gp-hover)] text-[var(--gp-text-secondary)] hover:text-[var(--gp-text-primary)]'
                )}
              >
                {style.label}
              </button>
            ))}
          </div>
        </div>
      </DialogBody>
    </Dialog>
  );
}

StoryComposer.displayName = 'StoryComposer';

export { StoryComposer };
export type { StoryComposerProps };
